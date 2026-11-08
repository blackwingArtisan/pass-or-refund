/**
 * Pays in PayPal's own checkout window on the sandbox: the real v6 button opens PayPal's popup,
 * and PayPal's guest checkout takes the public sandbox test card. No buyer login needed.
 */
import { expect, type Page } from "@playwright/test";
import { SANDBOX_TEST_CARD } from "../../src/lib/paypal/test-card";

export interface PopupOptions {
  /** Delay per key, so typing reads on a recording. */
  typeDelayMs?: number;
  /** Runs once PayPal's window is up, before anything is typed (the demo puts its caption here). */
  onOpen?: (popup: Page) => Promise<void>;
  /** Runs once PayPal's card form is on screen. */
  onForm?: (popup: Page) => Promise<void>;
  /** Runs once the card form is filled, before paying. */
  onFilled?: (popup: Page) => Promise<void>;
}

/** PayPal's button renders disabled until its session is ready, and a click before then does nothing. */
export async function paypalButtonReady(page: Page) {
  const button = page.getByTestId("paypal-v6-button").locator("paypal-button");
  await button.waitFor({ timeout: 60_000 });
  await expect(button).not.toHaveAttribute("disabled", { timeout: 60_000 });
  return button;
}

export async function payInPayPalWindow(page: Page, opts: PopupOptions = {}): Promise<Page> {
  const delay = opts.typeDelayMs ?? 0;
  const button = await paypalButtonReady(page);
  const opened = page.waitForEvent("popup", { timeout: 30_000 });
  await button.click();
  const popup = await opened;
  await popup.waitForLoadState("domcontentloaded");
  await opts.onOpen?.(popup);

  // PayPal serves two page variants. Both start with "Pay with Debit or Credit Card"; one then
  // asks for an email before the card form.
  const card = popup.locator("#cardNumber");
  try {
    await popup.getByRole("button", { name: "Pay with Debit or Credit Card" }).filter({ visible: true }).first().click({ timeout: 60_000 });
    const toPayment = popup.getByRole("button", { name: "Continue to Payment" });
    await card.or(toPayment).first().waitFor({ timeout: 60_000 });
    if (await toPayment.isVisible()) {
      await popup.locator("input[name=login_email], input[type=email]").filter({ visible: true }).first().fill(`buyer.${Date.now()}@example.com`);
      await toPayment.click();
    }
    await card.waitFor({ timeout: 60_000 });
  } catch (e) {
    await popup.screenshot({ path: "test-results/paypal-window-failure.png" }).catch(() => undefined);
    throw e;
  }
  await opts.onForm?.(popup);
  const [year, month] = SANDBOX_TEST_CARD.expiry.split("-");
  await card.pressSequentially(SANDBOX_TEST_CARD.number, { delay });
  await popup.locator("#cardExpiry").pressSequentially(`${month}${year.slice(2)}`, { delay });
  await popup.locator("#cardCvv").pressSequentially(SANDBOX_TEST_CARD.security_code, { delay });
  await popup.locator("#firstName").fill("Test");
  await popup.locator("#lastName").fill("Buyer");
  const address = SANDBOX_TEST_CARD.billing_address;
  await popup.locator("#billingLine1").fill(address.address_line_1);
  await popup.locator("#billingCity").fill(address.admin_area_2);
  await popup.locator("#billingState").selectOption(address.admin_area_1);
  await popup.locator("#billingPostalCode").fill(address.postal_code);
  await popup.locator("#phone").fill("4085551234");
  const email = popup.locator("#email");
  if (await email.isVisible()) await email.fill(`buyer.${Date.now()}@example.com`);
  await opts.onFilled?.(popup);

  const closed = popup.waitForEvent("close", { timeout: 90_000 });
  const guestPay = popup.getByTestId("pomaGuestSubmitButton");
  if (await guestPay.isVisible()) {
    await guestPay.click();
  } else {
    // The other variant pays as a guest once "Save info & create your PayPal account" is off.
    const saveInfo = popup.getByTestId("onboard-options-switch");
    if (await saveInfo.isChecked().catch(() => false)) await saveInfo.dispatchEvent("click");
    await popup.getByTestId("submit-button").click();
  }
  // After paying PayPal may ask one or two things before it finishes: to confirm the sandbox's
  // made-up address (keep it as entered), and on a phone, to make an account (stay a guest).
  const keepAddress = popup.getByRole("button", { name: "Continue", exact: true });
  const stayGuest = popup.getByRole("button", { name: "Continue as Guest" });
  const answer = async (button: typeof keepAddress) => {
    await button.waitFor({ timeout: 30_000 });
    await button.click();
  };
  for (let asked = 0; asked < 2 && !popup.isClosed(); asked++) {
    const next = await Promise.race([closed.then(() => "closed").catch(() => "closed"), answer(keepAddress).then(() => "address"), answer(stayGuest).then(() => "guest")]).catch(() => "nothing");
    if (next === "closed" || next === "nothing") break;
  }
  // Usually PayPal's window tells the page and closes. One of PayPal's checkout pages takes the
  // payment and stays on "Thanks for using PayPal" instead; then the page's own check finds the
  // payment at PayPal and closes the window. Either way the window must close by itself.
  await closed.catch(async (e) => {
    await popup.screenshot({ path: "test-results/paypal-window-failure.png", fullPage: true }).catch(() => undefined);
    throw e;
  });
  return popup;
}

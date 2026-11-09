/**
 * Helpers for silent, captioned demo videos. Everything is injected into the page with
 * page.evaluate, so it works on any page without app support.
 *
 *   await titleCard(page, "Settle partial shipments with PayPal", "An AI agent with a human in the loop");
 *   await caption(page, "The buyer approves a $120 hold with PayPal");
 *   await highlight(page, page.getByTestId("run-agent"));
 */
import type { Locator, Page } from "@playwright/test";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Height of the caption band. Pages get this much room at the bottom, so a caption never covers what it describes. */
const BAND_PX = 112;

/** Bottom caption band, full width. Waits `ms` (reading time) unless wait=false. */
export async function caption(page: Page, text: string, opts: { ms?: number; wait?: boolean } = {}) {
  const ms = opts.ms ?? Math.min(6000, 1400 + text.length * 45);
  await page.evaluate(
    ({ text, ms, band }) => {
      let el = document.getElementById("__demo_caption");
      if (!el) {
        const room = document.createElement("style");
        room.textContent = `html { scroll-padding-bottom: ${band + 24}px } body { padding-bottom: ${band}px !important }`;
        document.head.appendChild(room);
        el = document.createElement("div");
        el.id = "__demo_caption";
        Object.assign(el.style, {
          position: "fixed", left: "0", right: "0", bottom: "0", height: `${band}px`, zIndex: "2147483647",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "0 48px", boxSizing: "border-box",
          background: "rgba(9,9,11,0.94)", color: "#fff", font: "600 26px/1.3 var(--font-sans)",
          textAlign: "center", opacity: "0", transition: "opacity .3s", pointerEvents: "none",
        });
        document.body.appendChild(el);
      }
      el.textContent = text;
      requestAnimationFrame(() => {
        el!.style.opacity = "1";
      });
      clearTimeout((window as unknown as { __demoCaptionTimer?: number }).__demoCaptionTimer);
      (window as unknown as { __demoCaptionTimer?: number }).__demoCaptionTimer = window.setTimeout(() => {
        el!.style.opacity = "0";
      }, ms);
    },
    { text, ms, band: BAND_PX },
  );
  if (opts.wait !== false) await sleep(ms);
}

/** Scrolls an element to the middle of the space above the caption band. */
export async function centre(target: Locator) {
  await target.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
}

/** Full-screen title card (intro/outro). */
export async function titleCard(page: Page, title: string, subtitle = "", ms = 3200) {
  await page.evaluate(
    ({ title, subtitle }) => {
      const el = document.createElement("div");
      el.id = "__demo_title";
      el.innerHTML = `<div style="font:700 56px/1.1 var(--font-sans);letter-spacing:-0.02em">${title}</div>${subtitle ? `<div style="margin-top:18px;font:500 26px/1.4 var(--font-sans);opacity:.8">${subtitle}</div>` : ""}`;
      Object.assign(el.style, {
        position: "fixed", inset: "0", zIndex: "2147483647", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        textAlign: "center", padding: "48px", color: "#fff", background: "radial-gradient(ellipse at top, var(--brand, #0070e0), #0b1020 70%)",
        opacity: "0", transition: "opacity .4s",
      });
      document.body.appendChild(el);
      requestAnimationFrame(() => (el.style.opacity = "1"));
    },
    { title, subtitle },
  );
  await sleep(ms);
  await page.evaluate(() => {
    const el = document.getElementById("__demo_title");
    if (el) {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 400);
    }
  });
  await sleep(450);
}

/** Pulsing outline around an element so viewers know where to look. */
export async function highlight(page: Page, target: Locator, ms = 1600) {
  const box = await target.boundingBox();
  if (!box) return;
  await page.evaluate(
    ({ box, ms }) => {
      const el = document.createElement("div");
      Object.assign(el.style, {
        position: "fixed", left: `${box.x - 6}px`, top: `${box.y - 6}px`, width: `${box.width + 12}px`, height: `${box.height + 12}px`,
        border: "3px solid #f59e0b", borderRadius: "14px", zIndex: "2147483646", pointerEvents: "none",
        boxShadow: "0 0 0 6px rgba(245,158,11,.25)", transition: "opacity .3s",
      });
      document.body.appendChild(el);
      setTimeout(() => {
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 300);
      }, ms);
    },
    { box, ms },
  );
  await sleep(Math.min(ms, 900));
}

/**
 * Times on the main page's video, so scripts/demo-edit.mjs can drop waits and splice in PayPal's
 * window. The video starts with the page, a moment before the test body runs.
 */
/** A slow zoom into part of the frame: up to `to` times, toward the point at fractions ax, ay of the spare room. */
export interface Zoom {
  to: number;
  ax: number;
  ay: number;
}

/** A zoom that centres on `target` as far as the frame allows. */
export async function zoomOn(page: Page, target: Locator, to = 1.6): Promise<Zoom> {
  const box = await target.boundingBox();
  const view = page.viewportSize() ?? { width: 1280, height: 800 };
  if (!box) return { to, ax: 0.5, ay: 0.5 };
  const anchor = (centre: number, size: number) => Math.min(1, Math.max(0, (centre - size / (2 * to)) / (size - size / to)));
  return { to, ax: anchor(box.x + box.width / 2, view.width), ay: anchor(box.y + box.height / 2, view.height) };
}

export class DemoCuts {
  private readonly start = Date.now();
  readonly parts: { src: string; from: number; to?: number; zoom?: Zoom }[] = [];
  private zooming?: Zoom;
  private keptFrom = 0;
  private paused: boolean;
  /** `paused` starts with nothing kept, for setup that happens before the story does. */
  constructor(opts: { paused?: boolean } = {}) {
    this.paused = opts.paused ?? false;
  }
  private get now() {
    return (Date.now() - this.start) / 1000;
  }
  /** Stops keeping the main video here; `keep` seconds of what follows stay in. */
  pause(keep = 1.2) {
    if (this.paused) return;
    this.parts.push({ src: "main", from: this.keptFrom, to: this.now + keep, ...this.zoomed() });
    this.paused = true;
  }
  private zoomed() {
    return this.zooming ? { zoom: this.zooming } : {};
  }
  /** From here the edit zooms slowly in (see Zoom), until unzoom(). */
  zoom(zoom: Zoom | undefined) {
    if (!this.paused) {
      this.parts.push({ src: "main", from: this.keptFrom, to: this.now, ...this.zoomed() });
      this.keptFrom = this.now;
    }
    this.zooming = zoom;
  }
  unzoom() {
    this.zoom(undefined);
  }
  resume() {
    if (!this.paused) return;
    // A pause keeps a moment past itself; don't show that moment twice.
    const lastMain = this.parts.filter((p) => p.src === "main").at(-1)?.to ?? 0;
    this.keptFrom = Math.max(this.now, lastMain);
    this.paused = false;
  }
  /** Drops the main video from here, plays another recording whole, then picks up where resume() is called. */
  insert(src: string) {
    if (!this.paused) this.parts.push({ src: "main", from: this.keptFrom, to: this.now });
    this.parts.push({ src, from: 0 });
    this.paused = true;
  }
  /** Drops the main video from here and plays these stretches of another recording; resume() picks the main one up again. */
  clips(src: string, stretches: { from: number; to: number }[], zoom?: Zoom) {
    if (!this.paused) this.parts.push({ src: "main", from: this.keptFrom, to: this.now, ...this.zoomed() });
    // Stretches that touch or overlap play once, as one.
    let last: { src: string; from: number; to?: number } | undefined;
    for (const { from, to } of [...stretches].sort((a, b) => a.from - b.from)) {
      if (last && from <= last.to!) last.to = Math.max(last.to!, to);
      else this.parts.push((last = { src, from: Math.max(0, from), to, ...(zoom ? { zoom } : {}) }));
    }
    this.paused = true;
  }
  /** How long the edited cut runs so far, counting the main video up to now. */
  get editedSeconds() {
    const kept = this.parts.reduce((sum, p) => sum + ((p.to ?? p.from) - p.from), 0);
    return Math.round(kept + (this.paused ? 0 : this.now - this.keptFrom));
  }
  finish() {
    if (!this.paused) this.parts.push({ src: "main", from: this.keptFrom, ...this.zoomed() });
    return this.parts;
  }
}

/** Keeps the video under Devpost's 3-minute limit. */
export class DemoClock {
  private readonly start = Date.now();
  constructor(private readonly limitSeconds = 170) {}
  get seconds() {
    return Math.round((Date.now() - this.start) / 1000);
  }
  check(label: string) {
    const s = this.seconds;
    console.log(`[demo] ${label} at ${s}s`);
    if (s > this.limitSeconds) throw new Error(`Demo is ${s}s at "${label}" (limit ${this.limitSeconds}s). Cut scenes or shorten captions.`);
  }
}

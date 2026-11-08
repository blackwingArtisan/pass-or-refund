/**
 * The browser suites mark themselves with a cookie on the app's own address (never PayPal's), so
 * the learners they buy stay off /team and out of the cohort numbers for real visitors.
 */
export function testRunState(baseURL: string) {
  return {
    cookies: [{ name: "por_test_run", value: "1", domain: new URL(baseURL).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" as const }],
    // Judge shortcuts on, so the flows can fill prepared answers. One test checks they start off.
    origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: "por_judge", value: "1" }] }],
  };
}

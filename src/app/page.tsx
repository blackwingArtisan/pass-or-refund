import { Hero, SiteFooter, SiteHeader, StopsGaming } from "@/components/marketing/landing";
import { Story } from "@/components/marketing/story";

/** About two screens at 1440 wide: the product, why it matters, and why it can't be gamed. */
export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Story />
        <StopsGaming />
      </main>
      <SiteFooter />
    </>
  );
}

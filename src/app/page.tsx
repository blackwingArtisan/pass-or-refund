import { ForCreators, Hero, SiteFooter, SiteHeader, StopsGaming } from "@/components/marketing/landing";
import { Story } from "@/components/marketing/story";

/** One idea per screen: the refund itself, why it matters, what it costs a creator, then how gaming is stopped. */
export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Story />
        <ForCreators />
        <StopsGaming />
      </main>
      <SiteFooter />
    </>
  );
}

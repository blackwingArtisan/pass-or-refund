import { CtaBand, Features, Hero, HowItWorks, SiteFooter, SiteHeader, StopsGaming } from "@/components/marketing/landing";
import { Story } from "@/components/marketing/story";

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Story />
        <Hero />
        <StopsGaming />
        <HowItWorks />
        <Features />
        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}

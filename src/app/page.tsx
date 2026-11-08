import { CtaBand, Features, Hero, HowItWorks, SiteFooter, SiteHeader, StopsGaming } from "@/components/marketing/landing";
import { Story } from "@/components/marketing/story";

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Story />
        <StopsGaming />
        <HowItWorks />
        <Features />
        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}

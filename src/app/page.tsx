import { CtaBand, Features, Hero, HowItWorks, SiteFooter, SiteHeader, StopsGaming } from "@/components/marketing/landing";

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main>
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

import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { Features } from "@/components/features";
import { HowItWorks } from "@/components/how-it-works";
import { Algorithms } from "@/components/algorithms";
import { CTA } from "@/components/cta";
import { Footer } from "@/components/footer";

export default function Home() {
  return (
    <main className="relative min-h-screen">
      <Header />
      <Hero />
      <Features />
      <HowItWorks />
      <Algorithms />
      <CTA />
      <Footer />
    </main>
  );
}

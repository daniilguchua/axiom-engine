import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { Features } from "@/components/features";
import { Architecture } from "@/components/architecture";
import { Personas } from "@/components/personas";
import { Demo } from "@/components/demo";
import { Footer } from "@/components/footer";

export default function Home() {
  return (
    <main className="relative min-h-screen">
      <Header />
      <Hero />
      <Features />
      <Architecture />
      <Personas />
      <Demo />
      <Footer />
    </main>
  );
}

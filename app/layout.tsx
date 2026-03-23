import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "AXIOM Engine | See Algorithms Think",
  description:
    "AI-powered interactive algorithm visualization engine. Transform complex CS concepts into step-by-step simulations with real-time diagram generation and self-healing render pipeline.",
  keywords: [
    "algorithm visualization",
    "AI",
    "computer science",
    "education",
    "interactive learning",
    "data structures",
  ],
  authors: [{ name: "Daniil Guchua" }],
  openGraph: {
    title: "AXIOM Engine | See Algorithms Think",
    description:
      "AI-powered interactive algorithm visualization engine with self-healing render pipeline.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}
      >
        {children}
      </body>
    </html>
  );
}

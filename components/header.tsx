"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Menu, X, Github, ArrowRight } from "lucide-react";

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#algorithms", label: "Algorithms" },
];

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
        isScrolled
          ? "bg-background/90 backdrop-blur-2xl border-b border-border/50 shadow-lg shadow-black/5"
          : "bg-transparent"
      )}
    >
      <nav className="max-w-7xl mx-auto px-6 lg:px-8 h-16 lg:h-20 flex items-center justify-between">
        {/* Logo */}
        <a href="#" className="flex items-center gap-3 group">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary via-primary to-blue-500 flex items-center justify-center shadow-lg shadow-primary/25">
              <span className="text-white font-bold text-sm tracking-tight">AX</span>
            </div>
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary to-blue-500 blur-xl opacity-40 group-hover:opacity-60 transition-opacity" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-foreground tracking-tight text-lg">
              AXIOM
            </span>
            <span className="gradient-text font-mono text-sm font-medium">//</span>
            <span className="text-muted-foreground font-medium">ENGINE</span>
          </div>
        </a>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* CTA Buttons */}
        <div className="hidden md:flex items-center gap-3">
          <a
            href="https://github.com/daniilguchua/axiom-engine"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50"
          >
            <Github className="w-4 h-4" />
            <span>GitHub</span>
          </a>
          <a
            href="#launch"
            className="group relative flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-xl transition-all duration-300 hover:shadow-[0_0_30px_hsl(var(--primary)/0.4)] hover:-translate-y-0.5"
          >
            <span>Launch App</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="md:hidden p-2.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50"
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? (
            <X className="w-5 h-5" />
          ) : (
            <Menu className="w-5 h-5" />
          )}
        </button>
      </nav>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-background/95 backdrop-blur-2xl border-b border-border/50">
          <div className="px-6 py-6 space-y-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="block px-4 py-3 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors rounded-lg"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-4 mt-4 border-t border-border/50 space-y-3">
              <a
                href="https://github.com/daniilguchua/axiom-engine"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-3 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors rounded-lg"
              >
                <Github className="w-4 h-4" />
                GitHub
              </a>
              <a
                href="#launch"
                className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-primary text-primary-foreground font-medium rounded-xl"
              >
                <span>Launch App</span>
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

"use client";

import { Github, Twitter, Linkedin } from "lucide-react";

const footerLinks = {
  product: [
    { label: "Features", href: "#features" },
    { label: "Architecture", href: "#architecture" },
    { label: "AI Personas", href: "#personas" },
    { label: "Demo", href: "#demo" },
  ],
  resources: [
    {
      label: "Documentation",
      href: "https://github.com/daniilguchua/axiom-engine#readme",
    },
    {
      label: "API Reference",
      href: "https://github.com/daniilguchua/axiom-engine#api-reference",
    },
    {
      label: "Getting Started",
      href: "https://github.com/daniilguchua/axiom-engine#getting-started",
    },
    {
      label: "Contributing",
      href: "https://github.com/daniilguchua/axiom-engine",
    },
  ],
  connect: [
    { label: "GitHub", href: "https://github.com/daniilguchua/axiom-engine" },
    { label: "Twitter", href: "https://twitter.com" },
    { label: "LinkedIn", href: "https://linkedin.com" },
  ],
};

export function Footer() {
  return (
    <footer className="relative border-t border-border">
      {/* Background */}
      <div className="absolute inset-0 grid-pattern opacity-10" />

      <div className="relative max-w-7xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <div className="md:col-span-1">
            <a href="#" className="flex items-center gap-3 mb-4">
              <div className="relative w-8 h-8 flex items-center justify-center">
                <div className="absolute inset-0 bg-primary/20 rounded-lg" />
                <span className="relative text-primary font-mono font-bold text-sm">
                  AX
                </span>
              </div>
              <span className="font-semibold text-foreground tracking-tight">
                AXIOM
              </span>
            </a>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              AI-powered algorithm visualization engine. See algorithms think.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/daniilguchua/axiom-engine"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="GitHub"
              >
                <Github className="w-4 h-4" />
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Twitter"
              >
                <Twitter className="w-4 h-4" />
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="LinkedIn"
              >
                <Linkedin className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-4">
              Product
            </h4>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-4">
              Resources
            </h4>
            <ul className="space-y-3">
              {footerLinks.resources.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Tech Stack */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-4">
              Built With
            </h4>
            <div className="flex flex-wrap gap-2">
              {[
                "Flask",
                "Gemini 2.5",
                "FAISS",
                "LangChain",
                "Three.js",
                "Mermaid.js",
                "SQLite",
              ].map((tech) => (
                <span
                  key={tech}
                  className="px-2 py-1 text-xs rounded bg-secondary text-muted-foreground"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Built by{" "}
            <a
              href="https://github.com/daniilguchua"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:text-primary transition-colors"
            >
              Daniil Guchua
            </a>{" "}
            at Northwestern University
          </p>
          <p className="text-sm text-muted-foreground">
            MIT License. Open Source.
          </p>
        </div>
      </div>
    </footer>
  );
}

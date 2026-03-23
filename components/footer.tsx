"use client";

import { Github, Twitter, Linkedin } from "lucide-react";

const footerLinks = {
  product: [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Algorithms", href: "#algorithms" },
    { label: "Launch App", href: "#launch" },
  ],
  resources: [
    { label: "Documentation", href: "https://github.com/daniilguchua/axiom-engine#readme" },
    { label: "API Reference", href: "https://github.com/daniilguchua/axiom-engine#api-reference" },
    { label: "Getting Started", href: "https://github.com/daniilguchua/axiom-engine#getting-started" },
    { label: "Contributing", href: "https://github.com/daniilguchua/axiom-engine" },
  ],
};

const techStack = ["Flask", "Gemini 2.5", "FAISS", "LangChain", "Three.js", "Mermaid.js", "SQLite"];

export function Footer() {
  return (
    <footer className="relative border-t border-border/50">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <div className="md:col-span-1">
            <a href="#" className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-blue-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm">AX</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-foreground">AXIOM</span>
                <span className="text-primary font-mono text-sm">//</span>
                <span className="text-muted-foreground">ENGINE</span>
              </div>
            </a>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              AI-powered algorithm visualization engine. Transform complex CS concepts 
              into interactive, step-by-step simulations.
            </p>
            <div className="flex items-center gap-3">
              <a
                href="https://github.com/daniilguchua/axiom-engine"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 rounded-lg bg-card border border-border hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all"
                aria-label="GitHub"
              >
                <Github className="w-4 h-4" />
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 rounded-lg bg-card border border-border hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all"
                aria-label="Twitter"
              >
                <Twitter className="w-4 h-4" />
              </a>
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 rounded-lg bg-card border border-border hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all"
                aria-label="LinkedIn"
              >
                <Linkedin className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-4">Product</h4>
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
            <h4 className="text-sm font-semibold text-foreground mb-4">Resources</h4>
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
            <h4 className="text-sm font-semibold text-foreground mb-4">Built With</h4>
            <div className="flex flex-wrap gap-2">
              {techStack.map((tech) => (
                <span
                  key={tech}
                  className="px-3 py-1.5 text-xs rounded-lg bg-card border border-border text-muted-foreground"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-border/50 flex flex-col md:flex-row items-center justify-between gap-4">
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

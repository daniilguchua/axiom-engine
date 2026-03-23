"use client";

import {
  Brain,
  Sparkles,
  FileText,
  Zap,
  Users,
  MousePointerClick,
} from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "AI-Powered Generation",
    description:
      "Type any algorithm or concept. AXIOM's AI engine generates interactive, step-by-step visualizations with concrete example data automatically.",
  },
  {
    icon: Sparkles,
    title: "Real-Time Visualization",
    description:
      "Watch algorithms execute in real-time with animated Mermaid diagrams. Step forward or backward through each operation to understand the flow.",
  },
  {
    icon: FileText,
    title: "PDF Context Loading",
    description:
      "Upload any PDF document and ask questions with context-aware responses. Perfect for studying textbooks or research papers.",
  },
  {
    icon: Users,
    title: "3 AI Personas",
    description:
      "Choose your learning style: Explorer for beginners, Engineer for detailed analysis, or Architect for advanced theory and edge cases.",
  },
  {
    icon: Zap,
    title: "Self-Healing Pipeline",
    description:
      "Our 4-tier repair system automatically fixes ~85% of rendering issues. If a diagram breaks, AXIOM repairs it in real-time.",
  },
  {
    icon: MousePointerClick,
    title: "Interactive Nodes",
    description:
      "Click any node in the visualization to get AI explanations. Understand what changed, current values, and what happens next.",
  },
];

export function Features() {
  return (
    <section id="features" className="py-28 md:py-36 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(var(--primary)/0.05)_0%,_transparent_50%)]" />
      
      <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 rounded-full bg-primary/10 border border-primary/20">
            <span className="text-xs font-medium text-primary uppercase tracking-wider">Features</span>
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6 text-balance">
            Everything you need to
            <br />
            <span className="gradient-text">understand algorithms</span>
          </h2>
          <p className="max-w-2xl mx-auto text-muted-foreground text-lg">
            A complete learning platform that combines AI generation, interactive 
            visualization, and intelligent error recovery.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="group relative p-8 rounded-2xl bg-card/50 border border-border/50 hover:border-primary/30 transition-all duration-500 hover:bg-card"
            >
              {/* Hover Glow */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              {/* Content */}
              <div className="relative">
                <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6 group-hover:bg-primary/20 group-hover:border-primary/30 transition-all duration-300">
                  <feature.icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-3">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

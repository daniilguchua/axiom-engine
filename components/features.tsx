"use client";

import {
  Brain,
  Wrench,
  FileText,
  Zap,
  Database,
  Palette,
  GitBranch,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Brain,
    title: "AI Simulation Engine",
    description:
      "3 teaching personas with streaming generation. Automatically detects 7 algorithm categories and generates concrete random input data.",
    gradient: "from-emerald-500/20 to-teal-500/20",
    iconColor: "text-emerald-400",
  },
  {
    icon: Wrench,
    title: "Self-Healing Pipeline",
    description:
      "4-tier escalation system with 23+ regex transforms and 13-phase JS sanitizer. Auto-repairs ~85% of render failures.",
    gradient: "from-blue-500/20 to-cyan-500/20",
    iconColor: "text-blue-400",
  },
  {
    icon: FileText,
    title: "RAG Document System",
    description:
      "PDF upload with FAISS vector search. 768-dim embeddings with top-4 retrieval for context-grounded responses.",
    gradient: "from-amber-500/20 to-orange-500/20",
    iconColor: "text-amber-400",
  },
  {
    icon: Zap,
    title: "Production-Grade Infra",
    description:
      "Semantic caching, thread-safe sessions, 10 SQLite tables with auto-migration, rate limiting, and prompt injection defense.",
    gradient: "from-rose-500/20 to-pink-500/20",
    iconColor: "text-rose-400",
  },
  {
    icon: Database,
    title: "Semantic Caching",
    description:
      "Two-tier caching with SHA-256 hash matching and cosine similarity search. Only verified-complete simulations are cached.",
    gradient: "from-violet-500/20 to-purple-500/20",
    iconColor: "text-violet-400",
  },
  {
    icon: Palette,
    title: "Interactive Visualizations",
    description:
      "Mermaid flowcharts with semantic node shapes, zoom & pan controls, clickable node inspection, and draggable data overlays.",
    gradient: "from-cyan-500/20 to-sky-500/20",
    iconColor: "text-cyan-400",
  },
  {
    icon: GitBranch,
    title: "Algorithm Library",
    description:
      "Pre-built presets for sorting, graph algorithms, dynamic programming, AI/ML, systems, biology, and mathematics.",
    gradient: "from-lime-500/20 to-green-500/20",
    iconColor: "text-lime-400",
  },
  {
    icon: MessageSquare,
    title: "Node Inspection",
    description:
      "Click any node to send context to the LLM. Get tooltips with current value, what changed, and what happens next.",
    gradient: "from-fuchsia-500/20 to-pink-500/20",
    iconColor: "text-fuchsia-400",
  },
];

export function Features() {
  return (
    <section id="features" className="py-24 md:py-32 relative">
      {/* Background Elements */}
      <div className="absolute inset-0 grid-pattern opacity-20" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <p className="text-primary font-mono text-sm tracking-wider mb-4">
            CAPABILITIES
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4 text-balance">
            Built for Learning at Scale
          </h2>
          <p className="max-w-2xl mx-auto text-muted-foreground text-lg text-balance">
            A comprehensive platform combining AI-powered generation,
            intelligent error recovery, and interactive visualization.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className={cn(
                "group relative p-6 rounded-xl bg-card border border-border",
                "hover:border-primary/30 transition-all duration-300",
                "glow-card hover:glow-primary"
              )}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {/* Gradient Background on Hover */}
              <div
                className={cn(
                  "absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300",
                  `bg-gradient-to-br ${feature.gradient}`
                )}
              />

              {/* Content */}
              <div className="relative">
                <div
                  className={cn(
                    "w-12 h-12 rounded-lg flex items-center justify-center mb-4",
                    "bg-secondary border border-border",
                    "group-hover:border-primary/30 transition-colors"
                  )}
                >
                  <feature.icon className={cn("w-6 h-6", feature.iconColor)} />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
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

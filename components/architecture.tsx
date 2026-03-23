"use client";

import { cn } from "@/lib/utils";

const architectureLayers = [
  {
    title: "Client Layer",
    subtitle: "Browser (Vanilla JS)",
    color: "border-emerald-500/50",
    bgColor: "bg-emerald-500/5",
    modules: [
      { name: "10-Module Frontend", desc: "IIFE Architecture" },
      { name: "Three.js", desc: "Neural Background" },
      { name: "Mermaid.js", desc: "Diagram Renderer" },
      { name: "JS Sanitizer", desc: "13 Phases" },
    ],
  },
  {
    title: "Server Layer",
    subtitle: "Flask Backend",
    color: "border-blue-500/50",
    bgColor: "bg-blue-500/5",
    modules: [
      { name: "8 Blueprints", desc: "REST API Routes" },
      { name: "Persona Engine", desc: "3 AI Teaching Styles" },
      { name: "Session Manager", desc: "Thread-Safe + TTL" },
      { name: "Mermaid Sanitizer", desc: "23+ Regex Transforms" },
    ],
  },
  {
    title: "Cache Layer",
    subtitle: "Persistence & Intelligence",
    color: "border-amber-500/50",
    bgColor: "bg-amber-500/5",
    modules: [
      { name: "Semantic Cache", desc: "SHA-256 + Cosine Sim" },
      { name: "Repair Tracker", desc: "Retry Budget System" },
      { name: "SQLite (WAL)", desc: "10 Tables + Auto-Migration" },
      { name: "Feedback Logger", desc: "ML Training Data" },
    ],
  },
  {
    title: "External Services",
    subtitle: "AI & Vector Search",
    color: "border-violet-500/50",
    bgColor: "bg-violet-500/5",
    modules: [
      { name: "Gemini 2.5 Pro", desc: "Streaming Generation" },
      { name: "Gemini Embeddings", desc: "768-dim Vectors" },
      { name: "FAISS Index", desc: "L2 Similarity Search" },
      { name: "LangChain", desc: "RAG Orchestration" },
    ],
  },
];

const pipelineTiers = [
  {
    tier: 1,
    method: "Python Regex Sanitizer",
    transforms: "23+ transforms",
    speed: "~5ms",
    cost: "Free",
    color: "bg-emerald-500",
  },
  {
    tier: 2,
    method: "Python + JS Sanitizer",
    transforms: "13 phases",
    speed: "~10ms",
    cost: "Free",
    color: "bg-blue-500",
  },
  {
    tier: 3,
    method: "LLM Repair + Python",
    transforms: "AI-assisted",
    speed: "~3-10s",
    cost: "API call",
    color: "bg-amber-500",
  },
  {
    tier: 4,
    method: "LLM + Python + JS",
    transforms: "Full pipeline",
    speed: "~3-10s",
    cost: "API call",
    color: "bg-rose-500",
  },
];

export function Architecture() {
  return (
    <section id="architecture" className="py-24 md:py-32 relative bg-card/50">
      {/* Background Elements */}
      <div className="absolute inset-0 grid-pattern opacity-10" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <p className="text-primary font-mono text-sm tracking-wider mb-4">
            ARCHITECTURE
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4 text-balance">
            Production-Grade Engineering
          </h2>
          <p className="max-w-2xl mx-auto text-muted-foreground text-lg text-balance">
            64 source files across 4 languages, designed for performance,
            reliability, and scalability.
          </p>
        </div>

        {/* Architecture Layers */}
        <div className="grid lg:grid-cols-4 gap-6 mb-20">
          {architectureLayers.map((layer) => (
            <div
              key={layer.title}
              className={cn(
                "rounded-xl border p-6",
                layer.color,
                layer.bgColor
              )}
            >
              <h3 className="font-semibold text-foreground mb-1">
                {layer.title}
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                {layer.subtitle}
              </p>
              <div className="space-y-3">
                {layer.modules.map((module) => (
                  <div
                    key={module.name}
                    className="p-3 rounded-lg bg-background/50 border border-border/50"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {module.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {module.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Self-Healing Pipeline */}
        <div className="border border-border rounded-xl p-8 bg-card">
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-foreground mb-2">
              4-Tier Self-Healing Pipeline
            </h3>
            <p className="text-muted-foreground">
              Automatically repairs ~85% of render failures with escalating
              complexity
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            {pipelineTiers.map((tier) => (
              <div
                key={tier.tier}
                className="relative p-5 rounded-lg bg-secondary/50 border border-border"
              >
                {/* Tier Badge */}
                <div
                  className={cn(
                    "absolute -top-3 left-4 px-3 py-1 rounded-full text-xs font-bold text-white",
                    tier.color
                  )}
                >
                  Tier {tier.tier}
                </div>

                <div className="mt-4 space-y-2">
                  <p className="font-medium text-foreground text-sm">
                    {tier.method}
                  </p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{tier.transforms}</span>
                    <span>{tier.speed}</span>
                  </div>
                  <div className="pt-2 border-t border-border/50">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        tier.cost === "Free"
                          ? "text-emerald-400"
                          : "text-amber-400"
                      )}
                    >
                      {tier.cost}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Distribution Bar */}
          <div className="mt-8">
            <p className="text-sm text-muted-foreground mb-3">
              Target Distribution
            </p>
            <div className="flex h-3 rounded-full overflow-hidden bg-secondary">
              <div
                className="bg-emerald-500"
                style={{ width: "60%" }}
                title="Tier 1: ~60%"
              />
              <div
                className="bg-blue-500"
                style={{ width: "25%" }}
                title="Tier 2: ~25%"
              />
              <div
                className="bg-amber-500"
                style={{ width: "10%" }}
                title="Tier 3: ~10%"
              />
              <div
                className="bg-rose-500"
                style={{ width: "5%" }}
                title="Tier 4: ~5%"
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>~60% Tier 1</span>
              <span>~25% Tier 2</span>
              <span>~15% Tiers 3/4</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

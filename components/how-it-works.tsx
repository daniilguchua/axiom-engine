"use client";

import { Search, Cpu, Play, Repeat } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Search,
    title: "Type Any Algorithm",
    description:
      "Enter any algorithm, data structure, or CS concept. From QuickSort to Neural Networks, AXIOM understands hundreds of topics.",
    visual: (
      <div className="bg-card rounded-lg border border-border p-4 font-mono text-sm">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <div className="w-3 h-3 rounded-full bg-red-500/50" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
          <div className="w-3 h-3 rounded-full bg-green-500/50" />
        </div>
        <p className="text-foreground">
          <span className="text-primary">{">"}</span> Simulate binary search step by step
        </p>
      </div>
    ),
  },
  {
    number: "02",
    icon: Cpu,
    title: "AI Generates Visualization",
    description:
      "Our AI engine processes your request, generates concrete example data, and creates a complete step-by-step simulation with Mermaid diagrams.",
    visual: (
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs text-muted-foreground font-mono">PROCESSING</span>
        </div>
        <div className="space-y-2">
          <div className="h-2 bg-primary/20 rounded-full w-full" />
          <div className="h-2 bg-primary/20 rounded-full w-4/5" />
          <div className="h-2 bg-primary/20 rounded-full w-3/5" />
        </div>
      </div>
    ),
  },
  {
    number: "03",
    icon: Play,
    title: "Step Through Execution",
    description:
      "Navigate through each step of the algorithm. See exactly what changes at each iteration with highlighted nodes and data tables.",
    visual: (
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-mono text-muted-foreground">Step 3/7</span>
          <div className="flex gap-1">
            <div className="w-6 h-6 rounded bg-secondary flex items-center justify-center text-xs">{"<"}</div>
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center text-xs text-primary-foreground">{">"}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 bg-primary rounded-full" />
          <div className="flex-1 h-1 bg-primary rounded-full" />
          <div className="flex-1 h-1 bg-primary rounded-full" />
          <div className="flex-1 h-1 bg-border rounded-full" />
          <div className="flex-1 h-1 bg-border rounded-full" />
        </div>
      </div>
    ),
  },
  {
    number: "04",
    icon: Repeat,
    title: "Continue or Ask Questions",
    description:
      "Generate more steps, click nodes for explanations, or ask follow-up questions. AXIOM maintains context throughout your session.",
    visual: (
      <div className="bg-card rounded-lg border border-border p-4 space-y-2">
        <div className="flex items-start gap-2">
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary">?</div>
          <div className="flex-1 bg-secondary rounded-lg px-3 py-2 text-sm text-muted-foreground">
            Why did we choose this pivot?
          </div>
        </div>
        <div className="flex items-start gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-xs text-blue-400">A</div>
          <div className="flex-1 bg-blue-500/10 rounded-lg px-3 py-2 text-sm text-foreground">
            The median-of-three strategy...
          </div>
        </div>
      </div>
    ),
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-28 md:py-36 relative">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/30 to-background" />
      
      <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 rounded-full bg-primary/10 border border-primary/20">
            <span className="text-xs font-medium text-primary uppercase tracking-wider">How It Works</span>
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6 text-balance">
            From question to
            <br />
            <span className="gradient-text">understanding in seconds</span>
          </h2>
          <p className="max-w-2xl mx-auto text-muted-foreground text-lg">
            AXIOM transforms how you learn algorithms. No more static diagrams or 
            confusing explanations.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-12 lg:space-y-0 lg:grid lg:grid-cols-4 lg:gap-8">
          {steps.map((step, index) => (
            <div key={step.number} className="relative">
              {/* Connector Line (desktop) */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 left-[calc(100%+1rem)] w-[calc(100%-2rem)] h-px bg-gradient-to-r from-border via-primary/30 to-border" />
              )}
              
              <div className="flex flex-col">
                {/* Number & Icon */}
                <div className="flex items-center gap-4 mb-6">
                  <span className="text-5xl font-bold text-border/50">{step.number}</span>
                  <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <step.icon className="w-6 h-6 text-primary" />
                  </div>
                </div>
                
                {/* Content */}
                <h3 className="text-xl font-semibold text-foreground mb-3">
                  {step.title}
                </h3>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  {step.description}
                </p>
                
                {/* Visual */}
                {step.visual}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

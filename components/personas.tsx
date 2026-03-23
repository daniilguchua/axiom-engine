"use client";

import { cn } from "@/lib/utils";
import { Compass, Cog, Building2 } from "lucide-react";

const personas = [
  {
    id: "explorer",
    name: "Explorer",
    icon: Compass,
    level: "Beginner",
    temperature: "0.7",
    color: "emerald",
    gradient: "from-emerald-500 to-teal-500",
    borderColor: "border-emerald-500/30",
    bgColor: "bg-emerald-500/5",
    description:
      "Friendly, patient teaching style with extensive hand-holding. Uses analogies and everyday comparisons to explain concepts.",
    traits: [
      "Simple vocabulary and short sentences",
      "Step-by-step breakdowns with visual cues",
      "Encourages exploration and questions",
      "Celebrates small victories",
    ],
    example:
      '"Think of a linked list like a treasure hunt! Each clue (node) tells you where to find the next one..."',
  },
  {
    id: "engineer",
    name: "Engineer",
    icon: Cog,
    level: "Intermediate",
    temperature: "0.5",
    color: "blue",
    gradient: "from-blue-500 to-cyan-500",
    borderColor: "border-blue-500/30",
    bgColor: "bg-blue-500/5",
    description:
      "Practical, hands-on approach focused on implementation details and real-world applications. Balanced explanations with code.",
    traits: [
      "Technical terminology with clear definitions",
      "Code snippets and complexity analysis",
      "Trade-offs and optimization strategies",
      "Industry best practices and patterns",
    ],
    example:
      '"The partition function runs in O(n) time. Notice how we use a two-pointer approach to minimize swaps..."',
  },
  {
    id: "architect",
    name: "Architect",
    icon: Building2,
    level: "Advanced",
    temperature: "0.3",
    color: "violet",
    gradient: "from-violet-500 to-purple-500",
    borderColor: "border-violet-500/30",
    bgColor: "bg-violet-500/5",
    description:
      "Deep theoretical foundations and formal proofs. Connects concepts to broader CS theory and research papers.",
    traits: [
      "Mathematical notation and formal proofs",
      "Amortized analysis and invariants",
      "Historical context and academic citations",
      "Connection to advanced topics",
    ],
    example:
      '"By the Master Theorem, this recurrence T(n) = 2T(n/2) + O(n) yields O(n log n) complexity..."',
  },
];

export function Personas() {
  return (
    <section id="personas" className="py-24 md:py-32 relative">
      {/* Background Elements */}
      <div className="absolute inset-0 grid-pattern opacity-20" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <p className="text-primary font-mono text-sm tracking-wider mb-4">
            AI PERSONAS
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4 text-balance">
            Three Teaching Styles, One Goal
          </h2>
          <p className="max-w-2xl mx-auto text-muted-foreground text-lg text-balance">
            Each persona has distinct temperature tuning, vocabulary, and
            pedagogical strategies tailored to different learning levels.
          </p>
        </div>

        {/* Personas Grid */}
        <div className="grid lg:grid-cols-3 gap-8">
          {personas.map((persona) => (
            <div
              key={persona.id}
              className={cn(
                "relative rounded-2xl border p-8",
                persona.borderColor,
                persona.bgColor,
                "transition-all duration-300 hover:border-opacity-60"
              )}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      "w-14 h-14 rounded-xl flex items-center justify-center",
                      `bg-gradient-to-br ${persona.gradient}`
                    )}
                  >
                    <persona.icon className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground">
                      {persona.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {persona.level}
                    </p>
                  </div>
                </div>
                <div className="px-3 py-1 rounded-full bg-secondary text-xs font-mono text-muted-foreground">
                  temp: {persona.temperature}
                </div>
              </div>

              {/* Description */}
              <p className="text-muted-foreground mb-6 leading-relaxed">
                {persona.description}
              </p>

              {/* Traits */}
              <div className="space-y-2 mb-6">
                {persona.traits.map((trait) => (
                  <div
                    key={trait}
                    className="flex items-start gap-2 text-sm text-foreground/80"
                  >
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0",
                        `bg-${persona.color}-400`
                      )}
                      style={{
                        backgroundColor:
                          persona.color === "emerald"
                            ? "#34d399"
                            : persona.color === "blue"
                            ? "#60a5fa"
                            : "#a78bfa",
                      }}
                    />
                    {trait}
                  </div>
                ))}
              </div>

              {/* Example Quote */}
              <div className="p-4 rounded-lg bg-background/50 border border-border/50">
                <p className="text-sm italic text-muted-foreground">
                  {persona.example}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

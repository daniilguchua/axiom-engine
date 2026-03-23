"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Play, ChevronRight, ChevronLeft, RotateCcw } from "lucide-react";

const algorithmCategories = [
  {
    name: "Data Structures",
    algorithms: ["Binary Search", "QuickSort", "MergeSort", "BST Operations"],
  },
  {
    name: "Graph Algorithms",
    algorithms: ["Dijkstra's", "BFS", "DFS", "A* Pathfinding"],
  },
  {
    name: "Dynamic Programming",
    algorithms: ["Knapsack", "LCS", "Coin Change", "Edit Distance"],
  },
  {
    name: "AI / ML",
    algorithms: ["Backpropagation", "Attention", "Gradient Descent", "K-Means"],
  },
];

const mockSteps = [
  {
    step: 1,
    title: "Initialize Array",
    description:
      "We start with an unsorted array of 8 elements. QuickSort will recursively partition this array around pivot elements until all elements are sorted.",
    data: "[64, 34, 25, 12, 22, 11, 90, 42]",
    highlight: "Initial state - no comparisons yet",
  },
  {
    step: 2,
    title: "Choose Pivot",
    description:
      "Using the last element strategy, we select 42 as our pivot. All elements smaller than 42 will move to the left, larger elements to the right.",
    data: "[64, 34, 25, 12, 22, 11, 90, [42]]",
    highlight: "Pivot selected: 42",
  },
  {
    step: 3,
    title: "Partition",
    description:
      "After partitioning, elements less than 42 are on the left, greater elements on the right. The pivot is now in its final sorted position.",
    data: "[34, 25, 12, 22, 11] | 42 | [64, 90]",
    highlight: "Pivot 42 is now sorted",
  },
];

export function Demo() {
  const [selectedCategory, setSelectedCategory] = useState(0);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const currentStepData = mockSteps[currentStep];

  return (
    <section id="demo" className="py-24 md:py-32 relative bg-card/50">
      {/* Background Elements */}
      <div className="absolute inset-0 grid-pattern opacity-10" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <p className="text-primary font-mono text-sm tracking-wider mb-4">
            INTERACTIVE DEMO
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4 text-balance">
            See It In Action
          </h2>
          <p className="max-w-2xl mx-auto text-muted-foreground text-lg text-balance">
            Experience how AXIOM transforms complex algorithms into
            understandable step-by-step visualizations.
          </p>
        </div>

        {/* Demo Interface */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Algorithm Selector */}
          <div className="lg:col-span-1 space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              Select Algorithm
            </h3>
            {algorithmCategories.map((category, catIndex) => (
              <div key={category.name} className="space-y-2">
                <p className="text-xs font-mono text-muted-foreground/70 uppercase tracking-wider">
                  {category.name}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {category.algorithms.map((algo, algoIndex) => (
                    <button
                      key={algo}
                      onClick={() => {
                        setSelectedCategory(catIndex);
                        setSelectedAlgorithm(algoIndex);
                        setCurrentStep(0);
                      }}
                      className={cn(
                        "px-3 py-2 text-sm rounded-lg border transition-all text-left",
                        selectedCategory === catIndex &&
                          selectedAlgorithm === algoIndex
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary text-secondary-foreground border-border hover:border-primary/50"
                      )}
                    >
                      {algo}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Visualization Area */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-border bg-background overflow-hidden">
              {/* Visualization Header */}
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500" />
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                </div>
                <span className="text-sm font-mono text-muted-foreground">
                  {
                    algorithmCategories[selectedCategory].algorithms[
                      selectedAlgorithm
                    ]
                  }{" "}
                  Simulation
                </span>
              </div>

              {/* Mermaid-like Visualization */}
              <div className="p-8 min-h-[300px] flex items-center justify-center">
                <div className="w-full max-w-lg">
                  {/* Mock Flowchart */}
                  <div className="flex flex-col items-center gap-4">
                    <div className="px-6 py-3 rounded-xl bg-primary/20 border border-primary/30 text-primary font-mono text-sm">
                      Step {currentStepData.step}: {currentStepData.title}
                    </div>
                    <div className="w-px h-8 bg-border" />
                    <div className="px-4 py-2 rounded-lg bg-secondary border border-border font-mono text-sm text-foreground">
                      {currentStepData.data}
                    </div>
                    <div className="w-px h-8 bg-border" />
                    <div className="px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
                      {currentStepData.highlight}
                    </div>
                  </div>
                </div>
              </div>

              {/* Step Description */}
              <div className="p-6 border-t border-border bg-card/50">
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {currentStepData.description}
                </p>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-between p-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentStep(0)}
                    className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground transition-colors"
                    aria-label="Reset"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() =>
                      setCurrentStep(Math.max(0, currentStep - 1))
                    }
                    disabled={currentStep === 0}
                    className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground transition-colors disabled:opacity-50"
                    aria-label="Previous step"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      isPlaying
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary hover:bg-secondary/80 text-muted-foreground"
                    )}
                    aria-label={isPlaying ? "Pause" : "Play"}
                  >
                    <Play className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() =>
                      setCurrentStep(
                        Math.min(mockSteps.length - 1, currentStep + 1)
                      )
                    }
                    disabled={currentStep === mockSteps.length - 1}
                    className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground transition-colors disabled:opacity-50"
                    aria-label="Next step"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="text-sm text-muted-foreground">
                  Step {currentStep + 1} of {mockSteps.length}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";

const categories = [
  {
    name: "Sorting",
    algorithms: ["QuickSort", "MergeSort", "HeapSort", "Bubble Sort", "Insertion Sort", "Radix Sort"],
  },
  {
    name: "Graphs",
    algorithms: ["BFS", "DFS", "Dijkstra's", "A* Pathfinding", "Kruskal's MST", "Floyd-Warshall"],
  },
  {
    name: "Trees",
    algorithms: ["AVL Tree", "Red-Black Tree", "B-Tree", "Trie", "Segment Tree", "Binary Search Tree"],
  },
  {
    name: "Dynamic Programming",
    algorithms: ["Knapsack", "LCS", "Edit Distance", "Coin Change", "Matrix Chain", "Kadane's"],
  },
  {
    name: "Search",
    algorithms: ["Binary Search", "Linear Search", "Jump Search", "Interpolation Search", "Exponential Search"],
  },
  {
    name: "AI/ML",
    algorithms: ["Neural Network", "Gradient Descent", "Backpropagation", "K-Means", "Decision Tree", "SVM"],
  },
];

export function Algorithms() {
  const [activeCategory, setActiveCategory] = useState(0);

  return (
    <section id="algorithms" className="py-28 md:py-36 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_hsl(var(--primary)/0.05)_0%,_transparent_50%)]" />
      
      <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 rounded-full bg-primary/10 border border-primary/20">
            <span className="text-xs font-medium text-primary uppercase tracking-wider">Algorithm Library</span>
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6 text-balance">
            100+ algorithms
            <br />
            <span className="gradient-text">ready to explore</span>
          </h2>
          <p className="max-w-2xl mx-auto text-muted-foreground text-lg">
            From classic sorting algorithms to advanced AI concepts. Choose a preset or 
            type your own custom query.
          </p>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {categories.map((category, index) => (
            <button
              key={category.name}
              onClick={() => setActiveCategory(index)}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                activeCategory === index
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>

        {/* Algorithm Pills */}
        <div className="flex flex-wrap justify-center gap-3 max-w-4xl mx-auto">
          {categories[activeCategory].algorithms.map((algorithm) => (
            <div
              key={algorithm}
              className="group px-5 py-3 rounded-xl bg-card border border-border hover:border-primary/50 cursor-pointer transition-all duration-300 hover:bg-primary/5"
            >
              <span className="text-foreground group-hover:text-primary transition-colors">
                {algorithm}
              </span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <p className="text-muted-foreground mb-6">
            Don't see what you're looking for? Just type any algorithm or concept.
          </p>
          <a
            href="#launch"
            className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground font-medium rounded-xl transition-all duration-300 hover:shadow-[0_0_40px_hsl(var(--primary)/0.4)] hover:-translate-y-0.5"
          >
            Try AXIOM Now
          </a>
        </div>
      </div>
    </section>
  );
}

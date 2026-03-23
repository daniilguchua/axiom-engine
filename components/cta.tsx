"use client";

import { ArrowRight, Sparkles } from "lucide-react";

export function CTA() {
  return (
    <section id="launch" className="py-28 md:py-36 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/10 rounded-full blur-[150px]" />
      
      <div className="relative max-w-4xl mx-auto px-6 lg:px-8 text-center">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-8">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        
        {/* Heading */}
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6">
          Ready to see algorithms
          <br />
          <span className="gradient-text">come alive?</span>
        </h2>
        
        {/* Description */}
        <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
          Start exploring algorithms with AXIOM Engine. No signup required. 
          Just type and watch the visualization unfold.
        </p>
        
        {/* CTA Button */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="/app"
            className="group relative flex items-center gap-3 px-10 py-5 bg-primary text-primary-foreground text-lg font-medium rounded-2xl transition-all duration-300 hover:shadow-[0_0_60px_hsl(var(--primary)/0.5)] hover:-translate-y-1"
          >
            <span>Launch AXIOM Engine</span>
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            
            {/* Glow */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary via-blue-500 to-primary opacity-0 group-hover:opacity-100 transition-opacity blur-2xl -z-10" />
          </a>
        </div>
        
        {/* Trust Indicators */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>Open Source</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>No Signup Required</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>Free to Use</span>
          </div>
        </div>
      </div>
    </section>
  );
}

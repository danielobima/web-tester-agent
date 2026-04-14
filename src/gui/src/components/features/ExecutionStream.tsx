import { useState } from "react";
import { Icons } from "../ui/Icons";
import { Carousel } from "./Carousel";

export interface TestStep {
  id: string;
  step: string;
  status: "success" | "failed" | "pending";
  duration: string;
  description: string;
  stateDescription?: string;
  error?: string;
  screenshot?: string;
  action?: any;
}

interface ExecutionStreamProps {
  results: TestStep[];
  isGenerating?: boolean;
  onReplay?: () => void;
}

export const ExecutionStream = ({
  results,
  isGenerating = false,
  onReplay,
}: ExecutionStreamProps) => {
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [carouselIndex, setCarouselIndex] = useState<number | null>(null);

  const toggleStep = (id: string) => {
    setExpandedStepId(expandedStepId === id ? null : id);
  };

  return (
    <div className="h-full bg-surface-lowest rounded-md shadow-ambient overflow-hidden flex flex-col border border-on-surface/5">
      <div className="h-14 bg-surface-low flex items-center justify-between px-6 border-b border-on-surface/5 shrink-0">
        <div className="flex items-center gap-3">
          <Icons.Dashboard />
          <span className="text-sm font-bold">Execution Stream</span>
        </div>
        <div className="flex items-center gap-4">
          {results.length > 0 && (
            <button 
              onClick={() => setCarouselIndex(0)}
              className="flex items-center gap-2 text-[10px] font-bold text-on-surface/40 uppercase tracking-widest hover:text-primary transition-colors"
            >
              <Icons.Maximize /> Expand View
            </button>
          )}
          {isGenerating && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Live</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 p-6 space-y-3 overflow-y-auto bg-surface-lowest">
        {results.length === 0 && !isGenerating ? (
          <div className="h-full flex flex-col items-center justify-center text-on-surface/20 space-y-4 pt-20">
            <Icons.Wand />
            <p className="text-sm font-medium">Testing stream will appear here</p>
          </div>
        ) : (
          results.map((result) => (
            <div
              key={result.id}
              className={`rounded-md border border-on-surface/5 overflow-hidden transition-all ${
                result.status === "failed" ? "bg-orange-600/5 ring-1 ring-orange-600/10" : "bg-surface-low"
              }`}
            >
              <div 
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-on-surface/5 transition-colors"
                onClick={() => toggleStep(result.id)}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-sm ${result.status === "success" ? "bg-primary/10 text-primary" : result.status === "failed" ? "bg-orange-600/10 text-orange-600" : "bg-on-surface/5 text-on-surface/30"}`}>
                    {result.status === "success" && <Icons.CheckCircle />}
                    {result.status === "failed" && <Icons.XCircle />}
                    {result.status === "pending" && <Icons.Play />}
                  </div>
                  <span className="font-bold text-sm tracking-tight">{result.step}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-bold text-on-surface/30">{result.duration}</span>
                  <div className="text-on-surface/20">
                    {expandedStepId === result.id ? <Icons.ChevronUp /> : <Icons.ChevronDown />}
                  </div>
                </div>
              </div>

              {expandedStepId === result.id && (
                <div className="px-4 pb-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="pl-10 space-y-4">
                    <p className="text-sm font-medium text-on-surface/60 leading-relaxed">
                      {result.description}
                    </p>

                    {result.screenshot && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-on-surface/30">
                          <Icons.Image /> State Screenshot
                        </div>
                        <img 
                          src={result.screenshot} 
                          className="rounded border border-on-surface/5 shadow-sm max-w-full"
                          alt="Step State"
                        />
                      </div>
                    )}

                    {result.action && (
                      <div className="space-y-2">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface/30">Technial Action</div>
                        <pre className="bg-on-surface/[0.03] p-3 rounded text-[11px] font-mono overflow-x-auto border border-on-surface/5">
                          {JSON.stringify(result.action, null, 2)}
                        </pre>
                      </div>
                    )}

                    {result.error && (
                      <div className="p-3 bg-white rounded border border-orange-600/10">
                        <code className="text-xs text-orange-600 font-mono italic">Error: {result.error}</code>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="h-12 bg-surface-low border-t border-on-surface/5 flex items-center justify-between px-6 shrink-0">
        <div className="text-[10px] font-bold text-on-surface/30 uppercase tracking-widest">
          {results.length} steps executed
        </div>
        {!isGenerating && results.length > 0 && (
          <button onClick={onReplay} className="flex items-center gap-2 text-[10px] font-bold text-primary uppercase tracking-widest hover:underline">
            <Icons.TestSuites /> Replay
          </button>
        )}
      </div>
      {carouselIndex !== null && (
        <Carousel 
          steps={results} 
          activeIndex={carouselIndex} 
          onClose={() => setCarouselIndex(null)}
          onNavigate={setCarouselIndex}
        />
      )}
    </div>
  );
};

import { useState } from "react";
import { Icons } from "../ui/Icons";
import { Carousel } from "./Carousel";
import { FindingsSection, type Finding } from "./FindingsSection";

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
  issues?: { description: string; severity: string }[];
  url?: string;
  usability?: string[];
}

interface ExecutionStreamProps {
  results: TestStep[];
  issues: Finding[];
  isGenerating?: boolean;
  onReplay?: () => void;
}

export const ExecutionStream = ({
  results,
  issues,
  isGenerating = false,
  onReplay,
}: ExecutionStreamProps) => {
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [carouselIndex, setCarouselIndex] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"stream" | "findings">("stream");

  const toggleStep = (id: string) => {
    setExpandedStepId(expandedStepId === id ? null : id);
  };

  return (
    <div className="flex flex-col bg-surface-lowest rounded-md shadow-ambient overflow-hidden border border-on-surface/5 h-[700px]">
      {/* Header with Tabs */}
      <div className="h-14 bg-surface-low flex items-center justify-between px-6 border-b border-on-surface/5 shrink-0">
        <div className="flex items-center gap-8 h-full">
          <button 
            onClick={() => setActiveTab("stream")}
            className={`flex items-center gap-2 h-full border-b-2 transition-all ${
              activeTab === "stream" 
                ? "border-primary text-primary" 
                : "border-transparent text-on-surface/40 hover:text-on-surface/60"
            }`}
          >
            <Icons.Dashboard />
            <span className="text-xs font-bold uppercase tracking-widest">Action Stream</span>
          </button>
          <button 
            onClick={() => setActiveTab("findings")}
            className={`flex items-center gap-2 h-full border-b-2 transition-all relative ${
              activeTab === "findings" 
                ? "border-primary text-primary" 
                : "border-transparent text-on-surface/40 hover:text-on-surface/60"
            }`}
          >
            <Icons.Bug />
            <span className="text-xs font-bold uppercase tracking-widest">Agent Findings</span>
            {issues.length > 0 && (
              <span className="absolute -top-1 -right-4 bg-primary text-white text-[8px] font-bold px-1 rounded-full min-w-[14px] flex items-center justify-center">
                {issues.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-4">
          {activeTab === "stream" && results.length > 0 && (
            <button 
              onClick={() => setCarouselIndex(0)}
              className="flex items-center gap-2 text-[10px] font-bold text-on-surface/40 uppercase tracking-widest hover:text-primary transition-colors"
            >
              <Icons.Maximize /> Expand
            </button>
          )}
          {isGenerating && (
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Live</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        {/* Action Stream Tab */}
        {activeTab === "stream" && (
          <div className="absolute inset-0 p-5 space-y-3 overflow-y-auto bg-surface-lowest scrollbar-thin animate-in fade-in duration-200">
            {results.length === 0 && !isGenerating ? (
              <div className="h-full flex flex-col items-center justify-center text-on-surface/20 space-y-4 pt-20">
                <Icons.Wand />
                <p className="text-sm font-medium italic">Waiting for execution to start...</p>
              </div>
            ) : (
              results.map((result) => (
                <div
                  key={result.id}
                  className={`rounded-md border border-on-surface/5 overflow-hidden transition-all ${
                    result.status === "failed" ? "bg-red-600/5 ring-1 ring-red-600/10" : "bg-surface-low"
                  }`}
                >
                  <div 
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-on-surface/5 transition-colors"
                    onClick={() => toggleStep(result.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-sm ${result.status === "success" ? "bg-primary/10 text-primary" : result.status === "failed" ? "bg-red-600/10 text-red-600" : "bg-on-surface/5 text-on-surface/30"}`}>
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

                        {result.issues && result.issues.length > 0 && (
                          <div className="space-y-2">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-red-600/60">Local step findings</div>
                            <ul className="space-y-1.5">
                              {result.issues.map((issue, idx) => (
                                <li key={idx} className="flex gap-2 text-xs font-semibold text-on-surface/80">
                                  <span className="text-red-600 pt-1">•</span>
                                  {issue.description} <span className="text-[10px] opacity-40 uppercase">({issue.severity})</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {result.error && (
                          <div className="p-3 bg-white rounded border border-red-600/10">
                            <code className="text-xs text-red-600 font-mono italic">Error: {result.error}</code>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Findings Tab */}
        {activeTab === "findings" && (
          <div className="absolute inset-0 animate-in fade-in slide-in-from-right-2 duration-200 flex flex-col">
             <FindingsSection issues={issues} className="flex-1 border-none rounded-none shadow-none" hideHeader />
          </div>
        )}
      </div>

      <div className="h-12 bg-surface-low border-t border-on-surface/5 flex items-center justify-between px-6 shrink-0">
        <div className="text-[10px] font-bold text-on-surface/30 uppercase tracking-widest">
          {activeTab === "stream" ? `${results.length} steps executed` : `${issues.length} findings identified`}
        </div>
        {!isGenerating && results.length > 0 && (
          <button 
            onClick={onReplay} 
            className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest hover:underline transition-colors ${
              results.some(r => r.status === 'failed') ? 'text-red-600 hover:text-red-700' : 'text-primary'
            }`}
          >
            {results.some(r => r.status === 'failed') ? (
              <>
                <Icons.RotateCw /> Retry Execution
              </>
            ) : (
              <>
                <Icons.TestSuites /> Replay Test
              </>
            )}
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

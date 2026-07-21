import { useState, useRef, useEffect } from "react";
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
  snapshotBefore?: string;
  searchResults?: string;
  snapshotAfter?: string;
  usedVariables?: string[];
}

interface CollapsibleCodeViewerProps {
  title: string;
  content: string;
  icon: React.ReactNode;
}

export const CollapsibleCodeViewer = ({ title, content, icon }: CollapsibleCodeViewerProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Escaped search pattern for regex
  const escapedSearch = searchTerm.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const hasMinLength = searchTerm.length >= 1;
  const regex = hasMinLength ? new RegExp(escapedSearch, 'gi') : null;
  const matchCount = regex ? (content.match(regex) || []).length : 0;

  useEffect(() => {
    if (!searchTerm || !containerRef.current) return;
    const activeEl = containerRef.current.querySelector(
      `[data-match-idx="${activeMatchIndex}"]`
    );
    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [activeMatchIndex, searchTerm]);

  const renderHighlightedContent = () => {
    if (!regex) return content;

    const parts = content.split(new RegExp(`(${escapedSearch})`, 'gi'));
    let matchCounter = 0;

    return (
      <>
        {parts.map((part, i) => {
          if (regex.test(part)) {
            const currentIdx = matchCounter++;
            const isActive = currentIdx === activeMatchIndex;
            return (
              <mark
                key={i}
                data-match-idx={currentIdx}
                className={`rounded-sm px-0.5 transition-all ${
                  isActive
                    ? "bg-primary text-white font-bold ring-1 ring-primary"
                    : "bg-yellow-500/40 text-on-surface"
                }`}
              >
                {part}
              </mark>
            );
          }
          return part;
        })}
      </>
    );
  };

  return (
    <div className="space-y-2">
      <details className="group border border-on-surface/10 rounded-sm overflow-hidden bg-surface-low">
        <summary className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-on-surface/60 cursor-pointer hover:bg-on-surface/5 select-none list-none flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            {icon} {title}
          </span>
          <span className="transition-transform duration-200 group-open:rotate-180">
            <Icons.ChevronDown className="w-3.5 h-3.5" />
          </span>
        </summary>
        <div className="p-3 border-t border-on-surface/10 bg-black/5 flex flex-col h-[350px]">
          {/* VS Code like Search Bar */}
          <div className="flex items-center gap-2 mb-2 p-1.5 bg-surface-low border border-on-surface/10 rounded-sm shrink-0">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Find..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setActiveMatchIndex(0);
                }}
                className="w-full bg-surface-lowest text-xs px-2.5 py-1 pr-20 rounded border border-on-surface/10 focus:border-primary focus:outline-none text-on-surface"
              />
              {searchTerm && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-on-surface/40 select-none">
                  {matchCount > 0 ? `${activeMatchIndex + 1} of ${matchCount}` : "0 of 0"}
                </span>
              )}
            </div>
            
            <button
              disabled={matchCount <= 1}
              onClick={() => {
                setActiveMatchIndex((prev) => (prev - 1 + matchCount) % matchCount);
              }}
              className="p-1 rounded hover:bg-on-surface/5 disabled:opacity-30 disabled:hover:bg-transparent text-on-surface/60 transition-colors"
              title="Previous Match"
            >
              <Icons.ChevronUp className="w-3.5 h-3.5" />
            </button>
            
            <button
              disabled={matchCount <= 1}
              onClick={() => {
                setActiveMatchIndex((prev) => (prev + 1) % matchCount);
              }}
              className="p-1 rounded hover:bg-on-surface/5 disabled:opacity-30 disabled:hover:bg-transparent text-on-surface/60 transition-colors"
              title="Next Match"
            >
              <Icons.ChevronDown className="w-3.5 h-3.5" />
            </button>

            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setActiveMatchIndex(0);
                }}
                className="p-1 rounded hover:bg-on-surface/5 text-on-surface/60 transition-colors"
                title="Clear Search"
              >
                <Icons.Close className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div ref={containerRef} className="flex-1 overflow-y-auto bg-black/10 rounded p-2">
            <pre className="text-[10px] font-mono whitespace-pre-wrap text-on-surface/75">{renderHighlightedContent()}</pre>
          </div>
        </div>
      </details>
    </div>
  );
};

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

                        {result.usedVariables && result.usedVariables.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-primary/70">
                              <Icons.CheckCircle className="w-3.5 h-3.5" /> Used Variables
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {result.usedVariables.map((v, idx) => (
                                <span key={idx} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                                  {v}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

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
                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-on-surface/30">
                              <Icons.Code className="w-3.5 h-3.5" /> Action JSON Payload
                            </div>
                            <pre className="p-3 bg-black/5 rounded border border-on-surface/10 text-[10px] font-mono whitespace-pre-wrap text-on-surface/75">
                              {JSON.stringify(result.action, null, 2)}
                            </pre>
                          </div>
                        )}

                        {result.snapshotBefore && (
                          <CollapsibleCodeViewer
                            title="DOM Snapshot Before Action"
                            content={result.snapshotBefore}
                            icon={<Icons.Code className="w-3.5 h-3.5" />}
                          />
                        )}

                        {result.searchResults && (
                          <CollapsibleCodeViewer
                            title="Snapshot Search Results"
                            content={result.searchResults}
                            icon={<Icons.Search className="w-3.5 h-3.5" />}
                          />
                        )}

                        {result.snapshotAfter && (
                          <CollapsibleCodeViewer
                            title="DOM Snapshot After Action"
                            content={result.snapshotAfter}
                            icon={<Icons.Code className="w-3.5 h-3.5" />}
                          />
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

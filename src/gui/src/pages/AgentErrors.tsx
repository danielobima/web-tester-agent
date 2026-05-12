import { useState, useEffect } from "react";
import { Icons } from "../components/ui/Icons";
import { MarkdownRenderer } from "../components/ui/MarkdownRenderer";

interface ErrorSummary {
  id: string;
  timestamp: string;
  message: string;
  type: string;
  url: string;
}

export const AgentErrors = () => {
  const [errors, setErrors] = useState<ErrorSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedError, setSelectedError] = useState<any>(null);
  const [isViewingDetails, setIsViewingDetails] = useState(false);

  const loadErrors = async () => {
    setIsLoading(true);
    try {
      const data = await window.electron.listAgentErrors();
      setErrors(data);
    } catch (error) {
      console.error("Error loading agent errors:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadErrors();
  }, []);

  const handleViewDetails = async (errorId: string) => {
    try {
      const details = await window.electron.getAgentError(errorId);
      setSelectedError(details);
      setIsViewingDetails(true);
    } catch (error) {
      console.error("Failed to load error details:", error);
    }
  };

  const handleDelete = async (errorId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this error report?")) {
      await window.electron.deleteAgentError(errorId);
      loadErrors();
      if (selectedError?.id === errorId) {
        setIsViewingDetails(false);
      }
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex relative">
      <div className="flex-1 overflow-y-auto px-10 pb-20">
        <div className="max-w-6xl mx-auto py-10">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h1 className="text-3xl font-bold font-display tracking-tight">Agent Debugger</h1>
              <p className="text-on-surface/40 mt-1 font-medium">Investigate agent failures, schema errors, and technical defects</p>
            </div>
            <button 
              onClick={loadErrors}
              className="p-3 text-on-surface/40 hover:text-primary transition-all rounded-full hover:bg-primary/5"
              title="Refresh"
            >
              <Icons.RotateCw />
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 bg-surface-low rounded-xl border border-on-surface/5 animate-pulse"></div>
              ))}
            </div>
          ) : errors.length === 0 ? (
            <div className="h-[400px] flex flex-col items-center justify-center text-on-surface/20 space-y-6 bg-surface-low/50 rounded-2xl border border-dashed border-on-surface/10">
              <Icons.Bug />
              <div className="text-center">
                <p className="text-lg font-bold text-on-surface/40">No errors detected</p>
                <p className="text-sm">Agent executions are running smoothly!</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {errors.map((error) => (
                <div 
                  key={error.id}
                  onClick={() => handleViewDetails(error.id)}
                  className={`bg-surface-low p-6 rounded-xl border transition-all group flex items-center justify-between cursor-pointer ${
                    selectedError?.id === error.id ? 'border-primary bg-surface-lowest shadow-premium' : 'border-on-surface/5 hover:border-primary/30 hover:bg-surface-lowest'
                  }`}
                >
                  <div className="flex items-center gap-6 flex-1 min-w-0">
                    <div className="p-3 bg-red-500/10 text-red-500 rounded-lg shrink-0">
                      <Icons.XCircle />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-red-500 bg-red-500/10 px-2 py-0.5 rounded">
                          {error.type}
                        </span>
                        <span className="text-[10px] font-bold text-on-surface/30 uppercase tracking-widest">
                          {new Date(error.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <h3 className="font-bold text-base text-on-surface truncate group-hover:text-primary transition-colors">
                        {error.message}
                      </h3>
                      <p className="text-xs text-on-surface/40 truncate font-mono mt-1">{error.url}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 ml-6 shrink-0">
                    <button 
                      onClick={(e) => handleDelete(error.id, e)}
                      className="p-2 text-on-surface/20 hover:text-red-500 transition-colors rounded-lg hover:bg-red-500/5"
                    >
                      <Icons.Trash />
                    </button>
                    <Icons.ChevronRight className="text-on-surface/10 group-hover:text-primary transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Backdrop */}
      {isViewingDetails && selectedError && (
        <div 
          className="absolute inset-0 bg-surface-lowest/60 backdrop-blur-[4px] z-20 animate-in fade-in duration-300"
          onClick={() => setIsViewingDetails(false)}
        />
      )}

      {/* Detail Slide-over */}
      {isViewingDetails && selectedError && (
        <div className="absolute right-0 top-0 h-full w-[800px] bg-surface-lowest border-l border-on-surface/10 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col z-30">
          <div className="p-8 border-b border-on-surface/5 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-xl font-bold font-display tracking-tight text-on-surface">Error Investigation</h2>
              <p className="text-xs text-on-surface/40 font-medium mt-1">{selectedError.id}</p>
            </div>
            <button 
              onClick={() => setIsViewingDetails(false)}
              className="p-2 hover:bg-on-surface/5 rounded-full transition-colors text-on-surface/40"
            >
              <Icons.XCircle />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-10">
            {/* Error Header */}
            <section className="bg-red-500/5 border border-red-500/10 p-6 rounded-2xl space-y-4">
               <div className="flex items-center gap-3">
                 <div className="p-2 bg-red-500 text-white rounded-lg">
                   <Icons.Bug />
                 </div>
                 <h3 className="text-lg font-bold text-on-surface">{selectedError.error.message}</h3>
               </div>
               {selectedError.error.details && (
                 <div className="bg-surface-lowest/50 p-4 rounded-xl border border-red-500/10">
                   <pre className="text-xs text-red-600 font-mono whitespace-pre-wrap">
                     {typeof selectedError.error.details === 'string' ? selectedError.error.details : JSON.stringify(selectedError.error.details, null, 2)}
                   </pre>
                 </div>
               )}
               <div className="flex gap-4">
                 <div className="flex flex-col">
                   <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface/30">Phase</span>
                   <span className="text-xs font-bold text-red-500 uppercase">{selectedError.error.type}</span>
                 </div>
                 <div className="flex flex-col">
                   <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface/30">Step</span>
                   <span className="text-xs font-bold text-on-surface">#{selectedError.environment.step}</span>
                 </div>
                 <div className="flex flex-col max-w-xs min-w-0">
                   <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface/30">URL</span>
                   <span className="text-xs font-bold text-on-surface truncate">{selectedError.environment.url}</span>
                 </div>
               </div>
            </section>

            {/* Context */}
            <section className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface/30">Requirement</h3>
                <div className="p-4 bg-surface-low rounded-xl border border-on-surface/5 text-sm font-medium italic">
                  "{selectedError.environment.requirement}"
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface/30">Active Task</h3>
                <div className="p-4 bg-surface-low rounded-xl border border-on-surface/5">
                  <p className="text-xs font-bold text-primary mb-1">{selectedError.environment.taskId}</p>
                  <p className="text-sm font-medium">"{selectedError.environment.taskDescription}"</p>
                </div>
              </div>
            </section>

            {/* Visual State */}
            <section className="space-y-4">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface/30">Visual Evidence</h3>
              <div className="rounded-2xl border border-on-surface/10 overflow-hidden bg-black aspect-video flex items-center justify-center relative group">
                <img 
                  src={`media://${selectedError.screenshotPath}?t=${Date.now()}`} 
                  alt="Error State" 
                  className="max-w-full max-h-full object-contain"
                  onError={(e) => {
                    (e.target as any).src = "https://placehold.co/800x450/111/444?text=No+Screenshot+Available";
                  }}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                   <a 
                    href={`media://${selectedError.screenshotPath}`} 
                    target="_blank" 
                    className="bg-white text-black px-4 py-2 rounded-lg font-bold text-sm shadow-premium"
                   >
                     View Full Image
                   </a>
                </div>
              </div>
            </section>

            {/* Technical Details */}
            <section className="space-y-6">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface/30">Technical Payload</h3>
              
              <div className="space-y-4">
                 <details className="group border border-on-surface/5 rounded-xl bg-surface-low overflow-hidden">
                   <summary className="p-4 cursor-pointer hover:bg-on-surface/5 flex items-center justify-between font-bold text-xs uppercase tracking-widest list-none">
                     <span>LLM Prompt</span>
                     <Icons.ChevronRight className="group-open:rotate-90 transition-transform" />
                   </summary>
                   <div className="p-4 border-t border-on-surface/5 bg-surface-lowest">
                      <pre className="text-[10px] font-mono whitespace-pre-wrap text-on-surface/60 overflow-x-auto max-h-[400px]">
                        {selectedError.llm.prompt}
                      </pre>
                   </div>
                 </details>

                 <details className="group border border-on-surface/5 rounded-xl bg-surface-low overflow-hidden">
                   <summary className="p-4 cursor-pointer hover:bg-on-surface/5 flex items-center justify-between font-bold text-xs uppercase tracking-widest list-none">
                     <span>Agent Stack Trace</span>
                     <Icons.ChevronRight className="group-open:rotate-90 transition-transform" />
                   </summary>
                   <div className="p-4 border-t border-on-surface/5 bg-surface-lowest">
                      <pre className="text-[10px] font-mono whitespace-pre-wrap text-red-500/70 overflow-x-auto max-h-[400px]">
                        {selectedError.error.stack}
                      </pre>
                   </div>
                 </details>

                 <details className="group border border-on-surface/5 rounded-xl bg-surface-low overflow-hidden">
                   <summary className="p-4 cursor-pointer hover:bg-on-surface/5 flex items-center justify-between font-bold text-xs uppercase tracking-widest list-none">
                     <span>Accessibility Tree Snapshot</span>
                     <Icons.ChevronRight className="group-open:rotate-90 transition-transform" />
                   </summary>
                   <div className="p-4 border-t border-on-surface/5 bg-surface-lowest">
                      <pre className="text-[10px] font-mono whitespace-pre-wrap text-on-surface/60 overflow-x-auto max-h-[400px]">
                        {selectedError.snapshot}
                      </pre>
                   </div>
                 </details>

                 {selectedError.llm.rawResponse && (
                   <details className="group border border-on-surface/5 rounded-xl bg-surface-low overflow-hidden mt-4">
                     <summary className="p-4 cursor-pointer hover:bg-on-surface/5 flex items-center justify-between font-bold text-xs uppercase tracking-widest list-none">
                       <span className="text-primary">Raw AI Output (Debug)</span>
                       <Icons.ChevronRight className="group-open:rotate-90 transition-transform" />
                     </summary>
                     <div className="p-4 border-t border-on-surface/5 bg-surface-lowest">
                        <pre className="text-[10px] font-mono whitespace-pre-wrap text-primary/80 overflow-x-auto max-h-[400px]">
                          {selectedError.llm.rawResponse}
                        </pre>
                     </div>
                   </details>
                 )}
              </div>
            </section>

            {/* History */}
            <section className="space-y-4">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface/30">Conversation History ({selectedError.history.length})</h3>
              <div className="space-y-4">
                {selectedError.history.map((msg: any, idx: number) => (
                  <div key={idx} className={`p-4 rounded-xl border ${msg.role === 'user' ? 'bg-primary/5 border-primary/10 ml-8' : 'bg-surface-low border-on-surface/5 mr-8'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[9px] font-bold uppercase tracking-widest ${msg.role === 'user' ? 'text-primary' : 'text-on-surface/40'}`}>
                        {msg.role}
                      </span>
                    </div>
                    <div className="text-xs leading-relaxed text-on-surface/80">
                      {typeof msg.content === 'string' ? msg.content : Array.isArray(msg.content) ? msg.content.map((c: any) => c.text).join('\n') : JSON.stringify(msg.content)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="p-8 bg-surface-low border-t border-on-surface/5 flex gap-4">
            <button 
              onClick={() => setIsViewingDetails(false)}
              className="flex-1 bg-surface-lowest border border-on-surface/10 py-4 rounded-xl font-bold text-sm hover:bg-on-surface/5 transition-all"
            >
              Close Investigation
            </button>
            <button 
              onClick={(e) => handleDelete(selectedError.id, e as any)}
              className="bg-red-500/10 text-red-500 px-8 py-4 rounded-xl font-bold text-sm hover:bg-red-500 hover:text-white transition-all"
            >
              Archive Report
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

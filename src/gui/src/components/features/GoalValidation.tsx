import { useState } from "react";
import { Icons } from "../ui/Icons";

interface Issue {
  id: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
}

interface Checklist {
  currentStateDescription: string;
  tasks: { id: string; description: string; status: string; result?: string }[];
  finished: boolean;
  screenshot?: string;
  issues?: Issue[];
}

interface ExecutionCompletionProps {
  checklist: Checklist;
  onAction: (action: "validate" | "prompt" | "cancel", feedback?: string) => void;
}

export const ExecutionCompletion = ({ checklist, onAction }: ExecutionCompletionProps) => {
  const [feedback, setFeedback] = useState("");

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "text-red-600 border-red-600/30";
      case "high": return "text-orange-600 border-orange-600/30";
      case "medium": return "text-amber-600 border-amber-600/30";
      case "low": return "text-blue-600 border-blue-600/30";
      default: return "text-on-surface/40 border-on-surface/5";
    }
  };

  return (
    <div className="fixed inset-0 bg-on-surface/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-surface-lowest rounded-md shadow-ambient w-full max-w-2xl flex flex-col border border-on-surface/5 animate-in zoom-in-95 duration-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-on-surface/5 flex items-center justify-between bg-surface-low/50">
          <div>
            <h2 className="text-2xl font-bold font-display tracking-tight text-on-surface">Execution Completion Review</h2>
            <p className="text-on-surface/50 text-xs font-medium uppercase tracking-widest mt-1">Senior QA Validation Phase</p>
          </div>
          <div className="p-3 bg-primary/10 text-primary rounded-md shadow-inner">
            <Icons.CheckCircle />
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-0 overflow-y-auto custom-scrollbar flex-1 max-h-[75vh]">
          {/* Main Visual & Story */}
          <div className="p-6 space-y-8">
            {/* 1. The Strategy (Checklist Summary) */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-on-surface/30">
                <Icons.List /> Execution Strategy Status
              </div>
              <div className="grid grid-cols-1 gap-2">
                {checklist.tasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-3 p-3 rounded-md bg-surface-low/30 border border-on-surface/5">
                    <div className={`mt-0.5 shrink-0 ${task.status === 'completed' ? 'text-primary' : 'text-on-surface/20'}`}>
                      {task.status === 'completed' ? <Icons.CheckCircle /> : <Icons.Circle />}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-bold leading-none ${task.status === 'completed' ? 'text-on-surface/80' : 'text-on-surface/40'}`}>
                        {task.description}
                      </p>
                      {task.result && (
                        <p className="text-[10px] text-on-surface/40 mt-1 italic line-clamp-1">{task.result}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 2. Visual Outcome */}
            {checklist.screenshot && (
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-on-surface/30">
                  <Icons.Image /> Final Visual State
                </div>
                <div className="relative group rounded-md overflow-hidden border border-on-surface/10 bg-black aspect-video shadow-2xl">
                  <img 
                    src={checklist.screenshot.startsWith('media://') ? checklist.screenshot : `data:image/jpeg;base64,${checklist.screenshot}`} 
                    alt="Final State" 
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest bg-black/40 backdrop-blur-md px-2 py-1 rounded border border-white/10">Active Browser Snapshot</span>
                  </div>
                </div>
              </section>
            )}

            {/* 3. Logical Conclusion */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-on-surface/30">
                <Icons.Monitor /> Agent's Conclusion
              </div>
              <div className="bg-primary/5 rounded-md p-5 border border-primary/10 shadow-inner">
                <p className="text-sm font-medium leading-relaxed text-on-surface/80 italic">
                  "{checklist.currentStateDescription}"
                </p>
              </div>
            </section>

            {/* 4. Automated Findings (Unified) */}
            <section className="space-y-4">
               <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-on-surface/30">
                 <Icons.Dashboard /> Automated Findings Report
               </div>
               
               <div className={`p-4 rounded-md border flex flex-col gap-3 ${checklist.issues?.length ? 'bg-surface-low/50 border-on-surface/10 shadow-inner' : 'bg-surface-low/30 border-on-surface/5 opacity-40'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface/60 flex items-center gap-2">
                      <Icons.Bug /> Technical & UX Findings
                    </span>
                    <span className="text-[10px] font-bold text-primary">{checklist.issues?.length || 0} discovered</span>
                  </div>
                  {checklist.issues?.length ? (
                    <div className="space-y-2">
                      {checklist.issues.map((i, idx) => (
                        <div key={idx} className={`p-3 rounded border text-[11px] font-medium leading-relaxed flex flex-col gap-1 transition-all bg-white shadow-sm`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-mono opacity-40 uppercase tracking-tighter">{i.id}</span>
                            <span className={`text-[8px] font-bold uppercase tracking-widest px-1 border rounded ${getSeverityColor(i.severity)}`}>{i.severity}</span>
                          </div>
                          <p className="text-on-surface/80">{i.description}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 py-4 justify-center text-primary opacity-60">
                      <Icons.CheckCircle />
                      <p className="text-[11px] font-bold uppercase tracking-wider">No bugs or friction points detected</p>
                    </div>
                  )}
               </div>
            </section>

            {/* 5. Feedback Box */}
            <section className="space-y-4 pb-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-on-surface/30">
                <Icons.Edit /> Instruction for Next Cycle
              </div>
              <div className="relative group">
                <textarea 
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Execution was not fully completed. Here is what's missing..."
                  className="w-full h-28 bg-surface-low border border-on-surface/10 rounded-md p-4 text-sm font-medium outline-none focus:ring-1 ring-primary/30 placeholder:text-on-surface/20 resize-none transition-all focus:bg-surface-lowest"
                />
                <div className="absolute right-3 bottom-3 text-[9px] font-bold text-on-surface/20 uppercase tracking-widest">
                  {feedback.length} characters
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Unified Action Footer */}
        <div className="p-6 border-t border-on-surface/5 grid grid-cols-12 gap-3 bg-surface-low/50">
          <button 
            onClick={() => onAction("cancel")}
            className="col-span-3 px-4 py-3 text-[10px] font-bold text-on-surface/40 hover:text-red-600 transition-all hover:bg-red-600/5 uppercase tracking-widest border border-on-surface/10 rounded-md"
          >
            Abort Run
          </button>
          <button 
            onClick={() => feedback.trim() ? onAction("prompt", feedback) : onAction("validate")}
            className={`col-span-9 px-4 py-3 rounded-md font-bold text-[10px] uppercase tracking-widest transition-all shadow-xl flex items-center justify-center gap-2 group ${
              feedback.trim() 
                ? 'bg-primary/20 text-primary hover:bg-primary/30 border border-primary/20 animate-in fade-in slide-in-from-right-1' 
                : 'bg-primary text-white hover:bg-primary/90 border border-primary/50 shadow-primary/20'
            }`}
          >
            {feedback.trim() ? (
              <>
                <Icons.Lightning /> Refine & Cycle Further
              </>
            ) : (
              <>
                <Icons.CheckCircle /> Approve & Finish Report
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

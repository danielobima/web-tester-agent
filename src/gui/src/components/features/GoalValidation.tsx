import { useState } from "react";
import { Icons } from "../ui/Icons";

interface Checklist {
  currentStateDescription: string;
  tasks: { id: string; description: string; status: string; result?: string }[];
  isGoalAchieved: boolean;
  screenshot?: string;
  issues?: { id: string; description: string }[];
  usability?: { id: string; description: string }[];
}

interface GoalValidationProps {
  checklist: Checklist;
  onAction: (action: "validate" | "prompt" | "cancel", feedback?: string) => void;
}

export const GoalValidation = ({ checklist, onAction }: GoalValidationProps) => {
  const [feedback, setFeedback] = useState("");

  return (
    <div className="fixed inset-0 bg-on-surface/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-surface-lowest rounded-md shadow-ambient w-full max-w-2xl flex flex-col border border-on-surface/5 animate-in zoom-in-95 duration-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-on-surface/5 flex items-center justify-between bg-surface-low/50">
          <div>
            <h2 className="text-2xl font-bold font-display tracking-tight">Test Completion Review</h2>
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

            {/* 4. Automated Findings (Issues & Usability) */}
            <section className="space-y-4">
               <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-on-surface/30">
                 <Icons.Dashboard /> Technical & Usability Report
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Technical Issues */}
                  <div className={`p-4 rounded-md border flex flex-col gap-3 ${checklist.issues?.length ? 'bg-orange-600/5 border-orange-600/10' : 'bg-surface-low/30 border-on-surface/5 opacity-40'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-orange-600 flex items-center gap-2">
                        <Icons.XCircle /> Technical Health
                      </span>
                      <span className="text-[10px] font-mono text-orange-600/50">{checklist.issues?.length || 0} issues</span>
                    </div>
                    {checklist.issues?.length ? (
                      <ul className="space-y-2">
                        {checklist.issues.map((i, idx) => (
                          <li key={idx} className="text-[11px] font-medium text-on-surface/70 leading-relaxed border-l-2 border-orange-600/30 pl-2">
                            {i.description}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] italic text-on-surface/40">No technical errors detected.</p>
                    )}
                  </div>

                  {/* Usability Findings */}
                  <div className={`p-4 rounded-md border flex flex-col gap-3 ${checklist.usability?.length ? 'bg-primary/5 border-primary/10' : 'bg-surface-low/30 border-on-surface/5 opacity-40'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                        <Icons.Help /> UX Observations
                      </span>
                      <span className="text-[10px] font-mono text-primary/50">{checklist.usability?.length || 0} points</span>
                    </div>
                    {checklist.usability?.length ? (
                      <ul className="space-y-2">
                        {checklist.usability.map((u, idx) => (
                          <li key={idx} className="text-[11px] font-medium text-on-surface/70 leading-relaxed border-l-2 border-primary/30 pl-2">
                            {u.description}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] italic text-on-surface/40">No usability friction noted.</p>
                    )}
                  </div>
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
                  placeholder="The goal was not fully achieved. Here is what's missing..."
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
            className="col-span-3 px-4 py-3 text-[10px] font-bold text-on-surface/40 hover:text-orange-600 transition-all hover:bg-orange-600/5 uppercase tracking-widest border border-on-surface/10 rounded-md"
          >
            Abort Run
          </button>
          <button 
            onClick={() => onAction("prompt", feedback)}
            disabled={!feedback.trim()}
            className={`col-span-4 px-4 py-3 rounded-md font-bold text-[10px] uppercase tracking-widest transition-all shadow-sm ${
              feedback.trim() 
                ? 'bg-primary/20 text-primary hover:bg-primary/30 border border-primary/20 cursor-pointer animate-in fade-in slide-in-from-right-1' 
                : 'bg-on-surface/5 text-on-surface/20 border border-on-surface/10 cursor-not-allowed'
            }`}
          >
            {feedback.trim() ? 'Cycle Further' : 'Enter Feedback'}
          </button>
          <button 
            onClick={() => onAction("validate")}
            className="col-span-5 px-4 py-3 bg-primary text-white rounded-md font-bold text-[10px] uppercase tracking-widest transition-all hover:bg-primary/90 shadow-xl shadow-primary/20 flex items-center justify-center gap-2 group border border-primary/50"
          >
            <Icons.CheckCircle /> Approve & Finish Report
          </button>
        </div>
      </div>
    </div>
  );
};

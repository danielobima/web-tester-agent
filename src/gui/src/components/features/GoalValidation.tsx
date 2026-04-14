import { useState } from "react";
import { Icons } from "../ui/Icons";

interface Checklist {
  currentStateDescription: string;
  tasks: any[];
  isGoalAchieved: boolean;
  screenshot?: string;
}

interface GoalValidationProps {
  checklist: Checklist;
  onAction: (action: "validate" | "prompt" | "cancel", feedback?: string) => void;
}

export const GoalValidation = ({ checklist, onAction }: GoalValidationProps) => {
  const [feedback, setFeedback] = useState("");

  return (
    <div className="fixed inset-0 bg-on-surface/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-surface-lowest rounded-md shadow-ambient w-full max-w-xl flex flex-col border border-on-surface/5 animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-on-surface/5 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold font-display">Goal Achieved?</h2>
            <p className="text-on-surface/50 text-sm mt-1">The agent believes it has finished the task.</p>
          </div>
          <div className="p-3 bg-primary/10 text-primary rounded-md">
            <Icons.CheckCircle />
          </div>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {checklist.screenshot && (
            <div className="relative group rounded-md overflow-hidden border border-on-surface/5 bg-surface-low aspect-video shadow-inner">
              <img 
                src={checklist.screenshot.startsWith('media://') ? checklist.screenshot : `data:image/jpeg;base64,${checklist.screenshot}`} 
                alt="Validation State" 
                className="w-full h-full object-contain"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                <span className="text-[10px] font-bold text-white uppercase tracking-widest bg-black/40 backdrop-blur-md px-2 py-1 rounded">Current Browser State</span>
              </div>
            </div>
          )}

          <div className="bg-surface-low rounded-md p-4 border border-on-surface/5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface/40 mb-2">Agent's Conclusion</h3>
            <p className="text-sm font-medium leading-relaxed">{checklist.currentStateDescription}</p>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Provide Further Instructions (Optional)</h3>
            <textarea 
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="If the task is not fully complete, tell the agent what to do next..."
              className="w-full h-32 bg-surface-low border border-on-surface/5 rounded-md p-4 text-sm font-medium outline-none focus:ring-1 ring-primary/20 placeholder:text-on-surface/20 resize-none transition-all"
            />
          </div>
        </div>

        <div className="p-6 border-t border-on-surface/5 grid grid-cols-3 gap-3 bg-surface-low/30">
          <button 
            onClick={() => onAction("cancel")}
            className="px-4 py-3 text-[10px] font-bold text-on-surface/40 hover:text-orange-600 transition-colors uppercase tracking-widest border border-on-surface/5 rounded-md"
          >
            Cancel Run
          </button>
          <button 
            onClick={() => onAction("prompt", feedback)}
            disabled={!feedback.trim()}
            className={`px-4 py-3 rounded-md font-bold text-[10px] uppercase tracking-widest transition-all ${feedback.trim() ? 'bg-primary/20 text-primary hover:bg-primary/30' : 'bg-on-surface/5 text-on-surface/20 cursor-not-allowed'}`}
          >
            Prompt Further
          </button>
          <button 
            onClick={() => onAction("validate")}
            className="px-4 py-3 bg-primary text-white rounded-md font-bold text-[10px] uppercase tracking-widest transition-all hover:bg-primary/90 shadow-lg shadow-primary/20"
          >
            Validate & Finish
          </button>
        </div>
      </div>
    </div>
  );
};

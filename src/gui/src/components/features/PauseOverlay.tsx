import { useState } from "react";
import { Icons } from "../ui/Icons";

interface Task {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
}

interface Checklist {
  currentStateDescription: string;
  tasks: Task[];
  nextTaskId?: string;
  isGoalAchieved: boolean;
}

export type ManualPauseResult = 
  | { action: 'resume' }
  | { action: 'reprompt', feedback: string }
  | { action: 'modify', checklist: Checklist };

interface PauseOverlayProps {
  checklist: Checklist;
  onAction: (result: ManualPauseResult) => void;
  onCancel: () => void;
}

export const PauseOverlay = ({ checklist, onAction, onCancel }: PauseOverlayProps) => {
  const [mode, setMode] = useState<'menu' | 'reprompt' | 'modify'>('menu');
  const [feedback, setFeedback] = useState("");
  const [editedTasks, setEditedTasks] = useState<Task[]>(checklist.tasks);

  const handleDescriptionChange = (id: string, newDescription: string) => {
    setEditedTasks(prev => prev.map(t => t.id === id ? { ...t, description: newDescription } : t));
  };

  const handleAddTask = () => {
    const newId = `t${Date.now()}`;
    setEditedTasks(prev => [...prev, { id: newId, description: "", status: "pending" }]);
  };

  const handleRemoveTask = (id: string) => {
    setEditedTasks(prev => prev.filter(t => t.id !== id));
  };

  const handleResume = () => {
    onAction({ action: 'resume' });
  };

  const handleReprompt = () => {
    onAction({ action: 'reprompt', feedback });
  };

  const handleModify = () => {
    onAction({ action: 'modify', checklist: { ...checklist, tasks: editedTasks } });
  };

  return (
    <div className="fixed inset-0 bg-on-surface/60 backdrop-blur-md z-[70] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-surface-lowest rounded-md shadow-ambient w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden border border-on-surface/10 animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-on-surface/5 flex items-center justify-between bg-primary/5">
          <div>
            <h2 className="text-2xl font-bold font-display flex items-center gap-3">
              <span className="p-2 bg-primary/20 text-primary rounded-md">
                <Icons.Pause />
              </span>
              Execution Paused
            </h2>
            <p className="text-on-surface/50 text-sm mt-1">The agent is waiting for your intervention.</p>
          </div>
          <button onClick={onCancel} className="text-on-surface/20 hover:text-orange-600 transition-colors">
            <Icons.Close />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {mode === 'menu' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button 
                onClick={() => setMode('reprompt')}
                className="p-6 rounded-md border border-on-surface/5 bg-surface-low hover:bg-primary/5 hover:border-primary/20 transition-all text-left flex flex-col gap-3 group"
              >
                <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Icons.Wand />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Reprompt Agent</h3>
                  <p className="text-sm text-on-surface/40">Give the AI new instructions or feedback based on what you see in the browser.</p>
                </div>
              </button>
              
              <button 
                onClick={() => setMode('modify')}
                className="p-6 rounded-md border border-on-surface/5 bg-surface-low hover:bg-primary/5 hover:border-primary/20 transition-all text-left flex flex-col gap-3 group"
              >
                <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Icons.Plus />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Modify Plan</h3>
                  <p className="text-sm text-on-surface/40">Manually edit, add, or remove steps from the current testing strategy.</p>
                </div>
              </button>

              <button 
                onClick={handleResume}
                className="md:col-span-2 p-4 rounded-md border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all text-center flex items-center justify-center gap-2 font-bold text-primary uppercase tracking-widest text-xs"
              >
                <Icons.Play /> Just Resume Execution
              </button>
            </div>
          )}

          {mode === 'reprompt' && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface/40">New Instructions</h3>
                <textarea 
                  autoFocus
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Tell the agent what to change or focus on..."
                  className="w-full h-48 bg-surface-low border border-on-surface/10 rounded-md p-4 text-sm font-medium outline-none focus:ring-1 ring-primary/20 placeholder:text-on-surface/20 resize-none transition-all"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setMode('menu')} className="flex-1 py-3 text-xs font-bold text-on-surface/40 hover:text-on-surface transition-colors uppercase tracking-widest border border-on-surface/5 rounded-md">
                  Back
                </button>
                <button 
                  onClick={handleReprompt}
                  disabled={!feedback.trim()}
                  className={`flex-[2] py-3 rounded-md font-bold text-xs uppercase tracking-widest transition-all ${feedback.trim() ? 'bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/20' : 'bg-on-surface/10 text-on-surface/30 cursor-not-allowed'}`}
                >
                  Apply & Resume
                </button>
              </div>
            </div>
          )}

          {mode === 'modify' && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
               <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Edit Proposed Steps</h3>
                <button 
                  onClick={handleAddTask}
                  className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline transition-all pr-1"
                >
                  <Icons.Plus /> Add Step
                </button>
              </div>
              <div className="space-y-3">
                {editedTasks.map((task, index) => (
                  <div key={task.id} className="group flex gap-4 items-start bg-surface-low/50 rounded-md p-3 border border-on-surface/5 focus-within:ring-1 ring-primary/20 transition-all hover:bg-surface-low animate-in slide-in-from-left-2 duration-200">
                    <div className="bg-surface-highest text-on-surface/30 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-1">
                      {index + 1}
                    </div>
                    <input 
                      type="text" 
                      value={task.description}
                      placeholder="Describe what to do in this step..."
                      onChange={(e) => handleDescriptionChange(task.id, e.target.value)}
                      className="flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-on-surface/20"
                    />
                    <button onClick={() => handleRemoveTask(task.id)} className="mt-1 text-on-surface/10 hover:text-orange-600 transition-colors">
                      <Icons.Trash />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-8">
                <button onClick={() => setMode('menu')} className="flex-1 py-3 text-xs font-bold text-on-surface/40 hover:text-on-surface transition-colors uppercase tracking-widest border border-on-surface/5 rounded-md">
                  Back
                </button>
                <button 
                  onClick={handleModify}
                  className="flex-[2] py-3 bg-primary text-white rounded-md font-bold text-xs uppercase tracking-widest transition-all hover:bg-primary/90 shadow-lg shadow-primary/20"
                >
                  Save & Resume
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

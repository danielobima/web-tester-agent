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

interface PlanApprovalProps {
  checklist: Checklist;
  onApprove: (action: "accept" | "modify" | "reject", modifiedChecklist?: Checklist) => void;
}

export const PlanApproval = ({ checklist, onApprove }: PlanApprovalProps) => {
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

  const handleApprove = () => {
    onApprove("modify", { ...checklist, tasks: editedTasks });
  };

  return (
    <div className="fixed inset-0 bg-on-surface/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface-lowest rounded-md shadow-ambient w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden border border-on-surface/5 animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-on-surface/5 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold font-display">Review Testing Plan</h2>
            <p className="text-on-surface/50 text-sm mt-1">The AI has proposed the following steps to achieve your goal.</p>
          </div>
          <div className="p-3 bg-primary/10 text-primary rounded-md">
            <Icons.Wand />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="bg-surface-low rounded-md p-4 border border-on-surface/5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface/40 mb-2">Initial Perception</h3>
            <p className="text-sm font-medium">{checklist.currentStateDescription}</p>
          </div>

          <div className="space-y-3 mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Proposed Steps</h3>
              <button 
                onClick={handleAddTask}
                className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline transition-all pr-1"
              >
                <Icons.Plus /> Add Step
              </button>
            </div>
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
        </div>

        <div className="p-6 border-t border-on-surface/5 flex items-center justify-between bg-surface-low/30">
          <button onClick={() => onApprove("reject")} className="px-6 py-3 text-sm font-bold text-on-surface/40 hover:text-orange-600 transition-colors uppercase tracking-widest">
            Cancel
          </button>
          <button onClick={handleApprove} className="px-8 py-3 bg-primary text-white rounded-md font-bold text-sm transition-all hover:px-10 active:scale-95 shadow-lg shadow-primary/20">
            Approve & Launch
          </button>
        </div>
      </div>
    </div>
  );
};

import { Icons } from "../ui/Icons";

export interface ChecklistTask {
  id: string;
  description: string;
  status: 'pending' | 'completed' | 'failed';
  result?: string;
  type?: string;
}

interface TestingPlanProps {
  tasks: ChecklistTask[];
  isPlanning?: boolean;
}

const getTypeBadge = (type?: string) => {
  if (!type) return null;
  
  let styles = "bg-on-surface/5 text-on-surface/50 border-on-surface/10";
  let label = type;

  switch (type) {
    case "form_filling":
      styles = "bg-blue-500/10 text-blue-400 border-blue-500/20";
      label = "form";
      break;
    case "navigation":
      styles = "bg-teal-500/10 text-teal-400 border-teal-500/20";
      label = "nav";
      break;
    case "observer":
      styles = "bg-amber-500/10 text-amber-400 border-amber-500/20";
      label = "observe";
      break;
    case "data_manipulation":
      styles = "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
      label = "data";
      break;
    case "general":
      styles = "bg-gray-500/10 text-gray-400 border-gray-500/20";
      label = "general";
      break;
  }

  return (
    <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-semibold inline-block shrink-0 ${styles}`}>
      {label}
    </span>
  );
};

export const TestingPlan = ({ tasks, isPlanning = false }: TestingPlanProps) => {
  return (
    <div className="bg-surface-low p-6 rounded-md space-y-6">
      <div className="flex items-center justify-between border-b border-on-surface/5 pb-4">
        <span className="text-[10px] uppercase font-bold tracking-widest text-on-surface/40">Testing Plan</span>
        <span className="text-[10px] font-bold text-primary">{tasks.filter(t => t.status === 'completed').length} / {tasks.length} Completed</span>
      </div>
      
      <div className="space-y-4">
        {isPlanning && (
          <div className="flex gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
             <div className="mt-0.5 shrink-0 w-5 h-5 rounded-sm bg-primary/10 flex items-center justify-center">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
             </div>
             <div className="space-y-2 flex-1">
                <p className="text-xs font-bold text-primary uppercase tracking-widest animate-pulse">Strategic Re-Planning...</p>
                <div className="h-2 bg-on-surface/5 rounded w-full animate-shimmer" style={{ backgroundSize: '200% 100%', backgroundImage: 'linear-gradient(90deg, transparent, rgba(var(--primary-rgb), 0.05), transparent)' }}></div>
                <div className="h-2 bg-on-surface/5 rounded w-2/3 animate-shimmer" style={{ backgroundSize: '200% 100%', backgroundImage: 'linear-gradient(90deg, transparent, rgba(var(--primary-rgb), 0.05), transparent)' }}></div>
             </div>
          </div>
        )}

        {tasks.length === 0 && !isPlanning ? (
          <div className="py-4 text-center text-on-surface/20 text-xs italic">
            Waiting for strategic analysis...
          </div>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="flex gap-4 group">
              <div className={`mt-0.5 shrink-0 w-5 h-5 rounded-sm flex items-center justify-center transition-colors ${
                task.status === 'completed' ? 'bg-primary/20 text-primary' : 
                task.status === 'failed' ? 'bg-orange-600/20 text-orange-600' : 
                'bg-on-surface/5 text-on-surface/20'
              }`}>
                {task.status === 'completed' ? <Icons.CheckCircle /> : 
                 task.status === 'failed' ? <Icons.XCircle /> : 
                 <div className="w-1.5 h-1.5 rounded-full bg-current" />}
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {getTypeBadge(task.type)}
                  <p className={`text-sm font-medium leading-tight ${task.status === 'completed' ? 'line-through text-on-surface/40' : ''}`}>
                    {task.description}
                  </p>
                </div>
                {task.result && task.status === 'completed' && (
                   <p className="text-[11px] text-on-surface/30 italic">{task.result}</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

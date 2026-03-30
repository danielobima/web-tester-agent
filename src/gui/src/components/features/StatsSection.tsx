import { Icons } from "../ui/Icons";

export interface ChecklistTask {
  id: string;
  description: string;
  status: 'pending' | 'completed' | 'failed';
  result?: string;
}

interface TestingPlanProps {
  tasks: ChecklistTask[];
}

export const TestingPlan = ({ tasks }: TestingPlanProps) => {
  return (
    <div className="bg-surface-low p-6 rounded-md space-y-6">
      <div className="flex items-center justify-between border-b border-on-surface/5 pb-4">
        <span className="text-[10px] uppercase font-bold tracking-widest text-on-surface/40">Testing Plan</span>
        <span className="text-[10px] font-bold text-primary">{tasks.filter(t => t.status === 'completed').length} / {tasks.length} Completed</span>
      </div>
      
      <div className="space-y-4">
        {tasks.length === 0 ? (
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
              <div className="space-y-1">
                <p className={`text-sm font-medium leading-tight ${task.status === 'completed' ? 'line-through text-on-surface/40' : ''}`}>
                  {task.description}
                </p>
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

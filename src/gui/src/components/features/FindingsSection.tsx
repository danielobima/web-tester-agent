import { Icons } from "../ui/Icons";

export interface Finding {
  id: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
}

interface FindingsSectionProps {
  issues: Finding[];
  className?: string;
  hideHeader?: boolean;
}

export const FindingsSection = ({ issues, className = "", hideHeader = false }: FindingsSectionProps) => {
  const getSeverityStyles = (severity: Finding["severity"]) => {
    switch (severity) {
      case "critical":
        return "bg-red-600/10 border-red-600/20 text-red-600";
      case "high":
        return "bg-orange-600/10 border-orange-600/20 text-orange-600";
      case "medium":
        return "bg-amber-500/10 border-amber-500/20 text-amber-600";
      case "low":
        return "bg-blue-600/10 border-blue-600/20 text-blue-600";
      default:
        return "bg-on-surface/5 border-on-surface/10 text-on-surface/40";
    }
  };

  const getSeverityBadge = (severity: Finding["severity"]) => {
    switch (severity) {
      case "critical":
        return <span className="px-1.5 py-0.5 bg-red-600 text-white rounded-[2px] text-[8px] font-bold uppercase tracking-wider">Critical</span>;
      case "high":
        return <span className="px-1.5 py-0.5 bg-orange-600 text-white rounded-[2px] text-[8px] font-bold uppercase tracking-wider">High</span>;
      case "medium":
        return <span className="px-1.5 py-0.5 bg-amber-500 text-white rounded-[2px] text-[8px] font-bold uppercase tracking-wider">Medium</span>;
      case "low":
        return <span className="px-1.5 py-0.5 bg-blue-600 text-white rounded-[2px] text-[8px] font-bold uppercase tracking-wider">Low</span>;
      default:
        return null;
    }
  };

  return (
    <div className={`flex flex-col bg-surface-lowest rounded-md shadow-ambient overflow-hidden border border-on-surface/5 ${className}`}>
      {!hideHeader && (
        <div className="h-14 bg-surface-low flex items-center justify-between px-6 border-b border-on-surface/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="text-primary">
              <Icons.Bug />
            </div>
            <span className="text-sm font-bold tracking-tight">Agent Findings</span>
          </div>
          <div className="bg-primary/10 text-primary px-2 py-0.5 rounded text-[10px] font-bold">
            {issues.length}
          </div>
        </div>
      )}
      
      <div className="flex-1 p-4 space-y-3 overflow-y-auto min-h-0">
        {issues.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-on-surface/20 space-y-3 py-10">
            <div className="w-10 h-10 rounded-full bg-on-surface/5 flex items-center justify-center">
               <Icons.CheckCircle />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-widest">No issues identified yet</p>
          </div>
        ) : (
          issues.map((issue) => (
            <div 
              key={issue.id}
              className={`group p-4 rounded-md border transition-all animate-in slide-in-from-right-4 duration-300 ${getSeverityStyles(issue.severity)} bg-opacity-[0.03]`}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold opacity-40">
                    {issue.id}
                  </span>
                  {getSeverityBadge(issue.severity)}
                </div>
                <p className="text-[13px] font-medium leading-relaxed">
                  {issue.description}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

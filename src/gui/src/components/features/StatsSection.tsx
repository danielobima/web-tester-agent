

export const StatsSection = () => {
  return (
    <div className="flex gap-4">
      <div className="flex-1 bg-surface-low p-6 rounded-md space-y-4">
        <span className="text-[10px] uppercase font-bold tracking-widest text-on-surface/40">Suite Health</span>
        <div className="flex items-baseline gap-2">
           <span className="text-2xl font-display font-bold text-primary">98.4%</span>
           <span className="text-[10px] font-bold text-primary/60">+1.2%</span>
        </div>
        <div className="h-1 bg-on-surface/5 rounded-full overflow-hidden">
           <div className="h-full bg-primary" style={{width: '98%'}}></div>
        </div>
      </div>
      <div className="flex-1 bg-surface-low p-6 rounded-md space-y-4">
        <span className="text-[10px] uppercase font-bold tracking-widest text-on-surface/40">Avg Duration</span>
        <div className="flex items-baseline gap-2">
           <span className="text-2xl font-display font-bold">42s</span>
           <span className="text-[10px] font-bold text-orange-600">-4s</span>
        </div>
        <div className="flex items-end gap-1 h-8">
           {[0.2, 0.4, 0.3, 0.7, 0.5, 0.9, 0.6, 0.8].map((h, i) => (
             <div key={i} className={`flex-1 rounded-t-sm ${i === 5 ? 'bg-primary' : 'bg-primary/20'}`} style={{height: `${h*100}%`}}></div>
           ))}
        </div>
      </div>
    </div>
  );
};

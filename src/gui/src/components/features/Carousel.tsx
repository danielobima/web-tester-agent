import { useEffect } from "react";
import { Icons } from "../ui/Icons";
import type { TestStep } from "./ExecutionStream";

interface CarouselProps {
  steps: TestStep[];
  activeIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export const Carousel = ({ steps, activeIndex, onClose, onNavigate }: CarouselProps) => {
  const currentStep = steps[activeIndex];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onNavigate(Math.max(0, activeIndex - 1));
      if (e.key === "ArrowRight") onNavigate(Math.min(steps.length - 1, activeIndex + 1));
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, steps.length, onClose, onNavigate]);

  if (!currentStep) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-300">
      {/* Header */}
      <div className="h-20 border-b border-white/10 flex items-center justify-between px-8 bg-black/40">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-white/5 rounded-md text-white/40">
            <Icons.Monitor />
          </div>
          <div>
            <h2 className="text-white font-bold tracking-tight">{currentStep.step}</h2>
            <p className="text-white/40 text-xs font-medium">Step {activeIndex + 1} of {steps.length} • {currentStep.duration}</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-3 hover:bg-white/10 rounded-full text-white/60 transition-colors"
        >
          <Icons.Close />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative flex overflow-hidden">
        {/* Navigation Arrows */}
        <div className="absolute top-1/2 -translate-y-1/2 left-8 z-10">
          <button 
            onClick={(e) => { e.stopPropagation(); onNavigate(Math.max(0, activeIndex - 1)); }}
            disabled={activeIndex === 0}
            className={`p-4 rounded-full bg-white/5 text-white transition-all backdrop-blur-md ${activeIndex === 0 ? 'opacity-10 cursor-not-allowed' : 'hover:bg-white/10 hover:scale-110 active:scale-95'}`}
          >
            <Icons.ChevronLeft />
          </button>
        </div>

        {/* Visual Content (Left Column) */}
        <div className="flex-1 flex items-center justify-center p-12 overflow-hidden bg-white/5">
          <div className="relative max-h-full w-full flex flex-col items-center justify-center gap-8">
            {currentStep.screenshot ? (
              <div className="relative group">
                <img 
                  src={currentStep.screenshot} 
                  className="max-h-[75vh] rounded-lg shadow-2xl shadow-black border border-white/10 object-contain animate-in zoom-in-95 duration-500"
                  alt="Step Visual State"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-end p-6 pointer-events-none">
                  <span className="text-white/40 text-[10px] uppercase font-bold tracking-widest self-end">Captured live</span>
                </div>
              </div>
            ) : (
              <div className="w-[600px] h-[400px] bg-white/5 rounded-lg border border-white/10 flex flex-col items-center justify-center text-white/20 gap-4">
                <Icons.Image />
                <p className="text-sm font-medium">No visual state captured</p>
              </div>
            )}
          </div>
        </div>

        {/* Info Sidebar (Right Column) */}
        <div className="w-[450px] border-l border-white/10 bg-black/40 flex flex-col overflow-y-auto">
          <div className="p-8 space-y-8">
             <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/20 text-primary rounded-full text-[10px] font-bold uppercase tracking-widest">
                  {currentStep.status}
                </div>
                <h3 className="text-white font-bold text-lg leading-tight">{currentStep.step}</h3>
             </div>

             {currentStep.stateDescription && (
               <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/40"></div>
                    Observation
                  </div>
                  <p className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap font-medium">
                    {currentStep.stateDescription}
                  </p>
               </div>
             )}

             <div className="space-y-3">
                <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                  Strategic Intent
                </div>
                <p className="text-white/80 text-sm leading-relaxed font-medium italic">
                  "{currentStep.description}"
                </p>
             </div>

             {currentStep.action && (
                <div className="space-y-3 pt-4">
                   <div className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                     <Icons.Code /> Technical Action
                   </div>
                   <pre className="bg-white/5 p-4 rounded-lg text-[11px] font-mono text-white/60 overflow-x-auto border border-white/5">
                     {JSON.stringify(currentStep.action, null, 2)}
                   </pre>
                </div>
             )}

             {currentStep.error && (
               <div className="p-4 bg-orange-600/10 border border-orange-600/20 rounded-lg">
                  <p className="text-orange-500 text-xs font-mono">Error: {currentStep.error}</p>
               </div>
             )}
          </div>
        </div>

        {/* Right Navigation Arrow */}
        <div className="absolute top-1/2 -translate-y-1/2 right-[460px] z-10">
          <button 
            onClick={(e) => { e.stopPropagation(); onNavigate(Math.min(steps.length - 1, activeIndex + 1)); }}
            disabled={activeIndex === steps.length - 1}
            className={`p-4 rounded-full bg-white/5 text-white transition-all backdrop-blur-md ${activeIndex === steps.length - 1 ? 'opacity-10 cursor-not-allowed' : 'hover:bg-white/10 hover:scale-110 active:scale-95'}`}
          >
            <Icons.ChevronRightLarge />
          </button>
        </div>
      </div>

      {/* Thumbnails / Progress Strip */}
      <div className="h-24 border-t border-white/10 flex items-center justify-center gap-3 px-8 bg-black/40 overflow-x-auto">
        {steps.map((step, idx) => (
          <button
            key={step.id}
            onClick={() => onNavigate(idx)}
            className={`w-12 h-12 rounded border-2 transition-all flex-shrink-0 overflow-hidden ${idx === activeIndex ? 'border-primary ring-4 ring-primary/20 scale-110' : 'border-white/10 opacity-30 hover:opacity-100'}`}
          >
            {step.screenshot ? (
              <img src={step.screenshot} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-white/5" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

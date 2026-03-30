import { useState, useEffect } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
import { TestBuilder } from "./components/features/TestBuilder";
import { ConfigSection } from "./components/features/ConfigSection";
import { TestingPlan } from "./components/features/StatsSection";
import type { ChecklistTask } from "./components/features/StatsSection";
import { ExecutionStream } from "./components/features/ExecutionStream";
import type { TestStep } from "./components/features/ExecutionStream";
import { Icons } from "./components/ui/Icons";

declare global {
  interface Window {
    electron: {
      startTest: (url: string, prompt: string) => void;
      stopTest: () => void;
      replayTest: () => void;
      onTestStep: (callback: (step: TestStep) => void) => () => void;
      onTestChecklist: (callback: (checklist: any) => void) => () => void;
      onTestComplete: (callback: (result: { success: boolean; error?: string }) => void) => () => void;
    };
  }
}

function App() {
  const [activeTab, setActiveTab] = useState("Browser State");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [testResults, setTestResults] = useState<TestStep[]>([]);
  const [tasks, setTasks] = useState<ChecklistTask[]>([]);

  useEffect(() => {
    const unsubStep = window.electron.onTestStep((step: TestStep) => {
      setTestResults(prev => {
        const exists = prev.find(p => p.id === step.id);
        if (exists) return prev.map(p => p.id === step.id ? step : p);
        return [...prev, step];
      });
    });

    const unsubChecklist = window.electron.onTestChecklist((checklist: any) => {
      setTasks(checklist.tasks);
    });

    const unsubComplete = window.electron.onTestComplete((result: { success: boolean; error?: string; duration?: string }) => {
      setIsGenerating(false);
      setIsStopping(false);

      setTestResults(prev => [
        ...prev,
        {
          id: `complete-${Date.now()}`,
          step: result.success ? "Execution Finished" : "Execution Failed",
          status: result.success ? "success" : "failed",
          duration: result.duration || "FIN",
          description: result.success 
            ? "The agent has successfully achieved the stated goal." 
            : `The agent encountered a terminal error: ${result.error || "Unknown error"}`
        }
      ]);
    });

    return () => {
      unsubStep();
      unsubChecklist();
      unsubComplete();
    };
  }, []);

  const handleGenerate = (url: string, prompt: string) => {
    setIsGenerating(true);
    setIsStopping(false);
    setTestResults([]);
    setTasks([]);
    window.electron.startTest(url, prompt);
  };

  const handleStop = () => {
    setIsStopping(true);
    window.electron.stopTest();
  };

  const handleReset = () => {
    setTestResults([]);
    setTasks([]);
    setIsGenerating(false);
  };

  const handleReplay = () => {
    setTestResults([]);
    setTasks([]);
    setIsGenerating(true);
    setIsStopping(false);
    window.electron.replayTest();
  };

  const hasSubmitted = isGenerating || testResults.length > 0;

  return (
    <div className="flex h-screen w-full bg-surface text-on-surface overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col h-full bg-surface overflow-hidden relative">
        <Header />

        <div className="flex-1 overflow-y-auto px-10 pb-20">
          <div className="max-w-6xl mx-auto py-6">
            {!hasSubmitted ? (
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <TestBuilder onGenerate={handleGenerate} isGenerating={isGenerating} />
                <div className="grid grid-cols-12 gap-8">
                  <div className="col-span-12 lg:col-span-12">
                    <ConfigSection activeTab={activeTab} setActiveTab={setActiveTab} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
                <div className="flex items-center justify-between pb-2">
                  <h2 className="text-2xl font-bold font-display">Test Execution</h2>
                  {isGenerating && (
                    <button 
                      onClick={handleStop}
                      disabled={isStopping}
                      className={`px-4 py-2 border rounded-md text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${
                        isStopping 
                          ? 'bg-on-surface/5 text-on-surface/30 border-on-surface/10 cursor-not-allowed' 
                          : 'bg-orange-600/10 text-orange-600 border-orange-600/20 hover:bg-orange-600 hover:text-white'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-sm ${isStopping ? 'bg-on-surface/20 animate-pulse' : 'bg-current'}`}></div>
                      {isStopping ? 'Stopping Execution...' : 'Stop Execution'}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-12 gap-8 items-start">
                  <div className="col-span-12 lg:col-span-4 sticky top-0">
                    <TestingPlan tasks={tasks} />
                    <div className="mt-8 p-6 bg-surface-low rounded-md border border-on-surface/5">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface/30 mb-4">Active Configuration</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm"><span className="text-on-surface/40">Model</span><span className="font-medium">Gemini 3.1</span></div>
                        <div className="flex justify-between text-sm"><span className="text-on-surface/40">Viewport</span><span className="font-medium">1280x720</span></div>
                      </div>
                    </div>
                  </div>
                  <div className="col-span-12 lg:col-span-8">
                    <ExecutionStream 
                      results={testResults} 
                      isGenerating={isGenerating} 
                      onReplay={handleReplay}
                    />
                    <div className="mt-4 flex justify-end">
                       <button 
                         onClick={handleReset}
                         className="text-xs font-bold uppercase tracking-widest text-primary hover:underline flex items-center gap-2"
                       >
                         <Icons.ChevronRight /> Back to Builder
                       </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {!hasSubmitted && (
          <button className="absolute bottom-8 right-8 w-16 h-16 bg-primary text-white rounded-md shadow-ambient flex items-center justify-center transition-all hover:scale-110 active:scale-90 z-20">
            <Icons.Lightning />
          </button>
        )}
      </main>
    </div>
  );
}

export default App;

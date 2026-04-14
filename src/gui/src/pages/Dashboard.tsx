import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { TestBuilder } from "../components/features/TestBuilder";
import { ConfigSection } from "../components/features/ConfigSection";
import { TestingPlan } from "../components/features/StatsSection";
import type { ChecklistTask } from "../components/features/StatsSection";
import { ExecutionStream } from "../components/features/ExecutionStream";
import type { TestStep } from "../components/features/ExecutionStream";
import { PlanApproval } from "../components/features/PlanApproval";
import { GoalValidation } from "../components/features/GoalValidation";
import { PauseOverlay, type ManualPauseResult } from "../components/features/PauseOverlay";
import { Icons } from "../components/ui/Icons";

export const Dashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Browser State");
  
  useEffect(() => {
    if (location.state?.replaying) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state?.replaying, location.pathname, navigate]);

  const [isGenerating, setIsGenerating] = useState(!!location.state?.replaying);
  const [isStopping, setIsStopping] = useState(false);
  const [isManualPausing, setIsManualPausing] = useState(false);
  const [testResults, setTestResults] = useState<TestStep[]>([]);
  const [tasks, setTasks] = useState<ChecklistTask[]>([]);
  const [pendingPlan, setPendingPlan] = useState<any>(null);
  const [pendingGoalValidation, setPendingGoalValidation] = useState<any>(null);
  const [pendingPauseChecklist, setPendingPauseChecklist] = useState<any>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [completedSuitePath, setCompletedSuitePath] = useState<string | null>(null);

  useEffect(() => {
    const unsubStep = window.electron.onTestStep((step: TestStep) => {
      setTestResults(prev => {
        const exists = prev.find(p => p.id === step.id);
        if (exists) return prev.map(p => p.id === step.id ? step : p);
        return [...prev, step];
      });
    });

    const unsubChecklist = window.electron.onTestChecklist((checklist: { tasks: ChecklistTask[] }) => {
      setTasks(checklist.tasks);
    });

    const unsubPlanRequest = window.electron.onPlanApprovalRequest((checklist: { tasks: ChecklistTask[] }) => {
      setPendingPlan(checklist);
    });
    
    const unsubGoalReached = window.electron.onGoalReached((checklist: any) => {
      setPendingGoalValidation(checklist);
    });

    const unsubPlanning = window.electron.onPlanningState((planning: boolean) => {
      setIsPlanning(planning);
    });

    const unsubPauseRequest = window.electron.onPauseRequest((checklist: any) => {
      setPendingPauseChecklist(checklist);
      setIsManualPausing(false);
    });

    const unsubComplete = window.electron.onTestComplete((result: { success: boolean; error?: string; duration?: string; suitePath?: string }) => {
      setIsGenerating(false);
      setIsStopping(false);
      setIsManualPausing(false);
      setPendingPlan(null);
      setPendingGoalValidation(null);
      setPendingPauseChecklist(null);
      if (result.success && result.suitePath) {
        setCompletedSuitePath(result.suitePath);
      }
      setTestResults(prev => [...prev, {
        id: `complete-${Date.now()}`,
        step: result.success ? "Execution Finished" : "Execution Failed",
        status: result.success ? "success" : "failed",
        duration: result.duration || "FIN",
        description: result.success ? "Successfully achieved goal." : `Error: ${result.error || "Unknown"}`
      }]);
    });

    return () => {
      unsubStep();
      unsubChecklist();
      unsubPlanRequest();
      unsubGoalReached();
      unsubComplete();
      unsubPlanning();
      unsubPauseRequest();
    };
  }, []);

  const handleGenerate = (url: string, prompt: string) => {
    setIsGenerating(true);
    setIsStopping(false);
    setIsManualPausing(false);
    setTestResults([]);
    setTasks([]);
    setPendingPlan(null);
    setPendingGoalValidation(null);
    setPendingPauseChecklist(null);
    setIsPlanning(false);
    window.electron.startTest(url, prompt);
  };

  const handleApprovePlan = (action: 'accept' | 'modify' | 'reject', modifiedChecklist?: any) => {
    window.electron.approvePlan({ action, checklist: modifiedChecklist });
    setPendingPlan(null);
    if (action === 'reject') setIsGenerating(false);
  };

  const handleStop = () => {
    setIsStopping(true);
    setPendingPlan(null);
    setPendingGoalValidation(null);
    setPendingPauseChecklist(null);
    window.electron.stopTest();
  };

  const handlePause = () => {
    setIsManualPausing(true);
    window.electron.pauseTest();
  };

  const handleResume = (result: ManualPauseResult) => {
    window.electron.resumeTest(result);
    setPendingPauseChecklist(null);
  };
  
  const handleGoalAction = (action: 'validate' | 'prompt' | 'cancel', feedback?: string) => {
    window.electron.sendGoalValidationResponse({ action, feedback });
    setPendingGoalValidation(null);
    if (action === 'cancel') setIsGenerating(false);
  };

  const handleReset = () => {
    setTestResults([]);
    setTasks([]);
    setCompletedSuitePath(null);
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
    <div className="flex-1 overflow-y-auto px-10 pb-20">
      <div className="max-w-6xl mx-auto py-6">
        {!hasSubmitted ? (
          <div className="space-y-10">
            <TestBuilder onGenerate={handleGenerate} isGenerating={isGenerating} />
            <ConfigSection activeTab={activeTab} setActiveTab={setActiveTab} />
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex items-center justify-between pb-2">
              <h2 className="text-2xl font-bold font-display">Test Execution</h2>
              {isGenerating && (
                <div className="flex gap-3">
                  <button 
                    onClick={handlePause} 
                    disabled={isStopping || isManualPausing || !!pendingPauseChecklist} 
                    className={`px-4 py-2 border rounded-md text-xs font-bold uppercase tracking-widest transition-all transition-all flex items-center gap-2 ${
                      isManualPausing ? 'bg-primary/10 text-primary border-primary/20 animate-pulse' : 'bg-on-surface/5 text-on-surface/40 border-on-surface/10 hover:bg-on-surface/10 hover:text-on-surface'
                    }`}
                  >
                    <Icons.Pause />
                    {isManualPausing ? 'Pausing...' : 'Pause Execution'}
                  </button>
                  <button onClick={handleStop} disabled={isStopping} className="px-4 py-2 bg-orange-600/10 text-orange-600 border border-orange-600/20 rounded-md text-xs font-bold uppercase tracking-widest hover:bg-orange-600 hover:text-white transition-all">
                    {isStopping ? 'Stopping...' : 'Stop Execution'}
                  </button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-12 gap-8 items-start">
              <div className="col-span-12 lg:col-span-4 lg:sticky lg:top-10 z-10">
                <TestingPlan tasks={tasks} isPlanning={isPlanning} />
              </div>
              <div className="col-span-12 lg:col-span-8 space-y-4">
                <ExecutionStream results={testResults} isGenerating={isGenerating} onReplay={handleReplay} />
                <div className="flex items-center gap-6">
                  <button onClick={handleReset} className="text-xs font-bold uppercase tracking-widest text-primary hover:underline flex items-center gap-2">
                    <Icons.ChevronLeft /> Back to Builder
                  </button>
                  {completedSuitePath && (
                    <button 
                      onClick={() => navigate("/suites", { state: { suitePath: completedSuitePath, viewMode: "report" } })}
                      className="bg-primary text-white px-5 py-2 rounded-md font-bold text-[11px] uppercase tracking-wider shadow-ambient hover:opacity-90 transition-all flex items-center gap-2"
                    >
                      <Icons.TestSuites /> View Full Report
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {pendingPlan && <PlanApproval checklist={pendingPlan} onApprove={handleApprovePlan} />}
      {pendingGoalValidation && <GoalValidation checklist={pendingGoalValidation} onAction={handleGoalAction} />}
      {pendingPauseChecklist && <PauseOverlay checklist={pendingPauseChecklist} onAction={handleResume} onCancel={() => setPendingPauseChecklist(null)} />}
    </div>
  );
};

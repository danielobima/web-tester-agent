import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { TestingPlan } from "../components/features/StatsSection";
import type { ChecklistTask } from "../components/features/StatsSection";
import { ExecutionStream } from "../components/features/ExecutionStream";
import type { TestStep } from "../components/features/ExecutionStream";
import { PlanApproval } from "../components/features/PlanApproval";
import { GoalValidation } from "../components/features/GoalValidation";
import {
  PauseOverlay,
  type ManualPauseResult,
} from "../components/features/PauseOverlay";
import { Icons } from "../components/ui/Icons";
import { MarkdownRenderer } from "../components/ui/MarkdownRenderer";

export const Execution = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [isGenerating, setIsGenerating] = useState(!!location.state?.replaying);
  const [isStopping, setIsStopping] = useState(false);
  const [isManualPausing, setIsManualPausing] = useState(false);
  const [testResults, setTestResults] = useState<TestStep[]>([]);
  const [tasks, setTasks] = useState<ChecklistTask[]>([]);
  const [pendingPlan, setPendingPlan] = useState<any>(null);
  const [pendingGoalValidation, setPendingGoalValidation] = useState<any>(null);
  const [pendingPauseChecklist, setPendingPauseChecklist] = useState<any>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [completedSuitePath, setCompletedSuitePath] = useState<string | null>(
    null,
  );
  const [isViewingReport, setIsViewingReport] = useState(false);
  const [reportContent, setReportContent] = useState<string>("");
  const [issues, setIssues] = useState<any[]>([]);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    const unsubStep = window.electron.onTestStep((step: TestStep) => {
      setTestResults((prev) => {
        const exists = prev.find((p) => p.id === step.id);
        if (exists) return prev.map((p) => (p.id === step.id ? step : p));
        return [...prev, step];
      });
    });

    const unsubChecklist = window.electron.onTestChecklist(
      (checklist: { tasks: ChecklistTask[] }) => {
        setTasks(checklist.tasks);
      },
    );

    const unsubPlanRequest = window.electron.onPlanApprovalRequest(
      (checklist: { tasks: ChecklistTask[] }) => {
        setPendingPlan(checklist);
      },
    );

    const unsubGoalReached = window.electron.onGoalReached((checklist: any) => {
      setPendingGoalValidation(checklist);
    });

    const unsubPlanning = window.electron.onPlanningState(
      (planning: boolean) => {
        setIsPlanning(planning);
      },
    );

    const unsubIssues = window.electron.onTestIssues((issues: any[]) => {
      setIssues(issues);
    });

    const unsubPauseRequest = window.electron.onPauseRequest(
      (checklist: any) => {
        setPendingPauseChecklist(checklist);
        setIsManualPausing(false);
      },
    );

    const unsubComplete = window.electron.onTestComplete(
      (result: {
        success: boolean;
        error?: string;
        duration?: string;
        suitePath?: string;
      }) => {
        setIsGenerating(false);
        setIsStopping(false);
        setIsManualPausing(false);
        setPendingPlan(null);
        setPendingGoalValidation(null);
        setPendingPauseChecklist(null);
        if (result.success && result.suitePath) {
          setCompletedSuitePath(result.suitePath);
        }
        if (!result.success) {
          setHasFailed(true);
        }
        setTestResults((prev) => [
          ...prev,
          {
            id: `complete-${Date.now()}`,
            step: result.success ? "Execution Finished" : "Execution Failed",
            status: result.success ? "success" : "failed",
            duration: result.duration || "FIN",
            description: result.success
              ? ""
              : `Error: ${result.error || "Unknown"}`,
          },
        ]);
      },
    );

    return () => {
      unsubStep();
      unsubChecklist();
      unsubPlanRequest();
      unsubGoalReached();
      unsubComplete();
      unsubPlanning();
      unsubIssues();
      unsubPauseRequest();
    };
  }, []);

  const handleApprovePlan = (
    action: "accept" | "modify" | "reject",
    modifiedChecklist?: any,
  ) => {
    window.electron.approvePlan({ action, checklist: modifiedChecklist });
    setPendingPlan(null);
    if (action === "reject") setIsGenerating(false);
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

  const handleGoalAction = (
    action: "validate" | "prompt" | "cancel",
    feedback?: string,
  ) => {
    window.electron.sendGoalValidationResponse({ action, feedback });
    setPendingGoalValidation(null);
    if (action === "cancel") setIsGenerating(false);
  };

  const handleReset = () => {
    setHasFailed(false);
    navigate(-1);
  };

  const handleReplay = () => {
    setTestResults([]);
    setTasks([]);
    setHasFailed(false);
    setIsGenerating(true);
    setIsStopping(false);
    setIsViewingReport(false);
    setCompletedSuitePath(null);
    setIssues([]);
    window.electron.replayTest();
  };

  const handleViewReport = async () => {
    if (completedSuitePath) {
      try {
        const content =
          await window.electron.getSuiteReport(completedSuitePath);
        setReportContent(content);
        setIsViewingReport(true);
      } catch (error) {
        console.error("Failed to load report:", error);
      }
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-10 pb-20 relative">
      <div className="max-w-7xl mx-auto py-10">
        <div className="space-y-8">
          <div className="flex items-center justify-between pb-2">
            <div>
              <h1 className="text-3xl font-bold font-display tracking-tight text-on-surface">
                Test Execution
              </h1>
              <p className="text-on-surface/40 mt-1 font-medium">
                Real-time stream of the agent's actions and reasoning
              </p>
            </div>
            {isGenerating && (
              <div className="flex gap-3">
                <button
                  onClick={handlePause}
                  disabled={
                    isStopping || isManualPausing || !!pendingPauseChecklist
                  }
                  className={`px-4 py-2 border rounded-md text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${
                    isManualPausing
                      ? "bg-primary/10 text-primary border-primary/20 animate-pulse"
                      : "bg-on-surface/5 text-on-surface/40 border-on-surface/10 hover:bg-on-surface/10 hover:text-on-surface"
                  }`}
                >
                  <Icons.Pause />
                  {isManualPausing ? "Pausing..." : "Pause Execution"}
                </button>
                <button
                  onClick={handleStop}
                  disabled={isStopping}
                  className="px-4 py-2 bg-red-600/10 text-red-600 border border-red-600/20 rounded-md text-xs font-bold uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all shadow-sm"
                >
                  {isStopping ? "Stopping..." : "Stop Execution"}
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-12 gap-8 items-start">
            <div className="col-span-12 lg:col-span-3 lg:sticky lg:top-10 z-10 space-y-8">
              <TestingPlan tasks={tasks} isPlanning={isPlanning} />
            </div>
            <div className="col-span-12 lg:col-span-9 space-y-4">
              <ExecutionStream
                results={testResults}
                issues={issues}
                isGenerating={isGenerating}
                onReplay={handleReplay}
              />
              <div className="flex items-center gap-6">
                <button
                  onClick={handleReset}
                  className="text-xs font-bold uppercase tracking-widest text-primary hover:underline flex items-center gap-2"
                >
                  <Icons.ChevronLeft /> Back to Test Details
                </button>
                {completedSuitePath && (
                  <button
                    onClick={handleViewReport}
                    className="bg-primary text-white px-5 py-2 rounded-md font-bold text-[11px] uppercase tracking-wider shadow-ambient hover:opacity-90 transition-all flex items-center gap-2"
                  >
                    <Icons.TestSuites /> View Full Report
                  </button>
                )}
                {hasFailed && !isGenerating && (
                  <button
                    onClick={handleReplay}
                    className="bg-red-600 text-white px-5 py-2 rounded-md font-bold text-[11px] uppercase tracking-wider shadow-ambient hover:bg-red-700 transition-all flex items-center gap-2"
                  >
                    <Icons.RotateCw /> Retry Execution
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Backdrop */}
      {isViewingReport && (
        <div
          className="fixed inset-0 bg-surface-lowest/40 backdrop-blur-[2px] z-20 animate-in fade-in duration-300"
          onClick={() => setIsViewingReport(false)}
        />
      )}

      {/* Report Slide-over */}
      {isViewingReport && (
        <div className="fixed right-0 top-0 h-full w-[600px] bg-surface-lowest border-l border-on-surface/10 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col z-30">
          <div className="p-8 border-b border-on-surface/5 flex items-center justify-between shrink-0">
            <h2 className="text-xl font-bold font-display tracking-tight text-primary uppercase tracking-widest text-sm">
              Execution Report
            </h2>
            <button
              onClick={() => setIsViewingReport(false)}
              className="p-2 hover:bg-on-surface/5 rounded-full transition-colors text-on-surface/40"
            >
              <Icons.XCircle />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8">
            <MarkdownRenderer
              content={reportContent}
              basePath={
                completedSuitePath
                  ? completedSuitePath.split("/").slice(0, -1).join("/")
                  : undefined
              }
            />
          </div>
        </div>
      )}

      {pendingPlan && (
        <PlanApproval checklist={pendingPlan} onApprove={handleApprovePlan} />
      )}
      {pendingGoalValidation && (
        <GoalValidation
          checklist={pendingGoalValidation}
          onAction={handleGoalAction}
        />
      )}
      {pendingPauseChecklist && (
        <PauseOverlay
          checklist={pendingPauseChecklist}
          onAction={handleResume}
          onCancel={() => setPendingPauseChecklist(null)}
        />
      )}
    </div>
  );
};

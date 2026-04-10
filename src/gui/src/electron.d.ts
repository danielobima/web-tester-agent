import type { TestStep } from "./components/features/ExecutionStream";

declare global {
  interface Window {
    electron: {
      startTest: (url: string, prompt: string) => void;
      stopTest: () => void;
      approvePlan: (result: { action: 'accept' | 'modify' | 'reject', checklist?: any }) => void;
      replayTest: (suitePath?: string) => void;
      listSuites: () => Promise<Array<{
        id: string;
        name: string;
        url: string;
        stepsCount: number;
        path: string;
        createdAt: number;
      }>>;
      getSuite: (suitePath: string) => Promise<any>;
      deleteSuite: (suitePath: string) => Promise<{ success: boolean; error?: string }>;
      onTestStep: (callback: (step: TestStep) => void) => () => void;
      onTestChecklist: (callback: (checklist: { tasks: any[] }) => void) => () => void;
      onPlanApprovalRequest: (callback: (checklist: any) => void) => () => void;
      onGoalReached: (callback: (checklist: any) => void) => () => void;
      sendGoalValidationResponse: (result: { action: 'validate' | 'prompt' | 'cancel', feedback?: string }) => void;
      pauseTest: () => void;
      resumeTest: (result: { action: 'resume' } | { action: 'reprompt', feedback: string } | { action: 'modify', checklist: any }) => void;
      onPauseRequest: (callback: (checklist: any) => void) => () => void;
      onTestComplete: (callback: (result: { success: boolean; error?: string; duration?: string }) => void) => () => void;
      onPlanningState: (callback: (isPlanning: boolean) => void) => () => void;
    };
  }
}

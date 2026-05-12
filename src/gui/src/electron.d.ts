import type { TestStep } from "./components/features/ExecutionStream";

declare global {
  interface Window {
    electron: {
      startTest: (url: string, prompt: string) => void;
      stopTest: () => void;
      approvePlan: (result: { action: 'accept' | 'modify' | 'reject', checklist?: any }) => void;
      replayTest: (suitePath?: string) => void;
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
      onTestIssues: (callback: (issues: any[]) => void) => () => void;
      getSuiteReport: (suitePath: string) => Promise<string>;

      // Application Management
      listApplications: () => Promise<any[]>;
      createApplication: (name: string, description?: string) => Promise<any>;
      deleteApplication: (appId: string) => Promise<{ success: boolean }>;

      // Test Management
      listTests: (appId?: string) => Promise<any[]>;
      createTest: (config: { appId: string, name: string, url: string, prompt: string, model: string }) => Promise<any>;
      updateTest: (testId: string, config: any) => Promise<any>;
      deleteTest: (testId: string) => Promise<{ success: boolean }>;
      getTest: (testId: string) => Promise<any>;

      // Agent Error Management
      listAgentErrors: () => Promise<any[]>;
      getAgentError: (errorId: string) => Promise<any>;
      deleteAgentError: (errorId: string) => Promise<{ success: boolean }>;

      // Configuration
      getConfig: () => Promise<any>;
      saveConfig: (config: any) => Promise<{ success: boolean }>;

      startTest: (url: string, prompt: string, testId?: string, model?: string) => void;
    };
  }
}

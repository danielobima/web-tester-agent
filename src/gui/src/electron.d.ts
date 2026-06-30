import type { TestStep } from "./components/features/ExecutionStream";

declare global {
  interface Window {
    electron: {
      stopTest: () => void;
      approvePlan: (result: { action: 'accept' | 'modify' | 'reject', checklist?: any }) => void;
      replayTest: (suitePath?: string) => void;
      getSuite: (suitePath: string) => Promise<any>;
      deleteSuite: (suitePath: string) => Promise<{ success: boolean; error?: string }>;
      onTestStep: (callback: (step: TestStep) => void) => () => void;
      onTestChecklist: (callback: (checklist: { tasks: any[] }) => void) => () => void;
      onPlanApprovalRequest: (callback: (checklist: any) => void) => () => void;
      onExecutionFinished: (callback: (checklist: any) => void) => () => void;
      sendCompletionValidationResponse: (result: { action: 'validate' | 'prompt' | 'cancel', feedback?: string }) => void;
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
      createTest: (config: { appId: string, name: string, url: string, requirement: string, model: string }) => Promise<any>;
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

      // Variables Management
      listVariables: (appId?: string) => Promise<any[]>;
      createVariable: (config: { appId: string, name: string, type: string, value: string, purpose: string, expiry?: string }) => Promise<any>;
      updateVariable: (varId: string, config: any) => Promise<any>;
      deleteVariable: (varId: string) => Promise<{ success: boolean }>;

      startTest: (url: string, requirement: string, testId?: string, model?: string) => void;
    };
  }
}

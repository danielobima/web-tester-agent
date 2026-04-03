import type { TestStep } from "./components/features/ExecutionStream";

declare global {
  interface Window {
    electron: {
      startTest: (url: string, prompt: string) => void;
      stopTest: () => void;
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
      onTestComplete: (callback: (result: { success: boolean; error?: string; duration?: string }) => void) => () => void;
    };
  }
}

import {
  ExecutionResponse,
  ExecutionResponseSchema,
  Task,
  Checklist,
} from "./actions";
import { BrowserManager } from "./browser";
import { runWithSchemaRecovery } from "./agent/utils";
import {
  generateObjectWithTimeout,
  getProviderOptions,
  prepareImagePart,
} from "./utils";
import * as fs from "fs/promises";
import * as path from "path";

export interface FallbackAnalyserParams {
  model: any;
  requirement: string;
  currentTask: Task;
  checklist: Checklist;
  failureReason: string;
  history: any[];
  browser: BrowserManager;
  serializer?: any;
  signal?: AbortSignal;
  supportsVision?: boolean;
  onStep?: (update: any) => void;
}

/**
 * Fallback Dedicated Snapshot + Screenshot Analyser Agent.
 * Invoked when the primary Visual Agent fails or exhausts retries.
 * Cross-references the full accessibility DOM tree + screenshot to diagnose and recover.
 */
export async function runFallbackAnalyser(
  params: FallbackAnalyserParams,
): Promise<{ success: boolean; response: ExecutionResponse; error?: string }> {
  const {
    model,
    requirement,
    currentTask,
    checklist,
    failureReason,
    history,
    browser,
    serializer,
    signal,
    supportsVision = true,
    onStep,
  } = params;

  console.log(`\n[FallbackAnalyser] >>> Triggered for Task [${currentTask.id}]: "${currentTask.description}" <<<`);
  console.log(`[FallbackAnalyser] Failure Reason: ${failureReason}`);

  const promptPath = path.join(__dirname, "prompts", "fallback-analyser.txt");
  let promptTemplate = "";
  try {
    promptTemplate = await fs.readFile(promptPath, "utf-8");
  } catch {
    promptTemplate = `You are a Fallback QA Analyser Agent.\nTask: {taskDescription}\nGoal: {overallGoal}\nFailure: {failureReason}`;
  }

  const systemPrompt = promptTemplate
    .replace("{taskDescription}", currentTask.description)
    .replace("{overallGoal}", requirement)
    .replace("{failureReason}", failureReason);

  // 1. Fetch full accessibility tree snapshot
  const { text: domSnapshot, refs } = await browser.getSnapshotForLLM(false, false, true);

  // 2. Capture screenshot for visual inspection
  let screenshot: Buffer | undefined;
  if (browser.page) {
    try {
      screenshot = await browser.page.screenshot();
    } catch (e: any) {
      console.warn("[FallbackAnalyser] Failed to capture screenshot:", e.message);
    }
  }

  const currentUrl = browser.page ? browser.page.url() : "";
  const consoleLogs = browser.consoleLogs
    .filter((c) => c.type === "error")
    .map((c) => `[${c.type.toUpperCase()}] ${c.text}`)
    .join("\n");
  const networkErrors = browser.networkLogs
    .filter((n) => n.status >= 400)
    .map((n) => `[${n.method}] ${n.url} (${n.status})`)
    .join("\n");

  const technicalInfo = `
Current URL: ${currentUrl}
${consoleLogs ? `\nConsole Errors:\n${consoleLogs}` : ""}
${networkErrors ? `\nNetwork Failures:\n${networkErrors}` : ""}

Full Accessibility DOM Snapshot:
${domSnapshot}
`;

  const isolatedHistory = [...history.slice(-4)];

  const messages: any[] = [
    ...isolatedHistory,
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `The primary visual agent encountered an execution failure: "${failureReason}".\nDiagnose the root cause and provide a recovery action.\n\n${technicalInfo}`,
        },
        ...(screenshot && supportsVision ? [prepareImagePart(screenshot)] : []),
      ],
    },
  ];

  const maxFallbackAttempts = 2;
  let fallbackAttempt = 0;
  let lastDiagnosticError = "";
  let lastResult: ExecutionResponse | undefined;

  while (fallbackAttempt < maxFallbackAttempts) {
    fallbackAttempt++;
    console.log(`[FallbackAnalyser] Diagnostic Pass (Attempt ${fallbackAttempt}/${maxFallbackAttempts})`);

    try {
      const analysisStartTime = Date.now();
      const result = await runWithSchemaRecovery({
        model,
        schema: ExecutionResponseSchema,
        label: `FallbackAnalyser-Pass-${fallbackAttempt}`,
        history: isolatedHistory,
        abortSignal: signal,
        taskFn: async () => {
          const genRes = await generateObjectWithTimeout({
            model,
            schema: ExecutionResponseSchema,
            system: systemPrompt,
            providerOptions: getProviderOptions(model),
            messages,
            abortSignal: signal,
          });
          return genRes.object;
        },
      });

      lastResult = result;
      console.log(`[FallbackAnalyser] Selected Recovery Action: ${result.action.kind}`);
      console.log(`[FallbackAnalyser] Rationale: ${result.intendedActionDescription}`);

      // Execute the recovery action
      try {
        await browser.execute(result.action);
        result.previousActionResult = `Fallback recovery action '${result.action.kind}' executed successfully.`;

        if (onStep) {
          onStep({
            id: `fallback-${Date.now()}`,
            step: `Fallback Recovery: ${result.action.kind}`,
            status: "success",
            duration: `${((Date.now() - analysisStartTime) / 1000).toFixed(1)}s`,
            description: `Fallback Analyser resolved blocker: ${result.intendedActionDescription}`,
            stateDescription: result.currentStateDescription,
            url: currentUrl,
            action: result.action,
          });
        }

        return { success: true, response: result };
      } catch (execErr: any) {
        lastDiagnosticError = execErr.message;
        console.warn(`[FallbackAnalyser] Recovery attempt ${fallbackAttempt} failed: ${execErr.message}`);
        result.previousActionResult = `Fallback recovery failed: ${execErr.message}`;

        if (fallbackAttempt < maxFallbackAttempts) {
          // Re-capture fresh snapshot and screenshot for pass 2
          console.log("[FallbackAnalyser] Refreshing DOM snapshot and screenshot for pass 2...");
          const freshSnapshot = await browser.getSnapshotForLLM(false, false, true);
          let freshScreenshot: Buffer | undefined;
          if (browser.page) {
            freshScreenshot = await browser.page.screenshot().catch(() => undefined);
          }

          messages.push({
            role: "assistant",
            content: [{ type: "text", text: JSON.stringify(result) }],
          });
          messages.push({
            role: "user",
            content: [
              {
                type: "text",
                text: `Recovery action ${JSON.stringify(result.action)} failed with error: "${execErr.message}".\n\nUpdated DOM Snapshot:\n${freshSnapshot.text}\n\nSelect an alternative recovery action.`,
              },
              ...(freshScreenshot && supportsVision ? [prepareImagePart(freshScreenshot)] : []),
            ],
          });
        }
      }
    } catch (diagErr: any) {
      console.error(`[FallbackAnalyser] Diagnosis pass ${fallbackAttempt} error: ${diagErr.message}`);
      lastDiagnosticError = diagErr.message;
    }
  }

  return {
    success: false,
    response: lastResult || ({
      currentStateDescription: "Fallback analyser exhausted retries.",
      intendedActionDescription: "Unable to find working recovery action.",
      action: { kind: "none" },
      isTaskComplete: false,
      issues: [],
    } as any),
    error: lastDiagnosticError,
  };
}

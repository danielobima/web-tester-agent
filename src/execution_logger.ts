import * as fs from "fs/promises";
import * as path from "path";

export interface LogStepData {
  stepNumber: number;
  taskId?: string;
  taskDescription?: string;
  observation?: string;
  actionIntent?: string;
  actionKind: string;
  actionDetails?: any;
  result?: string;
  success: boolean;
  error?: string;
  assertions?: Array<{ type: string; name?: string; value?: string; passed?: boolean }>;
}

export class ExecutionLogger {
  private logPath: string | null = null;
  private buffer: string[] = [];
  private startTime: number = Date.now();
  private testName: string = "";
  private startUrl: string = "";
  private modelName: string = "";

  constructor(options?: { logPath?: string; testName?: string; startUrl?: string; modelName?: string }) {
    if (options?.logPath) this.logPath = options.logPath;
    if (options?.testName) this.testName = options.testName;
    if (options?.startUrl) this.startUrl = options.startUrl;
    if (options?.modelName) this.modelName = options.modelName;

    if (this.testName || this.startUrl) {
      this.initHeader();
    }
  }

  setLogPath(filePath: string) {
    this.logPath = filePath;
  }

  private initHeader() {
    this.startTime = Date.now();
    const dateStr = new Date(this.startTime).toISOString();
    this.buffer.push("=".repeat(80));
    this.buffer.push(`TEST EXECUTION LOG: ${this.testName || "Untitled Test"}`);
    this.buffer.push(`Timestamp: ${dateStr}`);
    if (this.startUrl) this.buffer.push(`Start URL: ${this.startUrl}`);
    if (this.modelName) this.buffer.push(`Model / Provider: ${this.modelName}`);
    this.buffer.push("=".repeat(80));
    this.buffer.push("");
  }

  logInfo(message: string) {
    const time = new Date().toLocaleTimeString();
    this.buffer.push(`[${time}] [INFO] ${message}`);
    this.flush().catch(() => {});
  }

  logPrecondition(message: string) {
    const time = new Date().toLocaleTimeString();
    this.buffer.push(`[${time}] [PRECONDITION] ${message}`);
    this.flush().catch(() => {});
  }

  logPlan(currentState: string, tasks: Array<{ id: string; description: string; type: string; status: string }>) {
    const time = new Date().toLocaleTimeString();
    this.buffer.push(`\n[${time}] [PLANNER] State Perception:`);
    this.buffer.push(`  ${currentState}`);
    this.buffer.push(`[${time}] [PLANNER] Plan Checklist (${tasks.length} tasks):`);
    for (const t of tasks) {
      const statusMark = t.status === "completed" ? "✓" : t.status === "failed" ? "✗" : t.status === "in_progress" ? "▶" : "○";
      this.buffer.push(`  ${statusMark} [${t.id}] (${t.type}): ${t.description} [${t.status}]`);
    }
    this.buffer.push("");
    this.flush().catch(() => {});
  }

  logStep(step: LogStepData) {
    const time = new Date().toLocaleTimeString();
    this.buffer.push(`\n--- STEP ${step.stepNumber} [${time}] ---`);
    if (step.taskId || step.taskDescription) {
      this.buffer.push(`Task: [${step.taskId || "N/A"}] ${step.taskDescription || ""}`);
    }
    if (step.observation) {
      this.buffer.push(`Observation: ${step.observation}`);
    }
    if (step.actionIntent) {
      this.buffer.push(`Intent: ${step.actionIntent}`);
    }
    
    // Format action cleanly
    const actionDetailsStr = step.actionDetails ? JSON.stringify(step.actionDetails) : "";
    this.buffer.push(`Action: ${step.actionKind} ${actionDetailsStr}`);

    if (step.success) {
      this.buffer.push(`Outcome: ✅ SUCCESS - ${step.result || "Executed successfully"}`);
    } else {
      this.buffer.push(`Outcome: ❌ FAILED - ${this.formatError(step.error || "Unknown failure")}`);
    }

    if (step.assertions && step.assertions.length > 0) {
      this.buffer.push(`Verifications:`);
      for (const a of step.assertions) {
        const passMark = a.passed !== false ? "✅" : "❌";
        this.buffer.push(`  ${passMark} ${a.type} ${a.name || ""} ${a.value ? `(expected: ${a.value})` : ""}`);
      }
    }

    this.flush().catch(() => {});
  }

  logError(title: string, error: any) {
    const time = new Date().toLocaleTimeString();
    const formatted = this.formatError(error);
    this.buffer.push(`\n[${time}] [ERROR] ${title}:`);
    this.buffer.push(`  ${formatted}`);
    this.buffer.push("");
    this.flush().catch(() => {});
  }

  logCompletion(result: { success: boolean; duration?: string; tasksCompleted?: number; totalTasks?: number; error?: string; issuesCount?: number }) {
    const duration = result.duration || `${((Date.now() - this.startTime) / 1000).toFixed(1)}s`;
    this.buffer.push("\n" + "=".repeat(80));
    this.buffer.push(`EXECUTION FINISHED: ${result.success ? "✅ PASSED" : "❌ FAILED"}`);
    this.buffer.push(`Total Duration: ${duration}`);
    if (result.tasksCompleted !== undefined && result.totalTasks !== undefined) {
      this.buffer.push(`Tasks Completed: ${result.tasksCompleted}/${result.totalTasks}`);
    }
    if (result.issuesCount !== undefined) {
      this.buffer.push(`Findings / Issues: ${result.issuesCount}`);
    }
    if (result.error) {
      this.buffer.push(`Final Error: ${this.formatError(result.error)}`);
    }
    this.buffer.push("=".repeat(80) + "\n");
    this.flush().catch(() => {});
  }

  /**
   * Cleans bloated errors (e.g. Vercel AI SDK / Axios / Playwright internal trace dumps)
   */
  private formatError(err: any): string {
    if (!err) return "Unknown error";
    if (typeof err === "string") {
      return err.replace(/\s+/g, " ").slice(0, 500);
    }

    // AI_APICallError / OpenAI API Error
    if (err.statusCode || err.name === "AI_APICallError" || err.url) {
      let apiMsg = err.data?.error?.message || err.message || "API request error";
      // Truncate long internal messages
      if (typeof apiMsg === "string" && apiMsg.length > 300) {
        apiMsg = apiMsg.slice(0, 300) + "...";
      }
      return `[LLM API Error ${err.statusCode || 400}] ${apiMsg}`;
    }

    // Playwright locator error
    if (err.message) {
      const firstLines = err.message.split("\n").filter((l: string) => !l.includes("Call log:") && !l.includes("at ") && !l.includes("node_modules")).slice(0, 3).join(" ");
      return firstLines.slice(0, 300);
    }

    try {
      return JSON.stringify(err).slice(0, 300);
    } catch {
      return String(err).slice(0, 300);
    }
  }

  async flush() {
    if (!this.logPath) return;
    try {
      const dir = path.dirname(this.logPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.logPath, this.buffer.join("\n"), "utf-8");
    } catch (e) {
      // Ignore write errors to prevent interrupting test flow
    }
  }

  getRawText(): string {
    return this.buffer.join("\n");
  }
}

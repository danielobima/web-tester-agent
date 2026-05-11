import * as fs from "fs/promises";
import * as path from "path";
import { BrowserManager } from "./browser";
import { AgentHistoryMessage } from "./agent";
import { Checklist } from "./actions";

export interface ErrorReportContext {
  error: Error;
  type: "planning" | "execution" | "verification" | "browser";
  step: number;
  requirement: string;
  url: string;
  taskId?: string;
  taskDescription?: string;
  history: AgentHistoryMessage[];
  snapshot?: string;
  axTree?: any;
  refs?: any;
  checklist?: Checklist;
  llmPrompt?: string;
  llmRawResponse?: string;
}

export async function saveAgentErrorReport(
  artifactsDir: string,
  ctx: ErrorReportContext,
  browser: BrowserManager
) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const errorDir = path.join(artifactsDir, "errors", timestamp);
  await fs.mkdir(errorDir, { recursive: true });

  const report = {
    timestamp: new Date().toISOString(),
    error: {
      message: ctx.error.message,
      stack: ctx.error.stack,
      type: ctx.type,
      cause: (ctx.error as any).cause,
      details: (ctx.error as any).errors // For Zod/Schema errors
    },
    environment: {
      url: ctx.url,
      step: ctx.step,
      taskId: ctx.taskId,
      taskDescription: ctx.taskDescription,
      requirement: ctx.requirement,
    },
    state: {
      checklist: ctx.checklist,
      refs: ctx.refs,
    },
    llm: {
      prompt: ctx.llmPrompt,
      rawResponse: ctx.llmRawResponse,
    },
    history: ctx.history,
  };

  // Save report JSON
  await fs.writeFile(
    path.join(errorDir, "report.json"),
    JSON.stringify(report, null, 2)
  );

  // Save Snapshot
  if (ctx.snapshot) {
    await fs.writeFile(path.join(errorDir, "snapshot.txt"), ctx.snapshot);
  }

  // Save AXTree
  if (ctx.axTree) {
    await fs.writeFile(
      path.join(errorDir, "axtree.json"),
      JSON.stringify(ctx.axTree, null, 2)
    );
  }

  // Save Screenshot
  if (browser.page) {
    try {
      await browser.page.screenshot({
        path: path.join(errorDir, "screenshot.png"),
        fullPage: false,
      });
    } catch (e) {
      console.warn(`Failed to take error screenshot: ${e}`);
    }
  }

  console.log(`[ErrorLogger] Detailed error report saved to: ${errorDir}`);
  return errorDir;
}

import { Action, Assertion, Checklist, Task } from "./actions";
import * as fs from "fs/promises";
import * as path from "path";
import { ExecutionLogger } from "./execution_logger";

export interface HealingRecord {
  date: string;
  originalSelector: string; // or ref
  newSelector: string;
  reason: string;
}

export interface Issue {
  id: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  affectedStepIds: string[];
}

export interface TestStep {
  id: string;
  action: Action;
  stateDescription?: string;
  actionIntent?: string;
  actionResult?: string;
  verificationAssertions?: Assertion[];
  taskId?: string;
  healingHistory?: HealingRecord[];
  stateSnapshot?: string;
  axTree?: any;
  issues?: { description: string; severity: "low" | "medium" | "high" | "critical" }[];
  usedVariables?: string[];
}

export interface SerializedTest {
  id: string;
  appId?: string;
  testId?: string;
  name: string;
  startUrl: string;
  checklist?: Checklist;
  steps: TestStep[];
  originalSteps?: TestStep[];
  issues: Issue[];
  variables?: Record<string, string>;
}

export class TestSerializer {
  private test: SerializedTest | null = null;
  private stepCounter = 0;
  private activeOutPath: string | null = null;
  private variables: Record<string, string> = {};
  public logger: ExecutionLogger = new ExecutionLogger();

  startTest(name: string, startUrl: string, appId?: string) {
    this.test = {
      id: `test-${Date.now()}`,
      appId,
      name,
      startUrl,
      steps: [],
      issues: [],
    };
    this.stepCounter = 0;
    this.variables = {};
    this.logger = new ExecutionLogger({ testName: name, startUrl });
    if (this.activeOutPath) {
      this.logger.setLogPath(this.activeOutPath.replace(/\.json$/, ".log"));
    }
  }

  setVariables(variables: any) {
    if (Array.isArray(variables)) {
      const map: Record<string, string> = {};
      for (const v of variables) {
        if (v && v.name) {
          map[v.name] = v.value;
        }
      }
      this.variables = map;
    } else if (variables) {
      this.variables = { ...variables };
    }
  }

  setOutPath(filePath: string) {
    this.activeOutPath = filePath;
    this.logger.setLogPath(filePath.replace(/\.json$/, ".log"));
  }

  logAction(
    action: Action,
    options?: {
      stateDescription?: string;
      actionIntent?: string;
      actionResult?: string;
      verificationAssertions?: Assertion[];
      taskId?: string;
      stateSnapshot?: string;
      axTree?: any;
      issues?: { description: string; severity: "low" | "medium" | "high" | "critical" }[];
      usedVariables?: string[];
    },
  ) {
    if (!this.test) throw new Error("Test not started");

    const stepId = `step-${++this.stepCounter}`;
    this.test.steps.push({
      id: stepId,
      action,
      stateDescription: options?.stateDescription,
      actionIntent: options?.actionIntent,
      actionResult: options?.actionResult,
      verificationAssertions: options?.verificationAssertions,
      taskId: options?.taskId,
      stateSnapshot: options?.stateSnapshot,
      axTree: options?.axTree,
      issues: options?.issues,
      usedVariables: options?.usedVariables,
    });

    if (options?.issues) {
      for (const issue of options.issues) {
        this.addOrUpdateIssue(issue, stepId);
      }
    }

    this.logger.logStep({
      stepNumber: this.stepCounter,
      taskId: options?.taskId,
      observation: options?.stateDescription,
      actionIntent: options?.actionIntent,
      actionKind: action.kind,
      actionDetails: action,
      result: options?.actionResult,
      success: true,
      assertions: options?.verificationAssertions,
    });
  }

  logFindings(stepId: string, issues?: { description: string; severity: "low" | "medium" | "high" | "critical" }[]) {
    if (!this.test) return;
    if (issues) {
      for (const issue of issues) {
        this.addOrUpdateIssue(issue, stepId);
      }
    }
  }

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
      .replace(/\s+/g, " ")
      .split(" ")
      .filter((w) => !["the", "a", "an"].includes(w))
      .join(" ");
  }

  private addOrUpdateIssue(
    issue: {
      description: string;
      severity: "low" | "medium" | "high" | "critical";
    },
    stepId: string,
  ) {
    if (!this.test) return;

    let description = issue.description.trim();
    let foundId: string | undefined;

    // Check for explicit ISSUE-N pattern
    const idMatch = description.match(/^(ISSUE-\d+)(?::\s*(.*))?$/i);
    if (idMatch) {
      foundId = idMatch[1].toUpperCase();
      description = idMatch[2] || foundId;
    }

    const normDescription = this.normalize(description);

    const existing = this.test.issues.find(
      (i) =>
        (foundId && i.id === foundId) ||
        this.normalize(i.description) === normDescription,
    );

    if (existing) {
      if (!existing.affectedStepIds.includes(stepId)) {
        existing.affectedStepIds.push(stepId);
      }
      
      const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
      if (severityOrder[issue.severity] > severityOrder[existing.severity]) {
        existing.severity = issue.severity;
      }
    } else {
      const newId = foundId || `ISSUE-${this.test.issues.length + 1}`;
      this.test.issues.push({
        id: newId,
        description: description === newId ? "Untitled Issue" : description,
        severity: issue.severity,
        affectedStepIds: [stepId],
      });
    }
  }

  updateChecklist(checklist: Checklist) {
    if (this.test) {
      this.test.checklist = checklist;
      if (checklist.tasks && Array.isArray(checklist.tasks)) {
        this.logger.logPlan(checklist.currentStateDescription, checklist.tasks);
      }
    }
  }

  logVerificationToLastStep(assertions: Assertion[]) {
    if (!this.test || this.test.steps.length === 0) return;
    this.test.steps[this.test.steps.length - 1].verificationAssertions =
      assertions;
  }

  // Update the result of the strictly previous step
  updatePreviousResult(resultDesc: string) {
    if (!this.test || this.test.steps.length === 0) return;
    this.test.steps[this.test.steps.length - 1].actionResult = resultDesc;
  }

  async saveTest(filePath?: string) {
    if (!this.test) throw new Error("Test not started");
    const targetPath = filePath || this.activeOutPath;
    if (!targetPath) {
      console.warn("[TestSerializer] No output path set, skipping save.");
      return;
    }

    this.test.variables = this.variables;

    const baseDir = path.dirname(targetPath);
    try {
      console.log(`[TestSerializer] Saving test to: ${targetPath}`);
      await fs.mkdir(baseDir, { recursive: true });
      await fs.writeFile(targetPath, JSON.stringify(this.test, null, 2), "utf-8");

      // Save execution log
      await this.logger.flush();
      const screenshotsDir = path.join(
        baseDir,
        path.basename(targetPath, ".json") + ".screenshots",
      );
      try {
        await fs.mkdir(screenshotsDir, { recursive: true });
        await fs.writeFile(
          path.join(screenshotsDir, "execution.log"),
          this.logger.getRawText(),
          "utf-8",
        );
      } catch (e) {}
    } catch (error: any) {
      console.error(`[TestSerializer] Failed to save test: ${error.message}`);
    }
  }

  async loadTest(filePath: string): Promise<SerializedTest> {
    const data = await fs.readFile(filePath, "utf-8");
    this.test = JSON.parse(data);
    this.stepCounter = this.test!.steps.length;
    if (this.test?.variables) {
      this.variables = { ...this.test.variables };
    }
    return this.test!;
  }

  getTest(): SerializedTest | null {
    return this.test;
  }

  setTest(test: SerializedTest) {
    this.test = test;
  }
}

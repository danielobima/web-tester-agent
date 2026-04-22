import { Action, Assertion, Checklist, Task } from "./actions";
import * as fs from "fs/promises";
import * as path from "path";

export interface HealingRecord {
  date: string;
  originalSelector: string; // or ref
  newSelector: string;
  reason: string;
}

export interface Issue {
  id: string;
  description: string;
  affectedStepIds: string[];
}

export interface UsabilityFeedback {
  id: string;
  description: string;
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
}

export interface SerializedTest {
  id: string;
  name: string;
  startUrl: string;
  checklist?: Checklist;
  steps: TestStep[];
  originalSteps?: TestStep[];
  issues: Issue[];
  usability: UsabilityFeedback[];
}

export class TestSerializer {
  private test: SerializedTest | null = null;
  private stepCounter = 0;
  private activeOutPath: string | null = null;

  startTest(name: string, startUrl: string) {
    this.test = {
      id: `test-${Date.now()}`,
      name,
      startUrl,
      steps: [],
      issues: [],
      usability: [],
    };
    this.stepCounter = 0;
  }

  setOutPath(filePath: string) {
    this.activeOutPath = filePath;
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
      observedIssues?: string[];
      usabilityFeedback?: string[];
    },
  ) {
    if (!this.test) throw new Error("Test not started");

    // If there's a previous step, we can backfill the actionResult of the previous step
    // now that we observe the new state. This assumes logAction is called after the action
    // executes, but the result is observed in the NEXT step.
    // The user requested: 1. current state, 2. action attempted, 3. result of action.
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
    });

    if (options?.observedIssues) {
      for (const issueContent of options.observedIssues) {
        this.addOrUpdateIssue(issueContent, stepId);
      }
    }

    if (options?.usabilityFeedback) {
      for (const feedbackContent of options.usabilityFeedback) {
        this.addOrUpdateUsability(feedbackContent, stepId);
      }
    }
  }

  logFindings(stepId: string, issues?: string[], usability?: string[]) {
    if (!this.test) return;
    if (issues) {
      for (const content of issues) {
        this.addOrUpdateIssue(content, stepId);
      }
    }
    if (usability) {
      for (const content of usability) {
        this.addOrUpdateUsability(content, stepId);
      }
    }
  }

  private addOrUpdateIssue(content: string, stepId: string) {
    if (!this.test) return;
    
    // Normalize content: some agents might return "ISSUE-1: Description"
    let description = content;
    let foundId: string | undefined;
    
    const idMatch = content.match(/^(ISSUE-\d+)(?::\s*(.*))?$/i);
    if (idMatch) {
      foundId = idMatch[1].toUpperCase();
      description = idMatch[2] || foundId;
    }

    const existing = this.test.issues.find(
      (i) => (foundId && i.id === foundId) || i.description.toLowerCase() === description.toLowerCase().trim()
    );

    if (existing) {
      if (!existing.affectedStepIds.includes(stepId)) {
        existing.affectedStepIds.push(stepId);
      }
    } else {
      const newId = foundId || `ISSUE-${this.test.issues.length + 1}`;
      this.test.issues.push({
        id: newId,
        description: description === newId ? "Untitled Issue" : description,
        affectedStepIds: [stepId],
      });
    }
  }

  private addOrUpdateUsability(content: string, stepId: string) {
    if (!this.test) return;

    let description = content;
    let foundId: string | undefined;

    const idMatch = content.match(/^(USABILITY-\d+)(?::\s*(.*))?$/i);
    if (idMatch) {
      foundId = idMatch[1].toUpperCase();
      description = idMatch[2] || foundId;
    }

    const existing = this.test.usability.find(
      (u) => (foundId && u.id === foundId) || u.description.toLowerCase() === description.toLowerCase().trim()
    );

    if (existing) {
      if (!existing.affectedStepIds.includes(stepId)) {
        existing.affectedStepIds.push(stepId);
      }
    } else {
      const newId = foundId || `USABILITY-${this.test.usability.length + 1}`;
      this.test.usability.push({
        id: newId,
        description: description === newId ? "Untitled Feedback" : description,
        affectedStepIds: [stepId],
      });
    }
  }

  updateChecklist(checklist: Checklist) {
    if (this.test) {
      this.test.checklist = checklist;
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

    const baseDir = path.dirname(targetPath);
    try {
      console.log(`[TestSerializer] Saving test to: ${targetPath}`);
      await fs.mkdir(baseDir, { recursive: true });
      await fs.writeFile(targetPath, JSON.stringify(this.test, null, 2), "utf-8");
    } catch (error: any) {
      console.error(`[TestSerializer] Failed to save test: ${error.message}`);
    }
  }

  async loadTest(filePath: string): Promise<SerializedTest> {
    const data = await fs.readFile(filePath, "utf-8");
    this.test = JSON.parse(data);
    this.stepCounter = this.test!.steps.length;
    return this.test!;
  }

  getTest(): SerializedTest | null {
    return this.test;
  }

  setTest(test: SerializedTest) {
    this.test = test;
  }
}

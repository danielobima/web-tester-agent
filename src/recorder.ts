import { Action, Assertion } from "./actions";
import * as fs from "fs/promises";
import * as path from "path";

export interface HealingRecord {
  date: string;
  originalSelector: string; // or ref
  newSelector: string;
  reason: string;
}

export interface TestStep {
  id: string;
  action: Action;
  stateDescription?: string;
  actionIntent?: string;
  actionResult?: string;
  assertions?: Assertion[];
  healingHistory?: HealingRecord[];
  stateSnapshot?: string;
  axTree?: any;
}

export interface SerializedTest {
  id: string;
  name: string;
  startUrl: string;
  steps: TestStep[];
  originalSteps?: TestStep[];
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
      assertions?: Assertion[];
      stateSnapshot?: string;
      axTree?: any;
    },
  ) {
    if (!this.test) throw new Error("Test not started");

    // If there's a previous step, we can backfill the actionResult of the previous step
    // now that we observe the new state. This assumes logAction is called after the action
    // executes, but the result is observed in the NEXT step.
    // The user requested: 1. current state, 2. action attempted, 3. result of action.
    this.test.steps.push({
      id: `step-${++this.stepCounter}`,
      action,
      stateDescription: options?.stateDescription,
      actionIntent: options?.actionIntent,
      actionResult: options?.actionResult,
      assertions: options?.assertions,
      stateSnapshot: options?.stateSnapshot,
      axTree: options?.axTree,
    });
  }

  // Update the result of the strictly previous step
  updatePreviousResult(resultDesc: string) {
    if (!this.test || this.test.steps.length === 0) return;
    this.test.steps[this.test.steps.length - 1].actionResult = resultDesc;
  }

  async saveTest(filePath?: string) {
    if (!this.test) throw new Error("Test not started");
    const targetPath = filePath || this.activeOutPath;
    if (!targetPath) return;
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, JSON.stringify(this.test, null, 2), "utf-8");
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

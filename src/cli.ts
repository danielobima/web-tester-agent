import { BrowserManager } from "./browser";
import { runAgent, type PlanApprovalResult } from "./agent";
import { TestSerializer } from "./recorder";
import { replayTest } from "./replay";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs/promises";
import { google } from "@ai-sdk/google";
import { createOllama } from "ollama-ai-provider-v2";
import * as readline from "readline/promises";
import { type Checklist } from "./actions";

dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`Usage: 
    npm run dev -- record "<Goal>" "<StartUrl>" "<OutputFile.json>" [--no-artifacts] [--full-snapshot] [--interactive]
    npm run dev -- replay "<File.json>" [--no-artifacts] [--full-snapshot]`);
    process.exit(1);
  }

  const browser = new BrowserManager();
  await browser.init(false);

  try {
    const providerArg = args.find((a) => a.startsWith("--provider="));
    const provider = providerArg ? providerArg.split("=")[1] : "google";
    const modelArg = args.find((a) => a.startsWith("--model="));
    let modelName = modelArg ? modelArg.split("=")[1] : "";

    let model;
    if (provider === "ollama") {
      const ollama = createOllama();
      if (!modelName) modelName = "deepseek-r1:7b";
      model = ollama(modelName);
    } else {
      if (!modelName) modelName = "gemini-3.1-flash-lite-preview";
      model = google(modelName);
    }

    if (command === "record") {
      const saveArtifacts = !args.includes("--no-artifacts");
      const skipAssertions = args.includes("--skip-assertions");
      const fullSnapshot = args.includes("--full-snapshot");
      const isInteractive = args.includes("--interactive") || args.includes("-i");
      
      const cleanArgs = args.filter(a => !["--no-artifacts", "--skip-assertions", "--full-snapshot", "--interactive", "-i"].includes(a) && !a.startsWith("--provider=") && !a.startsWith("--model="));

      const goal = cleanArgs[1];
      const startUrl = cleanArgs[2];
      const outPath = cleanArgs[3] || "test-spec.json";

      if (!goal || !startUrl) throw new Error("Missing goal or startUrl.");

      console.log(`[CLI] Starting Record Mode...`);
      const serializer = new TestSerializer();
      serializer.startTest(goal, startUrl);

      const artifactsDir = saveArtifacts ? `artifacts/record-${Date.now()}` : undefined;
      const resultsDir = "test-results";
      await fs.mkdir(resultsDir, { recursive: true });
      const finalOutPath = outPath.includes("/") ? outPath : path.join(resultsDir, outPath.endsWith(".json") ? outPath : `${outPath}.json`);
      serializer.setOutPath(finalOutPath);

      await browser.execute({ kind: "navigate", url: startUrl });
      await runAgent(
        goal,
        browser,
        model as any,
        serializer,
        artifactsDir,
        skipAssertions,
        fullSnapshot,
        undefined,
        undefined,
        isInteractive ? async (checklist: Checklist): Promise<PlanApprovalResult> => {
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          console.log("\n\nAI PROPOSED TESTING PLAN\n" + "=".repeat(40));
          checklist.tasks.forEach((t, i) => console.log(`${i + 1}. [${t.status}] ${t.description}`));
          const answer = await rl.question("\nDo you want to [A]ccept, [M]odify, or [R]eject this plan? (a/m/r): ");
          if (answer.toLowerCase().startsWith('r')) { rl.close(); return { action: 'reject' }; }
          if (answer.toLowerCase().startsWith('m')) {
            const newTasks = [...checklist.tasks];
            for (let i = 0; i < newTasks.length; i++) {
              const newDesc = await rl.question(`${i + 1}. [${newTasks[i].description}]: `);
              if (newDesc.trim()) newTasks[i] = { ...newTasks[i], description: newDesc.trim() };
            }
            rl.close();
            return { action: 'modify', checklist: { ...checklist, tasks: newTasks } };
          }
          rl.close();
          return { action: 'accept' };
        } : undefined,
        isInteractive ? async (checklist: Checklist): Promise<any> => {
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          console.log("\n\nGOAL VALIDATION\n" + "=".repeat(40));
          console.log(`The agent believes it has achieved the goal: "${checklist.isGoalAchieved}"`);
          console.log(`Current State: ${checklist.currentStateDescription}`);
          const answer = await rl.question("\n[V]alidate completion, [P]rompt further, or [C]ancel? (v/p/c): ");
          if (answer.toLowerCase().startsWith('p')) {
            const feedback = await rl.question("Provide feedback/instructions: ");
            rl.close();
            return { action: 'prompt', feedback };
          }
          if (answer.toLowerCase().startsWith('c')) {
            rl.close();
            return { action: 'cancel' };
          }
          rl.close();
          return { action: 'validate' };
        } : undefined
      );

      await serializer.saveTest(finalOutPath);
    } else if (command === "replay") {
      const file = args.find(a => !a.startsWith("-") && a !== "replay");
      if (!file) throw new Error("Missing file path for replay.");
      await replayTest(file, browser, model as any, undefined, false, false);
    }
  } catch (e: any) {
    console.error(`[CLI] Error: ${e.message}`);
  } finally {
    await browser.close();
  }
}

main();

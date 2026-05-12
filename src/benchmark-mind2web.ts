import { BrowserManager } from "./browser";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { google } from "@ai-sdk/google";
import * as dotenv from "dotenv";
import { planTask, executeTask, mapRefsToIdentifiers, type AgentHistoryMessage } from "./agent";
import { type Checklist } from "./actions";
import { createModel } from "./models";

dotenv.config();

const MIND2WEB_OP_MAP: Record<string, string[]> = {
    "CLICK": ["click", "click_selector", "hover", "drag", "scrollIntoView", "screenshot"],
    "TYPE": ["type", "fill", "press"],
    "SELECT": ["select_option", "select"]
};

function getMappedMind2WebOp(agentKind: string): string | undefined {
    for (const [mind2webOp, agentKinds] of Object.entries(MIND2WEB_OP_MAP)) {
        if (agentKinds.includes(agentKind)) {
            return mind2webOp;
        }
    }
    return undefined;
}

async function runBenchmarkSample() {
  const scratchPath = path.join(process.cwd(), "scratch", "mind2web_record_with_html.json");
  const trainingPath = path.join(process.cwd(), "..", "training", "sample_record.json");
  
  let sampleData;
  let task = "Unknown Task";
  try {
      if (fsSync.existsSync(scratchPath)) {
          console.log(`[Benchmark] Loading real Mind2Web sample from: ${scratchPath}`);
          sampleData = JSON.parse(fsSync.readFileSync(scratchPath, "utf-8"));
          task = sampleData.confirmed_task || task;
      } else {
          console.log(`[Benchmark] Loading manual sample from: ${trainingPath}`);
          sampleData = JSON.parse(await fs.readFile(trainingPath, "utf-8"));
      }
  } catch (e: any) {
      console.error(`[Benchmark] Failed to load sample data: ${e.message}`);
      return;
  }

  console.log(`[Benchmark] Task: ${sampleData.confirmed_task}`);
  
  const browser = new BrowserManager();
  await browser.init(true); // headless

  try {
    const actionsToTest = sampleData.actions || (sampleData.action ? [sampleData.action] : []);
    const limit = process.env.BENCHMARK_LIMIT ? parseInt(process.env.BENCHMARK_LIMIT) : actionsToTest.length;
    const actionsSubset = actionsToTest.slice(0, limit);
    
    console.log(`[Benchmark] Starting evaluation for ${actionsSubset.length} actions...`);
    
    // Model Setup
    const provider = process.env.BENCHMARK_PROVIDER || "google";
    const modelName = process.env.BENCHMARK_MODEL || "gemini-1.5-flash-latest";
    
    console.log(`[Benchmark] Using model: ${provider}:${modelName}`);
    
    let perfectMatches = 0;
    const model = createModel({
        id: "benchmark-model",
        name: "Benchmark Model",
        provider: provider as any,
        modelName: modelName,
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || "", // Fallback
    });
    const planningPrompt = await fs.readFile(path.join(__dirname, "prompts", "planning.txt"), "utf-8");
    const executionPromptTemplate = await fs.readFile(path.join(__dirname, "prompts", "execution.txt"), "utf-8");

    let history: AgentHistoryMessage[] = [];
    let checklist: Checklist = {
        currentStateDescription: "Starting Mind2Web benchmark",
        tasks: [],
        isGoalAchieved: false,
        issues: [],
    };

    for (let i = 0; i < actionsSubset.length; i++) {
        const actionData = actionsSubset[i];
        console.log(`\n\n` + "=".repeat(20) + ` ACTION ${i + 1}/${actionsSubset.length} ` + "=".repeat(20));
        console.log(`[Benchmark] Target: ${actionData.action_repr}`);

        // 1. Load the state
        if (actionData.raw_html) {
            let html = actionData.raw_html;
            if (sampleData.website) {
                html = `<base href="${sampleData.website}">${html}`;
            }
            await browser.page!.setContent(html);
        } else if (sampleData.website) {
            await browser.execute({ kind: "navigate", url: sampleData.website });
        }
        await browser.waitForStability();

        // 2. Take snapshot
        const snapshot = await browser.getSnapshotForLLM();
        
        // 3. Predict
        // Planning (Updates checklist)
        checklist = await planTask({
            model: model as any,
            requirement: task,
            checklist,
            snapshot: snapshot.text,
            history,
            planningPrompt,
        });

        const currentTaskId = checklist.nextTaskId || (checklist.tasks.length > 0 ? checklist.tasks[0].id : undefined);
        const currentTask = checklist.tasks.find(t => t.id === currentTaskId) || { description: task };

        // Execution Prediction
        const executionResponse = await executeTask({
            model: model as any,
            requirement: task,
            currentTask: currentTask,
            checklist,
            snapshot: snapshot.text,
            history,
            executionPromptTemplate,
        });

        mapRefsToIdentifiers(executionResponse.action, snapshot.refs);

        // Update history for next step using Dataset Ground Truth (Priming)
        // This keeps the agent "in sync" with the static snapshots
        history.push({
            role: "assistant",
            content: [
                {
                    type: "text",
                    text: `Action: ${actionData.action_repr || "I performed the required operation for this step."}`,
                },
            ],
        });
        history.push({
            role: "user",
            content: [
                {
                    type: "text",
                    text: "The action was successful. I am now at the next state.",
                },
            ],
        });

        // Limit history size
        if (history.length > 10) history.splice(0, 1);

        // 4. Compare
        if (actionData.operation) {
            const targetOp = actionData.operation.op;
            const targetValue = actionData.operation.value;
            const predictedOp = executionResponse.action.kind;
            const mappedPredictedOp = getMappedMind2WebOp(predictedOp);
            const predictedValue = (executionResponse.action as any).value || (executionResponse.action as any).text || "N/A";
            
            console.log(`\n[Benchmark] Comparison:`);
            console.log(`- Target Op:    ${targetOp}`);
            console.log(`- Predicted:    ${predictedOp} (Mapped: ${mappedPredictedOp || "UNKNOWN"})`);
            console.log(`- Target Val:   ${targetValue || "N/A"}`);
            console.log(`- Predicted Val:${predictedValue}`);

            const opMatch = targetOp === mappedPredictedOp;
            
            // Fuzzy value matching
            const tVal = (targetValue || "").toString().toLowerCase().trim();
            const pVal = (predictedValue || "").toString().toLowerCase().trim();
            
            const valMatch = tVal === pVal || 
                            (tVal && pVal && (tVal.includes(pVal) || pVal.includes(tVal)));

            if (opMatch && valMatch) {
                console.log("✅ PERFECT MATCH");
                perfectMatches++;
            } else if (opMatch) {
                console.log("✅ PARTIAL MATCH: Operation matches.");
            } else if (valMatch) {
                console.log("⚠️  PARTIAL MATCH: Value matches.");
            } else {
                console.log("❌ MISMATCH");
            }
        }
    }

    console.log(`\n\n` + "=".repeat(50));
    console.log(`[Benchmark] Task Complete: ${sampleData.annotation_id}`);
    console.log(`[Benchmark] Score: ${perfectMatches}/${actionsToTest.length} (${((perfectMatches/actionsToTest.length)*100).toFixed(1)}%)`);
    console.log("=".repeat(50));

  } catch (e: any) {
    console.error(`[Benchmark] Error during execution: ${e.message}`);
  } finally {
    await browser.close();
  }
}

runBenchmarkSample();

import { BrowserManager } from "./browser";
import { runAgent } from "./agent";
import { TestSerializer } from "./recorder";
import { replayTest } from "./replay";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs/promises";
import { google } from "@ai-sdk/google";
import { createOllama } from "ollama-ai-provider-v2";

dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`Usage: 
    npm run dev -- record "<Goal>" "<StartUrl>" "<OutputFile.json>" [--save-artifacts]
    npm run dev -- replay "<File.json>"`);
    process.exit(1);
  }

  const browser = new BrowserManager();
  await browser.init(false); // Disable headless to watch the bot work

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
      if (!modelName) modelName = "gemini-2.5-flash";
      model = google(modelName);
    }

    if (command === "record") {
      const saveArtifacts = args.includes("--save-artifacts");
      const skipAssertions = args.includes("--skip-assertions");
      const cleanArgs = args.filter(
        (a) =>
          a !== "--save-artifacts" &&
          a !== "--skip-assertions" &&
          !a.startsWith("--provider=") &&
          !a.startsWith("--model="),
      );

      const goal = cleanArgs[1];
      const startUrl = cleanArgs[2];
      const outPath = cleanArgs[3] || "test-spec.json";

      if (!goal || !startUrl) throw new Error("Missing goal or startUrl.");

      console.log(`[CLI] Starting Record Mode...`);
      const serializer = new TestSerializer();
      serializer.startTest(goal, startUrl);

      const artifactsDir = saveArtifacts
        ? `artifacts/record-${Date.now()}`
        : undefined;

      const resultsDir = "test-results";
      await fs.mkdir(resultsDir, { recursive: true });
      const finalOutPath = outPath.includes("/")
        ? outPath
        : path.join(
            resultsDir,
            outPath.endsWith(".json") ? outPath : `${outPath}.json`,
          );
      serializer.setOutPath(finalOutPath);

      await browser.execute({ kind: "navigate", url: startUrl });
      await runAgent(
        goal,
        browser,
        model as any,
        serializer,
        artifactsDir,
        skipAssertions,
      );

      const rawTest = serializer.getTest();

      await serializer.saveTest(finalOutPath);
      console.log(`[CLI] Recording finished. Saved to ${finalOutPath}`);
    } else if (command === "replay") {
      const saveArtifacts = args.includes("--save-artifacts");
      const skipAssertions = args.includes("--skip-assertions");
      const cleanArgs = args.filter(
        (a) =>
          a !== "--save-artifacts" &&
          a !== "--skip-assertions" &&
          !a.startsWith("--provider=") &&
          !a.startsWith("--model="),
      );

      const file = cleanArgs[1];
      if (!file) throw new Error("Missing file path for replay.");

      const artifactsDir = saveArtifacts
        ? `artifacts/replay-${Date.now()}`
        : undefined;

      console.log(`[CLI] Starting Replay Mode...`);
      await replayTest(
        file,
        browser,
        model as any,
        artifactsDir,
        skipAssertions,
      );
      console.log(`[CLI] Replay finished.`);
    } else {
      console.log("Unknown command. Use 'record' or 'replay'.");
    }
  } catch (e: any) {
    console.error(`[CLI] Unhandled Error: ${e.message}`);
  } finally {
    await browser.close();
  }
}

main();

import { BrowserManager } from "./browser";
import { runAgent } from "./agent";
import { TestSerializer } from "./recorder";
import { replayTest } from "./replay";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs/promises";

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
    if (command === "record") {
      const saveArtifacts = args.includes("--save-artifacts");
      const cleanArgs = args.filter((a) => a !== "--save-artifacts");

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

      await browser.execute({ kind: "navigate", url: startUrl });
      await runAgent(goal, browser, serializer, artifactsDir);

      const rawTest = serializer.getTest();
      if (rawTest) {
        console.log(`[CLI] Starting compilation/optimization pass...`);
        const { optimizeTest } = await import("./optimizer");
        const optimized = await optimizeTest(rawTest);
        serializer.setTest(optimized);
      }

      await serializer.saveTest(finalOutPath);
      console.log(`[CLI] Recording finished. Saved to ${finalOutPath}`);
    } else if (command === "replay") {
      const saveArtifacts = args.includes("--save-artifacts");
      const cleanArgs = args.filter((a) => a !== "--save-artifacts");

      const file = cleanArgs[1];
      if (!file) throw new Error("Missing file path for replay.");

      const artifactsDir = saveArtifacts
        ? `artifacts/replay-${Date.now()}`
        : undefined;

      console.log(`[CLI] Starting Replay Mode...`);
      await replayTest(file, browser, artifactsDir);
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

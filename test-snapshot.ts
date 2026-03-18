import { BrowserManager } from "./src/browser";

async function main() {
  const browser = new BrowserManager();
  await browser.init(true);
  try {
    await browser.execute({
      kind: "navigate",
      url: `file://${process.cwd()}/../test-form.html`,
    });
    await browser.waitForStability(2000, 500);
    const { text, refs } = await browser.getSnapshotForLLM(false, true); // true = interactiveOnly
    console.log("=== INTERACTIVE SNAPSHOT ===");
    console.log(text);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);

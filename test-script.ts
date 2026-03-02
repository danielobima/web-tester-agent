import { BrowserManager } from "./src/browser";

async function main() {
  const browser = new BrowserManager();
  await browser.init(false);

  console.log("Navigating to Hackernews...");
  await browser.execute({
    kind: "navigate",
    url: "https://news.ycombinator.com",
  });

  console.log("Waiting for network idle...");
  try {
    await browser.page?.waitForLoadState("networkidle", { timeout: 3000 });
  } catch (e) {}

  console.log("Capturing snapshot...");
  const { text, refs } = await browser.getSnapshotForLLM();

  // Find the 'Login' button (or link) ref
  let loginRef;
  for (const [ref, info] of Object.entries(refs)) {
    if (info.name && info.name.toLowerCase().includes("login")) {
      loginRef = ref;
      break;
    }
  }

  if (!loginRef) {
    console.log("Login ref not found in snapshot!");
    console.log(text);
  } else {
    console.log("Found Login ref:", loginRef, refs[loginRef]);
    console.log("Executing click...");
    await browser.execute({ kind: "click", ref: loginRef });
    console.log("Click executed!");
  }

  console.log("Waiting 3s before closing...");
  await new Promise((r) => setTimeout(r, 3000));
  await browser.close();
}

main().catch(console.error);

import {
  chromium,
  type Browser,
  type Page,
  type BrowserContext,
} from "playwright";
import { type Action } from "./actions";
import { snapshotRoleViaPlaywright } from "./browser/pw-tools-core.snapshot";
import { getRoleSnapshotStats } from "./browser/pw-role-snapshot";
import {
  clickViaPlaywright,
  typeViaPlaywright,
  pressKeyViaPlaywright,
  hoverViaPlaywright,
  scrollIntoViewViaPlaywright,
  dragViaPlaywright,
  selectOptionViaPlaywright,
  fillFormViaPlaywright,
  waitForViaPlaywright,
  evaluateViaPlaywright,
  navigateViaPlaywright,
  closePageViaPlaywright,
  takeScreenshotViaPlaywright,
} from "./browser/pw-tools-core";
import { refLocator } from "./browser/pw-session";

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  public page: Page | null = null;

  // We need cdpUrl array and targetId for OpenClaw functions
  public cdpUrl: string = "";
  public targetId: string = "root_target_id";

  async init(headless: boolean = false) {
    if (this.browser) return; // Already initialized

    // We have to launch the browser with remote debugging port to use CDP
    this.browser = await chromium.launch({
      headless,
      args: ["--remote-debugging-port=9222"],
    });

    this.cdpUrl = "http://localhost:9222";

    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();

    // Inject _snapshotForAI required by some OpenClaw aria fallback methods, though we attempt to use the locator version.
    // The targetId routing normally relies on `server-context` in OpenClaw.
    // Since we aren't using the server, we will pass true page reference directly where we can,
    // or rely on the simpler pw tools that we hacked/imported.

    // Get the targetId for the page so OpenClaw CDP tools route correctly
    const session = await this.context.newCDPSession(this.page);
    try {
      const info: any = await session.send("Target.getTargetInfo");
      this.targetId = info?.targetInfo?.targetId || "root_target_id";
    } catch {
      // fallback
    } finally {
      await session.detach();
    }

    // NOTE: In a real direct Playwright setup without OpenClaw's background proxy,
    // `snapshotRoleViaPlaywright` expects `opts.cdpUrl` and `opts.targetId` properly hooked up via `storeRoleRefsForTarget`
    // We will initialize it.
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  // Returns snapshot state and populates the refs mapping
  async getSnapshotForLLM() {
    if (!this.page) throw new Error("Browser not initialized");

    // OpenClaw's snapshotRoleViaPlaywright generates the tree and sets up refs
    try {
      const { snapshot, refs, stats } = await snapshotRoleViaPlaywright({
        cdpUrl: this.cdpUrl,
        targetId: this.targetId,
        selector: ":root",
      });

      console.log(`[Browser] Built Snapshot. Stats:`, stats);
      return {
        text: snapshot,
        refs,
        axTree: null, // The snapshot string IS the axTree for aria methods
      };
    } catch (e: any) {
      console.warn(`[Browser] snapshotRoleViaPlaywright failed: ${e.message}`);
      return { text: "Error fetching snapshot", refs: {}, axTree: null };
    }
  }

  async execute(action: Action) {
    if (!this.page) throw new Error("Browser not initialized");

    const baseOpts = { cdpUrl: this.cdpUrl, targetId: this.targetId };

    console.log(`[Browser] Executing action: ${action.kind}`);

    switch (action.kind) {
      case "navigate":
        await navigateViaPlaywright({
          ...baseOpts,
          url: action.url,
          timeoutMs: action.timeoutMs,
        });
        break;

      case "click_selector":
        await this.page
          .locator(action.selector)
          .first()
          .click({
            timeout: action.timeoutMs ?? 5000,
          });
        break;

      case "click":
        await clickViaPlaywright({
          ...baseOpts,
          ref: action.ref,
          doubleClick: action.doubleClick,
          button: action.button,
          timeoutMs: action.timeoutMs,
        });
        break;

      case "type":
        await typeViaPlaywright({
          ...baseOpts,
          ref: action.ref,
          text: action.text ?? action.value ?? "",
          submit: action.submit,
          slowly: action.slowly,
          timeoutMs: action.timeoutMs,
        });
        break;

      case "press":
        await pressKeyViaPlaywright({
          ...baseOpts,
          key: action.key,
          delayMs: action.delayMs,
        });
        break;

      case "hover":
        await hoverViaPlaywright({
          ...baseOpts,
          ref: action.ref,
          timeoutMs: action.timeoutMs,
        });
        break;

      case "scrollIntoView":
        await scrollIntoViewViaPlaywright({
          ...baseOpts,
          ref: action.ref,
          timeoutMs: action.timeoutMs,
        });
        break;

      case "drag":
        await dragViaPlaywright({
          ...baseOpts,
          startRef: action.startRef,
          endRef: action.endRef,
          timeoutMs: action.timeoutMs,
        });
        break;

      case "select":
        await selectOptionViaPlaywright({
          ...baseOpts,
          ref: action.ref,
          values: action.values,
          timeoutMs: action.timeoutMs,
        });
        break;

      case "fill":
        await fillFormViaPlaywright({
          ...baseOpts,
          fields: action.fields,
          timeoutMs: action.timeoutMs,
        });
        break;

      case "wait":
        await waitForViaPlaywright({
          ...baseOpts,
          timeMs: action.timeMs,
          text: action.text,
          textGone: action.textGone,
          selector: action.selector,
          url: action.url,
          loadState: action.loadState,
          fn: (action as any).fn,
          timeoutMs: action.timeoutMs,
        });
        break;

      case "evaluate":
        await evaluateViaPlaywright({
          ...baseOpts,
          fn: action.fn,
          ref: action.ref,
          timeoutMs: action.timeoutMs,
        });
        break;

      case "close":
        await closePageViaPlaywright(baseOpts);
        break;

      case "screenshot":
        if (action.fullPage) {
          await this.page.screenshot({
            fullPage: true,
            path: `artifacts/${action.name}.png`,
          });
        } else {
          // the tool handles regular screenshots
          await takeScreenshotViaPlaywright({
            ...baseOpts,
            path: `artifacts/${action.name}.jpeg`,
          } as any);
        }
        break;
    }
  }
}

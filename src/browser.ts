import {
  chromium,
  type Browser,
  type Page,
  type BrowserContext,
} from "playwright";
import * as fs from "fs";
import * as path from "path";
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
import { refLocator, findPageByTargetId } from "./browser/pw-session";

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  public page: Page | null = null;
  public networkLogs: {
    url: string;
    method: string;
    status: number;
  }[] = [];
  public consoleLogs: {
    type: string;
    text: string;
    location?: string;
  }[] = [];

  // We need cdpUrl array and targetId for OpenClaw functions
  public cdpUrl: string = "";
  public targetId: string = "";

  // Messages to be included in the next snapshot (e.g., event notifications)
  private pendingMessages: string[] = [];

  // Track all pages in the context
  public pages: Page[] = [];

  async init(headless: boolean = false) {
    if (this.browser) return; // Already initialized

    // We have to launch the browser with remote debugging port to use CDP
    this.browser = await chromium.launch({
      headless,
      args: ["--remote-debugging-port=9222"],
    });

    this.cdpUrl = "http://localhost:9222";

    this.context = await this.browser.newContext();
    
    // Listen for new pages to automatically track them
    this.context.on("page", async (newPage) => {
      console.log(`[Browser] New page opened: ${newPage.url()}`);
      this.pages.push(newPage);
      this.pendingMessages.push(`NEW TAB OPENED: ${newPage.url()}. Focus has been automatically switched to this new tab.`);
      
      // Auto-switch to new pages if they are opened by user action
      // We wait for the page to be ready and then update the active page
      try {
        await newPage.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
        this.setActivePage(newPage);
      } catch (e) {
        console.warn(`[Browser] Failed to auto-switch to new page: ${e}`);
      }
      
      newPage.on("close", () => {
        this.pages = this.pages.filter(p => p !== newPage);
        if (this.page === newPage) {
          this.pendingMessages.push(`TAB CLOSED: ${newPage.url()}. Current active tab was closed.`);
          // If active page closed, switch to the last available page
          const last = this.pages[this.pages.length - 1];
          if (last) {
            this.pendingMessages.push(`FOCUS SWITCHED: Focus has been switched to the next available tab: ${last.url()}`);
            this.setActivePage(last);
          } else {
            this.page = null;
            this.targetId = "";
          }
        }
      });
    });

    this.page = await this.context.newPage();
    this.setActivePage(this.page);
  }

  private async setActivePage(page: Page) {
    if (page.isClosed()) {
      console.warn("[Browser] Attempted to set a closed page as active.");
      return;
    }
    this.page = page;

    // Setup listeners if not already done
    const pageObj = page as any;
    if (!pageObj._listenersAttached) {
      pageObj._listenersAttached = true;
      page.on("response", (response) => {
        this.networkLogs.push({
          url: response.url(),
          method: response.request().method(),
          status: response.status(),
        });
      });

      page.on("console", (message) => {
        this.consoleLogs.push({
          type: message.type(),
          text: message.text(),
          location: `${message.location().url}:${message.location().lineNumber}`,
        });
      });

      page.on("close", () => {
        pageObj._listenersAttached = false;
      });
    }

    // Get the targetId for the page so OpenClaw CDP tools route correctly
    try {
      const session = await page.context().newCDPSession(page);
      try {
        const info: any = await session.send("Target.getTargetInfo");
        this.targetId = info?.targetInfo?.targetId || "";
        console.log(
          `[Browser] Active page set to: ${page.url()} (TargetID: ${this.targetId})`,
        );
      } catch (e) {
        console.warn(`[Browser] Failed to get target info: ${e}`);
      } finally {
        await session.detach().catch(() => {});
      }
    } catch (e) {
      console.warn(`[Browser] Failed to create CDP session: ${e}`);
      this.targetId = ""; // fallback
    }
  }


  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
      this.pages = [];
      this.targetId = "";
    }
  }

  // Returns snapshot state and populates the refs mapping
  async getSnapshotForLLM(
    quiet: boolean = false,
    interactiveOnly: boolean = false,
    fullSnapshot: boolean = false,
  ) {
    if (!this.page) throw new Error("Browser not initialized");

    // OpenClaw's snapshotRoleViaPlaywright generates the tree and sets up refs
    try {
      const { snapshot, refs, stats } = await snapshotRoleViaPlaywright({
        cdpUrl: this.cdpUrl,
        targetId: this.targetId,
        selector: ":root",
        options: fullSnapshot ? { raw: true } : (interactiveOnly ? { interactive: true } : undefined),
      });

      // Add tab information to the snapshot
      let tabInfo = "";
      if (this.pages.length > 1) {
        tabInfo = "\n\nAvailable Tabs:\n";
        for (const p of this.pages) {
          const title = await p.title().catch(() => "Unknown");
          const url = p.url();
          const isActive = p === this.page ? " (ACTIVE)" : "";
          // We don't easily have targetId here without extra CDP calls, 
          // but we can provide title and URL for the agent to switch if needed.
          tabInfo += `- ${title} [${url}]${isActive}\n`;
        }
      }

      let notifications = "";
      if (this.pendingMessages.length > 0) {
        notifications = "\n\nNOTIFICATIONS:\n" + this.pendingMessages.map(m => `- ${m}`).join("\n");
        this.pendingMessages = []; // Clear after including in snapshot
      }

      let focusedRef: string | null = null;
      const activeInfo = await this.page.evaluate(() => {
        const getDeepActiveElement = (doc: Document): Element | null => {
          let el = doc.activeElement;
          if (!el) return null;
          while (el && el.shadowRoot && el.shadowRoot.activeElement) {
            el = el.shadowRoot.activeElement;
          }
          if (el && el.tagName === "IFRAME") {
            try {
              const contentDoc = (el as HTMLIFrameElement).contentDocument;
              if (contentDoc) {
                const deep = getDeepActiveElement(contentDoc);
                return deep || el;
              }
            } catch (e) {
              return el; // Cross-origin
            }
          }
          return el;
        };
        const el = getDeepActiveElement(document);
        if (!el || el === document.body || el === document.documentElement) return null;
        return { tagName: el.tagName, id: el.id, className: el.className };
      }).catch(() => null);

      if (activeInfo) {
        // Find the specific frame that contains the active element
        const frames = this.page.frames();
        let targetFrame = null;
        for (const frame of frames) {
          const isFrameFocused = await frame.evaluate(() => {
            const el = document.activeElement;
            return el && el !== document.body && el !== document.documentElement;
          }).catch(() => false);
          if (isFrameFocused) {
            targetFrame = frame;
            break;
          }
        }

        if (targetFrame) {
          for (const ref of Object.keys(refs)) {
            try {
              const info = refs[ref];
              const loc = targetFrame.getByRole(info.role as any, { name: info.name, exact: true });
              const count = await loc.count().catch(() => 0);
              
              if (count > 0) {
                const targetLoc = info.nth !== undefined ? loc.nth(info.nth) : loc;
                const isFocused = await targetLoc.evaluate((node) => {
                  let active = document.activeElement;
                  while (active && active.shadowRoot && active.shadowRoot.activeElement) {
                    active = active.shadowRoot.activeElement;
                  }
                  return node === active;
                }).catch(() => false);

                if (isFocused) {
                  focusedRef = ref;
                  break;
                }
              }
            } catch (e) {
              // ignore
            }
          }
        }
      }

      let processedSnapshot = snapshot;
      if (focusedRef) {
        const lines = processedSnapshot.split("\n");
        processedSnapshot = lines.map(line => {
          if (line.includes(`[ref=${focusedRef}]`)) {
            return line + " (FOCUSED)";
          }
          return line;
        }).join("\n");
      }

      if (!quiet) {
        if (focusedRef) {
          console.log(`[Browser] Built Snapshot. Focused element found: ${focusedRef}`);
        } else if (activeInfo) {
          console.log(`[Browser] Built Snapshot. Active element exists (${(activeInfo as any).tagName}) but no matching ref found in ${Object.keys(refs).length} refs.`);
        } else {
          console.log(`[Browser] Built Snapshot. No active element found.`);
        }
      }
      return {
        text: processedSnapshot + tabInfo + notifications,
        refs,
        axTree: null, // The snapshot string IS the axTree for aria methods
      };
    } catch (e: any) {
      if (!quiet)
        console.warn(
          `[Browser] snapshotRoleViaPlaywright failed: ${e.message}`,
        );
      return { text: "Error fetching snapshot", refs: {}, axTree: null };
    }
  }

  // Wait for the accessibility tree to remain unchanged for a given polling period
  async waitForStability(
    timeoutMs: number = 10000,
    pollingMs: number = 500,
  ): Promise<void> {
    const startTime = Date.now();
    let previousSnapshot = "";

    while (Date.now() - startTime < timeoutMs) {
      const { text: currentSnapshot } = await this.getSnapshotForLLM(
        true,
        true,
      ); // Use interactiveOnly = true for stability check
      if (currentSnapshot === previousSnapshot && previousSnapshot !== "") {
        console.log(
          `[Browser] Page stabilized after ${Date.now() - startTime}ms`,
        );
        return;
      }
      previousSnapshot = currentSnapshot;
      await new Promise((resolve) => setTimeout(resolve, pollingMs));
    }
    console.warn(`[Browser] Page did not stabilize within ${timeoutMs}ms`);
  }

  // Helper to get a Playwright Locator from role/name/nth or a string 'ref'
  async getLocator(
    opts: string | { ref?: string; role?: string; name?: string; nth?: number },
  ) {
    if (!this.page) throw new Error("Browser not initialized");
    return await refLocator(this.page, opts);
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

      case "select_option":
        if (action.ref || action.role || action.name) {
          await selectOptionViaPlaywright({
            ...baseOpts,
            ref: action.ref,
            role: action.role,
            name: action.name,
            nth: action.nth,
            values: [action.value],
            timeoutMs: action.timeoutMs,
          });
        } else if (action.selector) {
          await this.page
            .locator(action.selector!)
            .first()
            .selectOption(action.value, {
              timeout: action.timeoutMs ?? 5000,
            });
        }
        break;

      case "click":
        await clickViaPlaywright({
          ...baseOpts,
          ref: action.ref,
          role: action.role,
          name: action.name,
          nth: action.nth,
          doubleClick: action.doubleClick,
          button: action.button,
          timeoutMs: action.timeoutMs,
        });
        break;

      case "type":
        await typeViaPlaywright({
          ...baseOpts,
          ref: action.ref,
          role: action.role,
          name: action.name,
          nth: action.nth,
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
          role: action.role,
          name: action.name,
          nth: action.nth,
          timeoutMs: action.timeoutMs,
        });
        break;

      case "scrollIntoView":
        await scrollIntoViewViaPlaywright({
          ...baseOpts,
          ref: action.ref,
          role: action.role,
          name: action.name,
          nth: action.nth,
          timeoutMs: action.timeoutMs,
        });
        break;

      case "drag":
        await dragViaPlaywright({
          ...baseOpts,
          startRef: action.startRef,
          startRole: action.startRole,
          startName: action.startName,
          startNth: action.startNth,
          endRef: action.endRef,
          endRole: action.endRole,
          endName: action.endName,
          endNth: action.endNth,
          timeoutMs: action.timeoutMs,
        });
        break;

      case "stop":
        console.log(`[Browser] Action 'stop' - no execution needed.`);
        break;

      case "select":
        await selectOptionViaPlaywright({
          ...baseOpts,
          ref: action.ref,
          role: action.role,
          name: action.name,
          nth: action.nth,
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
          role: action.role,
          name: action.name,
          nth: action.nth,
          timeoutMs: action.timeoutMs,
        });
        break;

      case "close":
        await closePageViaPlaywright(baseOpts);
        break;

      case "screenshot":
        if (action.ref || action.role) {
          const result = await takeScreenshotViaPlaywright({
            ...baseOpts,
            ref: action.ref,
            role: action.role,
            name: action.elementName,
            nth: action.nth,
            type: "jpeg",
          });
          const dest = path.join(
            process.cwd(),
            "artifacts",
            `${action.name}.jpeg`,
          );
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, result.buffer);
        } else if (action.fullPage) {
          await this.page.screenshot({
            fullPage: true,
            path: `artifacts/${action.name}.png`,
          });
        } else {
          // the tool handles regular screenshots
          const result = await takeScreenshotViaPlaywright({
            ...baseOpts,
            type: "jpeg",
          });
          const dest = path.join(
            process.cwd(),
            "artifacts",
            `${action.name}.jpeg`,
          );
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, result.buffer);
        }
        break;

      case "list_tabs":
        // This is handled implicitly by the snapshot, but we can log it
        console.log(`[Browser] Listing ${this.pages.length} tabs`);
        break;

      case "switch_tab":
        if (action.targetId) {
          const target = await findPageByTargetId(this.browser!, action.targetId, this.cdpUrl);
          if (target) {
            this.pendingMessages.push(`FOCUS SWITCHED: Focus has been manually switched to tab: ${target.url()}`);
            await this.setActivePage(target);
            await target.bringToFront();
          } else {
            throw new Error(`Tab with targetId ${action.targetId} not found`);
          }
        } else if (action.title || action.url) {
          const target = this.pages.find(p => 
            (action.title && p.url().includes(action.title)) || 
            (action.url && p.url().includes(action.url))
          );
          if (target) {
            this.pendingMessages.push(`FOCUS SWITCHED: Focus has been manually switched to tab: ${target.url()}`);
            await this.setActivePage(target);
            await target.bringToFront();
          } else {
            throw new Error(`Tab with title/url ${action.title || action.url} not found`);
          }
        }
        break;

      case "close_tab":
        if (action.targetId) {
          const target = await findPageByTargetId(this.browser!, action.targetId, this.cdpUrl);
          if (target) {
            await target.close();
          }
        } else {
          await this.page.close();
        }
        break;

      case "new_tab":
        if (this.context) {
          const newPage = await this.context.newPage();
          if (action.url) {
            await newPage.goto(action.url);
          }
          await this.setActivePage(newPage);
        }
        break;
    }
  }
}

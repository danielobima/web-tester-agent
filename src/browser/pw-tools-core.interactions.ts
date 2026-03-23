import {
  ensurePageState,
  forceDisconnectPlaywrightForTarget,
  getPageForTargetId,
  refLocator,
  restoreRoleRefsForTarget,
} from "./pw-session";
import {
  normalizeTimeoutMs,
  requireRefOrRole,
  formatRefForError,
  toAIFriendlyError,
} from "./pw-tools-core.shared";

export async function highlightViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  ref?: string;
  role?: string;
  name?: string;
  nth?: number;
}): Promise<void> {
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  restoreRoleRefsForTarget({
    cdpUrl: opts.cdpUrl,
    targetId: opts.targetId,
    page,
  });
  const refOpts = requireRefOrRole(opts);
  try {
    await (await refLocator(page, refOpts)).highlight();
  } catch (err) {
    throw toAIFriendlyError(err, formatRefForError(refOpts));
  }
}

export async function clickViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  ref?: string;
  role?: string;
  name?: string;
  nth?: number;
  doubleClick?: boolean;
  button?: "left" | "right" | "middle";
  modifiers?: Array<"Alt" | "Control" | "ControlOrMeta" | "Meta" | "Shift">;
  timeoutMs?: number;
}): Promise<void> {
  const page = await getPageForTargetId({
    cdpUrl: opts.cdpUrl,
    targetId: opts.targetId,
  });
  ensurePageState(page);
  restoreRoleRefsForTarget({
    cdpUrl: opts.cdpUrl,
    targetId: opts.targetId,
    page,
  });
  const refOpts = requireRefOrRole(opts);
  const locator = await refLocator(page, refOpts);
  const timeout = Math.max(
    500,
    Math.min(60_000, Math.floor(opts.timeoutMs ?? 8000)),
  );
  try {
    if (opts.doubleClick) {
      await locator.dblclick({
        timeout,
        button: opts.button,
        modifiers: opts.modifiers,
      });
    } else {
      // Robustness: Focus before click for certain interactive roles
      const info = opts.role
        ? opts
        : ((await refLocator(page, opts.ref || "")) as any)._info;
      const role = opts.role || info?.role;
      if (role === "combobox" || role === "listbox" || role === "searchbox") {
        await locator.focus({ timeout: 2000 }).catch(() => {});
      }

      await locator.click({
        timeout,
        button: opts.button,
        modifiers: opts.modifiers,
        // Robustness: force click for options/radios that might be overlay-heavy
        force:
          role === "option" ||
          role === "radio" ||
          role === "menuitem" ||
          role === "menuitemcheckbox" ||
          role === "menuitemradio",
      });
    }
    // Add a small delay to allow DOM/Network to react to click
    await page.waitForTimeout(1000);
    try {
      await page.waitForLoadState("networkidle", { timeout: 3000 });
    } catch (e) {
      // ignore
    }
  } catch (err) {
    throw toAIFriendlyError(err, formatRefForError(refOpts));
  }
}

export async function hoverViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  ref?: string;
  role?: string;
  name?: string;
  nth?: number;
  timeoutMs?: number;
}): Promise<void> {
  const refOpts = requireRefOrRole(opts);
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  restoreRoleRefsForTarget({
    cdpUrl: opts.cdpUrl,
    targetId: opts.targetId,
    page,
  });
  try {
    await (
      await refLocator(page, refOpts)
    ).hover({
      timeout: Math.max(500, Math.min(60_000, opts.timeoutMs ?? 8000)),
    });
  } catch (err) {
    throw toAIFriendlyError(err, formatRefForError(refOpts));
  }
}

export async function dragViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  startRef?: string;
  startRole?: string;
  startName?: string;
  startNth?: number;
  endRef?: string;
  endRole?: string;
  endName?: string;
  endNth?: number;
  timeoutMs?: number;
}): Promise<void> {
  const startRefOpts = requireRefOrRole({
    ref: opts.startRef,
    role: opts.startRole,
    name: opts.startName,
    nth: opts.startNth,
  });
  const endRefOpts = requireRefOrRole({
    ref: opts.endRef,
    role: opts.endRole,
    name: opts.endName,
    nth: opts.endNth,
  });
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  restoreRoleRefsForTarget({
    cdpUrl: opts.cdpUrl,
    targetId: opts.targetId,
    page,
  });
  try {
    await (
      await refLocator(page, startRefOpts)
    ).dragTo(await refLocator(page, endRefOpts), {
      timeout: Math.max(500, Math.min(60_000, opts.timeoutMs ?? 8000)),
    });
  } catch (err) {
    throw toAIFriendlyError(
      err,
      `${formatRefForError(startRefOpts)} -> ${formatRefForError(endRefOpts)}`,
    );
  }
}

export async function selectOptionViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  ref?: string;
  role?: string;
  name?: string;
  nth?: number;
  values: string[];
  timeoutMs?: number;
}): Promise<void> {
  const refOpts = requireRefOrRole(opts);
  if (!opts.values?.length) {
    throw new Error("values are required");
  }
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  restoreRoleRefsForTarget({
    cdpUrl: opts.cdpUrl,
    targetId: opts.targetId,
    page,
  });
  try {
    await (
      await refLocator(page, refOpts)
    ).selectOption(opts.values, {
      timeout: Math.max(500, Math.min(60_000, opts.timeoutMs ?? 8000)),
    });
  } catch (err) {
    throw toAIFriendlyError(err, formatRefForError(refOpts));
  }
}

export async function pressKeyViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  key: string;
  delayMs?: number;
}): Promise<void> {
  const key = String(opts.key ?? "").trim();
  if (!key) {
    throw new Error("key is required");
  }
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  await page.keyboard.press(key, {
    delay: Math.max(0, Math.floor(opts.delayMs ?? 0)),
  });
}

export async function typeViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  ref?: string;
  role?: string;
  name?: string;
  nth?: number;
  text: string;
  submit?: boolean;
  slowly?: boolean;
  timeoutMs?: number;
}): Promise<void> {
  const text = String(opts.text ?? "");
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  restoreRoleRefsForTarget({
    cdpUrl: opts.cdpUrl,
    targetId: opts.targetId,
    page,
  });
  const refOpts = requireRefOrRole(opts);
  const locator = await refLocator(page, refOpts);
  const timeout = Math.max(500, Math.min(60_000, opts.timeoutMs ?? 8000));
  try {
    if (opts.slowly) {
      await locator.click({ timeout });
      await locator.type(text, { timeout, delay: 75 });
    } else {
      await locator.fill(text, { timeout });
    }
    if (opts.submit) {
      await locator.press("Enter", { timeout });
    }
  } catch (err) {
    throw toAIFriendlyError(err, formatRefForError(refOpts));
  }
}

export async function fillFormViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  fields: any[];
  timeoutMs?: number;
}): Promise<void> {
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  restoreRoleRefsForTarget({
    cdpUrl: opts.cdpUrl,
    targetId: opts.targetId,
    page,
  });
  const timeout = Math.max(500, Math.min(60_000, opts.timeoutMs ?? 8000));
  for (const field of opts.fields) {
    const refOpts = field.role ? field : requireRefOrRole({ ref: field.ref });
    const type = field.type?.trim();
    const rawValue = field.value;
    const value =
      typeof rawValue === "string"
        ? rawValue
        : typeof rawValue === "number" || typeof rawValue === "boolean"
          ? String(rawValue)
          : "";
    if ((!refOpts.ref && !refOpts.role) || !type) {
      continue;
    }
    const locator = await refLocator(page, refOpts);
    if (type === "checkbox" || type === "radio") {
      const checked =
        rawValue === true ||
        rawValue === 1 ||
        rawValue === "1" ||
        rawValue === "true";
      try {
        await locator.setChecked(checked, { timeout });
      } catch (err) {
        throw toAIFriendlyError(err, formatRefForError(refOpts));
      }
      continue;
    }
    try {
      await locator.fill(value, { timeout });
    } catch (err) {
      throw toAIFriendlyError(err, formatRefForError(refOpts));
    }
  }
}

export async function evaluateViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  fn: string;
  ref?: string;
  role?: string;
  name?: string;
  nth?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<unknown> {
  const fnText = String(opts.fn ?? "").trim();
  if (!fnText) {
    throw new Error("function is required");
  }
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  restoreRoleRefsForTarget({
    cdpUrl: opts.cdpUrl,
    targetId: opts.targetId,
    page,
  });
  // Clamp evaluate timeout to prevent permanently blocking Playwright's command queue.
  // Without this, a long-running async evaluate blocks all subsequent page operations
  // because Playwright serializes CDP commands per page.
  //
  // NOTE: Playwright's { timeout } on evaluate only applies to installing the function,
  // NOT to its execution time. We must inject a Promise.race timeout into the browser
  // context itself so async functions are bounded.
  const outerTimeout = normalizeTimeoutMs(opts.timeoutMs, 20_000);
  // Leave headroom for routing/serialization overhead so the outer request timeout
  // doesn't fire first and strand a long-running evaluate.
  let evaluateTimeout = Math.max(1000, Math.min(120_000, outerTimeout - 500));
  evaluateTimeout = Math.min(evaluateTimeout, outerTimeout);

  const signal = opts.signal;
  let abortListener: (() => void) | undefined;
  let abortReject: ((reason: unknown) => void) | undefined;
  let abortPromise: Promise<never> | undefined;
  if (signal) {
    abortPromise = new Promise((_, reject) => {
      abortReject = reject;
    });
    // Ensure the abort promise never becomes an unhandled rejection if we throw early.
    void abortPromise.catch(() => {});
  }
  if (signal) {
    const disconnect = () => {
      void forceDisconnectPlaywrightForTarget({
        cdpUrl: opts.cdpUrl,
        targetId: opts.targetId,
        reason: "evaluate aborted",
      }).catch(() => {});
    };
    if (signal.aborted) {
      disconnect();
      throw signal.reason ?? new Error("aborted");
    }
    abortListener = () => {
      disconnect();
      abortReject?.(signal.reason ?? new Error("aborted"));
    };
    signal.addEventListener("abort", abortListener, { once: true });
    // If the signal aborted between the initial check and listener registration, handle it.
    if (signal.aborted) {
      abortListener();
      throw signal.reason ?? new Error("aborted");
    }
  }

  try {
    if (opts.ref || opts.role) {
      const locator = await refLocator(page, opts);
      // eslint-disable-next-line @typescript-eslint/no-implied-eval -- required for browser-context eval
      const elementEvaluator = new Function(
        "el",
        "args",
        `
        "use strict";
        var fnBody = args.fnBody, timeoutMs = args.timeoutMs;
        try {
          var candidate = eval("(" + fnBody + ")");
          var result = typeof candidate === "function" ? candidate(el) : candidate;
          if (result && typeof result.then === "function") {
            return Promise.race([
              result,
              new Promise(function(_, reject) {
                setTimeout(function() { reject(new Error("evaluate timed out after " + timeoutMs + "ms")); }, timeoutMs);
              })
            ]);
          }
          return result;
        } catch (err) {
          throw new Error("Invalid evaluate function: " + (err && err.message ? err.message : String(err)));
        }
        `,
      ) as (
        el: Element,
        args: { fnBody: string; timeoutMs: number },
      ) => unknown;
      const evalPromise = locator.evaluate(elementEvaluator, {
        fnBody: fnText,
        timeoutMs: evaluateTimeout,
      });
      if (!abortPromise) {
        return await evalPromise;
      }
      try {
        return await Promise.race([evalPromise, abortPromise]);
      } catch (err) {
        // If abort wins the race, the underlying evaluate may reject later; ensure we don't
        // surface it as an unhandled rejection.
        void evalPromise.catch(() => {});
        throw err;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- required for browser-context eval
    const browserEvaluator = new Function(
      "args",
      `
        "use strict";
        var fnBody = args.fnBody, timeoutMs = args.timeoutMs;
        try {
          var candidate = eval("(" + fnBody + ")");
          var result = typeof candidate === "function" ? candidate() : candidate;
          if (result && typeof result.then === "function") {
            return Promise.race([
              result,
              new Promise(function(_, reject) {
                setTimeout(function() { reject(new Error("evaluate timed out after " + timeoutMs + "ms")); }, timeoutMs);
              })
            ]);
          }
          return result;
        } catch (err) {
          throw new Error("Invalid evaluate function: " + (err && err.message ? err.message : String(err)));
        }
      `,
    ) as (args: { fnBody: string; timeoutMs: number }) => unknown;
    const evalPromise = page.evaluate(browserEvaluator, {
      fnBody: fnText,
      timeoutMs: evaluateTimeout,
    });
    if (!abortPromise) {
      return await evalPromise;
    }
    try {
      return await Promise.race([evalPromise, abortPromise]);
    } catch (err) {
      void evalPromise.catch(() => {});
      throw err;
    }
  } finally {
    if (signal && abortListener) {
      signal.removeEventListener("abort", abortListener);
    }
  }
}

export async function scrollIntoViewViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  ref?: string;
  role?: string;
  name?: string;
  nth?: number;
  timeoutMs?: number;
}): Promise<void> {
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  restoreRoleRefsForTarget({
    cdpUrl: opts.cdpUrl,
    targetId: opts.targetId,
    page,
  });
  const timeout = normalizeTimeoutMs(opts.timeoutMs, 20_000);

  const refOpts = requireRefOrRole(opts);
  const locator = await refLocator(page, refOpts);
  try {
    await locator.scrollIntoViewIfNeeded({ timeout });
  } catch (err) {
    throw toAIFriendlyError(err, formatRefForError(refOpts));
  }
}

export async function waitForViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  timeMs?: number;
  text?: string;
  textGone?: string;
  selector?: string;
  url?: string;
  loadState?: "load" | "domcontentloaded" | "networkidle";
  fn?: string;
  timeoutMs?: number;
}): Promise<void> {
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  const timeout = normalizeTimeoutMs(opts.timeoutMs, 20_000);

  if (typeof opts.timeMs === "number" && Number.isFinite(opts.timeMs)) {
    await page.waitForTimeout(Math.max(0, opts.timeMs));
  }
  if (opts.text) {
    await page.getByText(opts.text).first().waitFor({
      state: "visible",
      timeout,
    });
  }
  if (opts.textGone) {
    await page.getByText(opts.textGone).first().waitFor({
      state: "hidden",
      timeout,
    });
  }
  if (opts.selector) {
    const selector = String(opts.selector).trim();
    if (selector) {
      await page
        .locator(selector)
        .first()
        .waitFor({ state: "visible", timeout });
    }
  }
  if (opts.url) {
    const url = String(opts.url).trim();
    if (url) {
      await page.waitForURL(url, { timeout });
    }
  }
  if (opts.loadState) {
    await page.waitForLoadState(opts.loadState, { timeout });
  }
  if (opts.fn) {
    const fn = String(opts.fn).trim();
    if (fn) {
      await page.waitForFunction(fn, { timeout });
    }
  }
}

export async function takeScreenshotViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  ref?: string;
  role?: string;
  name?: string;
  nth?: number;
  element?: string;
  fullPage?: boolean;
  type?: "png" | "jpeg";
}): Promise<{ buffer: Buffer }> {
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  restoreRoleRefsForTarget({
    cdpUrl: opts.cdpUrl,
    targetId: opts.targetId,
    page,
  });
  const type = opts.type ?? "png";
  if (opts.ref) {
    if (opts.fullPage) {
      throw new Error("fullPage is not supported for element screenshots");
    }
    const locator = await refLocator(page, opts.ref);
    const buffer = await locator.screenshot({ type });
    return { buffer };
  }
  if (opts.element) {
    if (opts.fullPage) {
      throw new Error("fullPage is not supported for element screenshots");
    }
    const locator = page.locator(opts.element).first();
    const buffer = await locator.screenshot({ type });
    return { buffer };
  }
  const buffer = await page.screenshot({
    type,
    fullPage: Boolean(opts.fullPage),
  });
  return { buffer };
}

export async function screenshotWithLabelsViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  refs: Record<string, { role: string; name?: string; nth?: number }>;
  maxLabels?: number;
  type?: "png" | "jpeg";
}): Promise<{ buffer: Buffer; labels: number; skipped: number }> {
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  restoreRoleRefsForTarget({
    cdpUrl: opts.cdpUrl,
    targetId: opts.targetId,
    page,
  });
  const type = opts.type ?? "png";
  const maxLabels =
    typeof opts.maxLabels === "number" && Number.isFinite(opts.maxLabels)
      ? Math.max(1, Math.floor(opts.maxLabels))
      : 150;

  const viewport = await page.evaluate(() => ({
    scrollX: window.scrollX || 0,
    scrollY: window.scrollY || 0,
    width: window.innerWidth || 0,
    height: window.innerHeight || 0,
  }));

  const refs = Object.keys(opts.refs ?? {});
  const boxes: Array<{
    ref: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }> = [];
  let skipped = 0;

  for (const ref of refs) {
    if (boxes.length >= maxLabels) {
      skipped += 1;
      continue;
    }
    try {
      const box = await (await refLocator(page, ref)).boundingBox();
      if (!box) {
        skipped += 1;
        continue;
      }
      const x0 = box.x;
      const y0 = box.y;
      const x1 = box.x + box.width;
      const y1 = box.y + box.height;
      const vx0 = viewport.scrollX;
      const vy0 = viewport.scrollY;
      const vx1 = viewport.scrollX + viewport.width;
      const vy1 = viewport.scrollY + viewport.height;
      if (x1 < vx0 || x0 > vx1 || y1 < vy0 || y0 > vy1) {
        skipped += 1;
        continue;
      }
      boxes.push({
        ref,
        x: x0 - viewport.scrollX,
        y: y0 - viewport.scrollY,
        w: Math.max(1, box.width),
        h: Math.max(1, box.height),
      });
    } catch {
      skipped += 1;
    }
  }

  try {
    if (boxes.length > 0) {
      await page.evaluate((labels) => {
        const existing = document.querySelectorAll("[data-openclaw-labels]");
        existing.forEach((el) => el.remove());

        const root = document.createElement("div");
        root.setAttribute("data-openclaw-labels", "1");
        root.style.position = "fixed";
        root.style.left = "0";
        root.style.top = "0";
        root.style.zIndex = "2147483647";
        root.style.pointerEvents = "none";
        root.style.fontFamily =
          '"SF Mono","SFMono-Regular",Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace';

        const clamp = (value: number, min: number, max: number) =>
          Math.min(max, Math.max(min, value));

        for (const label of labels) {
          const box = document.createElement("div");
          box.setAttribute("data-openclaw-labels", "1");
          box.style.position = "absolute";
          box.style.left = `${label.x}px`;
          box.style.top = `${label.y}px`;
          box.style.width = `${label.w}px`;
          box.style.height = `${label.h}px`;
          box.style.border = "2px solid #ffb020";
          box.style.boxSizing = "border-box";

          const tag = document.createElement("div");
          tag.setAttribute("data-openclaw-labels", "1");
          tag.textContent = label.ref;
          tag.style.position = "absolute";
          tag.style.left = `${label.x}px`;
          tag.style.top = `${clamp(label.y - 18, 0, 20000)}px`;
          tag.style.background = "#ffb020";
          tag.style.color = "#1a1a1a";
          tag.style.fontSize = "12px";
          tag.style.lineHeight = "14px";
          tag.style.padding = "1px 4px";
          tag.style.borderRadius = "3px";
          tag.style.boxShadow = "0 1px 2px rgba(0,0,0,0.35)";
          tag.style.whiteSpace = "nowrap";

          root.appendChild(box);
          root.appendChild(tag);
        }

        document.documentElement.appendChild(root);
      }, boxes);
    }

    const buffer = await page.screenshot({ type });
    return { buffer, labels: boxes.length, skipped };
  } finally {
    await page
      .evaluate(() => {
        const existing = document.querySelectorAll("[data-openclaw-labels]");
        existing.forEach((el) => el.remove());
      })
      .catch(() => {});
  }
}

export async function setInputFilesViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  inputRef?: string;
  element?: string;
  paths: string[];
}): Promise<void> {
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  restoreRoleRefsForTarget({
    cdpUrl: opts.cdpUrl,
    targetId: opts.targetId,
    page,
  });
  if (!opts.paths.length) {
    throw new Error("paths are required");
  }
  const inputRef =
    typeof opts.inputRef === "string" ? opts.inputRef.trim() : "";
  const element = typeof opts.element === "string" ? opts.element.trim() : "";
  if (inputRef && element) {
    throw new Error("inputRef and element are mutually exclusive");
  }
  if (!inputRef && !element) {
    throw new Error("inputRef or element is required");
  }

  const locator = inputRef
    ? await refLocator(page, inputRef)
    : page.locator(element).first();

  try {
    await locator.setInputFiles(opts.paths);
  } catch (err) {
    throw toAIFriendlyError(err, inputRef || element);
  }
  try {
    const handle = await locator.elementHandle();
    if (handle) {
      await handle.evaluate((el) => {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
  } catch {
    // Best-effort for sites that don't react to setInputFiles alone.
  }
}

import { type AgentHistoryMessage } from "./types";
import { BrowserManager } from "../browser";
import { type Checklist } from "../actions";
import { type TokenBreakdown } from "../error_logger";
import * as fs from "fs/promises";
import * as path from "path";
import { ZodError } from "zod";
import { fromError } from "zod-validation-error";

export function mapRefsToIdentifiers(obj: any, refs: Record<string, any>) {
  if (!obj) return;
  const map = (target: any) => {
    if (target && target.ref && refs[target.ref]) {
      const refData = refs[target.ref];
      target.role = refData.role;
      if (refData.name) target.name = refData.name;
      if (refData.nth !== undefined) target.nth = refData.nth;
      if (target.kind === "screenshot") {
        target.elementName = target.name;
        delete target.name;
      }
      delete target.ref;
    }
  };
  map(obj);
  if (obj.kind === "drag") {
    if (obj.startRef) {
      const startRefData = refs[obj.startRef];
      if (startRefData) {
        obj.startRole = startRefData.role;
        if (startRefData.name) obj.startName = startRefData.name;
        if (startRefData.nth !== undefined) obj.startNth = startRefData.nth;
      }
      delete obj.startRef;
    }
    if (obj.endRef) {
      const endRefData = refs[obj.endRef];
      if (endRefData) {
        obj.endRole = endRefData.role;
        if (endRefData.name) obj.endName = endRefData.name;
        if (endRefData.nth !== undefined) obj.endNth = endRefData.nth;
      }
      delete obj.endRef;
    }
  }
  if (obj.kind === "fill" && Array.isArray(obj.fields)) {
    for (const field of obj.fields) map(field);
  }
  if (Array.isArray(obj.assertions)) {
    for (const assertion of obj.assertions) map(assertion);
  }
}

export async function saveStepArtifacts(
  dir: string,
  step: number,
  snapshot: string,
  axTree: any,
  refs: any,
  browser: BrowserManager,
  history: any[],
  checklist: Checklist,
) {
  await fs.writeFile(path.join(dir, `step-${step}-snapshot.txt`), snapshot);
  if (axTree)
    await fs.writeFile(
      path.join(dir, `step-${step}-axtree.json`),
      JSON.stringify(axTree, null, 2),
    );
  await fs.writeFile(
    path.join(dir, `step-${step}-refs.json`),
    JSON.stringify(refs, null, 2),
  );
  await fs.writeFile(
    path.join(dir, `step-${step}-checklist.json`),
    JSON.stringify(checklist, null, 2),
  );
  await fs.writeFile(
    path.join(dir, `step-${step}-history.json`),
    JSON.stringify(history, null, 2),
  );
  if (browser.page)
    await browser.page.screenshot({
      path: path.join(dir, `step-${step}-screenshot.png`),
    });
}

/**
 * Estimates the number of tokens in a text string.
 * Based on the standard baseline of ~4 characters per token.
 */
export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimates the number of tokens for an image (screenshot).
 * For vision models, standard high-resolution browser screenshots usually cost around 1000-1600 tokens.
 * We use 1100 tokens as a robust default estimate (matching GPT-4V high-detail tile cost).
 */
export function estimateImageTokens(image: any): number {
  return 1100;
}

/**
 * Calculates the estimated token size breakdown for an LLM invocation.
 */
export function getTokenBreakdown(params: {
  systemPrompt: string;
  history: AgentHistoryMessage[];
  latestUserText: string;
  screenshot?: Buffer | string;
  supportsVision?: boolean;
}): TokenBreakdown {
  const systemPromptTokens = estimateTextTokens(params.systemPrompt);

  const historyTokens = params.history.reduce((sum: number, msg) => {
    if (typeof msg.content === "string") {
      return sum + estimateTextTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      return sum + msg.content.reduce((innerSum: number, part: any) => {
        if (part.type === "text") {
          return innerSum + estimateTextTokens(part.text);
        } else if (part.type === "image") {
          return innerSum + estimateImageTokens(part.image);
        }
        return innerSum;
      }, 0);
    }
    return sum;
  }, 0);

  const latestUserTextTokens = estimateTextTokens(params.latestUserText);
  const imageTokens = (params.screenshot && params.supportsVision) ? estimateImageTokens(params.screenshot) : 0;
  const totalTokens = systemPromptTokens + historyTokens + latestUserTextTokens + imageTokens;

  return {
    systemPromptTokens,
    historyTokens,
    latestUserTextTokens,
    imageTokens,
    totalTokens,
  };
}

export function extractSchemaErrors(e: any): string | null {
  if (!e) return null;

  // Helper to find a ZodError or issues array in the error structure
  const findZodErrorOrIssues = (err: any): ZodError | any[] | null => {
    if (err instanceof ZodError || (err && typeof err === "object" && err.constructor?.name === "ZodError")) {
      return err;
    }
    if (err && typeof err === "object") {
      if (Array.isArray(err.errors)) return err.errors;
      if (Array.isArray(err.issues)) return err.issues;
      if (err.cause) {
        const nested = findZodErrorOrIssues(err.cause);
        if (nested) return nested;
      }
    }
    return null;
  };

  const resolved = findZodErrorOrIssues(e);
  if (!resolved) {
    return null;
  }

  try {
    let zodError: ZodError;
    if (Array.isArray(resolved)) {
      zodError = new ZodError(resolved);
    } else {
      zodError = resolved;
    }

    return fromError(zodError, {
      prefix: "The JSON structure you generated failed validation with the following errors:",
      issueSeparator: "; ",
      unionSeparator: " OR ",
    }).toString();
  } catch (err) {
    console.error("Error formatting Zod error:", err);
    return null;
  }
}

import { type AgentHistoryMessage } from "./types";
import { BrowserManager } from "../browser";
import { type Checklist } from "../actions";
import { type TokenBreakdown } from "../error_logger";
import * as fs from "fs/promises";
import * as path from "path";
import { ZodError, z } from "zod";
import { fromError } from "zod-validation-error";
import { generateObject, type LanguageModel } from "ai";
import { getProviderOptions } from "../utils";

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
      prefix: "Please regenerate the JSON and fix the following errors:",
      issueSeparator: "\n",
      unionSeparator: " OR ",
    }).toString();
  } catch (err) {
    console.error("Error formatting Zod error:", err);
    return null;
  }
}

export async function reformatJsonWithAgent<T>(params: {
  model: LanguageModel;
  schema: z.ZodSchema<T>;
  rawResponse: string;
  errors: string;
}): Promise<T> {
  console.log(`[Agent][Reformatter] Attempting to reformat invalid JSON with dedicated reformatter agent...`);

  try {
    const result = await generateObject({
      model: params.model,
      schema: params.schema,
      system: `You are a dedicated JSON repair/reformatting assistant. 
Your sole task is to take a raw text response that failed Zod validation and repair/reformat it to strictly conform to the expected JSON schema.
Ensure all missing fields are added (with default/reasonable values based on context if needed), invalid formats/types are corrected, and enum constraints are strictly met.
If you encounter an array, make sure all array elements are valid and has same type as schema.
Keep the original semantics, tasks, reasoning, and descriptions from the invalid JSON intact where possible.`,
      providerOptions: getProviderOptions(params.model),
      messages: [
        {
          role: "user",
          content: `The following raw output failed validation against the schema:
\`\`\`
${params.rawResponse}
\`\`\`

Validation errors encountered:
${params.errors}

Please correct the JSON completely so that it matches the schema exactly and passes all validation checks.`,
        },
      ],
    });

    return result.object;
  } catch (e: any) {
    console.warn(`[Agent][Reformatter] generateObject threw an error:`, e.message);
    const reformattedRaw = e.text || e.cause?.text || e.response?.text;
    if (reformattedRaw) {
      const extractedStr = extractJsonFromMarkdown(reformattedRaw);
      const parsedExtracted = extractedStr ? tryParseJson(extractedStr) : tryParseJson(reformattedRaw);
      if (parsedExtracted) {
        const validation = params.schema.safeParse(parsedExtracted);
        if (validation.success) {
          console.log(`[Agent][Reformatter] Successfully extracted and validated JSON from reformatter markdown response!`);
          return validation.data;
        } else {
          console.error(`[Agent][Reformatter] Validation failed on reformatted extracted JSON:`, validation.error.message);
        }
      }
    }
    throw e;
  }
}

function tryParseJson(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function extractJsonFromMarkdown(str: string): string | null {
  // 1. Try to extract from ```json ... ``` or ``` ... ``` code blocks
  const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
  const match = str.match(jsonBlockRegex);
  if (match && match[1]) {
    return match[1].trim();
  }

  // 2. Fallback: Find the first '{' and last '}' or first '[' and last ']' to extract JSON when explaining
  const firstBrace = str.indexOf("{");
  const lastBrace = str.lastIndexOf("}");
  const firstBracket = str.indexOf("[");
  const lastBracket = str.lastIndexOf("]");

  let startIndex = -1;
  let endIndex = -1;

  if (firstBrace !== -1 && lastBrace !== -1) {
    if (firstBracket !== -1 && lastBracket !== -1) {
      // Both exist, choose the outermost wrapper
      startIndex = Math.min(firstBrace, firstBracket);
      endIndex = Math.max(lastBrace, lastBracket);
    } else {
      startIndex = firstBrace;
      endIndex = lastBrace;
    }
  } else if (firstBracket !== -1 && lastBracket !== -1) {
    startIndex = firstBracket;
    endIndex = lastBracket;
  }

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    return str.substring(startIndex, endIndex + 1).trim();
  }

  return null;
}

export async function runWithSchemaRecovery<T>(params: {
  model: LanguageModel;
  schema: z.ZodSchema<T>;
  taskFn: () => Promise<T>;
  history: AgentHistoryMessage[];
  maxRetries?: number;
  label?: string;
  onMaxRetriesExceeded?: (error: any) => Promise<void> | void;
}): Promise<T> {
  const maxRetries = params.maxRetries ?? 3;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      return await params.taskFn();
    } catch (e: any) {
      retries++;
      let errorMessage = e.message;
      const details = extractSchemaErrors(e);
      if (details) {
        errorMessage = details;
      }

      const rawResponse = e.text || e.cause?.text || e.response?.text;
      let isParsedSuccess = false;
      let recoveredObj: T | null = null;
      let notJsonMessage = false;

      if (rawResponse) {
        // 1. Check if response is JSON
        const parsedDirect = tryParseJson(rawResponse);
        if (parsedDirect) {
          // 3. if is JSON, try to use reformat agent
          if (details) {
            try {
              recoveredObj = await reformatJsonWithAgent({
                model: params.model,
                schema: params.schema,
                rawResponse,
                errors: details,
              });
              isParsedSuccess = true;
            } catch (reformatErr: any) {
              console.error(`[Agent][${params.label ?? "Helper"}] Reformatter agent failed:`, reformatErr);
            }
          }
        } else {
          // 2. if is not JSON, try to parse from markdown code block eg ```json...
          const extractedStr = extractJsonFromMarkdown(rawResponse);
          const parsedExtracted = extractedStr ? tryParseJson(extractedStr) : null;

          if (parsedExtracted) {
            // 2.a if parsing succeeds, validate using the schema
            const validation = params.schema.safeParse(parsedExtracted);
            if (validation.success) {
              // 2.a.1 if validation succeeds, return the recovered json as a success
              console.log(`[Agent][${params.label ?? "Helper"}] Successfully extracted and validated JSON from markdown block!`);
              return validation.data;
            } else {
              // 2.a.2 if validation fails, try to use reformat agent (step 3)
              const localDetails = extractSchemaErrors(validation.error);
              console.log(`[Agent][${params.label ?? "Helper"}] Recovered JSON parse error details:`, localDetails);
              if (localDetails) {
                errorMessage = localDetails;
                try {
                  recoveredObj = await reformatJsonWithAgent({
                    model: params.model,
                    schema: params.schema,
                    rawResponse: extractedStr!,
                    errors: localDetails,
                  });
                  isParsedSuccess = true;
                } catch (reformatErr: any) {
                  console.error(`[Agent][${params.label ?? "Helper"}] Reformatter agent failed on extracted markdown JSON:`, reformatErr);
                }
              }
            }
          } else {
            // 2.b if parsing fails, add message to history for agent to return valid json
            notJsonMessage = true;
            errorMessage = "Your previous response was not a valid JSON. Please ensure your output is strictly a valid JSON object matching the schema, with no surrounding text or markdown formatting.";
          }
        }
      }

      if (isParsedSuccess && recoveredObj) {
        console.log(`[Agent][${params.label ?? "Helper"}] Successfully recovered invalid JSON using reformatter agent!`);
        return recoveredObj;
      }

      console.log(`[Agent][${params.label ?? "Helper"}] Raw response:`, rawResponse);

      params.history.push({
        role: "assistant",
        content: [
          {
            type: "text",
            text: rawResponse || JSON.stringify({ error: errorMessage }),
          },
        ],
      });
      params.history.push({
        role: "user",
        content: [
          {
            type: "text",
            text: notJsonMessage
              ? errorMessage
              : `Your previous response failed schema validation.\n\nERROR:\n${errorMessage}`,
          },
        ],
      });

      if (retries >= maxRetries) {
        if (params.onMaxRetriesExceeded) {
          await params.onMaxRetriesExceeded(e);
        }
        throw e;
      }
    }
  }

  throw new Error(`[Agent][${params.label ?? "Helper"}] Failed to execute task after ${maxRetries} attempts.`);
}



import { parseRoleRef } from "./pw-role-snapshot";

let nextUploadArmId = 0;
let nextDialogArmId = 0;
let nextDownloadArmId = 0;

export function bumpUploadArmId(): number {
  nextUploadArmId += 1;
  return nextUploadArmId;
}

export function bumpDialogArmId(): number {
  nextDialogArmId += 1;
  return nextDialogArmId;
}

export function bumpDownloadArmId(): number {
  nextDownloadArmId += 1;
  return nextDownloadArmId;
}

export function requireRefOrRole(opts: {
  ref?: string;
  role?: string;
  name?: string;
  nth?: number;
}): { ref?: string; role?: string; name?: string; nth?: number } {
  const rawRef = typeof opts.ref === "string" ? opts.ref.trim() : "";
  const roleRef = rawRef ? parseRoleRef(rawRef) : null;
  const ref = roleRef ?? (rawRef.startsWith("@") ? rawRef.slice(1) : rawRef);

  if (!ref && !opts.role) {
    throw new Error("ref or role is required");
  }

  return { ...opts, ref: ref || undefined };
}

export function formatRefForError(opts: {
  ref?: string;
  role?: string;
  name?: string;
  nth?: number;
}): string {
  if (opts.role) {
    let s = `role=${opts.role}`;
    if (opts.name) s += ` name="${opts.name}"`;
    if (opts.nth !== undefined) s += ` nth=${opts.nth}`;
    return s;
  }
  return opts.ref || "unknown";
}

export function normalizeTimeoutMs(
  timeoutMs: number | undefined,
  fallback: number,
) {
  return Math.max(500, Math.min(120_000, timeoutMs ?? fallback));
}

export function toAIFriendlyError(error: unknown, selector: string): Error {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("strict mode violation")) {
    const countMatch = message.match(/resolved to (\d+) elements/);
    const count = countMatch ? countMatch[1] : "multiple";
    return new Error(
      `Selector "${selector}" matched ${count} elements. ` +
        `Run a new snapshot to get updated refs, or use a different ref.`,
    );
  }

  if (
    (message.includes("Timeout") || message.includes("waiting for")) &&
    (message.includes("to be visible") || message.includes("not visible"))
  ) {
    return new Error(
      `Element "${selector}" not found or not visible. ` +
        `Run a new snapshot to see current page elements.`,
    );
  }

  if (
    message.includes("intercepts pointer events") ||
    message.includes("not visible") ||
    message.includes("not receive pointer events")
  ) {
    return new Error(
      `Element "${selector}" is not interactable (hidden or covered). ` +
        `Try scrolling it into view, closing overlays, or re-snapshotting.`,
    );
  }

  return error instanceof Error ? error : new Error(message);
}

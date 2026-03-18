import { z } from "zod";

// Define the schema mirroring OpenClaw's BrowserActRequest
export const ActionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("click"),
      ref: z
        .string()
        .describe("The 'ref' ID of the element to click (e.g., 'e12')"),
      doubleClick: z
        .boolean()
        .optional()
        .describe("Whether to double click instead of single click"),
      button: z
        .enum(["left", "right", "middle"])
        .optional()
        .describe("Which mouse button to press"),
      timeoutMs: z
        .number()
        .optional()
        .describe(
          "Provide maximum time to wait in ms before failing the action",
        ),
    })
    .describe(
      "Click on an element. Preferred action for elements that exist in the snapshot.",
    ),

  z
    .object({
      kind: z.literal("click_selector"),
      selector: z
        .string()
        .describe("A valid Playwright CSS or XPath selector to click on"),
      timeoutMs: z
        .number()
        .optional()
        .describe(
          "Provide maximum time to wait in ms before failing the action",
        ),
    })
    .describe(
      "Click on an element via a raw selector when a ref is not available.",
    ),

  z
    .object({
      kind: z.literal("type"),
      ref: z
        .string()
        .describe("The 'ref' ID of the input element to type into"),
      text: z
        .string()
        .optional()
        .describe("The exact text to type into the field"),
      value: z
        .string()
        .optional()
        .describe("The exact text to type into the field (alias for text)"),
      submit: z
        .boolean()
        .optional()
        .describe("Whether to press Enter/Submit after typing"),
      slowly: z
        .boolean()
        .optional()
        .describe(
          "Whether to type slowly with random delays, to simulate human typing",
        ),
      timeoutMs: z
        .number()
        .optional()
        .describe(
          "Provide maximum time to wait in ms before failing the action",
        ),
    })
    .describe("Type text into an input element and optionally submit."),

  z
    .object({
      kind: z.literal("press"),
      key: z
        .string()
        .describe(
          "The key code or combination to press (e.g. 'Enter', 'Escape', 'Control+A')",
        ),
      delayMs: z
        .number()
        .optional()
        .describe("Optional delay in ms to hold the key down for"),
    })
    .describe("Press a single key or key combination on the keyboard."),

  z
    .object({
      kind: z.literal("hover"),
      ref: z.string().describe("The 'ref' ID of the element to hover over"),
      timeoutMs: z
        .number()
        .optional()
        .describe(
          "Provide maximum time to wait in ms before failing the action",
        ),
    })
    .describe("Move the mouse cursor over an element."),

  z
    .object({
      kind: z.literal("scrollIntoView"),
      ref: z
        .string()
        .describe("The 'ref' ID of the element to scroll into the viewport"),
      timeoutMs: z
        .number()
        .optional()
        .describe(
          "Provide maximum time to wait in ms before failing the action",
        ),
    })
    .describe(
      "Scroll the page until the target element is visible in the viewport.",
    ),

  z
    .object({
      kind: z.literal("drag"),
      startRef: z
        .string()
        .describe("The 'ref' ID of the element to start dragging from"),
      endRef: z.string().describe("The 'ref' ID of the element to drop onto"),
      timeoutMs: z
        .number()
        .optional()
        .describe(
          "Provide maximum time to wait in ms before failing the action",
        ),
    })
    .describe(
      "Drag an element from one ref and drop it precisely onto another ref.",
    ),

  z
    .object({
      kind: z.literal("select"),
      ref: z.string().describe("The 'ref' ID of the <select> element"),
      values: z
        .array(z.string())
        .describe("The exact string values of the <option> elements to select"),
      timeoutMs: z
        .number()
        .optional()
        .describe(
          "Provide maximum time to wait in ms before failing the action",
        ),
    })
    .describe(
      "Select one or more options from a <select> dropdown by exact value.",
    ),

  z
    .object({
      kind: z.literal("fill"),
      fields: z
        .array(
          z.object({
            ref: z.string().describe("The 'ref' ID of the form field"),
            type: z
              .string()
              .describe("The type of the field, usually 'textbox' or similar"),
            value: z.union([z.string(), z.number(), z.boolean()]).optional(),
          }),
        )
        .describe("The fields and their exact values to fill out"),
      timeoutMs: z
        .number()
        .optional()
        .describe(
          "Provide maximum time to wait in ms before failing the action",
        ),
    })
    .describe(
      "Fill an entire form out all at once using multiple refs and values.",
    ),

  z
    .object({
      kind: z.literal("wait"),
      timeMs: z
        .number()
        .optional()
        .describe("Amount of time in ms to simply wait and do nothing"),
      text: z
        .string()
        .optional()
        .describe("Wait until exact text appears in the DOM"),
      textGone: z
        .string()
        .optional()
        .describe("Wait until exact text disappears from the DOM"),
      selector: z
        .string()
        .optional()
        .describe("Wait until a CSS selector exists in the DOM"),
      url: z
        .string()
        .optional()
        .describe("Wait until URL contains string or matches regex"),
      loadState: z
        .enum(["load", "domcontentloaded", "networkidle"])
        .optional()
        .describe("Wait for a specific page load state"),
      timeoutMs: z
        .number()
        .optional()
        .describe(
          "Provide maximum time to wait in ms before failing the wait condition",
        ),
    })
    .describe(
      "Wait for a specific condition to be met on the page (e.g. text appears, page loaded, or just a sleep duration).",
    ),

  z
    .object({
      kind: z.literal("evaluate"),
      fn: z
        .string()
        .describe(
          "A self-contained JavaScript function body as a string, must begin with e.g. '() => { ... }' or async function if awaiting",
        ),
      ref: z
        .string()
        .optional()
        .describe(
          "If provided, the element matching the ref is passed as the first argument to the evaluated function",
        ),
      timeoutMs: z
        .number()
        .optional()
        .describe(
          "Provide maximum time to wait in ms before failing the action",
        ),
    })
    .describe(
      "Execute custom JavaScript on the page within the browser execution context. Only use if absolutely necessary and alternative actions fail.",
    ),

  z
    .object({
      kind: z.literal("close"),
    })
    .describe(
      "Close the current page. The entire agent run may end immediately upon closing.",
    ),

  // These aren't in BrowserActRequest directly via action endpoints,
  // but they are required by our system/goal wrapper:
  z
    .object({
      kind: z.literal("navigate"),
      url: z
        .string()
        .describe(
          "The full URL to navigate the browser to (e.g. 'https://example.com')",
        ),
      timeoutMs: z
        .number()
        .optional()
        .describe(
          "Provide maximum time to wait in ms before failing the navigation action",
        ),
    })
    .describe(
      "Navigate the root page to a new URL. Provide the absolute URL including scheme.",
    ),

  z
    .object({
      kind: z.literal("screenshot"),
      name: z
        .string()
        .describe(
          "REQUIRED: A valid filename (no extension) describing what the screenshot captures. Example: 'email_icon_1' or 'success'. Do NOT omit this field.",
        ),
      ref: z
        .string()
        .optional()
        .describe(
          "If provided, takes a cropped screenshot of only the specific DOM element matching this ref (e.g., 'e12')",
        ),
      fullPage: z
        .boolean()
        .optional()
        .describe("Whether to take a full page scrolling screenshot"),
    })
    .describe(
      "Take a visual screenshot of the current page. Required to report SUCCESS when goal is complete!",
    ),
]);

// Extract the inferred type to use across the project
export type Action = z.infer<typeof ActionSchema>;

// Define the schema for evaluating intermediate steps during replay
export const AssertionSchema = z.object({
  ref: z
    .string()
    .describe("The 'ref' ID of the element to assert on, if applicable"),
  type: z
    .enum([
      "isVisible",
      "isHidden",
      "textContains",
      "textEquals",
      "hasClass",
      "hasAttribute",
    ])
    .describe("The type of assertion to evaluate"),
  value: z
    .string()
    .optional()
    .describe(
      "The expected value (required for textContains, textEquals, hasClass, hasAttribute)",
    ),
  attributeNode: z
    .string()
    .optional()
    .describe("The name of the attribute to check (required for hasAttribute)"),
});

export type Assertion = z.infer<typeof AssertionSchema>;

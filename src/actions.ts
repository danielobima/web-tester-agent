import { z } from "zod";

// Define the schema mirroring OpenClaw's BrowserActRequest
export const ActionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("click"),
      ref: z
        .string()
        .optional()
        .describe("The 'ref' ID of the element to click (e.g., 'e12')"),
      role: z
        .string()
        .optional()
        .describe("The ARIA role of the element to click"),
      name: z
        .string()
        .optional()
        .describe("The accessible name of the element to click"),
      nth: z.number().optional().describe("The index if multiple match"),
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
      kind: z.literal("select_option"),
      ref: z
        .string()
        .optional()
        .describe("The 'ref' ID of the element to select from"),
      role: z.string().optional().describe("The ARIA role of the element"),
      name: z
        .string()
        .optional()
        .describe("The accessible name of the element"),
      nth: z.number().optional().describe("The index if multiple match"),
      selector: z
        .string()
        .optional()
        .describe(
          "A valid Playwright CSS or XPath selector of the select/combobox/radio button group (only use if ref is not available)",
        ),
      value: z.string().describe("The value or label of the option to select"),
      timeoutMs: z
        .number()
        .optional()
        .describe(
          "Provide maximum time to wait in ms before failing the action",
        ),
    })
    .describe(
      "Select an option from a dropdown/select/combobox/radio button group using a ref, role, name, or raw selector.",
    ),

  z
    .object({
      kind: z.literal("type"),
      ref: z
        .string()
        .optional()
        .describe("The 'ref' ID of the input element to type into"),
      role: z
        .string()
        .optional()
        .describe("The ARIA role of the input element"),
      name: z
        .string()
        .optional()
        .describe("The accessible name of the input element"),
      nth: z.number().optional().describe("The index if multiple match"),
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
      ref: z
        .string()
        .optional()
        .describe("The 'ref' ID of the element to hover over"),
      role: z
        .string()
        .optional()
        .describe("The ARIA role of the element to hover over"),
      name: z
        .string()
        .optional()
        .describe("The accessible name of the element to hover over"),
      nth: z.number().optional().describe("The index if multiple match"),
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
        .optional()
        .describe("The 'ref' ID of the element to scroll into the viewport"),
      role: z
        .string()
        .optional()
        .describe("The ARIA role of the element to scroll"),
      name: z
        .string()
        .optional()
        .describe("The accessible name of the element to scroll"),
      nth: z.number().optional().describe("The index if multiple match"),
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
        .optional()
        .describe("The 'ref' ID of the element to start dragging from"),
      startRole: z
        .string()
        .optional()
        .describe("The ARIA role of the element to start dragging from"),
      startName: z
        .string()
        .optional()
        .describe("The accessible name of the element to start dragging from"),
      startNth: z.number().optional().describe("The index if multiple match"),
      endRef: z
        .string()
        .optional()
        .describe("The 'ref' ID of the element to drop onto"),
      endRole: z
        .string()
        .optional()
        .describe("The ARIA role of the element to drop onto"),
      endName: z
        .string()
        .optional()
        .describe("The accessible name of the element to drop onto"),
      endNth: z.number().optional().describe("The index if multiple match"),
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
      ref: z
        .string()
        .optional()
        .describe("The 'ref' ID of the <select> element"),
      role: z
        .string()
        .optional()
        .describe("The ARIA role of the <select> element"),
      name: z
        .string()
        .optional()
        .describe("The accessible name of the <select> element"),
      nth: z.number().optional().describe("The index if multiple match"),
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
        .union([
          z.array(
            z.object({
              ref: z
                .string()
                .optional()
                .describe("The 'ref' ID of the form field"),
              role: z
                .string()
                .optional()
                .describe("The ARIA role of the form field"),
              name: z
                .string()
                .optional()
                .describe("The accessible name of the form field"),
              nth: z
                .number()
                .optional()
                .describe("The index if multiple match"),
              type: z
                .string()
                .optional()
                .describe("The type of the field, usually 'textbox' or similar"),
              value: z.union([z.string(), z.number(), z.boolean()]).optional(),
            }),
          ),
          z.array(z.string()).transform((arr) => {
            const fields = [];
            for (let i = 0; i < arr.length; i += 2) {
              fields.push({
                ref: arr[i],
                value: arr[i + 1],
                type: "textbox",
              });
            }
            return fields;
          }),
        ])
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
      role: z.string().optional(),
      name: z.string().optional(),
      nth: z.number().optional(),
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
      role: z.string().optional(),
      elementName: z.string().optional(),
      nth: z.number().optional(),
      fullPage: z
        .boolean()
        .optional()
        .describe("Whether to take a full page scrolling screenshot"),
    })
    .describe(
      "Take a visual screenshot of the current page. Required to report SUCCESS when goal is complete!",
    ),
  z
    .object({
      kind: z.literal("stop"),
    })
    .describe(
      "Indicates that the current task is already complete or no action is required. Use this to skip a task without taking any visual action.",
    ),
]);

// Extract the inferred type to use across the project
export type Action = z.infer<typeof ActionSchema>;

// Define the schema for evaluating intermediate steps during replay
export const AssertionSchema = z.object({
  ref: z
    .string()
    .optional()
    .describe("The 'ref' ID of the element to assert on, if applicable"),
  role: z.string().optional().describe("The ARIA role to assert on"),
  name: z.string().optional().describe("The accessible name to assert on"),
  nth: z.number().optional().describe("The index if multiple elements match"),
  type: z
    .enum([
      "isVisible",
      "isHidden",
      "textContains",
      "textEquals",
      "inputValueEquals",
      "valueEquals",
      "hasClass",
      "hasAttribute",
      "pageNavigated",
      "networkRequestCompleted",
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

// --- Multi-Agent Schemas ---

export const TaskSchema = z.object({
  id: z.string().describe("Unique identifier for the task"),
  description: z
    .string()
    .describe("A concise summary of what needs to be achieved in this task"),
  status: z
    .enum(["pending", "in_progress", "completed", "failed"])
    .describe("The current operational status of the task"),
  result: z
    .string()
    .optional()
    .describe("Summary of what was achieved or why it failed"),
});

export type Task = z.infer<typeof TaskSchema>;

export const ChecklistSchema = z.object({
  currentStateDescription: z
    .string()
    .describe("Current perception of the application state"),
  tasks: z
    .array(TaskSchema)
    .describe("The sequence of high-level tasks to achieve the goal"),
  nextTaskId: z
    .string()
    .optional()
    .describe("The ID of the task that should be prioritized next"),
  isGoalAchieved: z
    .boolean()
    .describe(
      "Termination flag indicating if the overall user goal is fulfilled",
    ),
  screenshot: z
    .string()
    .optional()
    .describe("Base64 encoded screenshot of the final state"),
});

export type Checklist = z.infer<typeof ChecklistSchema>;

export const ExecutionResponseSchema = z.object({
  currentStateDescription: z
    .string()
    .describe("Detailed observation of the current page elements and state"),
  intendedActionDescription: z
    .string()
    .describe("Plain-text rationale for the selected action"),
  previousActionResult: z
    .string()
    .optional()
    .describe("Outcome of the previous execution step"),
  action: ActionSchema,
  isTaskComplete: z
    .boolean()
    .describe("Whether this specific high-level task is now finished"),
  taskResult: z
    .string()
    .optional()
    .describe(
      "A summary of what was accomplished during this task, if complete",
    ),
  observedIssues: z
    .array(z.string())
    .optional()
    .describe(
      "List of technical bugs or anomalies (e.g. 'ISSUE-1' to reference an existing one, or a string description for a new one).",
    ),
  usabilityFeedback: z
    .array(z.string())
    .optional()
    .describe(
      "List of usability observations (e.g. 'USABILITY-1' to reference an existing one, or a string description for a new one).",
    ),
});

export type ExecutionResponse = z.infer<typeof ExecutionResponseSchema>;

export const AssertionAgentResponseSchema = z.object({
  currentStateDescription: z
    .string()
    .describe("Comparison of the page state before and after the task"),
  assertions: z
    .array(AssertionSchema)
    .describe("The set of assertions generated to verify the task completion"),
  isTaskVerified: z
    .boolean()
    .describe("Whether the task is considered successfully verified"),
  verificationReasoning: z
    .string()
    .describe("Rationale for why the task is or isn't verified"),
  observedIssues: z
    .array(z.string())
    .optional()
    .describe(
      "List of technical bugs or anomalies discovered during verification.",
    ),
  usabilityFeedback: z
    .array(z.string())
    .optional()
    .describe(
      "List of usability observations discovered during verification.",
    ),
});

export type AssertionAgentResponse = z.infer<
  typeof AssertionAgentResponseSchema
>;

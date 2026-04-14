import * as fs from "fs/promises";
import * as path from "path";
import { SerializedTest, TestStep } from "./recorder";
import { Action } from "./actions";

export async function generateMarkdownReport(test: SerializedTest, reportDir: string, reportFileName: string) {
  let md = `# Test Suite Report: ${test.name}\n\n`;
  md += `**Date:** ${new Date().toLocaleString()}\n`;
  md += `**Start URL:** [${test.startUrl}](${test.startUrl})\n`;
  md += `**Steps Count:** ${test.steps.length}\n\n`;

  if (test.checklist) {
    md += `## Goal Verification Checklist\n\n`;
    md += `**Status:** ${test.checklist.isGoalAchieved ? "✅ Goal Achieved" : "❌ Goal Not Fully Achieved"}\n\n`;
    md += `### Tasks\n`;
    for (const task of test.checklist.tasks) {
      const statusIcon = task.status === "completed" ? "✅" : task.status === "failed" ? "❌" : "⏳";
      md += `- ${statusIcon} **${task.id}:** ${task.description}\n`;
      if (task.result) {
        md += `  - *Result:* ${task.result}\n`;
      }
    }
    md += `\n`;
  }

  md += `## Execution Sequence\n\n`;

  for (let i = 0; i < test.steps.length; i++) {
    const step = test.steps[i];
    md += `### Step ${i + 1}: ${step.actionIntent || step.action.kind}\n\n`;
    
    if (step.stateDescription) {
      md += `**Observation:** ${step.stateDescription}\n\n`;
    }

    md += `**Action:** \`${formatAction(step.action)}\`\n\n`;

    if (step.actionResult) {
      md += `**Outcome:** ${step.actionResult}\n\n`;
    }

    if (step.stateSnapshot) {
      // Step.stateSnapshot is "media:///full/path/to/step-N.jpg"
      // We want to link to it relatively in the report.
      // Since the serializer moves them to suite-name.screenshots/
      const screenshotsDirName = `${reportFileName.replace(".report.md", "")}.screenshots`;
      const fileName = path.basename(step.stateSnapshot.replace("media://", ""));
      md += `![Step ${i + 1} Screenshot](./${screenshotsDirName}/${fileName})\n\n`;
    }

    if (step.verificationAssertions && step.verificationAssertions.length > 0) {
      md += `#### Verifications\n`;
      for (const assertion of step.verificationAssertions) {
        md += `- ${assertion.type}${assertion.name ? ` on '${assertion.name}'` : ''}${assertion.value ? ` (expected: ${assertion.value})` : ''}\n`;
      }
      md += `\n`;
    }

    md += `---\n\n`;
  }

  const reportPath = path.join(reportDir, reportFileName);
  await fs.writeFile(reportPath, md, "utf-8");
  console.log(`[Reporter] Markdown report generated at: ${reportPath}`);
}

function formatAction(action: Action): string {
  switch (action.kind) {
    case "click":
      return `Click on ${action.name || action.role || action.ref || 'element'}`;
    case "type":
      return `Type "${action.text || action.value}" into ${action.name || action.role || action.ref || 'field'}`;
    case "navigate":
      return `Navigate to ${action.url}`;
    case "screenshot":
      return `Take screenshot: ${action.name}`;
    case "press":
      return `Press key: ${action.key}`;
    case "hover":
      return `Hover over ${action.name || action.role || action.ref || 'element'}`;
    case "scrollIntoView":
      return `Scroll to ${action.name || action.role || action.ref || 'element'}`;
    case "wait":
      return `Wait for ${action.timeMs ? action.timeMs + 'ms' : action.text || action.selector || 'condition'}`;
    case "select_option":
      return `Select option "${action.value}" from ${action.name || action.role || action.ref || 'dropdown'}`;
    case "drag":
      return `Drag from ${action.startName || action.startRef} to ${action.endName || action.endRef}`;
    case "evaluate":
      return `Evaluate custom JS`;
    case "close":
      return `Close page`;
    case "stop":
      return `Stop execution`;
    default:
      return (action as any).kind;
  }
}

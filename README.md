# Web Testing Agent 🤖🌐

**Web Testing Agent** is an autonomous web agent designed to streamline and automate end-to-end QA testing. By leveraging state-of-the-art Large Language Models (LLMs), the bot can navigate complex web applications, identify bugs, and verify user journeys based on high-level natural language goals.

---

## 🌟 Key Features

- **Autonomous Reasoning**: Specify a goal (e.g., "Purchase a product and verify the order confirmation"), and the agent will plan and execute the necessary steps.
- **Self-Healing Interaction**: Unlike traditional brittle selectors, the agent uses LLM-powered perception to identify elements, making it resilient to minor UI changes.
- **Human-in-the-Loop (HITL)**: Take control when needed. Approve AI-generated plans, modify them on the fly, or provide feedback during the execution stream.
- **Rich Reporting**: Automatically generates detailed Markdown reports for every test run, including:
  - Strategic reasoning for every action.
  - Screenshots of every step.
  - Console logs and network error tracking.
  - Usability findings and identified defects.
- **Record & Replay**: Record a session with the AI agent and replay it later to ensure no regressions.
- **Multi-Model Support**: Seamlessly switch between **Google Gemini**, **OpenAI**, **Claude**, and local models via **Ollama**.
- **Modern GUI & CLI**: Use the Electron-based Desktop interface for interactive debugging or the CLI for automated pipelines.

---

## 🛠️ Technical Stack

- **Core**: TypeScript, Node.js
- **Agent Orchestration**: AI SDK (Google, OpenAI, Anthropic), Playwright
- **Frontend**: React, Vite, Tailwind CSS
- **App Wrapper**: Electron
- **Validation**: Zod (Structured Outputs)

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- API Keys for your preferred LLM provider (e.g., Google AI Studio, OpenAI)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/danielobima/web-tester-agent.git
   cd web-tester-agent
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure environment variables:
   Create a `.env` file in the `web-tester-agent` directory:
   ```env
   GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key
   OPENAI_API_KEY=your_openai_api_key
   ```

---

## 📖 Usage

### Using the GUI (Recommended for Recording)

Launch the interactive Electron application to record new tests or monitor execution:

```bash
npm run dev
```

### Using the CLI

#### Record a New Test

```bash
npm run dev -- record "<Goal>" "<StartUrl>" "<OutputFile.json>"
```

_Example:_

```bash
npm run dev -- record "Purchase any product from the store" "https://example-shop.com" purchase_test.json --interactive
```

#### Replay an Existing Test

```bash
npm run dev -- replay "test-results/purchase_test.json"
```

---

## 📂 Project Structure

- `src/agent.ts`: The core "brain" of the bot, handling reasoning and planning.
- `src/browser.ts`: Playwright integration for browser control and snapshotting.
- `src/actions.ts`: Definitions of tasks, assertions, and structured AI response schemas.
- `src/gui/`: React-based interactive dashboard.
- `src/recorder.ts`: Logic for serializing test steps and generating reports.

---

## 🧪 Future Roadmap

- [ ] Headless mode for CI/CD integration.
- [ ] Exploratory testing mode (find bugs without a specific goal).
- [ ] Visual regression testing.
- [ ] Device emulation support.

---

## 📄 License

This project is licensed under the ISC License.

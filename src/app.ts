import { app, BrowserWindow, ipcMain, protocol, net } from "electron";
import { pathToFileURL } from "node:url";
import * as path from "path";
import { BrowserManager } from "./browser";
import { runAgent } from "./agent";
import { replayTest } from "./replay";
import { TestSerializer } from "./recorder";
import { google } from "@ai-sdk/google";
import * as dotenv from "dotenv";
import * as fs from "fs/promises";
import { generateMarkdownReport } from "./reporter";

dotenv.config();

protocol.registerSchemesAsPrivileged([
  { scheme: "media", privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, stream: true } }
]);

const suitesDir = path.join(app.getPath("userData"), "suites");

let mainWindow: BrowserWindow | null = null;
let activeTestController: AbortController | null = null;
let planApprovalPromise: { resolve: (val: any) => void; reject: (err: any) => void } | null = null;
let goalValidationPromise: { resolve: (val: any) => void; reject: (err: any) => void } | null = null;
let pausePromise: { resolve: (val: any) => void; reject: (err: any) => void } | null = null;
let isPaused = false;

const model = google("gemini-3.1-flash-lite-preview");

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const isDev = !app.isPackaged;
  const devUrl = "http://localhost:5173";

  if (isDev) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../src/gui/dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}


app.whenReady().then(async () => {
  
  // Register media protocol to serve local images securely
  protocol.handle("media", async (request) => {
    try {
      let filePath = decodeURIComponent(request.url.replace("media://", ""));
      
      // Normalization: Ensure the path is absolute (critical for Linux)
      if (!filePath.startsWith("/")) {
        filePath = "/" + filePath;
      }
      
      // Security: Only allow paths within userData
      const userDataPath = app.getPath("userData");
      if (!filePath.startsWith(userDataPath)) {
        console.warn(`[Protocol] Forbidden access attempt: ${filePath}`);
        return new Response("Forbidden Access", { status: 403 });
      }

      // Diagnostic: Check if file exists before trying to fetch
      try {
        await fs.access(filePath);
      } catch (err) {
        console.warn(`[Protocol] File NOT FOUND: ${filePath}`);
        return new Response("File Not Found", { status: 404 });
      }

      console.log(`[Protocol] Loading file: ${filePath}`);
      return net.fetch(pathToFileURL(filePath).toString());
    } catch (error) {
      console.error(`[Protocol] Error handling media request:`, error);
      return new Response("Internal Server Error", { status: 500 });
    }
  });

  createWindow();

  ipcMain.on("start-test", async (event, { url, prompt }) => {
    const browser = new BrowserManager();
    const testStartTime = Date.now();
    const serializer = new TestSerializer();
    const lastRunPath = path.join(app.getPath("userData"), "last-run.json");
    
    const suiteName = prompt.slice(0, 30).replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const timestamp = Date.now();
    const suitePath = path.join(suitesDir, `suite-${suiteName}-${timestamp}.json`);
    const sessionScreenshotsDir = path.join(suitesDir, `suite-${suiteName}-${timestamp}.screenshots`);
    await fs.mkdir(sessionScreenshotsDir, { recursive: true });
    
    serializer.startTest(prompt, url);
    serializer.setOutPath(suitePath);

    activeTestController = new AbortController();
    try {
      await browser.init(false);
      await browser.execute({ kind: "navigate", url });

      await runAgent(
        prompt,
        browser,
        model as any,
        serializer,
        undefined,
        false,
        false,
        (update) => {
          if (mainWindow) mainWindow.webContents.send("test-step", update);
        },
        (checklist) => {
          if (mainWindow) mainWindow.webContents.send("test-checklist", checklist);
        },
        async (checklist) => {
          if (!mainWindow) return { action: 'accept' };
          return new Promise((resolve, reject) => {
            planApprovalPromise = { resolve, reject };
            mainWindow?.webContents.send("plan-approval-request", checklist);
          });
        },
        async (checklist) => {
          if (!mainWindow) return { action: 'validate' };
          return new Promise((resolve, reject) => {
            goalValidationPromise = { resolve, reject };
            mainWindow?.webContents.send("goal-reached", checklist);
          });
        },
        (isPlanning: boolean) => {
          if (mainWindow) mainWindow.webContents.send("test-planning-state", isPlanning);
        },
        async (checklist) => {
          if (!isPaused) return { action: 'resume' };
          return new Promise((resolve, reject) => {
            pausePromise = { resolve, reject };
            mainWindow?.webContents.send("pause-request", checklist);
          });
        },
        sessionScreenshotsDir,
        activeTestController?.signal,
      );

      if (mainWindow) {
        const totalDuration = `${((Date.now() - testStartTime) / 1000).toFixed(1)}s`;
        await serializer.saveTest(lastRunPath);
        
        // Generate markdown report
        const testData = serializer.getTest();
        if (testData) {
          const reportFileName = path.basename(suitePath).replace(".json", ".report.md");
          await generateMarkdownReport(testData, suitesDir, reportFileName);
        }

        mainWindow.webContents.send("test-complete", { success: true, duration: totalDuration, suitePath });
      }
    } catch (error: any) {
      console.error("Test execution failed:", error);
      if (mainWindow) {
        mainWindow.webContents.send("test-step", {
          id: "error",
          step: "Execution Error",
          status: "failed",
          duration: "0s",
          description: error.message,
          error: error.stack,
        });
        const totalDuration = `${((Date.now() - testStartTime) / 1000).toFixed(1)}s`;
        mainWindow.webContents.send("test-complete", { success: false, error: error.message, duration: totalDuration });
      }
    } finally {
      await browser.close();
      activeTestController = null;
    }
  });

  ipcMain.on("stop-test", () => {
    if (activeTestController) activeTestController.abort();
    isPaused = false;
    if (planApprovalPromise) {
      planApprovalPromise.resolve({ action: 'reject' });
      planApprovalPromise = null;
    }
    if (goalValidationPromise) {
      goalValidationPromise.resolve({ action: 'cancel' });
      goalValidationPromise = null;
    }
    if (pausePromise) {
      pausePromise.resolve({ action: 'resume' });
      pausePromise = null;
    }
  });

  ipcMain.on("pause-test", () => {
    isPaused = true;
  });

  ipcMain.on("resume-test", (event, result) => {
    isPaused = false;
    if (pausePromise) {
      pausePromise.resolve(result);
      pausePromise = null;
    }
  });

  ipcMain.on("goal-validation-response", (event, result) => {
    if (goalValidationPromise) {
      goalValidationPromise.resolve(result);
      goalValidationPromise = null;
    }
  });

  ipcMain.on("approve-plan", (event, result) => {
    if (planApprovalPromise) {
      planApprovalPromise.resolve(result);
      planApprovalPromise = null;
    }
  });

  ipcMain.on("replay-test", async (event, { suitePath } = {}) => {
    const browser = new BrowserManager();
    const testStartTime = Date.now();
    const targetPath = suitePath || path.join(app.getPath("userData"), "last-run.json");
    activeTestController = new AbortController();
    try {
      await browser.init(false);
      await replayTest(targetPath, browser, model as any, undefined, false, false, (update) => {
        if (mainWindow) mainWindow.webContents.send("test-step", update);
      }, (checklist) => {
        if (mainWindow) mainWindow.webContents.send("test-checklist", checklist);
      }, (isPlanning: boolean) => {
        if (mainWindow) mainWindow.webContents.send("test-planning-state", isPlanning);
      }, activeTestController.signal);
      if (mainWindow) {
        const totalDuration = `${((Date.now() - testStartTime) / 1000).toFixed(1)}s`;
        mainWindow.webContents.send("test-complete", { success: true, duration: totalDuration });
      }
    } catch (error: any) {
      if (mainWindow) {
        const totalDuration = `${((Date.now() - testStartTime) / 1000).toFixed(1)}s`;
        mainWindow.webContents.send("test-complete", { success: false, error: error.message, duration: totalDuration });
      }
    } finally {
      await browser.close();
      activeTestController = null;
    }
  });

  ipcMain.handle("list-suites", async () => {
    try {
      await fs.mkdir(suitesDir, { recursive: true });
      const files = await fs.readdir(suitesDir);
      const suites = [];
      for (const file of files) {
        if (file.endsWith(".json")) {
          const content = await fs.readFile(path.join(suitesDir, file), "utf-8");
          const data = JSON.parse(content);
          suites.push({ id: data.id, name: data.name, url: data.startUrl, stepsCount: data.steps?.length || 0, path: path.join(suitesDir, file), createdAt: data.id.split("-")[1] ? parseInt(data.id.split("-")[1]) : 0 });
        }
      }
      return suites.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      return [];
    }
  });

  ipcMain.handle("get-suite", async (event, suitePath) => {
    try {
      const content = await fs.readFile(suitePath, "utf-8");
      return JSON.parse(content);
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("delete-suite", async (event, suitePath) => {
    try {
      await fs.unlink(suitePath);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("get-suite-report", async (event, suitePath) => {
    try {
      const reportPath = suitePath.replace(".json", ".report.md");
      const content = await fs.readFile(reportPath, "utf-8");
      return content;
    } catch (error: any) {
      return `### Report not found\n\nCould not load report for ${suitePath}`;
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

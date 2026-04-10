import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import { BrowserManager } from "./browser";
import { runAgent } from "./agent";
import { replayTest } from "./replay";
import { TestSerializer } from "./recorder";
import { google } from "@ai-sdk/google";
import * as dotenv from "dotenv";
import * as fs from "fs/promises";

dotenv.config();

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

app.whenReady().then(() => {
  createWindow();

  ipcMain.on("start-test", async (event, { url, prompt }) => {
    const browser = new BrowserManager();
    const testStartTime = Date.now();
    const serializer = new TestSerializer();
    const lastRunPath = path.join(app.getPath("userData"), "last-run.json");
    
    const suiteName = prompt.slice(0, 30).replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const suitePath = path.join(suitesDir, `suite-${suiteName}-${Date.now()}.json`);
    
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
        activeTestController.signal,
      );

      if (mainWindow) {
        const totalDuration = `${((Date.now() - testStartTime) / 1000).toFixed(1)}s`;
        await serializer.saveTest(lastRunPath);
        mainWindow.webContents.send("test-complete", { success: true, duration: totalDuration });
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

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

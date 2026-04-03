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

const model = google("gemini-3.1-flash-lite-preview"); // Default model

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
    // mainWindow.webContents.openDevTools();
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
    
    // Also save to a unique file in the suites directory
    const suiteName = prompt.slice(0, 30).replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const suitePath = path.join(suitesDir, `suite-${suiteName}-${Date.now()}.json`);
    
    serializer.startTest(prompt, url);
    serializer.setOutPath(suitePath);

    activeTestController = new AbortController();
    try {
      await browser.init(false); // Show browser so user can see the bot
      await browser.execute({ kind: "navigate", url });

      await runAgent(
        prompt,
        browser,
        model as any,
        serializer, // Pass the serializer to record the test
        undefined, // artifactsDir
        false, // skipAssertions
        false, // fullSnapshot
        (update) => {
          if (mainWindow) {
            mainWindow.webContents.send("test-step", update);
          }
        },
        (checklist) => {
          if (mainWindow) {
            mainWindow.webContents.send("test-checklist", checklist);
          }
        },
        activeTestController.signal,
      );

      if (mainWindow) {
        const totalDuration = `${((Date.now() - testStartTime) / 1000).toFixed(1)}s`;
        console.log("[IPC] Sending test-complete event");
        // Also save to the last-run for quick replay
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
        mainWindow.webContents.send("test-complete", {
          success: false,
          error: error.message,
          duration: totalDuration
        });
      }
    } finally {
      await browser.close();
      activeTestController = null;
    }
  });

  ipcMain.on("stop-test", () => {
    if (activeTestController) {
      activeTestController.abort();
    }
  });

  ipcMain.on("replay-test", async (event, { suitePath } = {}) => {
    console.log("[IPC] Received replay-test", suitePath);
    const browser = new BrowserManager();
    const testStartTime = Date.now();
    const targetPath = suitePath || path.join(app.getPath("userData"), "last-run.json");
    
    activeTestController = new AbortController();
    try {
      await browser.init(false);
      await replayTest(
        targetPath,
        browser,
        model as any,
        undefined, // artifactsDir
        false, // skipAssertions
        false, // fullSnapshot
        (update) => {
          if (mainWindow) mainWindow.webContents.send("test-step", update);
        },
        (checklist) => {
          if (mainWindow) mainWindow.webContents.send("test-checklist", checklist);
        },
        activeTestController.signal,
      );

      if (mainWindow) {
        const totalDuration = `${((Date.now() - testStartTime) / 1000).toFixed(1)}s`;
        mainWindow.webContents.send("test-complete", { success: true, duration: totalDuration });
      }
    } catch (error: any) {
      console.error("Replay failed:", error);
      if (mainWindow) {
        const totalDuration = `${((Date.now() - testStartTime) / 1000).toFixed(1)}s`;
        mainWindow.webContents.send("test-complete", {
          success: false,
          error: error.message,
          duration: totalDuration
        });
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
          suites.push({
            id: data.id,
            name: data.name,
            url: data.startUrl,
            stepsCount: data.steps?.length || 0,
            path: path.join(suitesDir, file),
            createdAt: data.id.split("-")[1] ? parseInt(data.id.split("-")[1]) : 0
          });
        }
      }
      return suites.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error("Failed to list suites:", error);
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
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

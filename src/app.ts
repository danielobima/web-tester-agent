import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import { BrowserManager } from "./browser";
import { runAgent } from "./agent";
import { replayTest } from "./replay";
import { TestSerializer } from "./recorder";
import { google } from "@ai-sdk/google";
import * as dotenv from "dotenv";

dotenv.config();

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
    
    serializer.startTest(prompt, url);
    serializer.setOutPath(lastRunPath);

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

  ipcMain.on("replay-test", async (event) => {
    console.log("[IPC] Received replay-test");
    const browser = new BrowserManager();
    const testStartTime = Date.now();
    const lastRunPath = path.join(app.getPath("userData"), "last-run.json");
    
    activeTestController = new AbortController();
    try {
      await browser.init(false);
      // We can use the same model as start-test
      await replayTest(
        lastRunPath,
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

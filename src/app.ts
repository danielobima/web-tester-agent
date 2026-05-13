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
import { isVisionModel } from "./utils";
import * as data from "./data";
import { createModel } from "./models";

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

// Model configuration is now handled dynamically via getConfig() and models.ts

function createWindow() {
  mainWindow = new BrowserWindow({
    title: "Web Testing Agent",
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

  ipcMain.on("start-test", async (event, { url, requirement, testId, model }) => {
    const browser = new BrowserManager();
    const testStartTime = Date.now();
    const serializer = new TestSerializer();
    const lastRunPath = path.join(app.getPath("userData"), "last-run.json");
    
    const suiteName = requirement.slice(0, 30).replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const timestamp = Date.now();
    const suitePath = path.join(suitesDir, `suite-${suiteName}-${timestamp}.json`);
    const sessionScreenshotsDir = path.join(suitesDir, `suite-${suiteName}-${timestamp}.screenshots`);
    await fs.mkdir(sessionScreenshotsDir, { recursive: true });
    
    const artifactsDir = app.getPath("userData");
    const config = await data.getConfig();
    const modelConfig = config.models.find(m => m.id === model) || config.models[0];
    const aiModel = createModel(modelConfig);
    const modelSupportsVision = config.enableVision && isVisionModel(modelConfig.provider, modelConfig.modelName);

    serializer.startTest(requirement, url);
    serializer.setOutPath(suitePath);

    activeTestController = new AbortController();
    try {
      await browser.init(config.headless || false);
      await browser.execute({ kind: "navigate", url });

      await runAgent(
        requirement,
        browser,
        aiModel,
        serializer,
        artifactsDir,
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
            mainWindow?.webContents.send("execution-finished", checklist);
          });
        },
        (planning) => {
          if (mainWindow) mainWindow.webContents.send("test-planning-state", planning);
        },
        async (checklist) => {
          if (!mainWindow) return { action: 'resume' };
          if (!isPaused) return { action: 'resume' };
          
          return new Promise((resolve, reject) => {
            pausePromise = { resolve, reject };
            mainWindow?.webContents.send("pause-request", checklist);
          });
        },
        sessionScreenshotsDir,
        (issues) => {
          if (mainWindow) mainWindow.webContents.send("test-issues", issues);
        },
        activeTestController.signal,
        modelSupportsVision,
        !config.requirePlanApproval
      );

      const totalDuration = `${((Date.now() - testStartTime) / 1000).toFixed(1)}s`;

      // Link result to test ID if provided
      if (testId) {
        const tests = await data.listTests();
        const testIndex = tests.findIndex(t => t.id === testId);
        if (testIndex !== -1) {
          tests[testIndex].lastRunPath = suitePath;
          await data.saveTests(tests);
        }
      }

      // Generate markdown report
      const testData = serializer.getTest();
      if (testData) {
        const reportFileName = path.basename(suitePath).replace(".json", ".report.md");
        await generateMarkdownReport(testData, suitesDir, reportFileName);
      }

      if (mainWindow) {
        mainWindow.webContents.send("test-complete", { success: true, duration: totalDuration, suitePath });
      }
    } catch (error: any) {
      console.error("Test execution failed:", error);
      if (mainWindow) {
        const totalDuration = `${((Date.now() - testStartTime) / 1000).toFixed(1)}s`;
        mainWindow.webContents.send("test-complete", {
          success: false,
          error: error.message,
          duration: totalDuration,
        });
        mainWindow.webContents.send("test-step", {
          id: "error",
          step: "Execution Error",
          status: "failed",
          duration: "ERR",
          description: error.message,
        });
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

  ipcMain.on("completion-validation-response", (event, result) => {
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
    
    const config = await data.getConfig();
    const modelConfig = config.models.find(m => m.id === config.defaultModelId) || config.models[0];
    const aiModel = createModel(modelConfig);
    const modelSupportsVision = config.enableVision && isVisionModel(modelConfig.provider, modelConfig.modelName);

    try {
      await browser.init(config.headless || false);
      await replayTest(targetPath, browser, aiModel, undefined, false, false, (update) => {
        if (mainWindow) mainWindow.webContents.send("test-step", update);
      }, (checklist) => {
        if (mainWindow) mainWindow.webContents.send("test-checklist", checklist);
      }, (isPlanning: boolean) => {
        if (mainWindow) mainWindow.webContents.send("test-planning-state", isPlanning);
      }, activeTestController.signal, modelSupportsVision, !config.requirePlanApproval);
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

  // Application Management
  ipcMain.handle("list-applications", async () => {
    return await data.listApplications();
  });

  ipcMain.handle("create-application", async (event, { name, description }) => {
    const apps = await data.listApplications();
    const newApp: data.Application = {
      id: `app-${Date.now()}`,
      name,
      description,
      createdAt: Date.now(),
    };
    apps.push(newApp);
    await data.saveApplications(apps);
    return newApp;
  });

  ipcMain.handle("delete-application", async (event, appId) => {
    const apps = await data.listApplications();
    const filteredApps = apps.filter(a => a.id !== appId);
    await data.saveApplications(filteredApps);
    
    // Also delete associated tests
    const tests = await data.listTests();
    const remainingTests = tests.filter(t => t.appId !== appId);
    await data.saveTests(remainingTests);
    
    return { success: true };
  });

  // Test Management
  ipcMain.handle("list-tests", async (event, appId) => {
    return await data.listTests(appId);
  });

  ipcMain.handle("create-test", async (event, { appId, name, url, requirement, model }) => {
    const tests = await data.listTests();
    const newTest: data.Test = {
      id: `test-${Date.now()}`,
      appId,
      name,
      url,
      requirement,
      model,
      createdAt: Date.now(),
    };
    tests.push(newTest);
    await data.saveTests(tests);
    return newTest;
  });

  ipcMain.handle("update-test", async (event, { testId, config }) => {
    const tests = await data.listTests();
    const index = tests.findIndex(t => t.id === testId);
    if (index !== -1) {
      tests[index] = { ...tests[index], ...config };
      await data.saveTests(tests);
      return tests[index];
    }
    throw new Error("Test not found");
  });

  ipcMain.handle("delete-test", async (event, testId) => {
    const tests = await data.listTests();
    const filteredTests = tests.filter(t => t.id !== testId);
    await data.saveTests(filteredTests);
    return { success: true };
  });

  ipcMain.handle("get-test", async (event, testId) => {
    const tests = await data.listTests();
    return tests.find(t => t.id === testId);
  });

  // Configuration Management
  ipcMain.handle("get-config", async () => {
    return await data.getConfig();
  });

  ipcMain.handle("save-config", async (event, config) => {
    await data.saveConfig(config);
    return { success: true };
  });

  // Agent Error Management
  ipcMain.handle("list-agent-errors", async () => {
    const errorBaseDir = path.join(app.getPath("userData"), "errors");
    try {
      await fs.mkdir(errorBaseDir, { recursive: true });
      const dirs = await fs.readdir(errorBaseDir);
      const errors = [];
      for (const dir of dirs) {
        try {
          const reportPath = path.join(errorBaseDir, dir, "report.json");
          const content = await fs.readFile(reportPath, "utf-8");
          const report = JSON.parse(content);
          errors.push({
            id: dir,
            timestamp: report.timestamp,
            message: report.error.message,
            type: report.error.type,
            url: report.environment.url,
            path: path.join(errorBaseDir, dir)
          });
        } catch (e) {
          // Skip if no report.json
        }
      }
      return errors.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      return [];
    }
  });

  ipcMain.handle("get-agent-error", async (event, errorId) => {
    const errorDir = path.join(app.getPath("userData"), "errors", errorId);
    try {
      const reportContent = await fs.readFile(path.join(errorDir, "report.json"), "utf-8");
      const report = JSON.parse(reportContent);
      
      let snapshot = "";
      try { snapshot = await fs.readFile(path.join(errorDir, "snapshot.txt"), "utf-8"); } catch (e) {}
      
      let axTree = null;
      try { 
        const axTreeContent = await fs.readFile(path.join(errorDir, "axtree.json"), "utf-8");
        axTree = JSON.parse(axTreeContent);
      } catch (e) {}

      return {
        ...report,
        id: errorId,
        snapshot,
        axTree,
        screenshotPath: path.join(errorDir, "screenshot.png")
      };
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle("delete-agent-error", async (event, errorId) => {
    const errorDir = path.join(app.getPath("userData"), "errors", errorId);
    try {
      await fs.rm(errorDir, { recursive: true, force: true });
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as any).message };
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

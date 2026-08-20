import { app, BrowserWindow, ipcMain, protocol, net } from "electron";
import { pathToFileURL } from "node:url";
import * as path from "path";
import { BrowserManager, killZombieChromiumSessions } from "./browser";
import { runAgent } from "./agent";
import { runVisualAgent } from "./visual-agent";
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
  {
    scheme: "media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true,
    },
  },
]);

const suitesDir = path.join(app.getPath("userData"), "suites");

let mainWindow: BrowserWindow | null = null;
let activeTestController: AbortController | null = null;
let planApprovalPromise: {
  resolve: (val: any) => void;
  reject: (err: any) => void;
} | null = null;
let goalValidationPromise: {
  resolve: (val: any) => void;
  reject: (err: any) => void;
} | null = null;
let pausePromise: {
  resolve: (val: any) => void;
  reject: (err: any) => void;
} | null = null;
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

  ipcMain.on(
    "start-test",
    async (event, { url, requirement, testId, model }) => {
      const browser = new BrowserManager();
      const testStartTime = Date.now();
      const artifactsDir = app.getPath("userData");
      const config = await data.getConfig();
      const modelConfig =
        config.models.find((m) => m.id === model) || config.models[0];
      if (!modelConfig) {
        throw new Error(
          "No LLMs are configured. Please go to Settings and add at least one AI model before running tests.",
        );
      }
      const aiModel = createModel(modelConfig);
      const modelSupportsVision =
        config.visualFirst &&
        isVisionModel(
          modelConfig.provider,
          modelConfig.modelName,
          modelConfig.supportsVision,
        );

      activeTestController = new AbortController();
      let activeSerializer: TestSerializer | null = null;

      try {
        const allTests = await data.listTests();
        let targetTest: data.Test | null = null;
        let appId = "";

        if (testId) {
          targetTest = allTests.find((t) => t.id === testId) || null;
          if (targetTest) {
            appId = targetTest.appId;
          }
        }

        // Build execution chain for prerequisites + target test
        let executionChain: data.Test[] = [];
        let dependencyMap = new Map<string, data.TestDependencyPrecondition>();

        if (targetTest) {
          const resolved = data.resolveTestDependencyChain(targetTest.id, allTests);
          executionChain = resolved.executionChain;
          dependencyMap = resolved.dependencyPreconditions;
        } else {
          executionChain = [
            {
              id: testId || `adhoc-${Date.now()}`,
              appId,
              name: requirement.slice(0, 40),
              url,
              requirement,
              model: model || config.defaultModelId || "gemini-1.5-flash",
              createdAt: Date.now(),
            },
          ];
        }

        // Check for storage_state or variable preconditions on the target test
        let initialStorageStatePath: string | undefined = undefined;
        const mainTarget = executionChain[executionChain.length - 1];

        if (mainTarget.preconditions) {
          // 1. Variable Preconditions validation & on-demand acquisition
          for (const pre of mainTarget.preconditions) {
            if (pre.type === "variable") {
              const activeVariables = await data.listVariables(appId);
              for (const varName of pre.variableNames) {
                const found = activeVariables.find((v) => v.name === varName);
                if (!found) {
                  if (pre.onMissingOrExpired === "run_acquisition_test" && pre.acquisitionTestId) {
                    const acqTest = allTests.find((t) => t.id === pre.acquisitionTestId);
                    if (acqTest && !executionChain.some((t) => t.id === acqTest.id)) {
                      console.log(`[Precondition] Injecting variable acquisition test "${acqTest.name}"`);
                      executionChain.unshift(acqTest);
                    }
                  } else {
                    throw new Error(`Required variable "${varName}" is missing or expired.`);
                  }
                }
              }
            }
          }

          // 2. Storage State / Auth Profile Preconditions
          for (const pre of mainTarget.preconditions) {
            if (pre.type === "storage_state") {
              if (pre.source === "auth_profile" && pre.authProfileId) {
                const profiles = await data.listAuthProfiles(appId);
                const profile = profiles.find((p) => p.id === pre.authProfileId);
                let stateValid = false;

                if (profile?.storageStatePath) {
                  try {
                    await fs.access(profile.storageStatePath);
                    stateValid = true;
                  } catch (e) {
                    stateValid = false;
                  }
                }

                if (!stateValid) {
                  const fallbackId = pre.fallbackTestId || profile?.sourceTestId;
                  if (pre.onMissingOrExpired === "run_fallback_test" && fallbackId) {
                    const fallbackTest = allTests.find((t) => t.id === fallbackId);
                    if (fallbackTest && !executionChain.some((t) => t.id === fallbackTest.id)) {
                      console.log(`[Precondition] Injecting auth fallback test "${fallbackTest.name}"`);
                      executionChain.unshift(fallbackTest);
                    }
                  } else {
                    throw new Error(
                      `Auth Profile "${profile?.name || pre.authProfileId}" is missing, expired, or has no valid session file.`,
                    );
                  }
                } else if (profile?.storageStatePath) {
                  initialStorageStatePath = profile.storageStatePath;
                }
              } else if (pre.source === "file" && pre.storageStatePath) {
                initialStorageStatePath = pre.storageStatePath;
              }
            }
          }
        }

        // Initialize browser with any resolved storage state
        await browser.init(config.headless || false, true, initialStorageStatePath);

        // Inject direct cookies and local storage if configured on target test
        if (mainTarget.preconditions) {
          for (const pre of mainTarget.preconditions) {
            if (pre.type === "storage_state" && pre.source === "direct") {
              if (pre.cookies && pre.cookies.length > 0) {
                await browser.injectCookies(pre.cookies);
              }
              if (pre.localStorage && pre.localStorage.length > 0) {
                await browser.injectLocalStorage(pre.localStorage);
              }
            }
          }
        }

        const totalPrereqs = executionChain.length - 1;
        let lastSuitePath = "";

        // Execute chain (Prerequisites first, then Target Test)
        for (let i = 0; i < executionChain.length; i++) {
          const currentTest = executionChain[i];
          const isTarget = i === executionChain.length - 1;
          const isPrereq = !isTarget;

          if (isPrereq) {
            if (mainWindow) {
              mainWindow.webContents.send("test-precondition-status", {
                phase: "precondition",
                currentTestId: currentTest.id,
                currentTestName: currentTest.name,
                index: i + 1,
                total: totalPrereqs,
                status: "running",
              });
            }
          } else {
            if (mainWindow) {
              mainWindow.webContents.send("test-precondition-status", {
                phase: "target",
                currentTestId: currentTest.id,
                currentTestName: currentTest.name,
                status: "running",
              });
            }
          }

          const currentSuiteName = currentTest.requirement
            .slice(0, 30)
            .replace(/[^a-z0-9]/gi, "_")
            .toLowerCase();
          const timestamp = Date.now();
          const currentSuitePath = path.join(
            suitesDir,
            `suite-${currentSuiteName}-${timestamp}.json`,
          );
          const currentScreenshotsDir = path.join(
            suitesDir,
            `suite-${currentSuiteName}-${timestamp}.screenshots`,
          );
          await fs.mkdir(currentScreenshotsDir, { recursive: true });

          const serializer = new TestSerializer();
          serializer.startTest(currentTest.requirement, currentTest.url, currentTest.appId);
          serializer.setOutPath(currentSuitePath);
          activeSerializer = serializer;

          const serializedTest = serializer.getTest();
          if (serializedTest) {
            if (currentTest.appId) serializedTest.appId = currentTest.appId;
            if (currentTest.id) serializedTest.testId = currentTest.id;
          }

          const depConfig = dependencyMap.get(currentTest.id);
          const shouldUseReplay =
            isPrereq &&
            depConfig?.executionMode !== "agent_only" &&
            currentTest.lastRunPath;

          if (shouldUseReplay && currentTest.lastRunPath) {
            // Replay execution for prerequisite
            await replayTest(
              currentTest.lastRunPath,
              browser,
              aiModel,
              currentScreenshotsDir,
              false,
              false,
              (update) => {
                if (mainWindow) mainWindow.webContents.send("test-step", update);
              },
              (checklist) => {
                if (mainWindow)
                  mainWindow.webContents.send("test-checklist", checklist);
              },
              (planning) => {
                if (mainWindow)
                  mainWindow.webContents.send("test-planning-state", planning);
              },
              activeTestController.signal,
              modelSupportsVision,
              true, // auto-accept during precondition replay
            );
          } else {
            // Live agent execution
            await browser.execute({ kind: "navigate", url: currentTest.url });
            const runner = config.visualFirst ? runVisualAgent : runAgent;
            await runner(
              currentTest.requirement,
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
                if (mainWindow)
                  mainWindow.webContents.send("test-checklist", checklist);
              },
              async (checklist) => {
                if (!mainWindow || isPrereq) return { action: "accept" };
                return new Promise((resolve, reject) => {
                  planApprovalPromise = { resolve, reject };
                  mainWindow?.webContents.send("plan-approval-request", checklist);
                });
              },
              async (checklist) => {
                if (!mainWindow || isPrereq) return { action: "validate" };
                return new Promise((resolve, reject) => {
                  goalValidationPromise = { resolve, reject };
                  mainWindow?.webContents.send("execution-finished", checklist);
                });
              },
              (planning) => {
                if (mainWindow)
                  mainWindow.webContents.send("test-planning-state", planning);
              },
              async (checklist) => {
                if (!mainWindow || isPrereq) return { action: "resume" };
                if (!isPaused) return { action: "resume" };

                return new Promise((resolve, reject) => {
                  pausePromise = { resolve, reject };
                  mainWindow?.webContents.send("pause-request", checklist);
                });
              },
              currentScreenshotsDir,
              (issues) => {
                if (mainWindow) mainWindow.webContents.send("test-issues", issues);
              },
              activeTestController.signal,
              modelSupportsVision,
              isPrereq ? true : !config.requirePlanApproval,
              currentTest.appId,
              currentTest.id,
            );
          }

          // Save last run path and capture session state if configured
          if (currentTest.id) {
            const currentTests = await data.listTests();
            const idx = currentTests.findIndex((t) => t.id === currentTest.id);
            if (idx !== -1) {
              currentTests[idx].lastRunPath = currentSuitePath;
              if (currentTest.captureSessionOnSuccess) {
                const sessionFile = path.join(
                  data.storageStatesDir,
                  `session-${currentTest.id}.json`,
                );
                await browser.exportStorageState(sessionFile);
                currentTests[idx].savedStorageStatePath = sessionFile;

                if (currentTest.savedAuthProfileId) {
                  const profiles = await data.listAuthProfiles();
                  const pIdx = profiles.findIndex(
                    (p) => p.id === currentTest.savedAuthProfileId,
                  );
                  if (pIdx !== -1) {
                    profiles[pIdx].storageStatePath = sessionFile;
                    profiles[pIdx].updatedAt = Date.now();
                    await data.saveAuthProfiles(profiles);
                  }
                }
              }
              await data.saveTests(currentTests);
            }
          }

          // Generate markdown report for target test
          if (isTarget) {
            lastSuitePath = currentSuitePath;
            const testData = serializer.getTest();
            if (testData) {
              const reportFileName = path
                .basename(currentSuitePath)
                .replace(".json", ".report.md");
              await generateMarkdownReport(testData, suitesDir, reportFileName);
            }
          }

          if (isPrereq && mainWindow) {
            mainWindow.webContents.send("test-precondition-status", {
              phase: "precondition",
              currentTestId: currentTest.id,
              currentTestName: currentTest.name,
              index: i + 1,
              total: totalPrereqs,
              status: "passed",
            });
          }
        }

        const totalDuration = `${((Date.now() - testStartTime) / 1000).toFixed(1)}s`;
        if (activeSerializer) {
          const testData = activeSerializer.getTest();
          activeSerializer.logger.logCompletion({
            success: true,
            duration: totalDuration,
            totalTasks: testData?.checklist?.tasks?.length,
            tasksCompleted: testData?.checklist?.tasks?.filter((t: any) => t.status === "completed").length,
            issuesCount: testData?.issues?.length,
          });
          await activeSerializer.saveTest().catch(() => {});
        }

        if (mainWindow) {
          mainWindow.webContents.send("test-precondition-status", {
            phase: "idle",
            status: "passed",
          });
          mainWindow.webContents.send("test-complete", {
            success: true,
            duration: totalDuration,
            suitePath: lastSuitePath,
          });
        }
      } catch (error: any) {
        console.error("Test execution failed:", error);
        if (activeSerializer) {
          activeSerializer.logger.logError("Test Execution Failed", error);
          activeSerializer.logger.logCompletion({ success: false, error: error.message });
          await activeSerializer.saveTest().catch(() => {});
        }

        if (mainWindow) {
          const totalDuration = `${((Date.now() - testStartTime) / 1000).toFixed(1)}s`;
          mainWindow.webContents.send("test-precondition-status", {
            phase: "idle",
            status: "failed",
            message: error.message,
          });
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
    },
  );

  ipcMain.handle("get-suite-log", async (event, suitePath) => {
    try {
      const logPath = suitePath.replace(".json", ".log");
      const content = await fs.readFile(logPath, "utf-8");
      return content;
    } catch (error: any) {
      return `No execution log found for ${suitePath}`;
    }
  });

  ipcMain.on("stop-test", () => {
    if (activeTestController) activeTestController.abort();
    isPaused = false;
    if (planApprovalPromise) {
      planApprovalPromise.resolve({ action: "reject" });
      planApprovalPromise = null;
    }
    if (goalValidationPromise) {
      goalValidationPromise.resolve({ action: "cancel" });
      goalValidationPromise = null;
    }
    if (pausePromise) {
      pausePromise.resolve({ action: "resume" });
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

  ipcMain.handle("kill-browser-sessions", async () => {
    try {
      killZombieChromiumSessions();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.on("replay-test", async (event, { suitePath } = {}) => {
    const browser = new BrowserManager();
    const testStartTime = Date.now();
    const targetPath =
      suitePath || path.join(app.getPath("userData"), "last-run.json");
    const replayArtifactsDir = targetPath.replace(/\.json$/i, ".replay-screenshots");
    activeTestController = new AbortController();

    const config = await data.getConfig();
    const modelConfig =
      config.models.find((m) => m.id === config.defaultModelId) ||
      config.models[0];
    if (!modelConfig) {
      throw new Error(
        "No LLMs are configured. Please go to Settings and add at least one AI model before running tests.",
      );
    }
    const aiModel = createModel(modelConfig);
    const modelSupportsVision =
      config.visualFirst &&
      isVisionModel(
        modelConfig.provider,
        modelConfig.modelName,
        modelConfig.supportsVision,
      );

    try {
      await browser.init(config.headless || false);
      await replayTest(
        targetPath,
        browser,
        aiModel,
        replayArtifactsDir,
        false,
        false,
        (update) => {
          if (mainWindow) mainWindow.webContents.send("test-step", update);
        },
        (checklist) => {
          if (mainWindow)
            mainWindow.webContents.send("test-checklist", checklist);
        },
        (isPlanning: boolean) => {
          if (mainWindow)
            mainWindow.webContents.send("test-planning-state", isPlanning);
        },
        activeTestController.signal,
        modelSupportsVision,
        !config.requirePlanApproval,
      );
      if (mainWindow) {
        const totalDuration = `${((Date.now() - testStartTime) / 1000).toFixed(1)}s`;
        mainWindow.webContents.send("test-complete", {
          success: true,
          duration: totalDuration,
        });
      }
    } catch (error: any) {
      if (mainWindow) {
        const totalDuration = `${((Date.now() - testStartTime) / 1000).toFixed(1)}s`;
        mainWindow.webContents.send("test-complete", {
          success: false,
          error: error.message,
          duration: totalDuration,
        });
        mainWindow.webContents.send("test-step", {
          id: "error",
          step: "Replay Error",
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
    const filteredApps = apps.filter((a) => a.id !== appId);
    await data.saveApplications(filteredApps);

    // Also delete associated tests
    const tests = await data.listTests();
    const remainingTests = tests.filter((t) => t.appId !== appId);
    await data.saveTests(remainingTests);

    return { success: true };
  });

  // Test Management
  ipcMain.handle("list-tests", async (event, appId) => {
    return await data.listTests(appId);
  });

  ipcMain.handle(
    "create-test",
    async (event, { appId, name, url, requirement, model }) => {
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
    },
  );

  ipcMain.handle("update-test", async (event, { testId, config }) => {
    const tests = await data.listTests();
    const index = tests.findIndex((t) => t.id === testId);
    if (index !== -1) {
      tests[index] = { ...tests[index], ...config };
      await data.saveTests(tests);
      return tests[index];
    }
    throw new Error("Test not found");
  });

  ipcMain.handle("delete-test", async (event, testId) => {
    const tests = await data.listTests();
    const filteredTests = tests.filter((t) => t.id !== testId);
    await data.saveTests(filteredTests);
    return { success: true };
  });

  ipcMain.handle("get-test", async (event, testId) => {
    const tests = await data.listTests();
    return tests.find((t) => t.id === testId);
  });

  // Configuration Management
  ipcMain.handle("get-config", async () => {
    return await data.getConfig();
  });

  ipcMain.handle("save-config", async (event, config) => {
    await data.saveConfig(config);
    return { success: true };
  });

  // Variables Management
  ipcMain.handle("list-variables", async (event, appId) => {
    return await data.listVariables(appId);
  });

  ipcMain.handle("create-variable", async (event, { appId, testId, name, type, value, purpose, expiry }) => {
    const variables = await data.listVariables();
    const newVar = {
      id: `var-${Date.now()}`,
      appId,
      testId,
      name,
      type,
      value,
      purpose,
      expiry,
      createdAt: Date.now(),
    };
    variables.push(newVar);
    await data.saveVariables(variables);
    return newVar;
  });

  ipcMain.handle("update-variable", async (event, { varId, config }) => {
    const variables = await data.listVariables();
    const index = variables.findIndex((v) => v.id === varId);
    if (index !== -1) {
      variables[index] = { ...variables[index], ...config };
      await data.saveVariables(variables);
      return variables[index];
    }
    throw new Error("Variable not found");
  });

  ipcMain.handle("delete-variable", async (event, varId) => {
    const variables = await data.listVariables();
    const filteredVariables = variables.filter((v) => v.id !== varId);
    await data.saveVariables(filteredVariables);
    return { success: true };
  });

  // Auth Profile Management
  ipcMain.handle("list-auth-profiles", async (event, appId) => {
    return await data.listAuthProfiles(appId);
  });

  ipcMain.handle("create-auth-profile", async (event, { appId, name, description, expiry, sourceTestId }) => {
    const profiles = await data.listAuthProfiles();
    const id = `auth-${Date.now()}`;
    const storageStatePath = path.join(data.storageStatesDir, `auth-${id}.json`);
    const newProfile: data.AuthProfile = {
      id,
      appId,
      name,
      description,
      storageStatePath,
      expiry,
      sourceTestId,
      updatedAt: Date.now(),
    };
    profiles.push(newProfile);
    await data.saveAuthProfiles(profiles);
    return newProfile;
  });

  ipcMain.handle("update-auth-profile", async (event, { profileId, config }) => {
    const profiles = await data.listAuthProfiles();
    const index = profiles.findIndex((p) => p.id === profileId);
    if (index !== -1) {
      profiles[index] = { ...profiles[index], ...config, updatedAt: Date.now() };
      await data.saveAuthProfiles(profiles);
      return profiles[index];
    }
    throw new Error("Auth Profile not found");
  });

  ipcMain.handle("delete-auth-profile", async (event, profileId) => {
    const profiles = await data.listAuthProfiles();
    const target = profiles.find((p) => p.id === profileId);
    if (target && target.storageStatePath) {
      try {
        await fs.rm(target.storageStatePath, { force: true });
      } catch (e) {}
    }
    await data.deleteAuthProfile(profileId);
    return { success: true };
  });

  ipcMain.handle("get-auth-profile-details", async (event, profileId) => {
    const profiles = await data.listAuthProfiles();
    const target = profiles.find((p) => p.id === profileId);
    if (!target) {
      throw new Error("Auth profile not found");
    }

    let cookies: any[] = [];
    let origins: any[] = [];
    let fileExists = false;
    let rawJson = "";

    if (target.storageStatePath) {
      try {
        const content = await fs.readFile(target.storageStatePath, "utf-8");
        rawJson = content;
        const parsed = JSON.parse(content);
        cookies = parsed.cookies || [];
        origins = parsed.origins || [];
        fileExists = true;
      } catch (e) {
        fileExists = false;
      }
    }

    return {
      profile: target,
      fileExists,
      cookies,
      origins,
      rawJson,
    };
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
            path: path.join(errorBaseDir, dir),
          });
        } catch (e) {
          // Skip if no report.json
        }
      }
      return errors.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
    } catch (error) {
      return [];
    }
  });

  ipcMain.handle("get-agent-error", async (event, errorId) => {
    const errorDir = path.join(app.getPath("userData"), "errors", errorId);
    try {
      const reportContent = await fs.readFile(
        path.join(errorDir, "report.json"),
        "utf-8",
      );
      const report = JSON.parse(reportContent);

      let snapshot = "";
      try {
        snapshot = await fs.readFile(
          path.join(errorDir, "snapshot.txt"),
          "utf-8",
        );
      } catch (e) {}

      let axTree = null;
      try {
        const axTreeContent = await fs.readFile(
          path.join(errorDir, "axtree.json"),
          "utf-8",
        );
        axTree = JSON.parse(axTreeContent);
      } catch (e) {}

      return {
        ...report,
        id: errorId,
        snapshot,
        axTree,
        screenshotPath: path.join(errorDir, "screenshot.png"),
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

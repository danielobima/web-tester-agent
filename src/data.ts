import * as fs from "fs/promises";
import * as path from "path";
import { app } from "electron";

export interface Application {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
}

export interface Test {
  id: string;
  appId: string;
  name: string;
  url: string;
  requirement: string;
  model: string;
  createdAt: number;
  lastRunPath?: string;
}

export interface ModelConfig {
  id: string;
  name: string;
  provider: "google" | "ollama" | "openai" | "anthropic";
  modelName: string;
  apiKey?: string;
  baseUrl?: string;
  supportsVision?: boolean;
  ollamaThink?: boolean;
  timeout?: number;
}

export interface AppConfig {
  models: ModelConfig[];
  defaultModelId?: string;
  requirePlanApproval?: boolean;
  headless?: boolean;
  visualFirst?: boolean;
}

export interface Variable {
  id: string;
  appId: string;
  testId?: string;
  name: string;
  type: "string" | "number" | "boolean" | "secret" | "json";
  value: string;
  expiry?: string;
  purpose: string;
  createdAt: number;
}

const getFallbackUserDataPath = () => {
  const home = process.env.HOME || process.env.USERPROFILE || ".";
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || home, "Electron");
  } else if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Electron");
  } else {
    return path.join(home, ".config", "Electron");
  }
};
const userDataPath = app ? app.getPath("userData") : getFallbackUserDataPath();
const dataDir = path.join(userDataPath, "data");
const appsFile = path.join(dataDir, "applications.json");
const testsFile = path.join(dataDir, "tests.json");
const configFile = path.join(dataDir, "config.json");
const variablesFile = path.join(dataDir, "variables.json");

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

export async function listApplications(): Promise<Application[]> {
  await ensureDataDir();
  try {
    const content = await fs.readFile(appsFile, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    return [];
  }
}

export async function saveApplications(apps: Application[]) {
  await ensureDataDir();
  await fs.writeFile(appsFile, JSON.stringify(apps, null, 2), "utf-8");
}

export async function listTests(appId?: string): Promise<Test[]> {
  await ensureDataDir();
  try {
    const content = await fs.readFile(testsFile, "utf-8");
    const tests: Test[] = JSON.parse(content);
    if (appId) {
      return tests.filter(t => t.appId === appId);
    }
    return tests;
  } catch (error) {
    return [];
  }
}

export async function saveTests(tests: Test[]) {
  await ensureDataDir();
  await fs.writeFile(testsFile, JSON.stringify(tests, null, 2), "utf-8");
}

export async function getConfig(): Promise<AppConfig> {
  await ensureDataDir();
  try {
    const content = await fs.readFile(configFile, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    return {
      models: [
        {
          id: "gemini-1.5-flash",
          name: "Gemini 1.5 Flash",
          provider: "google",
          modelName: "gemini-1.5-flash",
          supportsVision: true,
        },
        {
          id: "gemini-1.5-pro",
          name: "Gemini 1.5 Pro",
          provider: "google",
          modelName: "gemini-1.5-pro",
          supportsVision: true,
        }
      ],
      defaultModelId: "gemini-1.5-flash",
      requirePlanApproval: true,
      headless: false,
      visualFirst: false
    };
  }
}

export async function saveConfig(config: AppConfig) {
  await ensureDataDir();
  await fs.writeFile(configFile, JSON.stringify(config, null, 2), "utf-8");
}

export async function listVariables(appId?: string): Promise<Variable[]> {
  await ensureDataDir();
  try {
    const content = await fs.readFile(variablesFile, "utf-8");
    const variables: Variable[] = JSON.parse(content);
    
    const now = Date.now();
    const activeVariables = variables.filter(v => {
      if (v.expiry) {
        const expiryTime = new Date(v.expiry).getTime();
        if (!isNaN(expiryTime) && expiryTime <= now) {
          return false;
        }
      }
      return true;
    });

    if (activeVariables.length < variables.length) {
      await saveVariables(activeVariables);
    }

    if (appId) {
      return activeVariables.filter(v => v.appId === appId);
    }
    return activeVariables;
  } catch (error) {
    return [];
  }
}

export async function saveVariables(variables: Variable[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(variablesFile, JSON.stringify(variables, null, 2), "utf-8");
}

export function resolveVariables(appVars: Variable[], testVars: Variable[]): Variable[] {
  const map = new Map<string, Variable>();
  for (const v of appVars) {
    map.set(v.name, v);
  }
  for (const v of testVars) {
    map.set(v.name, v);
  }
  return Array.from(map.values());
}

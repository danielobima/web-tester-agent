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
  prompt: string;
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
}

export interface AppConfig {
  models: ModelConfig[];
  defaultModelId?: string;
  requirePlanApproval?: boolean;
  headless?: boolean;
}

const dataDir = path.join(app.getPath("userData"), "data");
const appsFile = path.join(dataDir, "applications.json");
const testsFile = path.join(dataDir, "tests.json");
const configFile = path.join(dataDir, "config.json");

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
        },
        {
          id: "gemini-1.5-pro",
          name: "Gemini 1.5 Pro",
          provider: "google",
          modelName: "gemini-1.5-pro",
        }
      ],
      defaultModelId: "gemini-1.5-flash",
      requirePlanApproval: true,
      headless: false
    };
  }
}

export async function saveConfig(config: AppConfig) {
  await ensureDataDir();
  await fs.writeFile(configFile, JSON.stringify(config, null, 2), "utf-8");
}

import * as fs from "fs/promises";
import * as path from "path";
import { app } from "electron";

export interface Application {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
}

export type PreconditionType = "test_dependency" | "storage_state" | "variable";

export interface TestDependencyPrecondition {
  id: string;
  type: "test_dependency";
  prerequisiteTestId: string;
  executionMode?: "auto" | "replay_only" | "agent_only";
  shareBrowserSession?: boolean;
  stopOnFailure?: boolean;
  passVariables?: boolean;
}

export interface CookieItem {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export interface LocalStorageItem {
  origin: string;
  key: string;
  value: string;
}

export interface StorageStatePrecondition {
  id: string;
  type: "storage_state";
  source: "direct" | "auth_profile" | "file";
  authProfileId?: string;
  cookies?: CookieItem[];
  localStorage?: LocalStorageItem[];
  storageStatePath?: string;
  onMissingOrExpired?: "fail" | "run_fallback_test";
  fallbackTestId?: string;
}

export interface VariablePrecondition {
  id: string;
  type: "variable";
  variableNames: string[];
  onMissingOrExpired?: "fail" | "run_acquisition_test";
  acquisitionTestId?: string;
}

export type TestPrecondition =
  | TestDependencyPrecondition
  | StorageStatePrecondition
  | VariablePrecondition;

export interface AuthProfile {
  id: string;
  appId: string;
  name: string;
  description?: string;
  storageStatePath: string;
  updatedAt: number;
  expiry?: string;
  sourceTestId?: string;
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
  preconditions?: TestPrecondition[];
  captureSessionOnSuccess?: boolean;
  savedAuthProfileId?: string;
  savedStorageStatePath?: string;
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
const authProfilesFile = path.join(dataDir, "auth_profiles.json");
export const storageStatesDir = path.join(userDataPath, "storage_states");

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(storageStatesDir, { recursive: true });
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

export async function listAuthProfiles(appId?: string): Promise<AuthProfile[]> {
  await ensureDataDir();
  try {
    const content = await fs.readFile(authProfilesFile, "utf-8");
    const profiles: AuthProfile[] = JSON.parse(content);
    const now = Date.now();
    const activeProfiles = profiles.filter((p) => {
      if (p.expiry) {
        const expiryTime = new Date(p.expiry).getTime();
        if (!isNaN(expiryTime) && expiryTime <= now) {
          return false;
        }
      }
      return true;
    });

    if (activeProfiles.length < profiles.length) {
      await saveAuthProfiles(activeProfiles);
    }

    if (appId) {
      return activeProfiles.filter((p) => p.appId === appId);
    }
    return activeProfiles;
  } catch (error) {
    return [];
  }
}

export async function saveAuthProfiles(profiles: AuthProfile[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(authProfilesFile, JSON.stringify(profiles, null, 2), "utf-8");
}

export async function saveAuthProfile(profile: AuthProfile): Promise<void> {
  const profiles = await listAuthProfiles();
  const index = profiles.findIndex((p) => p.id === profile.id);
  if (index >= 0) {
    profiles[index] = profile;
  } else {
    profiles.push(profile);
  }
  await saveAuthProfiles(profiles);
}

export async function deleteAuthProfile(profileId: string): Promise<void> {
  const profiles = await listAuthProfiles();
  const filtered = profiles.filter((p) => p.id !== profileId);
  await saveAuthProfiles(filtered);
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

/**
 * Resolves the dependency execution chain for a test using topological sorting.
 * Detects circular dependencies and orders prerequisites so they execute before dependent tests.
 */
export function resolveTestDependencyChain(
  targetTestId: string,
  allTests: Test[],
): { executionChain: Test[]; dependencyPreconditions: Map<string, TestDependencyPrecondition> } {
  const testMap = new Map<string, Test>();
  for (const t of allTests) {
    testMap.set(t.id, t);
  }

  const targetTest = testMap.get(targetTestId);
  if (!targetTest) {
    throw new Error(`Target test with ID '${targetTestId}' not found.`);
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const executionChain: Test[] = [];
  const dependencyPreconditions = new Map<string, TestDependencyPrecondition>();

  function dfs(currentTestId: string) {
    if (visiting.has(currentTestId)) {
      throw new Error(
        `Circular dependency detected involving test "${testMap.get(currentTestId)?.name || currentTestId}".`,
      );
    }
    if (visited.has(currentTestId)) {
      return;
    }

    visiting.add(currentTestId);
    const currentTest = testMap.get(currentTestId);
    if (currentTest?.preconditions) {
      for (const pre of currentTest.preconditions) {
        if (pre.type === "test_dependency" && pre.prerequisiteTestId) {
          if (!testMap.has(pre.prerequisiteTestId)) {
            throw new Error(
              `Prerequisite test ID '${pre.prerequisiteTestId}' referenced by "${currentTest.name}" does not exist.`,
            );
          }
          dependencyPreconditions.set(pre.prerequisiteTestId, pre);
          dfs(pre.prerequisiteTestId);
        }
      }
    }

    visiting.delete(currentTestId);
    visited.add(currentTestId);
    if (currentTest) {
      executionChain.push(currentTest);
    }
  }

  dfs(targetTestId);
  return { executionChain, dependencyPreconditions };
}

export function normalizeVariableName(name: string): string {
  return name
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2") // convert camelCase to snake_case
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .toUpperCase()
    .replace(/^_+|_+$/g, "");
}

export function getSemanticRoot(name: string): string {
  let clean = normalizeVariableName(name);
  const prefixes = ["SELECTED_", "CHOSEN_", "CURRENT_", "ACTIVE_", "NEW_", "TARGET_", "INPUT_", "FORM_"];
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of prefixes) {
      if (clean.startsWith(prefix)) {
        clean = clean.substring(prefix.length);
        changed = true;
      }
    }
  }
  changed = true;
  while (changed) {
    changed = false;
    const suffixes = ["_NAME", "_VALUE", "_TEXT", "_FIELD", "_VAL", "_INPUT", "_VAR", "_1", "_2", "_3"];
    for (const suffix of suffixes) {
      if (clean.endsWith(suffix)) {
        clean = clean.substring(0, clean.length - suffix.length);
        changed = true;
      }
    }
  }
  return clean;
}

function calculateStringOverlap(str1: string, str2: string): number {
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, " ").split(/\s+/).filter(w => w.length > 2);
  const w1 = new Set(words(str1));
  const w2 = new Set(words(str2));
  if (w1.size === 0 || w2.size === 0) return 0;
  let intersection = 0;
  for (const w of w1) {
    if (w2.has(w)) intersection++;
  }
  return intersection / Math.max(w1.size, w2.size);
}

export function isSimilarVariable(
  v1: { name: string; purpose?: string },
  v2: { name: string; purpose?: string }
): boolean {
  const n1 = normalizeVariableName(v1.name);
  const n2 = normalizeVariableName(v2.name);
  if (n1 === n2) return true;

  const r1 = getSemanticRoot(n1);
  const r2 = getSemanticRoot(n2);
  if (r1 === r2 && r1.length > 2) return true;

  if ((n1.includes(n2) || n2.includes(n1)) && Math.min(n1.length, n2.length) >= 4) {
    return true;
  }

  if (v1.purpose && v2.purpose) {
    const overlap = calculateStringOverlap(v1.purpose, v2.purpose);
    if (overlap >= 0.6) {
      const words1 = new Set(n1.split("_").filter(w => w.length > 2));
      const words2 = new Set(n2.split("_").filter(w => w.length > 2));
      let shareKeyword = false;
      for (const w of words1) {
        if (words2.has(w)) {
          shareKeyword = true;
          break;
        }
      }
      if (shareKeyword || words1.size === 0 || words2.size === 0) {
        return true;
      }
    }
  }

  return false;
}



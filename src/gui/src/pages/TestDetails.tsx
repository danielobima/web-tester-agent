import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Icons } from "../components/ui/Icons";
import { MarkdownRenderer } from "../components/ui/MarkdownRenderer";
import { AutocompleteInput } from "../components/ui/AutocompleteInput";
import { AuthProfileViewer } from "../components/features/AuthProfileViewer";

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

interface Test {
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

interface Variable {
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

const formatDatetimeLocal = (date: Date): string => {
  const pad = (num: number) => String(num).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const formatExpiry = (expiryStr?: string) => {
  if (!expiryStr) return "";
  const expiryTime = new Date(expiryStr).getTime();
  if (isNaN(expiryTime)) return expiryStr;
  
  if (expiryTime <= Date.now()) {
    return "Expired";
  }
  
  const date = new Date(expiryStr);
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const TestDetails = () => {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const [test, setTest] = useState<Test | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [viewMode, setViewMode] = useState<"settings" | "preconditions" | "variables" | "report" | "script">(
    "settings",
  );
  const [reportContent, setReportContent] = useState<string>("");
  const [scriptContent, setScriptContent] = useState<string>("");
  const [viewingAuthProfileId, setViewingAuthProfileId] = useState<string | null>(null);

  const [allVars, setAllVars] = useState<Variable[]>([]);
  const [isCreatingVariable, setIsCreatingVariable] = useState(false);
  const [editingVariable, setEditingVariable] = useState<Variable | null>(null);
  const [varName, setVarName] = useState("");
  const [varType, setVarType] = useState<Variable["type"]>("string");
  const [varValue, setVarValue] = useState("");
  const [varPurpose, setVarPurpose] = useState("");
  const [varExpiry, setVarExpiry] = useState("");

  const [models, setModels] = useState<any[]>([]);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editRequirement, setEditRequirement] = useState("");
  const [editModel, setEditModel] = useState("");
  const [urlSuggestions, setUrlSuggestions] = useState<string[]>([]);

  // Preconditions & Auth Profiles State
  const [siblingTests, setSiblingTests] = useState<Test[]>([]);
  const [authProfiles, setAuthProfiles] = useState<AuthProfile[]>([]);
  const [isCreatingPrecondition, setIsCreatingPrecondition] = useState(false);
  const [preconditionType, setPreconditionType] = useState<PreconditionType>("test_dependency");
  
  // Form fields for test_dependency
  const [prereqTestId, setPrereqTestId] = useState("");
  const [prereqExecMode, setPrereqExecMode] = useState<"auto" | "replay_only" | "agent_only">("auto");
  const [prereqShareSession, setPrereqShareSession] = useState(true);
  const [prereqStopOnFailure, setPrereqStopOnFailure] = useState(true);

  // Form fields for storage_state
  const [storageSource, setStorageSource] = useState<"auth_profile" | "direct">("auth_profile");
  const [selectedAuthProfileId, setSelectedAuthProfileId] = useState("");
  const [storageOnMissing, setStorageOnMissing] = useState<"fail" | "run_fallback_test">("run_fallback_test");
  const [storageFallbackTestId, setStorageFallbackTestId] = useState("");
  const [directCookies, setDirectCookies] = useState<CookieItem[]>([]);
  const [cookieName, setCookieName] = useState("");
  const [cookieValue, setCookieValue] = useState("");
  const [cookieDomain, setCookieDomain] = useState("");

  // Form fields for variable
  const [selectedVarNames, setSelectedVarNames] = useState<string[]>([]);
  const [varOnMissing, setVarOnMissing] = useState<"fail" | "run_acquisition_test">("run_acquisition_test");
  const [varAcqTestId, setVarAcqTestId] = useState("");

  // Form field for Auth Profile creation modal
  const [isCreatingAuthProfile, setIsCreatingAuthProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileDesc, setNewProfileDesc] = useState("");
  const [newProfileSourceTestId, setNewProfileSourceTestId] = useState("");

  const loadTest = async () => {
    if (!testId) return;
    setIsLoading(true);
    try {
      const testData = await window.electron.getTest(testId);
      setTest(testData);
      setEditName(testData.name);
      setEditUrl(testData.url);
      setEditRequirement(testData.requirement);

      // Load URL suggestions and sibling tests scoped to the application
      const allTests = await window.electron.listTests(testData.appId);
      setSiblingTests(allTests.filter((t: any) => t.id !== testId));
      const suggestions = Array.from(new Set(allTests.map((t: any) => t.url).filter(Boolean)));
      setUrlSuggestions(suggestions);

      const config = await window.electron.getConfig();
      setModels(config.models);

      const modelExists = config.models.some((m: any) => m.id === testData.model);
      if (modelExists) {
        setEditModel(testData.model);
      } else if (config.models.length > 0) {
        const defaultModelExists = config.models.some((m: any) => m.id === config.defaultModelId);
        setEditModel(defaultModelExists ? config.defaultModelId : config.models[0].id);
      } else {
        setEditModel("");
      }

      // Load variables
      const varsData = await window.electron.listVariables(testData.appId);
      setAllVars(varsData);

      // Load auth profiles
      const profiles = await window.electron.listAuthProfiles(testData.appId);
      setAuthProfiles(profiles);
    } catch (error) {
      console.error("Error loading test details:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTest();
  }, [testId]);

  useEffect(() => {
    const loadReport = async () => {
      if (viewMode === "report" && test?.lastRunPath) {
        try {
          const content = await window.electron.getSuiteReport(
            test.lastRunPath,
          );
          setReportContent(content);
        } catch (error) {
          console.error("Failed to load report:", error);
          setReportContent("### Error\nCould not load report content.");
        }
      }
    };

    const loadScript = async () => {
      if (viewMode === "script" && test?.lastRunPath) {
        try {
          const suite = await window.electron.getSuite(test.lastRunPath);
          setScriptContent(JSON.stringify(suite, null, 2));
        } catch (error) {
          console.error("Failed to load script:", error);
          setScriptContent("// Error: Could not load serialized script.");
        }
      }
    };

    if (viewMode === "report") loadReport();
    if (viewMode === "script") loadScript();
  }, [viewMode, test]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await window.electron.updateTest(testId!, {
        name: editName,
        url: editUrl,
        requirement: editRequirement,
        model: editModel,
      });
      setTest(updated);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update test:", error);
    }
  };

  const resetVarForm = () => {
    setVarName("");
    setVarType("string");
    setVarValue("");
    setVarPurpose("");
    setVarExpiry("");
    setEditingVariable(null);
  };

  const handleSaveVariable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!varName.trim() || !varValue.trim() || !varPurpose.trim() || !test) return;

    try {
      if (editingVariable) {
        const updated = await window.electron.updateVariable(editingVariable.id, {
          name: varName,
          type: varType,
          value: varValue,
          purpose: varPurpose,
          expiry: varExpiry ? new Date(varExpiry).toISOString() : "",
          testId: test.id,
        });
        setAllVars(allVars.map(v => v.id === editingVariable.id ? updated : v));
        setEditingVariable(null);
      } else {
        const newVar = await window.electron.createVariable({
          appId: test.appId,
          testId: test.id,
          name: varName,
          type: varType,
          value: varValue,
          purpose: varPurpose,
          expiry: varExpiry ? new Date(varExpiry).toISOString() : undefined,
        });
        setAllVars([...allVars, newVar]);
      }
      setIsCreatingVariable(false);
      resetVarForm();
    } catch (error) {
      console.error("Failed to save variable:", error);
    }
  };

  const handleEditVariable = (variable: Variable) => {
    setEditingVariable(variable);
    setVarName(variable.name);
    setVarType(variable.type);
    setVarValue(variable.value);
    setVarPurpose(variable.purpose);
    setVarExpiry(variable.expiry ? formatDatetimeLocal(new Date(variable.expiry)) : "");
    setIsCreatingVariable(true);
  };

  const handleOverrideVariable = (variable: Variable) => {
    setEditingVariable(null);
    setVarName(variable.name);
    setVarType(variable.type);
    setVarValue(variable.value);
    setVarPurpose(variable.purpose || "");
    setVarExpiry(variable.expiry ? formatDatetimeLocal(new Date(variable.expiry)) : "");
    setIsCreatingVariable(true);
  };

  const handleDeleteVariable = async (varId: string) => {
    if (confirm("Are you sure you want to delete this variable?")) {
      try {
        await window.electron.deleteVariable(varId);
        setAllVars(allVars.filter(v => v.id !== varId));
      } catch (error) {
        console.error("Failed to delete variable:", error);
      }
    }
  };

  const handleRun = () => {
    if (!test) return;
    window.electron.startTest(test.url, test.requirement, test.id, test.model);
    navigate("/execution", { state: { replaying: false } });
  };

  const handleReplay = () => {
    if (!test || !test.lastRunPath) return;
    window.electron.replayTest(test.lastRunPath);
    navigate("/execution", { state: { replaying: true } });
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this test?")) {
      await window.electron.deleteTest(testId!);
      navigate(`/applications/${test?.appId}`);
    }
  };

  const handleSavePrecondition = async (newPre: TestPrecondition) => {
    if (!test) return;
    const currentPreconditions = test.preconditions || [];
    const updatedPreconditions = [...currentPreconditions, newPre];
    try {
      const updated = await window.electron.updateTest(test.id, {
        preconditions: updatedPreconditions,
      });
      setTest(updated);
      setIsCreatingPrecondition(false);
      resetPreconditionForm();
    } catch (error) {
      console.error("Failed to save precondition:", error);
    }
  };

  const handleDeletePrecondition = async (preId: string) => {
    if (!test) return;
    const updatedPreconditions = (test.preconditions || []).filter((p) => p.id !== preId);
    try {
      const updated = await window.electron.updateTest(test.id, {
        preconditions: updatedPreconditions,
      });
      setTest(updated);
    } catch (error) {
      console.error("Failed to delete precondition:", error);
    }
  };

  const handleMovePrecondition = async (index: number, direction: "up" | "down") => {
    if (!test || !test.preconditions) return;
    const items = [...test.preconditions];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= items.length) return;

    const temp = items[index];
    items[index] = items[targetIdx];
    items[targetIdx] = temp;

    try {
      const updated = await window.electron.updateTest(test.id, {
        preconditions: items,
      });
      setTest(updated);
    } catch (error) {
      console.error("Failed to reorder preconditions:", error);
    }
  };

  const handleToggleCaptureSession = async (checked: boolean) => {
    if (!test) return;
    try {
      const updated = await window.electron.updateTest(test.id, {
        captureSessionOnSuccess: checked,
      });
      setTest(updated);
    } catch (error) {
      console.error("Failed to update session capture setting:", error);
    }
  };

  const handleSetSavedAuthProfileId = async (profileId: string) => {
    if (!test) return;
    try {
      const updated = await window.electron.updateTest(test.id, {
        savedAuthProfileId: profileId,
      });
      setTest(updated);
    } catch (error) {
      console.error("Failed to update saved auth profile ID:", error);
    }
  };

  const handleCreateAuthProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!test || !newProfileName.trim()) return;
    try {
      const newProf = await window.electron.createAuthProfile({
        appId: test.appId,
        name: newProfileName.trim(),
        description: newProfileDesc.trim() || undefined,
        sourceTestId: newProfileSourceTestId || test.id,
      });
      setAuthProfiles([...authProfiles, newProf]);
      setSelectedAuthProfileId(newProf.id);
      setIsCreatingAuthProfile(false);
      setNewProfileName("");
      setNewProfileDesc("");
      setNewProfileSourceTestId("");
    } catch (error) {
      console.error("Failed to create auth profile:", error);
    }
  };

  const resetPreconditionForm = () => {
    setPreconditionType("test_dependency");
    setPrereqTestId(siblingTests[0]?.id || "");
    setPrereqExecMode("auto");
    setPrereqShareSession(true);
    setPrereqStopOnFailure(true);
    setStorageSource("auth_profile");
    setSelectedAuthProfileId(authProfiles[0]?.id || "");
    setStorageOnMissing("run_fallback_test");
    setStorageFallbackTestId(siblingTests[0]?.id || "");
    setDirectCookies([]);
    setCookieName("");
    setCookieValue("");
    setCookieDomain("");
    setSelectedVarNames([]);
    setVarOnMissing("run_acquisition_test");
    setVarAcqTestId(siblingTests[0]?.id || "");
  };

  const testVars = test ? allVars.filter(v => v.testId === test.id) : [];
  const appVars = test ? allVars.filter(v => v.appId === test.appId && !v.testId) : [];
  const testVarNames = new Set(testVars.map(v => v.name));

  const scopedVars = [
    ...testVars.map(v => ({ ...v, scope: "test" as const, active: true, overridden: false })),
    ...appVars.map(v => {
      const isOverridden = testVarNames.has(v.name);
      return {
        ...v,
        scope: "application" as const,
        active: !isOverridden,
        overridden: isOverridden
      };
    })
  ].sort((a, b) => a.name.localeCompare(b.name));

  if (isLoading)
    return (
      <div className="flex-1 flex items-center justify-center bg-surface text-on-surface">
        Loading...
      </div>
    );
  if (!test)
    return (
      <div className="flex-1 flex items-center justify-center bg-surface text-on-surface">
        Test not found
      </div>
    );

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-surface">
      {/* Header */}
      <div className="px-10 py-8 border-b border-on-surface/5 bg-surface-low/30 shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(`/applications/${test.appId}`)}
              className="p-2 hover:bg-on-surface/5 rounded-full text-on-surface/40 transition-colors"
            >
              <Icons.ChevronLeft />
            </button>
            <div>
              <h1 className="text-3xl font-black font-display tracking-tight text-on-surface">
                {test.name}
              </h1>
              <p className="text-on-surface/40 text-sm font-medium mt-1">
                Test Specification & Preconditions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleDelete}
              className="p-3 text-on-surface/20 hover:text-red-500 hover:bg-red-500/5 rounded-lg transition-all"
              title="Delete Test"
            >
              <Icons.Trash />
            </button>
            {test.lastRunPath && (
              <button
                onClick={handleReplay}
                className="bg-surface-low text-primary border border-primary/20 px-6 py-3 rounded-lg font-bold text-sm shadow-sm hover:bg-primary/5 transition-all active:scale-95 flex items-center gap-3"
              >
                <Icons.Play /> Replay Last Run
              </button>
            )}
            <button
              onClick={handleRun}
              className="bg-primary text-white px-8 py-3 rounded-lg font-bold text-sm shadow-premium hover:opacity-90 transition-all active:scale-95 flex items-center gap-3"
            >
              <Icons.Lightning /> Run Agent
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-10 bg-surface-low/10 border-b border-on-surface/5 shrink-0">
        <div className="max-w-6xl mx-auto flex gap-8">
          {[
            { id: "settings", label: "Settings", icon: <Icons.Monitor /> },
            {
              id: "preconditions",
              label: `Preconditions ${(test.preconditions?.length || 0) > 0 ? `(${test.preconditions!.length})` : ""}`,
              icon: <Icons.Layers />,
            },
            {
              id: "variables",
              label: "Variables",
              icon: <Icons.Dashboard />,
            },
            {
              id: "report",
              label: "Last Report",
              icon: <Icons.TestSuites />,
              disabled: !test.lastRunPath,
            },
            {
              id: "script",
              label: "Serialized Script",
              icon: <Icons.Code />,
              disabled: !test.lastRunPath,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              disabled={tab.disabled}
              onClick={() => setViewMode(tab.id as any)}
              className={`flex items-center gap-2 py-4 border-b-2 transition-all font-bold text-sm ${
                viewMode === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-on-surface/40 hover:text-on-surface disabled:opacity-20"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-10 py-10">
        <div className="max-w-6xl mx-auto">
          {viewMode === "settings" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              <div className="lg:col-span-2 space-y-8">
                {isEditing ? (
                  <form
                    onSubmit={handleUpdate}
                    className="space-y-6 bg-surface-low p-8 rounded-2xl border border-on-surface/10 shadow-sm"
                  >
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">
                        Test Name
                      </label>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">
                        Start URL
                      </label>
                      <AutocompleteInput
                        value={editUrl}
                        onChange={setEditUrl}
                        suggestions={urlSuggestions}
                        placeholder="https://example.com"
                        className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors font-mono text-sm"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">
                        Model Tag (Backend)
                      </label>
                      <select
                        value={editModel}
                        onChange={(e) => setEditModel(e.target.value)}
                        className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors text-on-surface font-medium"
                      >
                        {models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">
                        Current Model
                      </label>
                      <p className="font-medium text-on-surface">
                        {models.find((m) => m.id === test.model)?.name ||
                          test.model}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">
                        Requirement / Instruction
                      </label>
                      <textarea
                        value={editRequirement}
                        onChange={(e) => setEditRequirement(e.target.value)}
                        rows={6}
                        className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors resize-none"
                      />
                    </div>
                    <div className="flex gap-4 pt-4">
                      <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className="flex-1 py-3 font-bold text-on-surface/60 hover:bg-on-surface/5 rounded-lg"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 bg-primary text-white py-3 rounded-lg font-bold shadow-premium"
                      >
                        Save Changes
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-10">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface/30">
                          Target Environment
                        </h3>
                        <button
                          onClick={() => setIsEditing(true)}
                          className="text-primary text-xs font-bold hover:underline flex items-center gap-1"
                        >
                          <Icons.Edit /> Edit
                        </button>
                      </div>
                      <div className="p-6 bg-surface-low rounded-xl border border-on-surface/5">
                        <div className="flex items-center gap-4 text-on-surface">
                          <Icons.Monitor />
                          <span className="font-mono text-sm">{test.url}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface/30">
                        Requirement
                      </h3>
                      <div className="p-8 bg-surface-low rounded-2xl border border-on-surface/5 leading-relaxed text-lg italic text-on-surface/80">
                        "{test.requirement}"
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-8">
                <div className="bg-surface-low p-6 rounded-2xl border border-on-surface/5 space-y-6 shadow-sm">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface/30">
                    Configuration
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] font-bold text-on-surface/30 uppercase tracking-widest mb-1">
                        AI Model
                      </p>
                      <p className="text-sm font-medium text-on-surface">
                        {models.find((m) => m.id === test.model)?.name ||
                          test.model}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-on-surface/30 uppercase tracking-widest mb-1">
                        Created
                      </p>
                      <p className="text-sm font-medium text-on-surface">
                        {new Date(test.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10 space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-primary/60">
                    Last Run Info
                  </h3>
                  {test.lastRunPath ? (
                    <div className="space-y-2">
                      <p className="text-xs text-primary/80">
                        Last run generated a report and a serialized script.
                      </p>
                      <button
                        onClick={() => setViewMode("report")}
                        className="text-primary text-sm font-bold hover:underline"
                      >
                        View Report →
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-on-surface/40">
                      This test has not been executed yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {viewMode === "preconditions" && test && (
            <div className="space-y-8 animate-in fade-in duration-200">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-on-surface/5 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-on-surface/80">Test Preconditions & Dependencies</h2>
                  <p className="text-xs text-on-surface/40 mt-1">
                    Configure prerequisite tests, storage states (auth cookies / local storage), or required variables before running this test.
                  </p>
                </div>
                <button
                  onClick={() => {
                    resetPreconditionForm();
                    setIsCreatingPrecondition(true);
                  }}
                  className="bg-primary text-white px-5 py-2.5 rounded-lg font-bold text-sm shadow-premium hover:opacity-90 transition-all active:scale-95 flex items-center gap-2"
                >
                  <Icons.Plus /> Add Precondition
                </button>
              </div>

              {/* Visual Execution Flow Preview */}
              <div className="p-6 rounded-2xl bg-surface-low border border-on-surface/5 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface/40 mb-3">
                  Execution Flow Sequence
                </h3>
                <div className="flex items-center gap-3 overflow-x-auto py-2">
                  {(test.preconditions || []).map((pre, idx) => {
                    let title = "";
                    let subtitle = "";
                    let icon = <Icons.Play className="w-3.5 h-3.5 text-primary" />;

                    if (pre.type === "test_dependency") {
                      const pTest = siblingTests.find((t) => t.id === pre.prerequisiteTestId);
                      title = pTest?.name || `Prerequisite Test (${pre.prerequisiteTestId.slice(0, 8)})`;
                      subtitle = `Mode: ${pre.executionMode || "auto"}`;
                      icon = <Icons.Play className="w-3.5 h-3.5 text-blue-500" />;
                    } else if (pre.type === "storage_state") {
                      const prof = authProfiles.find((p) => p.id === pre.authProfileId);
                      title = pre.source === "auth_profile" ? `Auth Profile: ${prof?.name || "Selected"}` : "Direct Cookies / Storage";
                      subtitle = pre.onMissingOrExpired === "run_fallback_test" ? "Fallback: Auto-refresh" : "Fail if expired";
                      icon = <Icons.Lock className="w-3.5 h-3.5 text-amber-500" />;
                    } else if (pre.type === "variable") {
                      title = `Variables: ${pre.variableNames.join(", ")}`;
                      subtitle = pre.onMissingOrExpired === "run_acquisition_test" ? "Acquire if missing" : "Fail if missing";
                      icon = <Icons.Key className="w-3.5 h-3.5 text-emerald-500" />;
                    }

                    return (
                      <div key={pre.id} className="flex items-center gap-3 shrink-0">
                        <div className="bg-surface-lowest border border-on-surface/10 px-4 py-3 rounded-xl flex items-center gap-3 min-w-[200px]">
                          <div className="p-2 rounded-lg bg-on-surface/5">{icon}</div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black uppercase tracking-wider text-on-surface/40">Step {idx + 1}</span>
                            </div>
                            <p className="text-xs font-bold text-on-surface truncate max-w-[180px]">{title}</p>
                            <p className="text-[10px] text-on-surface/40">{subtitle}</p>
                          </div>
                        </div>
                        <Icons.ChevronRight className="text-on-surface/30 shrink-0" />
                      </div>
                    );
                  })}

                  {/* Target Test */}
                  <div className="bg-primary/10 border border-primary/30 px-5 py-3 rounded-xl flex items-center gap-3 shrink-0">
                    <div className="p-2 rounded-lg bg-primary text-white">
                      <Icons.Lightning className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-primary">Target Test</span>
                      <p className="text-xs font-black text-on-surface truncate max-w-[200px]">{test.name}</p>
                      <p className="text-[10px] text-primary/70">Final Goal Execution</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Preconditions List */}
              {(test.preconditions || []).length === 0 ? (
                <div className="text-center py-16 bg-surface-low border border-dashed border-on-surface/10 rounded-2xl space-y-4">
                  <div className="w-12 h-12 rounded-full bg-on-surface/5 flex items-center justify-center mx-auto text-on-surface/30">
                    <Icons.Layers className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-bold text-on-surface/50">No Preconditions Defined</p>
                    <p className="text-xs text-on-surface/40 mt-1 max-w-md mx-auto">
                      This test runs in isolation with a clean browser session. Add a prerequisite test (e.g. login or record creation) or inject saved authentication state.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      resetPreconditionForm();
                      setIsCreatingPrecondition(true);
                    }}
                    className="bg-primary/10 text-primary hover:bg-primary/20 px-4 py-2 rounded-lg font-bold text-xs transition-colors"
                  >
                    + Add Your First Precondition
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {(test.preconditions || []).map((pre, index) => {
                    const isFirst = index === 0;
                    const isLast = index === (test.preconditions?.length || 0) - 1;

                    return (
                      <div
                        key={pre.id}
                        className="bg-surface-low border border-on-surface/5 hover:border-on-surface/15 rounded-xl p-5 flex items-center justify-between shadow-sm transition-all"
                      >
                        <div className="flex items-start gap-4">
                          <div className="p-3 rounded-xl bg-surface-lowest border border-on-surface/5 text-on-surface/60">
                            {pre.type === "test_dependency" && <Icons.Play className="w-5 h-5 text-blue-500" />}
                            {pre.type === "storage_state" && <Icons.Lock className="w-5 h-5 text-amber-500" />}
                            {pre.type === "variable" && <Icons.Key className="w-5 h-5 text-emerald-500" />}
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-black text-on-surface/40">#{index + 1}</span>
                              <span
                                className={`text-[10px] uppercase font-black px-2 py-0.5 rounded tracking-wider ${
                                  pre.type === "test_dependency"
                                    ? "bg-blue-500/10 text-blue-500"
                                    : pre.type === "storage_state"
                                      ? "bg-amber-500/10 text-amber-500"
                                      : "bg-emerald-500/10 text-emerald-500"
                                }`}
                              >
                                {pre.type.replace("_", " ")}
                              </span>
                              {pre.type === "test_dependency" && pre.stopOnFailure !== false && (
                                <span className="text-[10px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded font-bold">
                                  Stop on Failure
                                </span>
                              )}
                            </div>

                            {pre.type === "test_dependency" && (
                              <div>
                                <h4 className="text-sm font-bold text-on-surface">
                                  Run Test: {siblingTests.find((t) => t.id === pre.prerequisiteTestId)?.name || pre.prerequisiteTestId}
                                </h4>
                                <p className="text-xs text-on-surface/40">
                                  Execution: <strong className="text-on-surface/60">{pre.executionMode || "auto"}</strong>
                                  {pre.shareBrowserSession !== false && " • Shares live browser context"}
                                </p>
                              </div>
                            )}

                            {pre.type === "storage_state" && (
                              <div className="space-y-1">
                                <div className="flex items-center gap-3">
                                  <h4 className="text-sm font-bold text-on-surface">
                                    {pre.source === "auth_profile"
                                      ? `Inject Auth Profile: ${authProfiles.find((p) => p.id === pre.authProfileId)?.name || "Saved Profile"}`
                                      : `Direct Cookies (${pre.cookies?.length || 0}) / Storage (${pre.localStorage?.length || 0})`}
                                  </h4>
                                  {pre.source === "auth_profile" && pre.authProfileId && (
                                    <button
                                      type="button"
                                      onClick={() => setViewingAuthProfileId(pre.authProfileId!)}
                                      className="text-xs font-bold text-primary hover:underline flex items-center gap-1 bg-primary/10 px-2 py-0.5 rounded"
                                    >
                                      <Icons.Lock className="w-3 h-3" /> Inspect Cookies & Storage
                                    </button>
                                  )}
                                </div>
                                <p className="text-xs text-on-surface/40">
                                  On Expired/Missing:{" "}
                                  <strong className="text-on-surface/60">
                                    {pre.onMissingOrExpired === "run_fallback_test"
                                      ? `Trigger fallback test (${siblingTests.find((t) => t.id === pre.fallbackTestId)?.name || "Login"})`
                                      : "Fail immediately"}
                                  </strong>
                                </p>
                              </div>
                            )}

                            {pre.type === "variable" && (
                              <div>
                                <h4 className="text-sm font-bold text-on-surface">
                                  Require Variables: <span className="font-mono text-primary font-bold">{pre.variableNames.join(", ")}</span>
                                </h4>
                                <p className="text-xs text-on-surface/40">
                                  On Missing/Expired:{" "}
                                  <strong className="text-on-surface/60">
                                    {pre.onMissingOrExpired === "run_acquisition_test"
                                      ? `Run generator test (${siblingTests.find((t) => t.id === pre.acquisitionTestId)?.name || "Creator"})`
                                      : "Fail immediately"}
                                  </strong>
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            disabled={isFirst}
                            onClick={() => handleMovePrecondition(index, "up")}
                            className="p-2 text-on-surface/30 hover:text-on-surface disabled:opacity-20 hover:bg-on-surface/5 rounded-lg transition-all"
                            title="Move Up"
                          >
                            <Icons.ArrowUp />
                          </button>
                          <button
                            disabled={isLast}
                            onClick={() => handleMovePrecondition(index, "down")}
                            className="p-2 text-on-surface/30 hover:text-on-surface disabled:opacity-20 hover:bg-on-surface/5 rounded-lg transition-all"
                            title="Move Down"
                          >
                            <Icons.ArrowDown />
                          </button>
                          <button
                            onClick={() => handleDeletePrecondition(pre.id)}
                            className="p-2 text-on-surface/30 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                            title="Delete Precondition"
                          >
                            <Icons.Trash />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Session Capture Settings Card */}
              <div className="p-6 rounded-2xl bg-surface-low border border-on-surface/10 space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                      <Icons.Lock className="w-4 h-4 text-primary" /> Session Capture & Auth Profile Generator
                    </h3>
                    <p className="text-xs text-on-surface/40 mt-1 max-w-xl">
                      Automatically snapshot authentication cookies and local storage when this test completes successfully. This allows other tests to use this test's authenticated session as an instant precondition.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={test.captureSessionOnSuccess || false}
                      onChange={(e) => handleToggleCaptureSession(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-surface-lowest border border-on-surface/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                {test.captureSessionOnSuccess && (
                  <div className="pt-4 border-t border-on-surface/5 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">
                        Link to Saved Auth Profile
                      </label>
                      <select
                        value={test.savedAuthProfileId || ""}
                        onChange={(e) => handleSetSavedAuthProfileId(e.target.value)}
                        className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-2.5 outline-none focus:border-primary text-on-surface font-medium text-sm"
                      >
                        <option value="">-- Do not link (save as test snapshot only) --</option>
                        {authProfiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.updatedAt ? `(Updated: ${new Date(p.updatedAt).toLocaleTimeString()})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          setNewProfileName(`${test.name} Session`);
                          setNewProfileSourceTestId(test.id);
                          setIsCreatingAuthProfile(true);
                        }}
                        className="text-xs text-primary font-bold hover:underline flex items-center gap-1 mt-6"
                      >
                        <Icons.Plus className="w-3.5 h-3.5" /> Create New Auth Profile for this Test
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {viewMode === "report" && (
            <div className="bg-surface-low p-10 rounded-2xl border border-on-surface/5 shadow-sm min-h-[600px]">
              <MarkdownRenderer
                content={reportContent}
                basePath={
                  test.lastRunPath
                    ? test.lastRunPath.split("/").slice(0, -1).join("/")
                    : undefined
                }
              />
            </div>
          )}

          {viewMode === "script" && (
            <div className="bg-surface-lowest p-8 rounded-2xl border border-on-surface/10 shadow-inner font-mono text-xs overflow-x-auto whitespace-pre">
              {scriptContent}
            </div>
          )}

          {viewMode === "variables" && test && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-on-surface/5 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-on-surface/60">Scoped Variables</h2>
                  <p className="text-xs text-on-surface/40 mt-1">
                    Variables available to the Form Filling Agent during execution of this test. Scoped test variables override application variables of the same name.
                  </p>
                </div>
                <button
                  onClick={() => setIsCreatingVariable(true)}
                  className="bg-primary text-white px-5 py-2.5 rounded-lg font-bold text-sm shadow-premium hover:opacity-90 transition-all active:scale-95 flex items-center gap-2"
                >
                  <Icons.Plus /> Add Scoped Variable
                </button>
              </div>

              {scopedVars.length === 0 ? (
                <div className="text-center py-20 bg-surface-low border border-dashed border-on-surface/10 rounded-2xl">
                  <div className="max-w-md mx-auto space-y-4">
                    <div className="w-12 h-12 rounded-full bg-on-surface/5 flex items-center justify-center mx-auto text-on-surface/30">
                      <Icons.Dashboard />
                    </div>
                    <p className="font-bold text-on-surface/40">No scoped variables in this test</p>
                    <p className="text-xs text-on-surface/30">
                      Declare variables scoped specifically to this test, or add application-wide variables under the application details tab to inherit them.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {scopedVars.map(v => (
                    <div 
                      key={v.id} 
                      className={`group p-6 rounded-xl border flex flex-col justify-between shadow-sm transition-all ${
                        v.overridden 
                          ? "bg-surface-low/50 border-on-surface/5 opacity-60" 
                          : "bg-surface-low border-on-surface/5 hover:border-primary/45"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-mono font-bold px-2.5 py-1 rounded text-sm ${v.overridden ? "bg-on-surface/5 text-on-surface/30 line-through" : "bg-primary/10 text-primary"}`}>
                              {v.name}
                            </span>
                            <span className="text-[10px] bg-on-surface/5 text-on-surface/60 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                              {v.type}
                            </span>
                            {v.scope === "test" ? (
                              <span className="text-[10px] bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full font-bold">
                                Test Scope
                              </span>
                            ) : v.overridden ? (
                              <span className="text-[10px] bg-on-surface/5 text-on-surface/35 px-2 py-0.5 rounded-full font-bold">
                                App Scope (Overridden)
                              </span>
                            ) : (
                              <span className="text-[10px] bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full font-bold">
                                App Scope (Inherited)
                              </span>
                            )}
                          </div>
                          
                          {v.scope === "test" && (
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditVariable(v);
                                }}
                                className="p-1 text-on-surface/40 hover:text-primary transition-colors"
                                title="Edit Variable"
                              >
                                <Icons.Edit />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteVariable(v.id);
                                }}
                                className="p-1 text-on-surface/40 hover:text-red-500 transition-colors"
                                title="Delete Variable"
                              >
                                <Icons.Trash />
                              </button>
                            </div>
                          )}
                          {v.scope === "application" && !v.overridden && (
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOverrideVariable(v);
                                }}
                                className="text-xs text-primary font-bold hover:underline flex items-center gap-1"
                                title="Override this variable for this test"
                              >
                                <Icons.Plus className="w-3 h-3" /> Override
                              </button>
                            </div>
                          )}
                        </div>
                        
                        <div className="mb-4">
                          <p className="text-[10px] font-bold text-on-surface/30 uppercase tracking-widest mb-1">Value</p>
                          <p className={`font-mono text-sm p-3 rounded-lg border border-on-surface/5 break-all max-h-32 overflow-y-auto ${v.overridden ? "bg-on-surface/5 text-on-surface/20 line-through" : "bg-surface-lowest text-on-surface"}`}>
                            {v.type === "secret" ? "••••••••••••••••" : v.value}
                          </p>
                        </div>
                        
                        {v.purpose && (
                          <p className={`text-xs font-medium mb-1 ${v.overridden ? "text-on-surface/30" : "text-on-surface/60"}`}>
                            <span className="text-on-surface/30 font-bold uppercase text-[9px] tracking-wider block mb-0.5">Purpose</span>
                            {v.purpose}
                          </p>
                        )}
                        
                        {v.expiry && (
                          <p className={`text-xs italic mt-2 ${v.overridden ? "text-on-surface/20" : "text-on-surface/50"}`}>
                            <strong>Expiry:</strong> {formatExpiry(v.expiry)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isCreatingVariable && test && (
            <div className="fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
              <div 
                className="absolute inset-0" 
                onClick={() => {
                  setIsCreatingVariable(false);
                  resetVarForm();
                }}
              />
              <div className="relative w-full max-w-xl bg-surface-low border border-on-surface/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-8 border-b border-on-surface/5">
                  <h2 className="text-2xl font-bold font-display tracking-tight border-b border-on-surface/5 pb-2">
                    {editingVariable ? "Edit Variable" : "Declare Scoped Variable"}
                  </h2>
                  <p className="text-on-surface/40 text-sm mt-1">
                    {editingVariable ? `Updating variable '${editingVariable.name}'` : `Save a variable scoped specifically to the test "${test.name}"`}
                  </p>
                </div>
                
                <form onSubmit={handleSaveVariable} className="p-8 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Variable Name</label>
                      <input 
                        autoFocus
                        required
                        disabled={!!editingVariable}
                        value={varName}
                        onChange={e => setVarName(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").toUpperCase())}
                        placeholder="e.g. CUSTOMER_ID"
                        className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors text-on-surface font-mono font-bold text-sm disabled:opacity-50"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Data Type</label>
                      <select 
                        value={varType}
                        onChange={e => setVarType(e.target.value as any)}
                        className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors text-on-surface font-medium"
                      >
                        <option value="string">String (Text)</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                        <option value="secret">Secret (Obfuscated)</option>
                        <option value="json">JSON</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Value</label>
                    <textarea 
                      required
                      value={varValue}
                      onChange={e => setVarValue(e.target.value)}
                      placeholder={varType === "json" ? '{\n  "key": "value"\n}' : "Enter variable value..."}
                      rows={3}
                      className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors text-on-surface font-mono text-sm resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Purpose / Description</label>
                    <input 
                      required
                      value={varPurpose}
                      onChange={e => setVarPurpose(e.target.value)}
                      placeholder="e.g. Account email used to login"
                      className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors text-on-surface font-medium"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Expiry Date & Time (Optional)</label>
                    <input 
                      type="datetime-local"
                      value={varExpiry}
                      onChange={e => setVarExpiry(e.target.value)}
                      className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors text-on-surface font-medium"
                    />
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button 
                        type="button" 
                        onClick={() => {
                          const d = new Date();
                          d.setMinutes(d.getMinutes() + 5);
                          setVarExpiry(formatDatetimeLocal(d));
                        }}
                        className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-on-surface/5 hover:bg-on-surface/10 text-on-surface/60 rounded-md border border-on-surface/10 transition-colors"
                      >
                        +5 mins
                      </button>
                      <button 
                        type="button" 
                        onClick={() => {
                          const d = new Date();
                          d.setHours(d.getHours() + 2);
                          setVarExpiry(formatDatetimeLocal(d));
                        }}
                        className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-on-surface/5 hover:bg-on-surface/10 text-on-surface/60 rounded-md border border-on-surface/10 transition-colors"
                      >
                        +2 hrs
                      </button>
                      <button 
                        type="button" 
                        onClick={() => {
                          const d = new Date();
                          d.setDate(d.getDate() + 1);
                          setVarExpiry(formatDatetimeLocal(d));
                        }}
                        className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-on-surface/5 hover:bg-on-surface/10 text-on-surface/60 rounded-md border border-on-surface/10 transition-colors"
                      >
                        +1 day
                      </button>
                      <button 
                        type="button" 
                        onClick={() => {
                          const d = new Date();
                          d.setDate(d.getDate() + 7);
                          setVarExpiry(formatDatetimeLocal(d));
                        }}
                        className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-on-surface/5 hover:bg-on-surface/10 text-on-surface/60 rounded-md border border-on-surface/10 transition-colors"
                      >
                        +7 days
                      </button>
                      {varExpiry && (
                        <button 
                          type="button" 
                          onClick={() => setVarExpiry("")}
                          className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-red-500/10 hover:bg-red-500/20 text-red-600 rounded-md border border-red-500/10 transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button 
                      type="button"
                      onClick={() => {
                        setIsCreatingVariable(false);
                        resetVarForm();
                      }}
                      className="flex-1 px-6 py-3 rounded-lg font-bold text-sm text-on-surface/60 hover:bg-on-surface/5 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      disabled={!varName.trim() || !varValue.trim() || !varPurpose.trim()}
                      className="flex-1 bg-primary text-white px-6 py-3 rounded-lg font-bold text-sm shadow-premium hover:opacity-90 transition-all disabled:opacity-50"
                    >
                      {editingVariable ? "Save Changes" : "Declare Scoped Variable"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
          {/* Create Precondition Modal */}
          {isCreatingPrecondition && test && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
              <div
                className="absolute inset-0"
                onClick={() => {
                  setIsCreatingPrecondition(false);
                  resetPreconditionForm();
                }}
              />
              <div className="relative w-full max-w-2xl bg-surface-low border border-on-surface/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-on-surface/5 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold font-display text-on-surface">Add Test Precondition</h2>
                    <p className="text-xs text-on-surface/40 mt-0.5">
                      Define prerequisites that must execute or validate before "{test.name}"
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setIsCreatingPrecondition(false);
                      resetPreconditionForm();
                    }}
                    className="p-2 text-on-surface/40 hover:text-on-surface rounded-lg"
                  >
                    <Icons.Close />
                  </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6 flex-1">
                  {/* Precondition Type Selector */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      {
                        type: "test_dependency" as PreconditionType,
                        title: "Prerequisite Test",
                        desc: "Run another test first (e.g. Create Record)",
                        icon: <Icons.Play className="w-4 h-4 text-blue-500" />,
                      },
                      {
                        type: "storage_state" as PreconditionType,
                        title: "Auth / Storage State",
                        desc: "Inject cookies & tokens (e.g. Login profile)",
                        icon: <Icons.Lock className="w-4 h-4 text-amber-500" />,
                      },
                      {
                        type: "variable" as PreconditionType,
                        title: "Required Variables",
                        desc: "Assert runtime variables are present",
                        icon: <Icons.Key className="w-4 h-4 text-emerald-500" />,
                      },
                    ].map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => setPreconditionType(item.type)}
                        className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between gap-2 ${
                          preconditionType === item.type
                            ? "bg-primary/10 border-primary shadow-sm"
                            : "bg-surface-lowest border-on-surface/10 hover:border-on-surface/20"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {item.icon}
                          <span className="text-xs font-bold text-on-surface">{item.title}</span>
                        </div>
                        <p className="text-[11px] text-on-surface/40 leading-tight">{item.desc}</p>
                      </button>
                    ))}
                  </div>

                  {/* Form for test_dependency */}
                  {preconditionType === "test_dependency" && (
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">
                          Select Prerequisite Test
                        </label>
                        {siblingTests.length === 0 ? (
                          <p className="text-xs text-amber-500 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                            No other tests found in this application. Create another test first to link as a prerequisite.
                          </p>
                        ) : (
                          <select
                            value={prereqTestId}
                            onChange={(e) => setPrereqTestId(e.target.value)}
                            className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary text-on-surface font-medium text-sm"
                          >
                            <option value="">-- Choose a test --</option>
                            {siblingTests.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name} ({t.url})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">
                            Execution Mode
                          </label>
                          <select
                            value={prereqExecMode}
                            onChange={(e) => setPrereqExecMode(e.target.value as any)}
                            className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary text-on-surface font-medium text-sm"
                          >
                            <option value="auto">Auto (Fast Replay if recorded, else AI Agent)</option>
                            <option value="replay_only">Replay Only (Deterministic)</option>
                            <option value="agent_only">AI Agent Only (Full Exploration)</option>
                          </select>
                        </div>

                        <div className="space-y-3 pt-6">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={prereqStopOnFailure}
                              onChange={(e) => setPrereqStopOnFailure(e.target.checked)}
                              className="rounded border-on-surface/20 text-primary focus:ring-primary h-4 w-4"
                            />
                            <span className="text-xs font-bold text-on-surface">Stop target test if prerequisite fails</span>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={prereqShareSession}
                              onChange={(e) => setPrereqShareSession(e.target.checked)}
                              className="rounded border-on-surface/20 text-primary focus:ring-primary h-4 w-4"
                            />
                            <span className="text-xs font-bold text-on-surface">Share active live browser session</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Form for storage_state */}
                  {preconditionType === "storage_state" && (
                    <div className="space-y-4 pt-2">
                      <div className="flex gap-4 border-b border-on-surface/5 pb-3">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-on-surface">
                          <input
                            type="radio"
                            name="storageSource"
                            checked={storageSource === "auth_profile"}
                            onChange={() => setStorageSource("auth_profile")}
                          />
                          Use Saved Auth Profile
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-on-surface">
                          <input
                            type="radio"
                            name="storageSource"
                            checked={storageSource === "direct"}
                            onChange={() => setStorageSource("direct")}
                          />
                          Direct Cookies / Storage
                        </label>
                      </div>

                      {storageSource === "auth_profile" && (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">
                                Auth Profile
                              </label>
                              <button
                                type="button"
                                onClick={() => setIsCreatingAuthProfile(true)}
                                className="text-xs text-primary font-bold hover:underline flex items-center gap-1"
                              >
                                <Icons.Plus className="w-3.5 h-3.5" /> New Profile
                              </button>
                            </div>
                            <select
                              value={selectedAuthProfileId}
                              onChange={(e) => setSelectedAuthProfileId(e.target.value)}
                              className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary text-on-surface font-medium text-sm"
                            >
                              <option value="">-- Select Auth Profile --</option>
                              {authProfiles.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} {p.updatedAt ? `(Updated: ${new Date(p.updatedAt).toLocaleDateString()})` : "(Not populated)"}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="p-4 rounded-xl bg-surface-lowest border border-on-surface/5 space-y-3">
                            <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40 block">
                              If State is Missing or Expired
                            </label>
                            <div className="grid grid-cols-2 gap-4">
                              <select
                                value={storageOnMissing}
                                onChange={(e) => setStorageOnMissing(e.target.value as any)}
                                className="w-full bg-surface-low border border-on-surface/10 rounded-lg px-3 py-2 text-xs font-medium text-on-surface"
                              >
                                <option value="run_fallback_test">Auto-run Fallback Test (Login)</option>
                                <option value="fail">Fail test immediately</option>
                              </select>

                              {storageOnMissing === "run_fallback_test" && (
                                <select
                                  value={storageFallbackTestId}
                                  onChange={(e) => setStorageFallbackTestId(e.target.value)}
                                  className="w-full bg-surface-low border border-on-surface/10 rounded-lg px-3 py-2 text-xs font-medium text-on-surface"
                                >
                                  <option value="">-- Choose Fallback Test --</option>
                                  {siblingTests.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {storageSource === "direct" && (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">
                              Add Cookie Pair
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                              <input
                                placeholder="Cookie Name (e.g. auth_token)"
                                value={cookieName}
                                onChange={(e) => setCookieName(e.target.value)}
                                className="bg-surface-lowest border border-on-surface/10 rounded-lg px-3 py-2 text-xs text-on-surface"
                              />
                              <input
                                placeholder="Value"
                                value={cookieValue}
                                onChange={(e) => setCookieValue(e.target.value)}
                                className="bg-surface-lowest border border-on-surface/10 rounded-lg px-3 py-2 text-xs text-on-surface"
                              />
                              <div className="flex gap-2">
                                <input
                                  placeholder="Domain (optional)"
                                  value={cookieDomain}
                                  onChange={(e) => setCookieDomain(e.target.value)}
                                  className="bg-surface-lowest border border-on-surface/10 rounded-lg px-3 py-2 text-xs text-on-surface flex-1"
                                />
                                <button
                                  type="button"
                                  disabled={!cookieName.trim() || !cookieValue.trim()}
                                  onClick={() => {
                                    setDirectCookies([
                                      ...directCookies,
                                      {
                                        name: cookieName.trim(),
                                        value: cookieValue.trim(),
                                        domain: cookieDomain.trim() || undefined,
                                      },
                                    ]);
                                    setCookieName("");
                                    setCookieValue("");
                                    setCookieDomain("");
                                  }}
                                  className="bg-primary text-white px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
                                >
                                  Add
                                </button>
                              </div>
                            </div>
                          </div>

                          {directCookies.length > 0 && (
                            <div className="space-y-2">
                              <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">
                                Configured Cookies ({directCookies.length})
                              </label>
                              <div className="space-y-1 max-h-36 overflow-y-auto">
                                {directCookies.map((c, i) => (
                                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-surface-lowest text-xs font-mono">
                                    <span>
                                      <strong>{c.name}</strong>={c.value} {c.domain ? `(${c.domain})` : ""}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setDirectCookies(directCookies.filter((_, idx) => idx !== i))}
                                      className="text-red-500 hover:opacity-80"
                                    >
                                      <Icons.Trash className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Form for variable */}
                  {preconditionType === "variable" && (
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">
                          Select Required Variables
                        </label>
                        {allVars.length === 0 ? (
                          <p className="text-xs text-amber-500 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                            No variables declared in this application yet.
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-surface-lowest rounded-xl border border-on-surface/10">
                            {allVars.map((v) => {
                              const isSelected = selectedVarNames.includes(v.name);
                              return (
                                <button
                                  key={v.id}
                                  type="button"
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedVarNames(selectedVarNames.filter((n) => n !== v.name));
                                    } else {
                                      setSelectedVarNames([...selectedVarNames, v.name]);
                                    }
                                  }}
                                  className={`p-2.5 rounded-lg text-left text-xs font-mono flex items-center justify-between border transition-all ${
                                    isSelected
                                      ? "bg-primary/10 border-primary text-primary font-bold"
                                      : "bg-surface-low border-on-surface/5 text-on-surface hover:border-on-surface/20"
                                  }`}
                                >
                                  <span>{v.name}</span>
                                  <span className="text-[10px] uppercase font-bold text-on-surface/40">{v.type}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="p-4 rounded-xl bg-surface-lowest border border-on-surface/5 space-y-3">
                        <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40 block">
                          If Variable is Missing or Expired
                        </label>
                        <div className="grid grid-cols-2 gap-4">
                          <select
                            value={varOnMissing}
                            onChange={(e) => setVarOnMissing(e.target.value as any)}
                            className="w-full bg-surface-low border border-on-surface/10 rounded-lg px-3 py-2 text-xs font-medium text-on-surface"
                          >
                            <option value="run_acquisition_test">Auto-run Generator Test</option>
                            <option value="fail">Fail test immediately</option>
                          </select>

                          {varOnMissing === "run_acquisition_test" && (
                            <select
                              value={varAcqTestId}
                              onChange={(e) => setVarAcqTestId(e.target.value)}
                              className="w-full bg-surface-low border border-on-surface/10 rounded-lg px-3 py-2 text-xs font-medium text-on-surface"
                            >
                              <option value="">-- Choose Generator Test --</option>
                              {siblingTests.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-6 border-t border-on-surface/5 flex gap-4 bg-surface-low/50">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingPrecondition(false);
                      resetPreconditionForm();
                    }}
                    className="flex-1 py-3 font-bold text-sm text-on-surface/60 hover:bg-on-surface/5 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={
                      (preconditionType === "test_dependency" && !prereqTestId) ||
                      (preconditionType === "storage_state" && storageSource === "auth_profile" && !selectedAuthProfileId) ||
                      (preconditionType === "storage_state" && storageSource === "direct" && directCookies.length === 0) ||
                      (preconditionType === "variable" && selectedVarNames.length === 0)
                    }
                    onClick={() => {
                      const id = `pre-${Date.now()}`;
                      if (preconditionType === "test_dependency") {
                        handleSavePrecondition({
                          id,
                          type: "test_dependency",
                          prerequisiteTestId: prereqTestId,
                          executionMode: prereqExecMode,
                          shareBrowserSession: prereqShareSession,
                          stopOnFailure: prereqStopOnFailure,
                          passVariables: true,
                        });
                      } else if (preconditionType === "storage_state") {
                        handleSavePrecondition({
                          id,
                          type: "storage_state",
                          source: storageSource,
                          authProfileId: storageSource === "auth_profile" ? selectedAuthProfileId : undefined,
                          cookies: storageSource === "direct" ? directCookies : undefined,
                          onMissingOrExpired: storageOnMissing,
                          fallbackTestId: storageFallbackTestId || undefined,
                        });
                      } else if (preconditionType === "variable") {
                        handleSavePrecondition({
                          id,
                          type: "variable",
                          variableNames: selectedVarNames,
                          onMissingOrExpired: varOnMissing,
                          acquisitionTestId: varAcqTestId || undefined,
                        });
                      }
                    }}
                    className="flex-1 bg-primary text-white py-3 rounded-xl font-bold text-sm shadow-premium hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    Add Precondition
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Create Auth Profile Modal */}
          {isCreatingAuthProfile && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
              <div className="absolute inset-0" onClick={() => setIsCreatingAuthProfile(false)} />
              <div className="relative w-full max-w-md bg-surface-low border border-on-surface/10 rounded-2xl shadow-2xl p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-on-surface">Create Auth Profile</h3>
                  <p className="text-xs text-on-surface/40 mt-0.5">
                    Save a named authentication session snapshot profile for this application.
                  </p>
                </div>

                <form onSubmit={handleCreateAuthProfile} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Profile Name</label>
                    <input
                      required
                      autoFocus
                      placeholder="e.g. Admin User, Verified Customer"
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                      className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-2.5 outline-none focus:border-primary text-on-surface font-medium text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Description (Optional)</label>
                    <input
                      placeholder="e.g. Default admin session with dashboard permissions"
                      value={newProfileDesc}
                      onChange={(e) => setNewProfileDesc(e.target.value)}
                      className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-2.5 outline-none focus:border-primary text-on-surface text-sm"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsCreatingAuthProfile(false)}
                      className="flex-1 py-2.5 font-bold text-xs text-on-surface/60 hover:bg-on-surface/5 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newProfileName.trim()}
                      className="flex-1 bg-primary text-white py-2.5 rounded-lg font-bold text-xs shadow-premium hover:opacity-90 disabled:opacity-50"
                    >
                      Create Profile
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {viewingAuthProfileId && (
            <AuthProfileViewer
              profileId={viewingAuthProfileId}
              onClose={() => setViewingAuthProfileId(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

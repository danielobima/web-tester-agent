import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Icons } from "../components/ui/Icons";
import { MarkdownRenderer } from "../components/ui/MarkdownRenderer";
import { AutocompleteInput } from "../components/ui/AutocompleteInput";

interface Test {
  id: string;
  appId: string;
  name: string;
  url: string;
  requirement: string;
  model: string;
  createdAt: number;
  lastRunPath?: string;
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
  const [viewMode, setViewMode] = useState<"settings" | "report" | "script" | "variables">(
    "settings",
  );
  const [reportContent, setReportContent] = useState<string>("");
  const [scriptContent, setScriptContent] = useState<string>("");

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

  const loadTest = async () => {
    if (!testId) return;
    setIsLoading(true);
    try {
      const testData = await window.electron.getTest(testId);
      setTest(testData);
      setEditName(testData.name);
      setEditUrl(testData.url);
      setEditRequirement(testData.requirement);

      // Load URL suggestions scoped to the application
      const allTests = await window.electron.listTests(testData.appId);
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
                Test Specification & Results
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
        </div>
      </div>
    </div>
  );
};

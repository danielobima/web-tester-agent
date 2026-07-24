import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Icons } from "../components/ui/Icons";

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

interface Application {
  id: string;
  name: string;
  description?: string;
}

export interface Variable {
  id: string;
  appId: string;
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

export const ApplicationDetails = () => {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const [app, setApp] = useState<Application | null>(null);
  const [tests, setTests] = useState<Test[]>([]);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<"tests" | "variables">("tests");
  
  const [models, setModels] = useState<any[]>([]);
  const [defaultModelId, setDefaultModelId] = useState("");
  
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newRequirement, setNewRequirement] = useState("");
  const [newModel, setNewModel] = useState("");

  // Variables modal and form state
  const [isCreatingVariable, setIsCreatingVariable] = useState(false);
  const [editingVariable, setEditingVariable] = useState<Variable | null>(null);
  const [varName, setVarName] = useState("");
  const [varType, setVarType] = useState<Variable["type"]>("string");
  const [varValue, setVarValue] = useState("");
  const [varPurpose, setVarPurpose] = useState("");
  const [varExpiry, setVarExpiry] = useState("");
  const [varScope, setVarScope] = useState<"application" | "test">("application");
  const [varTestId, setVarTestId] = useState("");

  const urlSuggestions = Array.from(new Set(tests.map(t => t.url).filter(Boolean)));

  const loadData = async () => {
    if (!appId) return;
    setIsLoading(true);
    try {
      const apps = await window.electron.listApplications();
      const currentApp = apps.find((a: any) => a.id === appId);
      setApp(currentApp || null);

      const testsData = await window.electron.listTests(appId);
      setTests(testsData);

      const varsData = await window.electron.listVariables(appId);
      setVariables(varsData);

      const config = await window.electron.getConfig();
      setModels(config.models);
      setDefaultModelId(config.defaultModelId || "");
      
      const defaultModelExists = config.models.some((m: any) => m.id === config.defaultModelId);
      const initialModel = defaultModelExists 
        ? config.defaultModelId 
        : (config.models[0]?.id || "");
      setNewModel(initialModel);
    } catch (error) {
      console.error("Error loading application details:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const resetVarForm = () => {
    setVarName("");
    setVarType("string");
    setVarValue("");
    setVarPurpose("");
    setVarExpiry("");
    setVarScope("application");
    setVarTestId("");
    setEditingVariable(null);
  };

  useEffect(() => {
    loadData();
  }, [appId]);

  const handleCreateTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newUrl.trim() || !newRequirement.trim()) return;

    try {
      const newTest = await window.electron.createTest({
        appId: appId!,
        name: newName,
        url: newUrl,
        requirement: newRequirement,
        model: newModel,
      });
      setTests([...tests, newTest]);
      setIsCreating(false);
      setNewName("");
      setNewUrl("");
      setNewRequirement("");
      navigate(`/tests/${newTest.id}`);
    } catch (error) {
      console.error("Failed to create test:", error);
    }
  };

  const handleCreateVariable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!varName.trim() || !varValue.trim() || !varPurpose.trim()) return;

    try {
      if (editingVariable) {
        const updated = await window.electron.updateVariable(editingVariable.id, {
          name: varName,
          type: varType,
          value: varValue,
          purpose: varPurpose,
          expiry: varExpiry ? new Date(varExpiry).toISOString() : "",
          testId: varScope === "test" ? varTestId : null,
        });
        setVariables(variables.map(v => v.id === editingVariable.id ? updated : v));
        setEditingVariable(null);
      } else {
        const newVar = await window.electron.createVariable({
          appId: appId!,
          testId: varScope === "test" ? varTestId : undefined,
          name: varName,
          type: varType,
          value: varValue,
          purpose: varPurpose,
          expiry: varExpiry ? new Date(varExpiry).toISOString() : undefined,
        });
        setVariables([...variables, newVar]);
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
    setVarScope(variable.testId ? "test" : "application");
    setVarTestId(variable.testId || "");
    setIsCreatingVariable(true);
  };

  const handleDeleteVariable = async (varId: string) => {
    if (confirm("Are you sure you want to delete this variable?")) {
      try {
        await window.electron.deleteVariable(varId);
        setVariables(variables.filter(v => v.id !== varId));
      } catch (error) {
        console.error("Failed to delete variable:", error);
      }
    }
  };

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center bg-surface text-on-surface">Loading...</div>;
  }

  if (!app) {
    return <div className="flex-1 flex items-center justify-center bg-surface text-on-surface">Application not found</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto px-10 pb-20 bg-surface">
      <div className="max-w-6xl mx-auto py-10">
        {/* Header */}
        <div className="mb-10 flex items-center gap-4">
           <button 
             onClick={() => navigate("/applications")}
             className="p-2 hover:bg-on-surface/5 rounded-full text-on-surface/40 transition-colors"
           >
             <Icons.ChevronLeft />
           </button>
           <div>
             <h1 className="text-4xl font-black font-display tracking-tight text-on-surface">{app.name}</h1>
             <p className="text-on-surface/40 mt-1 font-medium">{app.description || "Manage tests and variables for this application"}</p>
           </div>
        </div>

        {/* Tab Selection */}
        <div className="flex gap-8 mb-8 border-b border-on-surface/5">
          <button 
            onClick={() => setActiveTab("tests")}
            className={`flex items-center gap-2 py-4 border-b-2 transition-all font-bold text-sm ${
              activeTab === "tests"
                ? "border-primary text-primary"
                : "border-transparent text-on-surface/40 hover:text-on-surface"
            }`}
          >
            <Icons.TestSuites /> Tests ({tests.length})
          </button>
          <button 
            onClick={() => setActiveTab("variables")}
            className={`flex items-center gap-2 py-4 border-b-2 transition-all font-bold text-sm ${
              activeTab === "variables"
                ? "border-primary text-primary"
                : "border-transparent text-on-surface/40 hover:text-on-surface"
            }`}
          >
            <Icons.Code /> Variables ({variables.length})
          </button>
        </div>

        {/* Tab Contents: Tests */}
        {activeTab === "tests" && (
          <>
            <div className="flex items-center justify-between mb-8">
               <h2 className="text-xl font-bold text-on-surface/60">Tests ({tests.length})</h2>
               <button 
                 onClick={() => {
                   const defaultModelExists = models.some((m: any) => m.id === defaultModelId);
                   setNewModel(defaultModelExists ? defaultModelId : (models[0]?.id || ""));
                   setIsCreating(true);
                 }}
                 className="bg-primary text-white px-6 py-3 rounded-md font-bold text-sm shadow-premium hover:opacity-90 transition-all flex items-center gap-2"
               >
                 <Icons.Plus /> New Test
               </button>
            </div>

            {tests.length === 0 ? (
              <div className="h-[300px] flex flex-col items-center justify-center text-on-surface/20 bg-surface-low/30 rounded-2xl border-2 border-dashed border-on-surface/10">
                <Icons.TestSuites />
                <p className="mt-4 font-bold text-on-surface/40">No tests created yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {tests.map(test => (
                  <div 
                    key={test.id}
                    onClick={() => navigate(`/tests/${test.id}`)}
                    className="group bg-surface-low p-6 rounded-xl border border-on-surface/5 hover:border-primary/40 transition-all cursor-pointer flex items-center justify-between shadow-sm hover:shadow-premium"
                  >
                    <div className="flex items-center gap-6">
                      <div className="w-10 h-10 bg-on-surface/5 text-on-surface/40 rounded-lg flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                        <Icons.TestSuites />
                      </div>
                      <div>
                        <h3 className="font-bold text-on-surface text-lg group-hover:text-primary transition-colors">{test.name}</h3>
                        <p className="text-xs text-on-surface/40 font-mono mt-1">{test.url}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                       <div className="text-right">
                         <p className="text-[10px] font-bold text-on-surface/20 uppercase tracking-widest mb-1">Status</p>
                         <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${test.lastRunPath ? 'bg-green-500/10 text-green-500' : 'bg-on-surface/5 text-on-surface/40'}`}>
                           {test.lastRunPath ? 'Last Run Available' : 'No Runs Yet'}
                         </span>
                       </div>
                       <Icons.ChevronRight />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Tab Contents: Variables */}
        {activeTab === "variables" && (
          <>
            <div className="flex items-center justify-between mb-8">
               <h2 className="text-xl font-bold text-on-surface/60">Variables ({variables.length})</h2>
               <button 
                 onClick={() => {
                   resetVarForm();
                   setIsCreatingVariable(true);
                 }}
                 className="bg-primary text-white px-6 py-3 rounded-md font-bold text-sm shadow-premium hover:opacity-90 transition-all flex items-center gap-2"
               >
                 <Icons.Plus /> New Variable
               </button>
            </div>

            {variables.length === 0 ? (
              <div className="h-[300px] flex flex-col items-center justify-center text-on-surface/20 bg-surface-low/30 rounded-2xl border-2 border-dashed border-on-surface/10">
                <Icons.Code />
                <p className="mt-4 font-bold text-on-surface/40">No variables declared yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {variables.map(v => (
                  <div key={v.id} className="group bg-surface-low p-6 rounded-xl border border-on-surface/5 flex flex-col justify-between shadow-sm hover:border-primary/45 transition-all">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-primary bg-primary/10 px-2.5 py-1 rounded text-sm">{v.name}</span>
                          <span className="text-[10px] bg-on-surface/5 text-on-surface/60 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">{v.type}</span>
                          {v.testId ? (
                            <span className="text-[10px] bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full font-bold">
                              Test: {tests.find(t => t.id === v.testId)?.name || "Unknown"}
                            </span>
                          ) : (
                            <span className="text-[10px] bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full font-bold">
                              App-wide
                            </span>
                          )}
                        </div>
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
                      </div>
                      
                      <div className="mb-4">
                        <p className="text-[10px] font-bold text-on-surface/30 uppercase tracking-widest mb-1">Value</p>
                        <p className="font-mono text-sm text-on-surface bg-surface-lowest p-3 rounded-lg border border-on-surface/5 break-all max-h-32 overflow-y-auto">
                          {v.type === "secret" ? "••••••••••••••••" : v.value}
                        </p>
                      </div>
                      
                      {v.purpose && (
                        <p className="text-xs text-on-surface/60 font-medium mb-1">
                          <span className="text-on-surface/30 font-bold uppercase text-[9px] tracking-wider block mb-0.5">Purpose</span>
                          {v.purpose}
                        </p>
                      )}
                      
                      {v.expiry && (
                        <p className="text-xs text-on-surface/50 italic mt-2">
                          <strong>Expiry:</strong> {formatExpiry(v.expiry)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Test Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div 
            className="absolute inset-0 bg-surface-lowest/80 backdrop-blur-md"
            onClick={() => setIsCreating(false)}
          />
          <div className="relative w-full max-w-xl bg-surface-low border border-on-surface/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-on-surface/5">
              <h2 className="text-2xl font-bold font-display tracking-tight">New Test Specification</h2>
              <p className="text-on-surface/40 text-sm mt-1">Define the goal and environment for this test</p>
            </div>
            
            <form onSubmit={handleCreateTest} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Test Name</label>
                <input 
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Verify Checkout Flow"
                  className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors text-on-surface font-medium"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Start URL</label>
                <AutocompleteInput 
                  value={newUrl}
                  onChange={setNewUrl}
                  suggestions={urlSuggestions}
                  placeholder="https://example.com"
                  className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors text-on-surface font-mono text-sm"
                  type="url"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Model Tag (Backend)</label>
                <select 
                  value={newModel}
                  onChange={e => setNewModel(e.target.value)}
                  className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors text-on-surface font-medium"
                >
                  {models.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Requirement / Instruction</label>
                <textarea 
                  value={newRequirement}
                  onChange={e => setNewRequirement(e.target.value)}
                  placeholder="Explain what the agent should achieve..."
                  rows={4}
                  className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors text-on-surface font-medium resize-none"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="flex-1 px-6 py-3 rounded-lg font-bold text-sm text-on-surface/60 hover:bg-on-surface/5 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={!newName.trim() || !newUrl.trim() || !newRequirement.trim()}
                  className="flex-1 bg-primary text-white px-6 py-3 rounded-lg font-bold text-sm shadow-premium hover:opacity-90 transition-all disabled:opacity-50"
                >
                  Create Test
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create/Edit Variable Modal */}
      {isCreatingVariable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div 
            className="absolute inset-0 bg-surface-lowest/80 backdrop-blur-md"
            onClick={() => {
              setIsCreatingVariable(false);
              resetVarForm();
            }}
          />
          <div className="relative w-full max-w-xl bg-surface-low border border-on-surface/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-on-surface/5">
              <h2 className="text-2xl font-bold font-display tracking-tight border-b border-on-surface/5 pb-2">
                {editingVariable ? "Edit Variable" : "Declare New Variable"}
              </h2>
              <p className="text-on-surface/40 text-sm mt-1">
                {editingVariable ? `Updating config for '${editingVariable.name}'` : "Save data key/values securely scoped to this application"}
              </p>
            </div>
            
            <form onSubmit={handleCreateVariable} className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Variable Name</label>
                  <input 
                    autoFocus
                    required
                    disabled={!!editingVariable}
                    value={varName}
                    onChange={e => setVarName(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").toUpperCase())}
                    placeholder="e.g. USER_EMAIL"
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Scope</label>
                  <select 
                    value={varScope}
                    onChange={e => setVarScope(e.target.value as any)}
                    className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors text-on-surface font-medium"
                  >
                    <option value="application">Application-wide (Global)</option>
                    <option value="test">Test-specific</option>
                  </select>
                </div>
                {varScope === "test" && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Select Test</label>
                    <select 
                      value={varTestId}
                      required
                      onChange={e => setVarTestId(e.target.value)}
                      className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors text-on-surface font-medium"
                    >
                      <option value="">-- Choose a Test --</option>
                      {tests.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}
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
                  {editingVariable ? "Save Changes" : "Declare Variable"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

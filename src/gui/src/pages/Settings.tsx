import { useState, useEffect } from "react";
import { Icons } from "../components/ui/Icons";

interface ModelConfig {
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

interface AppConfig {
  models: ModelConfig[];
  defaultModelId?: string;
  requirePlanApproval?: boolean;
  headless?: boolean;
  visualFirst?: boolean;
}

export const Settings = () => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);

  // New model state
  const [newModel, setNewModel] = useState<Partial<ModelConfig>>({
    name: "",
    provider: "google",
    modelName: "",
    apiKey: "",
    baseUrl: "",
    supportsVision: false,
    ollamaThink: true,
    timeout: undefined
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const data = await window.electron.getConfig();
      setConfig(data);
    } catch (error) {
      console.error("Failed to load config:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (updatedConfig: AppConfig) => {
    try {
      await window.electron.saveConfig(updatedConfig);
      setConfig(updatedConfig);
    } catch (error) {
      console.error("Failed to save config:", error);
    }
  };

  const handleStartEdit = (model: ModelConfig) => {
    setNewModel({
      name: model.name,
      provider: model.provider,
      modelName: model.modelName,
      apiKey: model.apiKey || "",
      baseUrl: model.baseUrl || "",
      supportsVision: model.supportsVision || false,
      ollamaThink: model.ollamaThink !== false,
      timeout: model.timeout
    });
    setEditingModelId(model.id);
    setShowAddModal(true);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingModelId(null);
    setNewModel({
      name: "",
      provider: "google",
      modelName: "",
      apiKey: "",
      baseUrl: "",
      supportsVision: false,
      ollamaThink: true,
      timeout: undefined
    });
  };

  const handleSaveModel = () => {
    if (!config) return;

    let updatedConfig: AppConfig;
    if (editingModelId) {
      const updatedModels = config.models.map(m => 
        m.id === editingModelId 
          ? { ...newModel, id: editingModelId } as ModelConfig 
          : m
      );
      updatedConfig = {
        ...config,
        models: updatedModels
      };
      setEditingModelId(null);
    } else {
      const modelToAdd = {
        ...newModel,
        id: `model-${Date.now()}`
      } as ModelConfig;

      updatedConfig = {
        ...config,
        models: [...config.models, modelToAdd]
      };
    }

    handleSave(updatedConfig);
    setShowAddModal(false);
    setNewModel({
      name: "",
      provider: "google",
      modelName: "",
      apiKey: "",
      baseUrl: "",
      supportsVision: false,
      ollamaThink: true,
      timeout: undefined
    });
  };

  const handleRemoveModel = (id: string) => {
    if (!config) return;
    const newModels = config.models.filter(m => m.id !== id);
    const updatedConfig = {
      ...config,
      models: newModels,
      defaultModelId: config.defaultModelId === id ? (newModels[0]?.id || "") : config.defaultModelId
    };
    handleSave(updatedConfig);
  };

  const handleSetDefault = (id: string) => {
    if (!config) return;
    const updatedConfig = {
      ...config,
      defaultModelId: id
    };
    handleSave(updatedConfig);
  };

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center bg-surface text-on-surface">Loading settings...</div>;
  }

  if (!config) {
    return <div className="flex-1 flex items-center justify-center bg-surface text-on-surface">Failed to load configuration</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto px-10 pb-20 bg-surface">
      <div className="max-w-4xl mx-auto py-10">
        <div className="mb-10">
          <h1 className="text-4xl font-black font-display tracking-tight text-on-surface">Intelligence Settings</h1>
          <p className="text-on-surface/40 mt-1 font-medium">Configure AI models, API keys, and local inference endpoints</p>
        </div>

        <div className="space-y-8">
          <section className="bg-surface-low p-8 rounded-2xl border border-on-surface/5 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-on-surface">Configured Models</h2>
                <p className="text-sm text-on-surface/40">Models available for test execution</p>
              </div>
              <button 
                onClick={() => {
                  setEditingModelId(null);
                  setShowAddModal(true);
                }}
                className="bg-primary text-white px-4 py-2 rounded-lg font-bold text-sm shadow-premium hover:opacity-90 transition-all flex items-center gap-2"
              >
                <Icons.Plus /> Add Model
              </button>
            </div>

            <div className="space-y-4">
              {config.models.map(model => (
                <div key={model.id} className="group bg-surface-lowest p-5 rounded-xl border border-on-surface/5 flex items-center justify-between transition-all hover:border-primary/20">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs ${
                       model.provider === 'google' ? 'bg-blue-500/10 text-blue-500' :
                       model.provider === 'ollama' ? 'bg-orange-500/10 text-orange-500' :
                       model.provider === 'openai' ? 'bg-green-500/10 text-green-500' :
                       'bg-purple-500/10 text-purple-500'
                     }`}>
                      {model.provider.substring(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-on-surface">{model.name}</h3>
                        {config.defaultModelId === model.id && (
                          <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-black uppercase tracking-wider">Default</span>
                        )}
                        {model.supportsVision && (
                          <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">Vision</span>
                        )}
                        {model.provider === 'ollama' && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${
                            model.ollamaThink !== false 
                              ? 'bg-amber-500/10 text-amber-500' 
                              : 'bg-on-surface/5 text-on-surface/40'
                          }`}>
                            {model.ollamaThink !== false ? 'Thinking' : 'No Thinking'}
                          </span>
                        )}
                        {model.timeout && (
                          <span className="text-[10px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                            {model.timeout}s Timeout
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-on-surface/40 font-mono">{model.modelName} ({model.provider})</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {config.defaultModelId !== model.id && (
                      <button 
                        onClick={() => handleSetDefault(model.id)}
                        className="p-2 text-on-surface/40 hover:text-primary transition-colors text-xs font-bold"
                      >
                        Set as Default
                      </button>
                    )}
                    <button 
                      onClick={() => handleStartEdit(model)}
                      className="p-2 text-on-surface/20 hover:text-primary transition-colors"
                      title="Edit Model"
                    >
                      <Icons.Edit />
                    </button>
                    <button 
                      onClick={() => handleRemoveModel(model.id)}
                      className="p-2 text-on-surface/20 hover:text-red-500 transition-colors"
                      title="Remove Model"
                    >
                      <Icons.Trash />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-surface-low p-8 rounded-2xl border border-on-surface/5 shadow-sm">
            <h2 className="text-xl font-bold text-on-surface mb-6">Execution Settings</h2>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-on-surface">Require Plan Approval</h3>
                  <p className="text-sm text-on-surface/40">Pause at the beginning of each test to approve the agent's plan</p>
                </div>
                <button 
                  onClick={() => handleSave({...config, requirePlanApproval: !config.requirePlanApproval})}
                  className={`w-12 h-6 rounded-full transition-colors relative ${config.requirePlanApproval ? 'bg-primary' : 'bg-on-surface/10'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${config.requirePlanApproval ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-on-surface">Headless Mode</h3>
                  <p className="text-sm text-on-surface/40">Run tests without showing the browser window (faster)</p>
                </div>
                <button 
                  onClick={() => handleSave({...config, headless: !config.headless})}
                  className={`w-12 h-6 rounded-full transition-colors relative ${config.headless ? 'bg-primary' : 'bg-on-surface/10'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${config.headless ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-on-surface">Visual-First Execution</h3>
                  <p className="text-sm text-on-surface/40">Optimize context window usage by using screenshots and snapshot search queries</p>
                </div>
                <button 
                  onClick={() => handleSave({...config, visualFirst: !config.visualFirst})}
                  className={`w-12 h-6 rounded-full transition-colors relative ${config.visualFirst ? 'bg-primary' : 'bg-on-surface/10'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${config.visualFirst ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
            </div>
          </section>

          <section className="bg-surface-low p-8 rounded-2xl border border-on-surface/5 shadow-sm opacity-50 cursor-not-allowed">
            <h2 className="text-xl font-bold text-on-surface mb-2">Global API Keys</h2>
            <p className="text-sm text-on-surface/40 mb-6">Environment-wide fallback keys (Coming Soon)</p>
            <div className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-black uppercase tracking-widest text-on-surface/20">Google AI Studio Key</label>
                <div className="bg-surface-lowest border border-on-surface/5 rounded-lg px-4 py-3 text-on-surface/20 font-mono text-sm">••••••••••••••••••••••••</div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Add Model Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-surface-lowest/80 backdrop-blur-md" onClick={handleCloseModal} />
          <div className="relative w-full max-w-xl bg-surface-low border border-on-surface/10 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-8 border-b border-on-surface/5">
              <h2 className="text-2xl font-bold font-display tracking-tight">
                {editingModelId ? "Edit Intelligence Model" : "Add Intelligence Model"}
              </h2>
              <p className="text-on-surface/40 text-sm mt-1">
                {editingModelId ? "Update your model configuration parameters" : "Connect a new provider or local inference engine"}
              </p>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Provider</label>
                  <select 
                    value={newModel.provider}
                    onChange={e => setNewModel({...newModel, provider: e.target.value as any})}
                    className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors text-on-surface font-medium"
                  >
                    <option value="google">Google Gemini</option>
                    <option value="ollama">Ollama (Local)</option>
                    <option value="openai">OpenAI</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">UI Label</label>
                  <input 
                    value={newModel.name}
                    onChange={e => setNewModel({...newModel, name: e.target.value})}
                    placeholder="e.g. Local Qwen"
                    className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors text-on-surface font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Timeout (Seconds)</label>
                  <input 
                    type="number"
                    min="1"
                    value={newModel.timeout || ""}
                    onChange={e => setNewModel({...newModel, timeout: e.target.value ? parseInt(e.target.value, 10) : undefined})}
                    placeholder="e.g. 60"
                    className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors text-on-surface font-medium"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Model Tag (Identifier)</label>
                <input 
                  value={newModel.modelName}
                  onChange={e => setNewModel({...newModel, modelName: e.target.value})}
                  placeholder={newModel.provider === 'ollama' ? "e.g. qwen2.5:7b" : "e.g. gpt-4o"}
                  className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors text-on-surface font-mono text-sm"
                />
              </div>

              <div className="flex items-center justify-between bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3">
                <div>
                  <h4 className="font-bold text-sm text-on-surface">Supports Vision</h4>
                  <p className="text-xs text-on-surface/40">This model is capable of parsing visual/image prompts</p>
                </div>
                <button 
                  onClick={() => setNewModel({...newModel, supportsVision: !newModel.supportsVision})}
                  className={`w-12 h-6 rounded-full transition-colors relative ${newModel.supportsVision ? 'bg-primary' : 'bg-on-surface/10'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${newModel.supportsVision ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              {newModel.provider === 'ollama' && (
                <>
                  <div className="flex items-center justify-between bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3">
                    <div>
                      <h4 className="font-bold text-sm text-on-surface">Enable Thinking / Reasoning</h4>
                      <p className="text-xs text-on-surface/40">Keep this active for reasoning models like DeepSeek-R1</p>
                    </div>
                    <button 
                      onClick={() => setNewModel({...newModel, ollamaThink: !newModel.ollamaThink})}
                      className={`w-12 h-6 rounded-full transition-colors relative ${newModel.ollamaThink !== false ? 'bg-primary' : 'bg-on-surface/10'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${newModel.ollamaThink !== false ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Base URL</label>
                    <input 
                      value={newModel.baseUrl}
                      onChange={e => setNewModel({...newModel, baseUrl: e.target.value})}
                      placeholder="http://localhost:11434/api"
                      className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors text-on-surface font-mono text-sm"
                    />
                  </div>
                </>
              )}

              {newModel.provider === 'openai' && (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Base URL (Optional, for Local Servers like vLLM)</label>
                    <input 
                      value={newModel.baseUrl}
                      onChange={e => setNewModel({...newModel, baseUrl: e.target.value})}
                      placeholder="http://localhost:8000/v1"
                      className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors text-on-surface font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">API Key</label>
                    <input 
                      type="password"
                      value={newModel.apiKey}
                      onChange={e => setNewModel({...newModel, apiKey: e.target.value})}
                      placeholder="sk-..."
                      className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors text-on-surface font-mono text-sm"
                    />
                  </div>
                </>
              )}

              <div className="flex gap-4 pt-4">
                <button 
                  onClick={handleCloseModal}
                  className="flex-1 px-6 py-3 rounded-lg font-bold text-sm text-on-surface/60 hover:bg-on-surface/5 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveModel}
                  disabled={!newModel.name || !newModel.modelName}
                  className="flex-1 bg-primary text-white px-6 py-3 rounded-lg font-bold text-sm shadow-premium hover:opacity-90 transition-all disabled:opacity-50"
                >
                  {editingModelId ? "Save Model" : "Add Model"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Icons } from "../components/ui/Icons";

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

export const ApplicationDetails = () => {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const [app, setApp] = useState<Application | null>(null);
  const [tests, setTests] = useState<Test[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  
  const [models, setModels] = useState<any[]>([]);
  const [defaultModelId, setDefaultModelId] = useState("");
  
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newRequirement, setNewRequirement] = useState("");
  const [newModel, setNewModel] = useState("");

  const loadData = async () => {
    if (!appId) return;
    setIsLoading(true);
    try {
      const apps = await window.electron.listApplications();
      const currentApp = apps.find((a: any) => a.id === appId);
      setApp(currentApp || null);

      const testsData = await window.electron.listTests(appId);
      setTests(testsData);

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

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center bg-surface text-on-surface">Loading...</div>;
  }

  if (!app) {
    return <div className="flex-1 flex items-center justify-center bg-surface text-on-surface">Application not found</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto px-10 pb-20 bg-surface">
      <div className="max-w-6xl mx-auto py-10">
        <div className="mb-10 flex items-center gap-4">
           <button 
             onClick={() => navigate("/applications")}
             className="p-2 hover:bg-on-surface/5 rounded-full text-on-surface/40 transition-colors"
           >
             <Icons.ChevronLeft />
           </button>
           <div>
             <h1 className="text-4xl font-black font-display tracking-tight text-on-surface">{app.name}</h1>
             <p className="text-on-surface/40 mt-1 font-medium">{app.description || "Manage tests for this application"}</p>
           </div>
        </div>

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
                <input 
                  type="url"
                  value={newUrl}
                  onChange={e => setNewUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors text-on-surface font-mono text-sm"
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
    </div>
  );
};

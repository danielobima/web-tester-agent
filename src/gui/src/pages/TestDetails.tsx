import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Icons } from "../components/ui/Icons";
import { MarkdownRenderer } from "../components/ui/MarkdownRenderer";

interface Test {
  id: string;
  appId: string;
  name: string;
  url: string;
  prompt: string;
  model: string;
  createdAt: number;
  lastRunPath?: string;
}

export const TestDetails = () => {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const [test, setTest] = useState<Test | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [viewMode, setViewMode] = useState<"settings" | "report" | "script">("settings");
  const [reportContent, setReportContent] = useState<string>("");
  const [scriptContent, setScriptContent] = useState<string>("");

  const [models, setModels] = useState<any[]>([]);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editModel, setEditModel] = useState("");

  const loadTest = async () => {
    if (!testId) return;
    setIsLoading(true);
    try {
      const testData = await window.electron.getTest(testId);
      setTest(testData);
      setEditName(testData.name);
      setEditUrl(testData.url);
      setEditPrompt(testData.prompt);
      setEditModel(testData.model);

      const config = await window.electron.getConfig();
      setModels(config.models);
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
          const content = await window.electron.getSuiteReport(test.lastRunPath);
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
        prompt: editPrompt,
        model: editModel
      });
      setTest(updated);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update test:", error);
    }
  };

  const handleRun = () => {
    if (!test) return;
    window.electron.startTest(test.url, test.prompt, test.id, test.model);
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

  if (isLoading) return <div className="flex-1 flex items-center justify-center bg-surface text-on-surface">Loading...</div>;
  if (!test) return <div className="flex-1 flex items-center justify-center bg-surface text-on-surface">Test not found</div>;

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
              <h1 className="text-3xl font-black font-display tracking-tight text-on-surface">{test.name}</h1>
              <p className="text-on-surface/40 text-sm font-medium mt-1">Test Specification & Results</p>
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
             { id: "report", label: "Last Report", icon: <Icons.TestSuites />, disabled: !test.lastRunPath },
             { id: "script", label: "Serialized Script", icon: <Icons.Code />, disabled: !test.lastRunPath }
           ].map(tab => (
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
                   <form onSubmit={handleUpdate} className="space-y-6 bg-surface-low p-8 rounded-2xl border border-on-surface/10 shadow-sm">
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Test Name</label>
                        <input 
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Start URL</label>
                        <input 
                          value={editUrl}
                          onChange={e => setEditUrl(e.target.value)}
                          className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors font-mono"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Model Tag (Backend)</label>
                        <select 
                          value={editModel}
                          onChange={e => setEditModel(e.target.value)}
                          className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors text-on-surface font-medium"
                        >
                          {models.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Current Model</label>
                        <p className="font-medium text-on-surface">{models.find(m => m.id === test.model)?.name || test.model}</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Prompt / Goal</label>
                        <textarea 
                          value={editPrompt}
                          onChange={e => setEditPrompt(e.target.value)}
                          rows={6}
                          className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors resize-none"
                        />
                      </div>
                      <div className="flex gap-4 pt-4">
                        <button type="button" onClick={() => setIsEditing(false)} className="flex-1 py-3 font-bold text-on-surface/60 hover:bg-on-surface/5 rounded-lg">Cancel</button>
                        <button type="submit" className="flex-1 bg-primary text-white py-3 rounded-lg font-bold shadow-premium">Save Changes</button>
                      </div>
                   </form>
                 ) : (
                   <div className="space-y-10">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface/30">Target Environment</h3>
                          <button onClick={() => setIsEditing(true)} className="text-primary text-xs font-bold hover:underline flex items-center gap-1"><Icons.Edit /> Edit</button>
                        </div>
                        <div className="p-6 bg-surface-low rounded-xl border border-on-surface/5">
                           <div className="flex items-center gap-4 text-on-surface">
                              <Icons.Monitor />
                              <span className="font-mono text-sm">{test.url}</span>
                           </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface/30">Intelligence Goal</h3>
                        <div className="p-8 bg-surface-low rounded-2xl border border-on-surface/5 leading-relaxed text-lg italic text-on-surface/80">
                           "{test.prompt}"
                        </div>
                      </div>
                   </div>
                 )}
              </div>

              <div className="space-y-8">
                 <div className="bg-surface-low p-6 rounded-2xl border border-on-surface/5 space-y-6 shadow-sm">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface/30">Configuration</h3>
                    <div className="space-y-4">
                       <div>
                         <p className="text-[10px] font-bold text-on-surface/30 uppercase tracking-widest mb-1">AI Model</p>
                         <p className="text-sm font-medium text-on-surface">{models.find(m => m.id === test.model)?.name || test.model}</p>
                       </div>
                       <div>
                         <p className="text-[10px] font-bold text-on-surface/30 uppercase tracking-widest mb-1">Created</p>
                         <p className="text-sm font-medium text-on-surface">{new Date(test.createdAt).toLocaleString()}</p>
                       </div>
                    </div>
                 </div>

                 <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10 space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-primary/60">Last Run Info</h3>
                    {test.lastRunPath ? (
                      <div className="space-y-2">
                        <p className="text-xs text-primary/80">Last run generated a report and a serialized script.</p>
                        <button onClick={() => setViewMode("report")} className="text-primary text-sm font-bold hover:underline">View Report →</button>
                      </div>
                    ) : (
                      <p className="text-xs text-on-surface/40">This test has not been executed yet.</p>
                    )}
                 </div>
              </div>
            </div>
          )}

          {viewMode === "report" && (
            <div className="bg-surface-low p-10 rounded-2xl border border-on-surface/5 shadow-sm min-h-[600px]">
              <MarkdownRenderer 
                content={reportContent} 
                basePath={test.lastRunPath ? test.lastRunPath.split('/').slice(0, -1).join('/') : undefined} 
              />
            </div>
          )}

          {viewMode === "script" && (
            <div className="bg-surface-lowest p-8 rounded-2xl border border-on-surface/10 shadow-inner font-mono text-xs overflow-x-auto whitespace-pre">
              {scriptContent}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

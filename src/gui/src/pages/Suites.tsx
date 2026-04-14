import { useState, useEffect } from "react";
import { Icons } from "../components/ui/Icons";
import { useNavigate, useLocation } from "react-router-dom";
import { MarkdownRenderer } from "../components/ui/MarkdownRenderer";

interface Suite {
  id: string;
  name: string;
  url: string;
  stepsCount: number;
  path: string;
  createdAt: number;
}

export const Suites = () => {
  const [suites, setSuites] = useState<Suite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSuite, setSelectedSuite] = useState<any>(null); // Ideally this would be typed to SerializedTest
  const [isViewingDetails, setIsViewingDetails] = useState(false);
  const [viewMode, setViewMode] = useState<"details" | "report">("details");
  const [reportContent, setReportContent] = useState<string>("");
  const navigate = useNavigate();
  const location = useLocation();

  const loadSuites = async () => {
    setIsLoading(true);
    try {
      const data = await window.electron.listSuites();
      setSuites(data);
    } catch (error) {
      console.error("Error loading suites:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSuites();
  }, []);

  useEffect(() => {
    const checkState = async () => {
      if (location.state?.suitePath && suites.length > 0) {
        const suite = suites.find(s => s.path === location.state.suitePath);
        if (suite) {
          await handleViewDetails(suite);
          if (location.state.viewMode === "report") {
            setViewMode("report");
          }
        }
        // Clear state to avoid reopening on refresh
        navigate(location.pathname, { replace: true, state: {} });
      }
    };
    checkState();
  }, [location.state, suites, navigate]);

  useEffect(() => {
    const loadReport = async () => {
      if (viewMode === "report" && selectedSuite?.localPath) {
        try {
          const content = await window.electron.getSuiteReport(selectedSuite.localPath);
          setReportContent(content);
        } catch (error) {
          console.error("Failed to load report:", error);
          setReportContent("### Error\nCould not load report content.");
        }
      }
    };
    loadReport();
  }, [viewMode, selectedSuite]);

  const handleReplay = (path: string) => {
    window.electron.replayTest(path);
    navigate("/", { state: { replaying: true } });
  };

  const handleDelete = async (suite: Suite) => {
    if (confirm(`Are you sure you want to delete "${suite.name}"?`)) {
      await window.electron.deleteSuite(suite.path);
      loadSuites();
    }
  };

  const handleViewDetails = async (suite: Suite) => {
    try {
      const details = await window.electron.getSuite(suite.path);
      setSelectedSuite({ ...details, localPath: suite.path });
      setViewMode("details");
      setIsViewingDetails(true);
    } catch (error) {
      console.error("Failed to load suite details:", error);
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex relative">
      <div className="flex-1 overflow-y-auto px-10 pb-20">
        <div className="max-w-6xl mx-auto py-10">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h1 className="text-3xl font-bold font-display tracking-tight">Test Suites</h1>
              <p className="text-on-surface/40 mt-1 font-medium">Manage and execution your automated test specifications</p>
            </div>
            <button 
              onClick={() => navigate("/")}
              className="bg-primary text-white px-6 py-3 rounded-md font-bold text-sm shadow-ambient hover:opacity-90 transition-all active:scale-95 flex items-center gap-2"
            >
              <Icons.Lightning /> New Test
            </button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-48 bg-surface-low rounded-md border border-on-surface/5 animate-pulse"></div>
              ))}
            </div>
          ) : suites.length === 0 ? (
            <div className="h-[400px] flex flex-col items-center justify-center text-on-surface/20 space-y-6 bg-surface-low/50 rounded-lg border border-dashed border-on-surface/10">
              <Icons.TestSuites />
              <div className="text-center">
                <p className="text-lg font-bold text-on-surface/40">No suites found</p>
                <p className="text-sm">Run your first test to generate a suite specification</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {suites.map((suite) => (
                <div 
                  key={suite.id}
                  onClick={() => handleViewDetails(suite)}
                  className={`bg-surface-low p-6 rounded-md border transition-all group flex flex-col justify-between h-52 relative overflow-hidden cursor-pointer ${
                    selectedSuite?.localPath === suite.path ? 'border-primary shadow-sm bg-surface-lowest' : 'border-on-surface/5 hover:border-primary/30'
                  }`}
                >
                  <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                     <button 
                       onClick={(e) => { e.stopPropagation(); handleDelete(suite); }}
                       className="p-2 text-on-surface/20 hover:text-orange-600 transition-colors"
                     >
                       <Icons.XCircle />
                     </button>
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`p-2 rounded-sm transition-colors ${selectedSuite?.localPath === suite.path ? 'bg-primary text-white' : 'bg-primary/10 text-primary'}`}>
                        <Icons.TestSuites />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface/30">
                        {suite.stepsCount} steps
                      </span>
                    </div>
                    <h3 className="font-bold text-lg leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2">
                      {suite.name}
                    </h3>
                    <p className="text-xs text-on-surface/40 font-mono truncate">{suite.url}</p>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-on-surface/5">
                    <span className="text-[10px] font-bold text-on-surface/20 uppercase tracking-widest">
                      {new Date(suite.createdAt).toLocaleDateString()}
                    </span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleReplay(suite.path); }}
                      className="flex items-center gap-2 text-xs font-bold text-primary hover:underline"
                    >
                      Replay <Icons.Play />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Backdrop */}
      {isViewingDetails && selectedSuite && (
        <div 
          className="absolute inset-0 bg-surface-lowest/40 backdrop-blur-[2px] z-20 animate-in fade-in duration-300"
          onClick={() => setIsViewingDetails(false)}
        />
      )}

      {/* Detail Slide-over */}
      {isViewingDetails && selectedSuite && (
        <div className="absolute right-0 top-0 h-full w-[500px] bg-surface-lowest border-l border-on-surface/10 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col z-30">
          <div className="p-8 border-b border-on-surface/5 flex items-center justify-between shrink-0">
            <h2 className="text-xl font-bold font-display tracking-tight text-primary">Suite Registry</h2>
            <div className="flex items-center gap-2 bg-on-surface/5 p-1 rounded-lg">
              <button 
                onClick={() => setViewMode("details")}
                className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${viewMode === "details" ? "bg-surface-lowest text-primary shadow-sm" : "text-on-surface/40 hover:text-on-surface"}`}
              >
                Details
              </button>
              <button 
                onClick={() => setViewMode("report")}
                className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${viewMode === "report" ? "bg-surface-lowest text-primary shadow-sm" : "text-on-surface/40 hover:text-on-surface"}`}
              >
                Report
              </button>
            </div>
            <button 
              onClick={() => setIsViewingDetails(false)}
              className="p-2 hover:bg-on-surface/5 rounded-full transition-colors text-on-surface/40"
            >
              <Icons.XCircle />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-8">
            {viewMode === "details" ? (
              <>
                <section>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface/30 mb-3">Goal Specification</h3>
                  <div className="p-4 bg-surface-low rounded-md border border-on-surface/5">
                    <p className="text-sm font-medium leading-relaxed italic">"{selectedSuite.name}"</p>
                  </div>
                </section>

                <section>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface/30 mb-3">Inception State</h3>
                  <div className="flex items-center gap-3 text-sm text-on-surface/60">
                    <Icons.Monitor />
                    <span className="truncate font-mono text-[11px]">{selectedSuite.startUrl}</span>
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface/30">Step Sequence ({selectedSuite.steps?.length || 0})</h3>
                  <div className="space-y-3">
                    {selectedSuite.steps?.map((step: any, idx: number) => (
                      <div key={idx} className="p-5 bg-on-surface/[0.02] rounded-lg border border-on-surface/5 group hover:bg-on-surface/[0.04] transition-colors relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 group-hover:bg-primary transition-colors" />
                        <div className="flex items-center justify-between mb-4 pl-1">
                          <span className="text-[10px] font-bold text-primary/60 uppercase tracking-tighter">Event Sequence {idx + 1}</span>
                          <div className="flex gap-2">
                            <span className="text-[8px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold uppercase tracking-widest border border-primary/10">
                              {step.action?.kind || 'manual'}
                            </span>
                          </div>
                        </div>
                        
                        <div className="space-y-4 pl-1">
                          <div>
                            <span className="text-[9px] font-bold text-on-surface/20 uppercase tracking-widest block mb-1">Instruction</span>
                            <p className="text-xs font-bold leading-relaxed">{step.step}</p>
                          </div>
                          
                          {step.description && (
                            <div>
                              <span className="text-[9px] font-bold text-on-surface/20 uppercase tracking-widest block mb-1">Reasoning</span>
                              <p className="text-[10px] text-on-surface/50 leading-relaxed italic line-clamp-3 group-hover:line-clamp-none transition-all">
                                "{step.description}"
                              </p>
                            </div>
                          )}

                          <div className="pt-3 border-t border-on-surface/5 flex items-center justify-between">
                            <span className="text-[9px] font-bold text-on-surface/20 uppercase tracking-widest">Tactical Action</span>
                            <span className="text-[10px] font-mono text-on-surface/40">
                              {step.action?.kind === 'click' ? `click(${step.action.element?.role || 'element'})` : step.action?.kind || 'observation'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <MarkdownRenderer 
                content={reportContent} 
                basePath={selectedSuite?.localPath ? selectedSuite.localPath.split('/').slice(0, -1).join('/') : undefined} 
              />
            )}
          </div>

          <div className="p-8 bg-surface-low border-t border-on-surface/5">
            <button 
              onClick={() => handleReplay(selectedSuite.localPath)}
              className="w-full bg-primary text-white py-4 rounded-md font-bold text-sm shadow-ambient flex items-center justify-center gap-3 hover:opacity-90 active:scale-[0.98] transition-all"
            >
              <Icons.Play /> Execute Regression Run
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

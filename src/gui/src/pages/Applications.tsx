import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Icons } from "../components/ui/Icons";

interface Application {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
}

export const Applications = () => {
  const [apps, setApps] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const navigate = useNavigate();

  const loadApps = async () => {
    setIsLoading(true);
    try {
      const data = await window.electron.listApplications();
      setApps(data);
    } catch (error) {
      console.error("Error loading applications:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadApps();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    
    try {
      const newApp = await window.electron.createApplication(newName, newDescription);
      setApps([...apps, newApp]);
      setIsCreating(false);
      setNewName("");
      setNewDescription("");
      navigate(`/applications/${newApp.id}`);
    } catch (error) {
      console.error("Failed to create application:", error);
    }
  };

  const handleDelete = async (appId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this application and all its tests?")) {
      try {
        await window.electron.deleteApplication(appId);
        setApps(apps.filter(a => a.id !== appId));
      } catch (error) {
        console.error("Failed to delete application:", error);
      }
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-10 pb-20 bg-surface">
      <div className="max-w-6xl mx-auto py-10">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-4xl font-black font-display tracking-tight text-on-surface">Applications</h1>
            <p className="text-on-surface/40 mt-2 font-medium text-lg">Group and manage your testing projects</p>
          </div>
          <button 
            onClick={() => setIsCreating(true)}
            className="bg-primary text-white px-8 py-4 rounded-md font-bold text-sm shadow-premium hover:opacity-90 transition-all active:scale-95 flex items-center gap-3"
          >
            <Icons.Plus /> Create Application
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-surface-low rounded-xl border border-on-surface/5 animate-pulse"></div>
            ))}
          </div>
        ) : apps.length === 0 ? (
          <div className="h-[400px] flex flex-col items-center justify-center text-on-surface/20 space-y-8 bg-surface-low/30 rounded-2xl border-2 border-dashed border-on-surface/10">
            <div className="p-6 bg-surface-low rounded-full">
               <Icons.Monitor />
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-on-surface/40">No applications yet</p>
              <p className="text-on-surface/30 mt-2">Create your first application to start grouping tests</p>
            </div>
            <button 
              onClick={() => setIsCreating(true)}
              className="text-primary font-bold hover:underline"
            >
              + Add Application
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {apps.map((app) => (
              <div 
                key={app.id}
                onClick={() => navigate(`/applications/${app.id}`)}
                className="group bg-surface-low p-8 rounded-2xl border border-on-surface/5 hover:border-primary/40 transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between h-56 shadow-sm hover:shadow-premium"
              >
                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => handleDelete(app.id, e)}
                    className="p-2 text-on-surface/20 hover:text-red-500 transition-colors"
                  >
                    <Icons.Trash />
                  </button>
                </div>

                <div>
                  <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary group-hover:text-white transition-colors">
                    <Icons.Monitor />
                  </div>
                  <h3 className="text-xl font-bold text-on-surface group-hover:text-primary transition-colors mb-2">{app.name}</h3>
                  <p className="text-sm text-on-surface/50 line-clamp-2 leading-relaxed">{app.description || "No description provided."}</p>
                </div>

                <div className="pt-6 border-t border-on-surface/5 flex items-center justify-between">
                   <span className="text-[10px] font-bold text-on-surface/30 uppercase tracking-widest">
                     Created {new Date(app.createdAt).toLocaleDateString()}
                   </span>
                   <Icons.ChevronRight />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div 
            className="absolute inset-0 bg-surface-lowest/80 backdrop-blur-md"
            onClick={() => setIsCreating(false)}
          />
          <div className="relative w-full max-w-md bg-surface-low border border-on-surface/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-on-surface/5">
              <h2 className="text-2xl font-bold font-display tracking-tight">New Application</h2>
              <p className="text-on-surface/40 text-sm mt-1">Define your project scope</p>
            </div>
            
            <form onSubmit={handleCreate} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Name</label>
                <input 
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. E-commerce Frontend"
                  className="w-full bg-surface-lowest border border-on-surface/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors text-on-surface font-medium"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-on-surface/40">Description</label>
                <textarea 
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder="What is this application for?"
                  rows={3}
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
                  disabled={!newName.trim()}
                  className="flex-1 bg-primary text-white px-6 py-3 rounded-lg font-bold text-sm shadow-premium hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

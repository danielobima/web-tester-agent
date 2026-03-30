
import { Icons } from "../ui/Icons";

interface ConfigSectionProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const ConfigSection = ({ activeTab, setActiveTab }: ConfigSectionProps) => {
  return (
    <div className="space-y-8">
      {/* Tabs */}
      <div className="bg-surface-low p-1 rounded-md flex gap-1 w-fit border border-on-surface/5">
        {["Browser State", "Network", "Environment"].map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === tab ? 'bg-surface-lowest shadow-sm' : 'text-on-surface/50 hover:text-on-surface'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Viewport Card */}
      <div className="bg-surface-low rounded-md p-8 space-y-6">
        <div className="space-y-4">
          <span className="text-[10px] uppercase font-bold tracking-widest text-on-surface/40">Default Viewport</span>
          <div className="flex gap-4">
            <div className="flex-1 bg-surface-highest p-4 rounded-md flex justify-between items-center group focus-within:ring-1 ring-primary/20">
              <span className="text-on-surface/40 text-sm font-medium">Width</span>
              <span className="font-display font-bold">1440px</span>
            </div>
            <div className="flex-1 bg-surface-highest p-4 rounded-md flex justify-between items-center">
              <span className="text-on-surface/40 text-sm font-medium">Height</span>
              <span className="font-display font-bold">900px</span>
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-on-surface/5">
          <span className="text-[10px] uppercase font-bold tracking-widest text-on-surface/40">Device Emulation</span>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-surface-lowest rounded-md border border-primary/20 shadow-sm">
              <div className="flex items-center gap-4">
                 <div className="p-2 bg-primary/10 rounded-sm text-primary"><Icons.Dashboard /></div>
                 <span className="font-bold">Desktop (Chrome)</span>
              </div>
              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-white"><Icons.Play /></div>
            </div>
            <div className="flex items-center justify-between p-4 bg-surface/50 rounded-md opacity-40">
              <div className="flex items-center gap-4">
                 <div className="p-2 bg-on-surface/5 rounded-sm"><Icons.Monitor /></div>
                 <span className="font-bold">iPhone 14 Pro</span>
              </div>
              <div className="w-5 h-5 rounded-full border-2 border-on-surface/20"></div>
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-on-surface/5">
          <div className="flex justify-between items-center">
             <span className="text-[10px] uppercase font-bold tracking-widest text-on-surface/40">Active Middleware</span>
             <span className="bg-orange-600/10 text-orange-600 text-[10px] font-bold px-2 py-0.5 rounded-full">3 ACTIVE</span>
          </div>
          <div className="space-y-2">
            {["auth_bypass_v2.js", "mock_payment_gateway.js"].map(tag => (
              <div key={tag} className="bg-surface-highest/50 px-4 py-3 rounded-md flex justify-between items-center group">
                <code className="text-sm font-medium text-on-surface/70 italic">{tag}</code>
                <span className="opacity-0 group-hover:opacity-100 cursor-pointer text-on-surface/30 hover:text-on-surface">×</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

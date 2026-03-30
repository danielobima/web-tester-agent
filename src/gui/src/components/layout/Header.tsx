
import { Icons } from "../ui/Icons";

export const Header = () => {
  return (
    <header className="h-20 flex items-center justify-between px-10 shrink-0">
      <div className="flex items-center gap-8">
        <h1 className="text-xl font-bold font-display uppercase tracking-tight">QA_ENGINE</h1>
        <div className="flex gap-6 text-sm font-medium text-on-surface/50">
          <span className="cursor-pointer hover:text-on-surface transition-colors">Environment</span>
          <span className="text-primary border-b-2 border-primary pb-2 translate-y-2">Release_v2.4</span>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <button className="flex items-center gap-2 bg-[#D5E3FC] text-primary px-4 py-2 rounded-md font-bold text-sm hover:bg-[#C5D3EC] transition-all">
          <Icons.Play /> Run All Tests
        </button>
        <div className="flex gap-4 text-on-surface/40">
          <Icons.Bug />
          <Icons.Monitor />
          <div className="w-8 h-8 rounded-full bg-surface-highest overflow-hidden border border-on-surface/10">
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" />
          </div>
        </div>
      </div>
    </header>
  );
};

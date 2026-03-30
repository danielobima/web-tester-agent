
import { Icons } from "../ui/Icons";

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}

function NavItem({ icon, label, active = false }: NavItemProps) {
  return (
    <div className={`flex items-center gap-3 w-full px-4 py-3 rounded-md font-bold text-sm cursor-pointer transition-all ${active ? 'bg-surface-lowest text-primary shadow-sm' : 'text-on-surface/50 hover:bg-on-surface/5 hover:text-on-surface'}`}>
      {icon}
      <span>{label}</span>
    </div>
  );
}

export const Sidebar = () => {
  return (
    <aside className="w-64 bg-surface-low border-r border-on-surface/5 flex flex-col p-6 items-start gap-8 z-10 shrink-0">
      <div className="flex flex-col gap-1 mb-4">
        <h2 className="text-xl font-display font-bold">TestOps</h2>
        <span className="text-[10px] uppercase tracking-widest text-on-surface/40 font-medium">Clinical Architect v1.0</span>
      </div>

      <nav className="flex flex-col gap-2 w-full">
        <NavItem icon={<Icons.Dashboard />} label="Dashboard" />
        <NavItem icon={<Icons.TestSuites />} label="Test Suites" active />
        <NavItem icon={<Icons.Regression />} label="Visual Regression" />
        <NavItem icon={<Icons.Bug />} label="Bug Reports" />
        <NavItem icon={<Icons.Monitor />} label="API Monitor" />
      </nav>

      <div className="mt-auto w-full flex flex-col gap-6">
        <button className="flex items-center justify-center gap-2 bg-primary text-white py-3 px-4 rounded-md font-bold text-sm w-full transition-all hover:opacity-90 active:scale-[0.98]">
          New Test Case
        </button>
        <div className="flex flex-col gap-4 text-on-surface/60 text-sm font-medium">
          <a href="#" className="flex items-center gap-3 hover:text-primary transition-colors">
            <Icons.TestSuites /> Documentation
          </a>
          <a href="#" className="flex items-center gap-3 hover:text-primary transition-colors">
            <Icons.Monitor /> Support
          </a>
        </div>
      </div>
    </aside>
  );
};

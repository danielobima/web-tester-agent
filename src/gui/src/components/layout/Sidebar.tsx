import { Icons } from "../ui/Icons";
import { NavLink, useNavigate } from "react-router-dom";

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  to: string;
}

function NavItem({ icon, label, to }: NavItemProps) {
  return (
    <NavLink 
      to={to}
      className={({ isActive }) => 
        `flex items-center gap-3 w-full px-4 py-3 rounded-md font-bold text-sm cursor-pointer transition-all ${
          isActive 
            ? 'bg-on-surface/5 text-primary shadow-sm shadow-primary/5 border border-on-surface/5' 
            : 'text-on-surface/50 hover:bg-on-surface/5 hover:text-on-surface border border-transparent'
        }`
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

export const Sidebar = () => {
  const navigate = useNavigate();
  return (
    <aside className="w-64 bg-surface-low border-r border-on-surface/5 flex flex-col p-6 items-start gap-8 z-10 shrink-0">
      <div className="flex flex-col gap-1 mb-4">
        <h2 className="text-xl font-display font-bold tracking-tight">TestOps</h2>
        <span className="text-[10px] uppercase tracking-widest text-on-surface/40 font-medium">Clinical Architect v1.0</span>
      </div>

      <nav className="flex flex-col gap-2 w-full">
        <NavItem icon={<Icons.Monitor />} label="Applications" to="/applications" />
        <NavItem icon={<Icons.Play />} label="Ongoing Execution" to="/execution" />
        <NavItem icon={<Icons.Bug />} label="Agent Debugger" to="/errors" />
        <NavItem icon={<Icons.Settings />} label="Settings" to="/settings" />
      </nav>

      <div className="mt-auto w-full flex flex-col gap-6">
        <button 
          onClick={() => navigate("/applications")}
          className="flex items-center justify-center gap-2 bg-primary text-white py-4 px-4 rounded-xl font-bold text-sm w-full transition-all hover:opacity-90 active:scale-[0.98] shadow-premium"
        >
          <Icons.Plus /> New Application
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

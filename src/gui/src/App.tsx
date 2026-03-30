import { useState } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
import { TestBuilder } from "./components/features/TestBuilder";
import { ConfigSection } from "./components/features/ConfigSection";
import { StatsSection } from "./components/features/StatsSection";
import { ScriptEditor } from "./components/features/ScriptEditor";
import { Icons } from "./components/ui/Icons";

function App() {
  const [activeTab, setActiveTab] = useState("Browser State");

  return (
    <div className="flex h-screen w-full bg-surface text-on-surface overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col h-full bg-surface overflow-hidden relative">
        <Header />

        <div className="flex-1 overflow-y-auto px-10 pb-20">
          <div className="max-w-6xl mx-auto py-6 space-y-10">
            <TestBuilder />

            <div className="grid grid-cols-12 gap-8">
              <div className="col-span-12 lg:col-span-5 space-y-8">
                <ConfigSection activeTab={activeTab} setActiveTab={setActiveTab} />
                <StatsSection />
              </div>

              <div className="col-span-12 lg:col-span-7">
                <ScriptEditor />
              </div>
            </div>
          </div>
        </div>

        <button className="absolute bottom-8 right-8 w-16 h-16 bg-primary text-white rounded-md shadow-ambient flex items-center justify-center transition-all hover:scale-110 active:scale-90 z-20">
          <Icons.Lightning />
        </button>
      </main>
    </div>
  );
}

export default App;

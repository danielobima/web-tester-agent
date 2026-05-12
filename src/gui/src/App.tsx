import { HashRouter as Router, Routes, Route } from "react-router-dom";
import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
import { Applications } from "./pages/Applications";
import { ApplicationDetails } from "./pages/ApplicationDetails";
import { TestDetails } from "./pages/TestDetails";
import { Execution } from "./pages/Execution";
import { AgentErrors } from "./pages/AgentErrors";
import { Settings } from "./pages/Settings";
import { Icons } from "./components/ui/Icons";

function App() {
  return (
    <Router>
      <div className="flex h-screen w-full bg-surface text-on-surface overflow-hidden font-sans select-none">
        <Sidebar />

        <main className="flex-1 flex flex-col h-full bg-surface overflow-hidden relative">
          <Header />

          <Routes>
            <Route path="/" element={<Applications />} />
            <Route path="/applications" element={<Applications />} />
            <Route path="/applications/:appId" element={<ApplicationDetails />} />
            <Route path="/tests/:testId" element={<TestDetails />} />
            <Route path="/execution" element={<Execution />} />
            <Route path="/errors" element={<AgentErrors />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Applications />} />
          </Routes>

          {/* Floating Action Button (Optional, can be contextualized) */}
          <Routes>
            <Route path="/" element={
              <button className="absolute bottom-8 right-8 w-16 h-16 bg-primary text-white rounded-md shadow-ambient flex items-center justify-center transition-all hover:scale-110 active:scale-90 z-20">
                <Icons.Lightning />
              </button>
            } />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;

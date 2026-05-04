import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TestBuilder } from "../components/features/TestBuilder";
import { ConfigSection } from "../components/features/ConfigSection";

export const Dashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Browser State");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = (url: string, prompt: string) => {
    setIsGenerating(true);
    window.electron.startTest(url, prompt);
    navigate("/execution", { state: { replaying: false } });
  };

  return (
    <div className="flex-1 overflow-y-auto px-10 pb-20">
      <div className="max-w-6xl mx-auto py-6">
        <div className="space-y-10">
          <TestBuilder onGenerate={handleGenerate} isGenerating={isGenerating} />
          <ConfigSection activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>
      </div>
    </div>
  );
};

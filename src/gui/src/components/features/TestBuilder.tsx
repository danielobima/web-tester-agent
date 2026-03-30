
import { useState } from "react";
import { Icons } from "../ui/Icons";

interface TestBuilderProps {
  onGenerate: (url: string, prompt: string) => void;
  isGenerating?: boolean;
}

export const TestBuilder = ({ onGenerate, isGenerating = false }: TestBuilderProps) => {
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");

  const handleSubmit = () => {
    if (url && prompt) {
      onGenerate(url, prompt);
    }
  };

  return (
    <section className="space-y-10 py-6">
      <h2 className="text-4xl font-bold font-display">Build New Test Suite</h2>

      {/* Inputs Section */}
      <div className="flex flex-col gap-4">
        <div className="bg-surface-low rounded-md p-2 flex items-center gap-4 border border-on-surface/5 focus-within:ring-1 ring-primary/20">
          <div className="pl-4 text-on-surface/30 text-sm font-bold w-24">URL</div>
          <input 
            type="text" 
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="flex-1 bg-transparent py-4 text-lg outline-none placeholder:text-on-surface/20 font-medium"
          />
        </div>

        <div className="bg-surface-low rounded-md p-2 flex items-center gap-4 border border-on-surface/5 focus-within:ring-1 ring-primary/20">
          <div className="pl-4 text-primary">
            <Icons.Wand />
          </div>
          <input 
            type="text" 
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the user journey to test..."
            className="flex-1 bg-transparent py-4 text-lg outline-none placeholder:text-on-surface/30 font-medium"
          />
          <button 
            onClick={handleSubmit}
            disabled={isGenerating || !url || !prompt}
            className={`bg-primary text-white flex items-center gap-2 px-8 py-4 rounded-md font-bold transition-all hover:px-10 active:scale-95 text-lg ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isGenerating ? "Generating..." : "Generate Script"} <Icons.ChevronRight />
          </button>
        </div>
      </div>
    </section>
  );
};

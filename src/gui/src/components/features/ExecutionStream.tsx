import { Icons } from "../ui/Icons";

export interface TestStep {
  id: string;
  step: string;
  status: "success" | "failed" | "pending";
  duration: string;
  description: string;
  error?: string;
}

interface ExecutionStreamProps {
  results: TestStep[];
  isGenerating?: boolean;
}

export const ExecutionStream = ({
  results,
  isGenerating = false,
}: ExecutionStreamProps) => {
  return (
    <div className="h-full bg-surface-lowest rounded-md shadow-ambient overflow-hidden flex flex-col border border-on-surface/5">
      <div className="h-14 bg-surface-low flex items-center justify-between px-6 border-b border-on-surface/5 shrink-0">
        <div className="flex items-center gap-3">
          <Icons.Dashboard />
          <span className="text-sm font-bold">Execution Stream</span>
        </div>
        <div className="flex gap-4">
          {isGenerating && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                Live Data
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 p-6 space-y-4 overflow-y-auto bg-surface-lowest">
        {results.length === 0 && !isGenerating ? (
          <div className="h-full flex flex-col items-center justify-center text-on-surface/20 space-y-4 pt-20">
            <Icons.Wand />
            <p className="text-sm font-medium">
              Enter a URL and prompt to begin testing
            </p>
          </div>
        ) : (
          results.map((result) => (
            <div
              key={result.id}
              className={`p-5 rounded-md border border-on-surface/5 transition-all flex flex-col gap-3 group hover:shadow-sm ${
                result.status === "failed"
                  ? "bg-orange-600/5 ring-1 ring-orange-600/10"
                  : "bg-surface-low hover:bg-surface-lowest"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-1.5 rounded-sm ${
                      result.status === "success"
                        ? "bg-primary/10 text-primary"
                        : result.status === "failed"
                          ? "bg-orange-600/10 text-orange-600"
                          : "bg-on-surface/5 text-on-surface/30"
                    }`}
                  >
                    {result.status === "success" && <Icons.CheckCircle />}
                    {result.status === "failed" && <Icons.XCircle />}
                    {result.status === "pending" && <Icons.Play />}
                  </div>
                  <span className="font-bold text-sm">{result.step}</span>
                </div>
                <span className="text-[10px] font-bold text-on-surface/30">
                  {result.duration}
                </span>
              </div>

              <p className="text-sm font-medium text-on-surface/60 leading-relaxed pl-10">
                {result.description}
              </p>

              {result.error && (
                <div className="ml-10 mt-1 p-3 bg-surface-lowest rounded border border-orange-600/10">
                  <code className="text-xs text-orange-600 font-mono italic">
                    Error: {result.error}
                  </code>
                </div>
              )}
            </div>
          ))
        )}
        {isGenerating && (
          <div className="p-5 rounded-md border border-on-surface/5 bg-surface-low animate-pulse flex items-center gap-3">
            <div className="p-1.5 rounded-sm bg-on-surface/5 w-6 h-6"></div>
            <div className="h-4 bg-on-surface/5 rounded w-1/2"></div>
          </div>
        )}
      </div>

      <div className="h-12 bg-surface-low border-t border-on-surface/5 flex items-center justify-between px-6 shrink-0 mt-auto">
        <div className="text-[10px] font-bold text-on-surface/30 uppercase tracking-widest">
          {results.length} steps executed |{" "}
          {results.filter((r) => r.status === "failed").length} failures
        </div>
        <div className="flex gap-6 text-[10px] font-bold uppercase tracking-widest">
          <span className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors">
            <Icons.TestSuites /> Replay
          </span>
        </div>
      </div>
    </div>
  );
};

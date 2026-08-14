import React, { useState, useEffect } from "react";
import { Icons } from "../ui/Icons";

interface CookieItem {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

interface LocalStorageOrigin {
  origin: string;
  localStorage: { name: string; value: string }[];
}

interface AuthProfileViewerProps {
  profileId: string;
  onClose: () => void;
}

export const AuthProfileViewer: React.FC<AuthProfileViewerProps> = ({
  profileId,
  onClose,
}) => {
  const [data, setData] = useState<{
    profile: any;
    fileExists: boolean;
    cookies: CookieItem[];
    origins: LocalStorageOrigin[];
    rawJson: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"cookies" | "storage" | "raw">("cookies");
  const [revealedValues, setRevealedValues] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const details = await window.electron.getAuthProfileDetails(profileId);
        setData(details);
      } catch (err) {
        console.error("Failed to load auth profile details:", err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [profileId]);

  const toggleReveal = (key: string) => {
    setRevealedValues((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const formatCookieExpiry = (expires?: number) => {
    if (!expires || expires === -1) return "Session (Expires when closed)";
    const date = new Date(expires * 1000);
    if (isNaN(date.getTime())) return "Unknown";
    const isPast = date.getTime() <= Date.now();
    return `${date.toLocaleString()} ${isPast ? "(Expired)" : ""}`;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-surface-low border border-on-surface/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-on-surface/5 flex items-center justify-between bg-surface-low/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Icons.Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold font-display text-on-surface">
                  {data?.profile?.name || "Auth Profile Details"}
                </h2>
                {data && (
                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                      data.fileExists
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-amber-500/10 text-amber-500"
                    }`}
                  >
                    {data.fileExists ? "Session Snapshot Saved" : "Session Not Captured Yet"}
                  </span>
                )}
              </div>
              <p className="text-xs text-on-surface/40 mt-0.5">
                {data?.profile?.description || "Authentication cookies and localStorage tokens snapshot"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-on-surface/40 hover:text-on-surface hover:bg-on-surface/5 rounded-lg transition-colors"
          >
            <Icons.Close />
          </button>
        </div>

        {/* Tabs Bar */}
        <div className="px-6 border-b border-on-surface/5 flex gap-6 bg-surface-low/40">
          {[
            {
              id: "cookies" as const,
              label: `Cookies (${data?.cookies?.length || 0})`,
            },
            {
              id: "storage" as const,
              label: `Local Storage (${data?.origins?.reduce((acc, o) => acc + (o.localStorage?.length || 0), 0) || 0})`,
            },
            {
              id: "raw" as const,
              label: "Raw Storage State JSON",
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 text-xs font-bold border-b-2 transition-all ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-on-surface/40 hover:text-on-surface"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="py-20 text-center text-on-surface/40 text-sm font-medium">
              Loading session state...
            </div>
          ) : !data?.fileExists ? (
            <div className="py-16 text-center space-y-3 bg-surface-lowest rounded-xl border border-dashed border-on-surface/10">
              <div className="w-12 h-12 rounded-full bg-on-surface/5 flex items-center justify-center mx-auto text-on-surface/30">
                <Icons.Lock className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-on-surface/60">No Session Snapshot Captured Yet</p>
              <p className="text-xs text-on-surface/40 max-w-md mx-auto">
                Run the associated login test with <strong>"Capture session state on success"</strong> enabled to populate this Auth Profile with cookies and localStorage.
              </p>
            </div>
          ) : (
            <>
              {/* Cookies View */}
              {activeTab === "cookies" && (
                <div className="space-y-4">
                  {data.cookies.length === 0 ? (
                    <p className="text-xs text-on-surface/40 text-center py-10">No cookies stored in this profile.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-on-surface/10 text-[10px] uppercase tracking-wider text-on-surface/40">
                            <th className="pb-2 font-bold">Name</th>
                            <th className="pb-2 font-bold">Value</th>
                            <th className="pb-2 font-bold">Domain & Path</th>
                            <th className="pb-2 font-bold">Security</th>
                            <th className="pb-2 font-bold">Expires</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-on-surface/5 font-mono">
                          {data.cookies.map((c, i) => {
                            const key = `cookie-${i}-${c.name}`;
                            const isRevealed = !!revealedValues[key];
                            return (
                              <tr key={i} className="hover:bg-surface-lowest/50 transition-colors">
                                <td className="py-3 font-bold text-primary max-w-[160px] truncate pr-2">
                                  {c.name}
                                </td>
                                <td className="py-3 pr-4 max-w-[220px]">
                                  <div className="flex items-center gap-2">
                                    <span className="truncate text-on-surface/80">
                                      {isRevealed ? c.value : "••••••••••••••••"}
                                    </span>
                                    <button
                                      onClick={() => toggleReveal(key)}
                                      className="text-[10px] text-on-surface/40 hover:text-on-surface font-sans"
                                      title={isRevealed ? "Hide" : "Reveal"}
                                    >
                                      {isRevealed ? "Hide" : "Show"}
                                    </button>
                                    <button
                                      onClick={() => handleCopy(c.value, key)}
                                      className="text-[10px] text-primary hover:underline font-sans"
                                      title="Copy Value"
                                    >
                                      {copiedKey === key ? "Copied!" : "Copy"}
                                    </button>
                                  </div>
                                </td>
                                <td className="py-3 text-on-surface/60 pr-2">
                                  <span className="text-on-surface/80">{c.domain}</span>
                                  <span className="text-on-surface/40 text-[10px] ml-1">({c.path || "/"})</span>
                                </td>
                                <td className="py-3 pr-2">
                                  <div className="flex gap-1 flex-wrap">
                                    {c.httpOnly && (
                                      <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 text-[9px] font-bold">
                                        HttpOnly
                                      </span>
                                    )}
                                    {c.secure && (
                                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[9px] font-bold">
                                        Secure
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 text-on-surface/40 text-[10px] font-sans">
                                  {formatCookieExpiry(c.expires)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Local Storage View */}
              {activeTab === "storage" && (
                <div className="space-y-6">
                  {data.origins.length === 0 ? (
                    <p className="text-xs text-on-surface/40 text-center py-10">No localStorage entries stored in this profile.</p>
                  ) : (
                    data.origins.map((originObj, oIdx) => (
                      <div key={oIdx} className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-on-surface/60 uppercase tracking-wider">Origin:</span>
                          <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                            {originObj.origin}
                          </span>
                        </div>

                        <div className="space-y-2">
                          {originObj.localStorage.map((item, iIdx) => {
                            const key = `ls-${oIdx}-${iIdx}-${item.name}`;
                            const isRevealed = !!revealedValues[key];
                            return (
                              <div
                                key={iIdx}
                                className="p-3 bg-surface-lowest rounded-xl border border-on-surface/5 flex flex-col gap-1.5"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-bold text-xs text-on-surface">
                                    {item.name}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => toggleReveal(key)}
                                      className="text-xs text-on-surface/40 hover:text-on-surface"
                                    >
                                      {isRevealed ? "Collapse" : "Expand / Reveal"}
                                    </button>
                                    <button
                                      onClick={() => handleCopy(item.value, key)}
                                      className="text-xs text-primary font-bold hover:underline"
                                    >
                                      {copiedKey === key ? "Copied!" : "Copy"}
                                    </button>
                                  </div>
                                </div>
                                <div className="font-mono text-xs text-on-surface/60 break-all bg-surface-low/50 p-2 rounded-lg max-h-36 overflow-y-auto">
                                  {isRevealed ? item.value : item.value.slice(0, 40) + (item.value.length > 40 ? "..." : "")}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Raw JSON View */}
              {activeTab === "raw" && (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleCopy(data.rawJson, "raw-json")}
                      className="bg-surface-lowest hover:bg-surface-low border border-on-surface/10 text-xs font-bold px-3 py-1.5 rounded-lg text-on-surface/80 flex items-center gap-1.5 transition-colors"
                    >
                      <Icons.Code className="w-3.5 h-3.5" />
                      {copiedKey === "raw-json" ? "Copied to Clipboard!" : "Copy Full JSON"}
                    </button>
                  </div>
                  <pre className="p-4 bg-surface-lowest border border-on-surface/10 rounded-xl font-mono text-xs text-on-surface/70 overflow-x-auto max-h-[450px]">
                    {data.rawJson}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-on-surface/5 flex justify-between items-center bg-surface-low/60 text-xs text-on-surface/40">
          <span>
            Storage Path: <code className="font-mono text-[11px] text-on-surface/60">{data?.profile?.storageStatePath}</code>
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-surface-lowest hover:bg-surface-low border border-on-surface/10 font-bold text-on-surface"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

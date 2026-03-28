import { useEffect, useState } from "react";
import { checkOllamaStatus } from "../lib/ollama";
import { getSettings, getActiveProfile } from "../lib/storage";
import { generateStream } from "../lib/ollama";
import { promptGeneratePost } from "../lib/prompts";
import type { OllamaStatus, UserBrandProfile, AppSettings } from "../types";

type View = "home" | "draft" | "score";

export default function Popup() {
  const [status, setStatus] = useState<OllamaStatus>("checking");
  const [profile, setProfile] = useState<UserBrandProfile | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [view, setView] = useState<View>("home");

  // Draft state
  const [topic, setTopic] = useState("");
  const [pillar, setPillar] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setSettings(s);
      const p = await getActiveProfile();
      setProfile(p);
      const ollamaStatus = await checkOllamaStatus(s.ollamaUrl);
      setStatus(ollamaStatus);
    })();
  }, []);

  const openDashboard = () => {
    chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
    window.close();
  };

  const handleGenerate = async () => {
    if (!profile || !settings || !topic.trim()) return;
    setOutput("");
    setLoading(true);

    const { system, user } = promptGeneratePost(profile, topic, pillar || profile.contentPillars[0]);

    try {
      await generateStream(
        user,
        system,
        settings.defaultModel,
        (chunk) => setOutput((prev) => prev + chunk),
        () => setLoading(false),
        settings.ollamaUrl
      );
    } catch (err) {
      setOutput("⚠️ Could not connect to Ollama. Make sure it is running.");
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(output);
  };

  return (
    <div className="flex flex-col h-full font-sans">
      {/* Header */}
      <header className="bg-linkedin-blue text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">LinkedIn AI</span>
          <StatusBadge status={status} />
        </div>
        <button
          onClick={openDashboard}
          className="text-xs text-blue-200 hover:text-white transition"
        >
          Open Dashboard →
        </button>
      </header>

      {/* No profile warning */}
      {!profile && (
        <div className="p-4 bg-yellow-50 border-b border-yellow-200 text-xs text-yellow-800">
          No brand profile set up.{" "}
          <button onClick={openDashboard} className="underline font-semibold">
            Set up profile
          </button>{" "}
          in the dashboard.
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {view === "home" && (
          <>
            <p className="text-xs text-gray-500">
              Quick draft powered by{" "}
              <span className="font-medium text-gray-700">{settings?.defaultModel ?? "..."}</span>{" "}
              running locally.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Topic / Idea</label>
              <textarea
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-linkedin-blue"
                rows={3}
                placeholder="e.g. Why data quality matters more than data quantity"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Content Pillar</label>
              <select
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-linkedin-blue"
                value={pillar}
                onChange={(e) => setPillar(e.target.value)}
              >
                <option value="">— pick a pillar —</option>
                {(profile?.contentPillars ?? []).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => { handleGenerate(); setView("draft"); }}
              disabled={!profile || !topic.trim() || status !== "online" || loading}
              className="w-full bg-linkedin-blue text-white text-sm font-semibold py-2.5 rounded-md disabled:opacity-40 hover:bg-linkedin-dark transition"
            >
              {loading ? "Generating..." : "✦ Generate Draft"}
            </button>
          </>
        )}

        {view === "draft" && (
          <>
            <div className="flex items-center justify-between">
              <button onClick={() => setView("home")} className="text-xs text-gray-500 hover:text-gray-800">
                ← Back
              </button>
              <span className="text-xs text-gray-400">{output.length} chars</span>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-sm leading-relaxed min-h-[180px] whitespace-pre-wrap">
              {output || <span className="text-gray-400 animate-pulse">Generating...</span>}
            </div>

            {output && !loading && (
              <div className="flex gap-2">
                <button
                  onClick={copyToClipboard}
                  className="flex-1 border border-linkedin-blue text-linkedin-blue text-xs font-semibold py-2 rounded-md hover:bg-linkedin-light transition"
                >
                  Copy
                </button>
                <button
                  onClick={openDashboard}
                  className="flex-1 bg-linkedin-blue text-white text-xs font-semibold py-2 rounded-md hover:bg-linkedin-dark transition"
                >
                  Save & Score
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer nav */}
      <footer className="border-t border-gray-100 px-4 py-2 flex justify-around text-xs text-gray-500">
        <button onClick={openDashboard} className="hover:text-linkedin-blue">📊 Dashboard</button>
        <button onClick={openDashboard} className="hover:text-linkedin-blue">📅 Planner</button>
        <button onClick={openDashboard} className="hover:text-linkedin-blue">⚙️ Settings</button>
      </footer>
    </div>
  );
}

function StatusBadge({ status }: { status: OllamaStatus }) {
  const config: Record<OllamaStatus, { color: string; label: string }> = {
    checking: { color: "bg-yellow-400", label: "Checking..." },
    online:   { color: "bg-green-400",  label: "Ollama ✓" },
    offline:  { color: "bg-red-400",    label: "Ollama offline" },
    error:    { color: "bg-orange-400", label: "Error" },
  };
  const { color, label } = config[status];
  return (
    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-white/20`}>
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

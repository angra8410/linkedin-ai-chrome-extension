import { useEffect, useState } from "react";
import { checkOllamaStatus, type OllamaGenerationOptions } from "../lib/ollama";
import { cleanupSourceAdaptation, cleanupTopicExpansion } from "../lib/sourceCleanup";
import { getSettings, getActiveProfile } from "../lib/storage";
import { generateStream } from "../lib/ollama";
import { promptGeneratePost } from "../lib/prompts";
import type {
  OllamaStatus,
  UserBrandProfile,
  AppSettings,
  AppTheme,
  GenerationInputMode,
} from "../types";

type View = "home" | "draft" | "score";

function applyTheme(theme: AppTheme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

const creativeGenerationOptions: OllamaGenerationOptions = {
  temperature: 0.75,
  top_p: 0.82,
  top_k: 30,
  repeat_penalty: 1.14,
};

const sourceFaithfulGenerationOptions: OllamaGenerationOptions = {
  temperature: 0.1,
  top_p: 0.4,
  top_k: 10,
  repeat_penalty: 1.01,
};

export default function Popup() {
  const [status, setStatus] = useState<OllamaStatus>("checking");
  const [profile, setProfile] = useState<UserBrandProfile | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [view, setView] = useState<View>("home");
  const [inputMode, setInputMode] = useState<GenerationInputMode>("topic");

  // Draft state
  const [topic, setTopic] = useState("");
  const [pillar, setPillar] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      applyTheme(s.theme);
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

    const { system, user } = promptGeneratePost(
      profile,
      topic,
      pillar || profile.contentPillars[0],
      inputMode
    );

    try {
      const generationOptions = inputMode === "source"
        ? sourceFaithfulGenerationOptions
        : creativeGenerationOptions;
      let finalText = "";

      await generateStream(
        user,
        system,
        settings.defaultModel,
        (chunk) => {
          finalText += chunk;
          setOutput((prev) => prev + chunk);
        },
        () => setLoading(false),
        settings.ollamaUrl,
        generationOptions
      );

      if (finalText.trim()) {
        setOutput(
          inputMode === "source"
            ? cleanupSourceAdaptation(topic, finalText)
            : cleanupTopicExpansion(topic, finalText)
        );
      }
    } catch (err) {
      setOutput("⚠️ Could not connect to Ollama. Make sure it is running.");
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(output);
  };

  return (
    <div className="flex min-h-[480px] flex-col bg-gray-50 text-gray-900 font-sans dark:bg-slate-950 dark:text-slate-100">
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
        <div className="border-b border-yellow-200 bg-yellow-50 p-4 text-xs text-yellow-800 dark:border-yellow-900/30 dark:bg-yellow-900/20 dark:text-yellow-300">
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
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Quick draft powered by{" "}
              <span className="font-medium text-gray-700 dark:text-slate-200">{settings?.defaultModel ?? "..."}</span>{" "}
              running locally.
            </p>
            <div>
              <div className="mb-2 flex gap-2">
                <button
                  onClick={() => setInputMode("topic")}
                  className={`rounded-full border px-3 py-1 text-[11px] transition ${
                    inputMode === "topic"
                      ? "border-linkedin-blue bg-linkedin-blue text-white"
                      : "border-gray-200 text-gray-600 dark:border-slate-700 dark:text-slate-400"
                  }`}
                >
                  Topic idea
                </button>
                <button
                  onClick={() => setInputMode("source")}
                  className={`rounded-full border px-3 py-1 text-[11px] transition ${
                    inputMode === "source"
                      ? "border-linkedin-blue bg-linkedin-blue text-white"
                      : "border-gray-200 text-gray-600 dark:border-slate-700 dark:text-slate-400"
                  }`}
                >
                  Adapt source
                </button>
              </div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-slate-300">Topic / Idea</label>
              <textarea
                className="w-full resize-none rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-linkedin-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
                rows={3}
                placeholder={
                  inputMode === "source"
                    ? "Paste source material to adapt faithfully"
                    : "e.g. Why data quality matters more than data quantity"
                }
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-slate-300">Content Pillar</label>
              <select
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-linkedin-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
              <button
                onClick={() => setView("home")}
                className="text-xs text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-100"
              >
                ← Back
              </button>
              <span className="text-xs text-gray-400 dark:text-slate-500">{output.length} chars</span>
            </div>

            <div className="min-h-[180px] whitespace-pre-wrap rounded-md border border-gray-200 bg-white p-3 text-sm leading-relaxed dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
              {output || <span className="animate-pulse text-gray-400 dark:text-slate-500">Generating...</span>}
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
      <footer className="flex justify-around border-t border-gray-100 px-4 py-2 text-xs text-gray-500 dark:border-slate-800 dark:text-slate-400">
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

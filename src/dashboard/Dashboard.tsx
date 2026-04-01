import { useEffect, useState } from "react";
import { getSettings, getActiveProfile, saveSettings } from "../lib/storage";
import { checkOllamaStatus } from "../lib/ollama";
import type {
  OllamaStatus,
  UserBrandProfile,
  AppSettings,
  ScoreComparisonPayload,
  DraftPromotionPayload,
  AppTheme,
} from "../types";
import ProfileTab from "./tabs/ProfileTab";
import DraftTab from "./tabs/DraftTab";
import ScoreTab from "./tabs/ScoreTab";
import PlannerTab from "./tabs/PlannerTab";
import AnalyticsTab from "./tabs/AnalyticsTab";
import DraftLibraryTab from "./tabs/DraftLibraryTab";
import SettingsTab from "./tabs/SettingsTab";

type Tab =
  | "draft"
  | "score"
  | "planner"
  | "analytics"
  | "library"
  | "profile"
  | "settings";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "draft", label: "Draft", icon: "✦" },
  { id: "score", label: "Score", icon: "★" },
  { id: "planner", label: "Planner", icon: "📅" },
  { id: "analytics", label: "Analytics", icon: "📊" },
  { id: "library", label: "Library", icon: "📚" },
  { id: "profile", label: "Profile", icon: "👤" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

function applyTheme(theme: AppTheme) {
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("draft");
  const [profile, setProfile] = useState<UserBrandProfile | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>("checking");
  const [scoreSeed, setScoreSeed] = useState<ScoreComparisonPayload | null>(null);
  const [draftSeed, setDraftSeed] = useState<DraftPromotionPayload | null>(null);
  const [themeSaving, setThemeSaving] = useState(false);

  const reload = async () => {
    const s = await getSettings();
    setSettings(s);
    applyTheme(s.theme);

    const p = await getActiveProfile();
    setProfile(p);

    const status = await checkOllamaStatus(s.ollamaUrl);
    setOllamaStatus(status);
  };

  useEffect(() => {
    void reload();
    if (window.location.hash === "#onboarding") {
      setTab("profile");
    }
  }, []);

  useEffect(() => {
    if (!settings) return;
    applyTheme(settings.theme);
  }, [settings]);

  const handleSendToScore = (payload: ScoreComparisonPayload) => {
    setScoreSeed(payload);
    setTab("score");
  };

  const handlePromoteToDraft = (payload: DraftPromotionPayload) => {
    setDraftSeed(payload);
    setTab("draft");
  };

  const handleToggleTheme = async () => {
    if (!settings || themeSaving) return;

    const nextTheme: AppTheme = settings.theme === "dark" ? "light" : "dark";

    setThemeSaving(true);
    setSettings({ ...settings, theme: nextTheme });
    applyTheme(nextTheme);

    try {
      await saveSettings({ theme: nextTheme });
    } finally {
      setThemeSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50 text-gray-900 font-sans dark:bg-slate-950 dark:text-slate-100">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col dark:bg-slate-900 dark:border-slate-800">
        <div className="px-5 py-5 border-b border-gray-100 dark:border-slate-800">
          <h1 className="font-bold text-linkedin-blue text-lg leading-tight">LinkedIn AI</h1>
          <p className="text-xs text-gray-400 mt-0.5 dark:text-slate-400">
            Local · Private · Fast
          </p>
        </div>

        <nav className="flex-1 py-4 space-y-0.5 px-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                tab === t.id
                  ? "bg-linkedin-light text-linkedin-blue dark:bg-slate-800 dark:text-blue-300"
                  : "text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100 dark:border-slate-800">
          <OllamaStatusPanel
            status={ollamaStatus}
            model={settings?.defaultModel ?? "—"}
          />
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-slate-950">
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10 dark:bg-slate-900 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-slate-100">
              {TABS.find((t) => t.id === tab)?.label}
            </h2>
            {profile && (
              <p className="text-xs text-gray-400 dark:text-slate-400">
                {profile.name} · {profile.currentTitle}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => void handleToggleTheme()}
              disabled={themeSaving}
              className="text-xs border border-gray-200 bg-white text-gray-700 font-medium px-3 py-2 rounded-full hover:bg-gray-50 transition disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              title={`Switch to ${settings?.theme === "dark" ? "light" : "dark"} mode`}
            >
              {settings?.theme === "dark" ? "☀️ Light" : "🌙 Dark"}
            </button>

            {!profile && tab !== "profile" && (
              <button
                onClick={() => setTab("profile")}
                className="text-xs bg-yellow-100 text-yellow-800 font-medium px-3 py-1.5 rounded-full hover:bg-yellow-200 transition"
              >
                ⚠️ Set up your brand profile first
              </button>
            )}
          </div>
        </header>

        <div className="p-8">
          {tab === "draft" && (
            <DraftTab
              profile={profile}
              settings={settings}
              onSendToScore={handleSendToScore}
              seedPayload={draftSeed}
            />
          )}

          {tab === "score" && (
            <ScoreTab
              profile={profile}
              settings={settings}
              seedPayload={scoreSeed}
              onPromoteToDraft={handlePromoteToDraft}
            />
          )}

          {tab === "planner" && (
            <PlannerTab
              profile={profile}
              settings={settings}
              onSendToDraft={handlePromoteToDraft}
            />
          )}

          {tab === "analytics" && (
            <AnalyticsTab
              profile={profile}
              settings={settings}
              onReuseInDraft={handlePromoteToDraft}
            />
          )}

          {tab === "library" && (
            <DraftLibraryTab
              profile={profile}
              settings={settings}
              onOpenInDraft={handlePromoteToDraft}
            />
          )}

          {tab === "profile" && <ProfileTab onSave={reload} />}
          {tab === "settings" && <SettingsTab onSave={reload} />}
        </div>
      </main>
    </div>
  );
}

function OllamaStatusPanel({
  status,
  model,
}: {
  status: OllamaStatus;
  model: string;
}) {
  const colors: Record<OllamaStatus, string> = {
    checking: "text-yellow-600 dark:text-yellow-400",
    online: "text-green-600 dark:text-green-400",
    offline: "text-red-500 dark:text-red-400",
    error: "text-orange-500 dark:text-orange-400",
  };

  const labels: Record<OllamaStatus, string> = {
    checking: "Checking...",
    online: "Ollama online",
    offline: "Ollama offline",
    error: "Connection error",
  };

  return (
    <div className="text-xs">
      <div className={`font-semibold ${colors[status]}`}>{labels[status]}</div>
      <div className="text-gray-400 mt-0.5 dark:text-slate-400">Model: {model}</div>
      {status === "offline" && (
        <p className="text-gray-400 mt-1 leading-tight dark:text-slate-400">
          Run <code className="bg-gray-100 px-1 rounded dark:bg-slate-800">ollama serve</code> to start
        </p>
      )}
    </div>
  );
}
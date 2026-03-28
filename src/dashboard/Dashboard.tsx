import { useState, useEffect } from "react";
import { getSettings, getActiveProfile } from "../lib/storage";
import { checkOllamaStatus } from "../lib/ollama";
import type {
  OllamaStatus,
  UserBrandProfile,
  AppSettings,
  ScoreComparisonPayload,
  DraftPromotionPayload,
} from "../types";
import ProfileTab from "./tabs/ProfileTab";
import DraftTab from "./tabs/DraftTab";
import ScoreTab from "./tabs/ScoreTab";
import PlannerTab from "./tabs/PlannerTab";
import AnalyticsTab from "./tabs/AnalyticsTab";
import SettingsTab from "./tabs/SettingsTab";

type Tab = "draft" | "score" | "planner" | "analytics" | "profile" | "settings";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "draft", label: "Draft", icon: "✦" },
  { id: "score", label: "Score", icon: "★" },
  { id: "planner", label: "Planner", icon: "📅" },
  { id: "analytics", label: "Analytics", icon: "📊" },
  { id: "profile", label: "Profile", icon: "👤" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("draft");
  const [profile, setProfile] = useState<UserBrandProfile | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>("checking");
  const [scoreSeed, setScoreSeed] = useState<ScoreComparisonPayload | null>(null);
  const [draftSeed, setDraftSeed] = useState<DraftPromotionPayload | null>(null);

  const reload = async () => {
    const s = await getSettings();
    setSettings(s);

    const p = await getActiveProfile();
    setProfile(p);

    const status = await checkOllamaStatus(s.ollamaUrl);
    setOllamaStatus(status);
  };

  useEffect(() => {
    reload();
    if (window.location.hash === "#onboarding") setTab("profile");
  }, []);

  const handleSendToScore = (payload: ScoreComparisonPayload) => {
    setScoreSeed(payload);
    setTab("score");
  };

  const handlePromoteToDraft = (payload: DraftPromotionPayload) => {
    setDraftSeed(payload);
    setTab("draft");
  };

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-5 py-5 border-b border-gray-100">
          <h1 className="font-bold text-linkedin-blue text-lg leading-tight">LinkedIn AI</h1>
          <p className="text-xs text-gray-400 mt-0.5">Local · Private · Fast</p>
        </div>

        <nav className="flex-1 py-4 space-y-0.5 px-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                tab === t.id
                  ? "bg-linkedin-light text-linkedin-blue"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <OllamaStatusPanel
            status={ollamaStatus}
            model={settings?.defaultModel ?? "—"}
          />
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              {TABS.find((t) => t.id === tab)?.label}
            </h2>
            {profile && (
              <p className="text-xs text-gray-400">
                {profile.name} · {profile.currentTitle}
              </p>
            )}
          </div>

          {!profile && tab !== "profile" && (
            <button
              onClick={() => setTab("profile")}
              className="text-xs bg-yellow-100 text-yellow-800 font-medium px-3 py-1.5 rounded-full hover:bg-yellow-200 transition"
            >
              ⚠️ Set up your brand profile first
            </button>
          )}
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

          {tab === "planner" && <PlannerTab profile={profile} settings={settings} />}
          {tab === "analytics" && <AnalyticsTab profile={profile} settings={settings} />}
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
    checking: "text-yellow-600",
    online: "text-green-600",
    offline: "text-red-500",
    error: "text-orange-500",
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
      <div className="text-gray-400 mt-0.5">Model: {model}</div>
      {status === "offline" && (
        <p className="text-gray-400 mt-1 leading-tight">
          Run <code className="bg-gray-100 px-1 rounded">ollama serve</code> to start
        </p>
      )}
    </div>
  );
}
import { useState, useEffect } from "react";
import { generate } from "../../lib/ollama";
import { promptPerformanceReflection } from "../../lib/prompts";
import { savePerformanceLog, getRecentLogs } from "../../lib/db";
import type { UserBrandProfile, AppSettings, PerformanceLog } from "../../types";

interface Props {
  profile: UserBrandProfile | null;
  settings: AppSettings | null;
}

const FORMATS = ["list", "story", "insight", "question", "data"] as const;

const EMPTY_LOG = {
  postTitle: "",
  pillar: "",
  format: "insight" as PerformanceLog["format"],
  impressions: 0,
  reactions: 0,
  comments: 0,
  reposts: 0,
  profileViews: 0,
  notes: "",
};

export default function AnalyticsTab({ profile, settings }: Props) {
  const [form, setForm] = useState({ ...EMPTY_LOG });
  const [logs, setLogs] = useState<PerformanceLog[]>([]);
  const [insight, setInsight] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const model = settings?.defaultModel ?? "mistral";
  const ollamaUrl = settings?.ollamaUrl ?? "http://localhost:11434";

  useEffect(() => {
    getRecentLogs(20).then(setLogs);
  }, [saved]);

  const handleSave = async () => {
    if (!form.postTitle.trim()) return;
    setSaving(true);
    await savePerformanceLog({
      ...form,
      id: crypto.randomUUID(),
      postedAt: Date.now(),
      createdAt: Date.now(),
    });
    setForm({ ...EMPTY_LOG });
    setSaved((p) => !p);
    setSaving(false);
  };

  const handleInsight = async () => {
    if (logs.length < 3) {
      alert("Log at least 3 posts to generate insights.");
      return;
    }
    setInsightLoading(true);
    setInsight("");
    try {
      const { system, user } = promptPerformanceReflection(JSON.stringify(logs.slice(0, 15), null, 2));
      const raw = await generate(user, system, model, ollamaUrl);
      const cleaned = raw.replace(/```json|```/gi, "").trim();
      const parsed = JSON.parse(cleaned);
      setInsight(
        `📌 Top pillar: ${parsed.topPillar}\n` +
        `📐 Top format: ${parsed.topFormat}\n` +
        `⏰ Best timing: ${parsed.bestTiming}\n\n` +
        `✅ Do more: ${parsed.recommendation}\n` +
        `🚫 Stop doing: ${parsed.stopDoing}`
      );
    } catch {
      setInsight("Could not parse insights. Try again with more logs.");
    } finally {
      setInsightLoading(false);
    }
  };

  const engagementRate = (log: PerformanceLog) => {
    if (!log.impressions) return "—";
    const rate = ((log.reactions + log.comments + log.reposts) / log.impressions) * 100;
    return `${rate.toFixed(2)}%`;
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Log a post */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-semibold text-gray-800">Log Post Performance</h3>
        <p className="text-xs text-gray-400">Manually enter metrics from LinkedIn. Your data stays on your device.</p>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-600 mb-1 block">Post title / topic</label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-linkedin-blue"
              placeholder="e.g. Why data quality matters more than volume"
              value={form.postTitle}
              onChange={(e) => setForm({ ...form, postTitle: e.target.value })}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Pillar</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-linkedin-blue"
              value={form.pillar}
              onChange={(e) => setForm({ ...form, pillar: e.target.value })}
            >
              <option value="">— select —</option>
              {(profile?.contentPillars ?? []).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Format</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-linkedin-blue"
              value={form.format}
              onChange={(e) => setForm({ ...form, format: e.target.value as PerformanceLog["format"] })}
            >
              {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          {(["impressions", "reactions", "comments", "reposts", "profileViews"] as const).map((field) => (
            <div key={field}>
              <label className="text-xs font-medium text-gray-600 mb-1 block capitalize">
                {field === "profileViews" ? "Profile views (approx)" : field}
              </label>
              <input
                type="number"
                min={0}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-linkedin-blue"
                value={form[field] || ""}
                onChange={(e) => setForm({ ...form, [field]: parseInt(e.target.value) || 0 })}
              />
            </div>
          ))}

          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-600 mb-1 block">Notes</label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-linkedin-blue"
              placeholder="e.g. Posted at 8am, got a recruiter DM"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!form.postTitle.trim() || saving}
          className="w-full bg-linkedin-blue text-white font-semibold py-3 rounded-xl disabled:opacity-40 hover:bg-linkedin-dark transition"
        >
          {saving ? "Saving..." : "Save Entry"}
        </button>
      </div>

      {/* Insight engine */}
      {logs.length >= 3 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">AI Insights</h3>
            <span className="text-xs text-gray-400">{logs.length} posts logged</span>
          </div>
          <button
            onClick={handleInsight}
            disabled={insightLoading}
            className="px-4 py-2.5 text-sm bg-gray-800 text-white rounded-xl hover:bg-gray-700 transition disabled:opacity-40"
          >
            {insightLoading ? "Analyzing..." : "✦ Analyze Performance"}
          </button>
          {insight && (
            <div className="bg-linkedin-light rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
              {insight}
            </div>
          )}
        </div>
      )}

      {/* Log table */}
      {logs.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800 text-sm">Recent Posts</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Post</th>
                  <th className="px-4 py-3 font-medium">Pillar</th>
                  <th className="px-4 py-3 font-medium">Impressions</th>
                  <th className="px-4 py-3 font-medium">Reactions</th>
                  <th className="px-4 py-3 font-medium">Engagement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-medium text-gray-700 max-w-[200px] truncate">{log.postTitle}</td>
                    <td className="px-4 py-3 text-gray-500">{log.pillar || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{log.impressions.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-600">{log.reactions}</td>
                    <td className="px-4 py-3 text-linkedin-blue font-semibold">{engagementRate(log)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

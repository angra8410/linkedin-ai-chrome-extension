import { useState, useEffect } from "react";
import { generate } from "../../lib/ollama";
import { promptPerformanceReflection } from "../../lib/prompts";
import {
  savePerformanceLog,
  getRecentLogs,
  getRecentDrafts,
  getScoredDrafts,
} from "../../lib/db";
import type {
  UserBrandProfile,
  AppSettings,
  PerformanceLog,
  PostDraft,
  DraftPromotionPayload,
} from "../../types";

interface Props {
  profile: UserBrandProfile | null;
  settings: AppSettings | null;
  onReuseInDraft: (payload: DraftPromotionPayload) => void;
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

export default function AnalyticsTab({ profile, settings, onReuseInDraft }: Props) {
  const [form, setForm] = useState({ ...EMPTY_LOG });
  const [logs, setLogs] = useState<PerformanceLog[]>([]);
  const [recentDrafts, setRecentDrafts] = useState<PostDraft[]>([]);
  const [scoredDrafts, setScoredDrafts] = useState<PostDraft[]>([]);
  const [insight, setInsight] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const model = settings?.defaultModel ?? "llama3.1:latest";
  const ollamaUrl = settings?.ollamaUrl ?? "http://localhost:11434";

  useEffect(() => {
    (async () => {
      const [recentLogs, drafts, scored] = await Promise.all([
        getRecentLogs(20),
        getRecentDrafts(12),
        getScoredDrafts(8),
      ]);

      setLogs(recentLogs);
      setRecentDrafts(drafts);
      setScoredDrafts(scored);
    })();
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
      const { system, user } = promptPerformanceReflection(
        JSON.stringify(logs.slice(0, 15), null, 2)
      );

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

  const draftScoreColor = (score?: number) => {
    if (score === undefined) return "text-gray-400 bg-gray-100";
    if (score >= 8) return "text-green-700 bg-green-100";
    if (score >= 6) return "text-yellow-700 bg-yellow-100";
    return "text-red-700 bg-red-100";
  };

  const draftStatusColor = (status: PostDraft["status"]) => {
    if (status === "ready") return "text-green-700 bg-green-100";
    if (status === "posted") return "text-linkedin-blue bg-linkedin-light";
    return "text-gray-600 bg-gray-100";
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const truncate = (text: string, max = 220) => {
    if (text.length <= max) return text;
    return `${text.slice(0, max).trim()}...`;
  };

  const reuseDraft = (draft: PostDraft) => {
    onReuseInDraft({
      content: draft.content,
      sourceLabel: "Analytics history",
      sourceTopic: draft.prompt,
      scoringResult: draft.scoringResult,
      createdAt: Date.now(),
    });
  };

  return (
    <div className="max-w-5xl space-y-6">
      {/* Draft history */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800">Draft History</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Review your recent saved drafts and the strongest scored ones.
            </p>
          </div>
          <span className="text-xs text-gray-400">
            {recentDrafts.length} recent · {scoredDrafts.length} scored
          </span>
        </div>

        <div className="grid lg:grid-cols-2 gap-0">
          <div className="p-6 border-b lg:border-b-0 lg:border-r border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-700">Top scored drafts</h4>
              <span className="text-xs text-gray-400">Best first</span>
            </div>

            {scoredDrafts.length === 0 ? (
              <div className="text-sm text-gray-500 bg-gray-50 rounded-xl p-4">
                No scored drafts yet. Score a draft in the Score tab, promote it back to Draft, and save it.
              </div>
            ) : (
              <div className="space-y-3">
                {scoredDrafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="border border-gray-200 rounded-xl p-4 bg-green-50/30 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-xs text-gray-400">
                        {formatDate(draft.createdAt)}
                      </div>
                      <div className="flex gap-2 flex-wrap justify-end">
                        <span
                          className={`text-[11px] px-2 py-1 rounded-full font-semibold ${draftScoreColor(
                            draft.scoringResult?.totalScore
                          )}`}
                        >
                          Score {draft.scoringResult?.totalScore?.toFixed(1) ?? "—"}
                        </span>
                        <span
                          className={`text-[11px] px-2 py-1 rounded-full font-semibold ${draftStatusColor(
                            draft.status
                          )}`}
                        >
                          {draft.status}
                        </span>
                      </div>
                    </div>

                    <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {truncate(draft.content, 260)}
                    </div>

                    <div className="flex gap-3 flex-wrap">
                      <button
                        onClick={() => navigator.clipboard.writeText(draft.content)}
                        className="text-xs text-linkedin-blue underline"
                      >
                        Copy draft
                      </button>
                      <button
                        onClick={() => reuseDraft(draft)}
                        className="text-xs text-linkedin-blue underline"
                      >
                        Reuse in Draft
                      </button>
                      <span className="text-xs text-gray-400">
                        Model: {draft.model}
                      </span>
                      <span className="text-xs text-gray-400">
                        Pillar: {draft.pillar || "—"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-700">Recent saved drafts</h4>
              <span className="text-xs text-gray-400">Most recent first</span>
            </div>

            {recentDrafts.length === 0 ? (
              <div className="text-sm text-gray-500 bg-gray-50 rounded-xl p-4">
                No saved drafts yet. Save one from the Draft tab to start building your local content history.
              </div>
            ) : (
              <div className="space-y-3">
                {recentDrafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="border border-gray-200 rounded-xl p-4 bg-gray-50/60 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-xs text-gray-400">
                        {formatDate(draft.createdAt)}
                      </div>
                      <div className="flex gap-2 flex-wrap justify-end">
                        {draft.scoringResult && (
                          <span
                            className={`text-[11px] px-2 py-1 rounded-full font-semibold ${draftScoreColor(
                              draft.scoringResult.totalScore
                            )}`}
                          >
                            {draft.scoringResult.totalScore.toFixed(1)}/10
                          </span>
                        )}
                        <span
                          className={`text-[11px] px-2 py-1 rounded-full font-semibold ${draftStatusColor(
                            draft.status
                          )}`}
                        >
                          {draft.status}
                        </span>
                      </div>
                    </div>

                    <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {truncate(draft.content, 220)}
                    </div>

                    <div className="flex gap-3 flex-wrap">
                      <button
                        onClick={() => navigator.clipboard.writeText(draft.content)}
                        className="text-xs text-linkedin-blue underline"
                      >
                        Copy draft
                      </button>
                      <button
                        onClick={() => reuseDraft(draft)}
                        className="text-xs text-linkedin-blue underline"
                      >
                        Reuse in Draft
                      </button>
                      <span className="text-xs text-gray-400">
                        Variants: {draft.variants.length}
                      </span>
                      <span className="text-xs text-gray-400">
                        Pillar: {draft.pillar || "—"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Log a post */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-semibold text-gray-800">Log Post Performance</h3>
        <p className="text-xs text-gray-400">
          Manually enter metrics from LinkedIn. Your data stays on your device.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Post title / topic
            </label>
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
              onChange={(e) =>
                setForm({ ...form, format: e.target.value as PerformanceLog["format"] })
              }
            >
              {FORMATS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
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
                onChange={(e) =>
                  setForm({ ...form, [field]: parseInt(e.target.value) || 0 })
                }
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
                    <td className="px-4 py-3 font-medium text-gray-700 max-w-[200px] truncate">
                      {log.postTitle}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{log.pillar || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {log.impressions.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{log.reactions}</td>
                    <td className="px-4 py-3 text-linkedin-blue font-semibold">
                      {engagementRate(log)}
                    </td>
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
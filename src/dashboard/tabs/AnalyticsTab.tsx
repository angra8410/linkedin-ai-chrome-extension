import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { generate } from "../../lib/ollama";
import { promptPerformanceReflection } from "../../lib/prompts";
import {
  ANALYTICS_SEED_EVENT,
  clearAnalyticsSeed,
  getAnalyticsSeed,
  getRecentLogs,
  getRecentDrafts,
  getScoredDrafts,
  savePerformanceLog,
  updatePerformanceLog,
  getPerformanceLogBySourceDraftId,
  deleteDraft,
} from "../../lib/db";
import type {
  UserBrandProfile,
  AppSettings,
  PerformanceLog,
  PerformanceLogSeedPayload,
  PostDraft,
  DraftPromotionPayload,
} from "../../types";

interface Props {
  profile: UserBrandProfile | null;
  settings: AppSettings | null;
  onReuseInDraft: (payload: DraftPromotionPayload) => void;
}

type AnalyticsFormState = {
  sourceDraftId?: string;
  postTitle: string;
  pillar: string;
  format: PerformanceLog["format"];
  postedAt: string;
  impressions: number;
  reactions: number;
  comments: number;
  reposts: number;
  profileViews: number;
  notes: string;
};

type ExportRow = {
  "Post": string;
  "Posted At": string;
  "Last Updated": string;
  "Pillar": string;
  "Format": string;
  "Impressions": number;
  "Reactions": number;
  "Comments": number;
  "Reposts": number;
  "Profile Views": number;
  "Engagement Rate": string;
  "Notes": string;
  "Source Draft ID": string;
  "Log ID": string;
};

const FORMATS = ["list", "story", "insight", "question", "data"] as const;

const EXPORT_COLUMNS: Array<keyof ExportRow> = [
  "Post",
  "Posted At",
  "Last Updated",
  "Pillar",
  "Format",
  "Impressions",
  "Reactions",
  "Comments",
  "Reposts",
  "Profile Views",
  "Engagement Rate",
  "Notes",
  "Source Draft ID",
  "Log ID",
];

function toDatetimeLocalValue(timestamp: number): string {
  const date = new Date(timestamp);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function createEmptyForm(): AnalyticsFormState {
  return {
    sourceDraftId: undefined,
    postTitle: "",
    pillar: "",
    format: "insight",
    postedAt: toDatetimeLocalValue(Date.now()),
    impressions: 0,
    reactions: 0,
    comments: 0,
    reposts: 0,
    profileViews: 0,
    notes: "",
  };
}

function buildFormFromSeed(seed: PerformanceLogSeedPayload): AnalyticsFormState {
  return {
    sourceDraftId: seed.sourceDraftId,
    postTitle: seed.postTitle,
    pillar: seed.pillar,
    format: seed.format ?? "insight",
    postedAt: toDatetimeLocalValue(seed.postedAt),
    impressions: 0,
    reactions: 0,
    comments: 0,
    reposts: 0,
    profileViews: 0,
    notes: "",
  };
}

function buildFormFromLog(log: PerformanceLog): AnalyticsFormState {
  return {
    sourceDraftId: log.sourceDraftId,
    postTitle: log.postTitle,
    pillar: log.pillar,
    format: log.format,
    postedAt: toDatetimeLocalValue(log.postedAt),
    impressions: log.impressions,
    reactions: log.reactions,
    comments: log.comments,
    reposts: log.reposts,
    profileViews: log.profileViews,
    notes: log.notes,
  };
}

function escapeCsvValue(value: string | number): string {
  const stringValue = String(value ?? "");
  const escaped = stringValue.replace(/"/g, "\"\"");
  return `"${escaped}"`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildTimestampForFilename(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "_",
    pad(now.getHours()),
    pad(now.getMinutes()),
  ].join("");
}

export default function AnalyticsTab({ profile, settings, onReuseInDraft }: Props) {
  const [form, setForm] = useState<AnalyticsFormState>(createEmptyForm());
  const [seed, setSeed] = useState<PerformanceLogSeedPayload | null>(null);
  const [logs, setLogs] = useState<PerformanceLog[]>([]);
  const [recentDrafts, setRecentDrafts] = useState<PostDraft[]>([]);
  const [scoredDrafts, setScoredDrafts] = useState<PostDraft[]>([]);
  const [insight, setInsight] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [draftHistoryOpen, setDraftHistoryOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<PerformanceLog | null>(null);

  const formSectionRef = useRef<HTMLDivElement | null>(null);
  const insightsSectionRef = useRef<HTMLDivElement | null>(null);
  const recentPostsSectionRef = useRef<HTMLDivElement | null>(null);
  const draftHistorySectionRef = useRef<HTMLDivElement | null>(null);

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
  }, [refreshKey]);

  const scrollToSection = (ref: { current: HTMLDivElement | null }) => {
    ref.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  useEffect(() => {
    let cancelled = false;

    const applySeed = async () => {
      const nextSeed = getAnalyticsSeed();

      if (!nextSeed) {
        return;
      }

      const existingLog = await getPerformanceLogBySourceDraftId(nextSeed.sourceDraftId);

      if (cancelled) {
        return;
      }

      setSeed(nextSeed);

      if (existingLog) {
        setEditingLog(existingLog);
        setForm(buildFormFromLog(existingLog));
      } else {
        setEditingLog(null);
        setForm(buildFormFromSeed(nextSeed));
      }

      requestAnimationFrame(() => {
        scrollToSection(formSectionRef);
      });
    };

    void applySeed();

    const handleSeedUpdated = () => {
      void applySeed();
    };

    window.addEventListener(
      ANALYTICS_SEED_EVENT,
      handleSeedUpdated as EventListener
    );

    return () => {
      cancelled = true;
      window.removeEventListener(
        ANALYTICS_SEED_EVENT,
        handleSeedUpdated as EventListener
      );
    };
  }, []);

  const handleSave = async () => {
    if (!form.postTitle.trim()) return;

    setSaving(true);

    const now = Date.now();
    const postedTimestamp = form.postedAt
      ? new Date(form.postedAt).getTime()
      : now;

    let nextEditingLog: PerformanceLog | null = editingLog;

    if (!nextEditingLog && form.sourceDraftId) {
      nextEditingLog = await getPerformanceLogBySourceDraftId(form.sourceDraftId);
    }

    if (nextEditingLog) {
      await updatePerformanceLog({
        ...nextEditingLog,
        sourceDraftId: form.sourceDraftId,
        postTitle: form.postTitle.trim(),
        postedAt: postedTimestamp,
        pillar: form.pillar,
        format: form.format,
        impressions: form.impressions,
        reactions: form.reactions,
        comments: form.comments,
        reposts: form.reposts,
        profileViews: form.profileViews,
        notes: form.notes.trim(),
        updatedAt: now,
      });
    } else {
      await savePerformanceLog({
        id: crypto.randomUUID(),
        sourceDraftId: form.sourceDraftId,
        postTitle: form.postTitle.trim(),
        postedAt: postedTimestamp,
        pillar: form.pillar,
        format: form.format,
        impressions: form.impressions,
        reactions: form.reactions,
        comments: form.comments,
        reposts: form.reposts,
        profileViews: form.profileViews,
        notes: form.notes.trim(),
        createdAt: now,
        updatedAt: now,
      });
    }

    if (seed?.sourceDraftId && seed.sourceDraftId === form.sourceDraftId) {
      clearAnalyticsSeed();
      setSeed(null);
    }

    setEditingLog(null);
    setForm(createEmptyForm());
    setRefreshKey((p) => p + 1);
    setSaving(false);

    requestAnimationFrame(() => {
      scrollToSection(recentPostsSectionRef);
    });
  };

  const handleClearPrefill = () => {
    clearAnalyticsSeed();
    setSeed(null);
    setEditingLog(null);
    setForm(createEmptyForm());
  };

  const handleCancelEdit = () => {
    setEditingLog(null);

    if (seed) {
      setForm(buildFormFromSeed(seed));
      return;
    }

    setForm(createEmptyForm());
  };

  const handleEditMetrics = (log: PerformanceLog) => {
    setEditingLog(log);
    setForm(buildFormFromLog(log));

    requestAnimationFrame(() => {
      scrollToSection(formSectionRef);
    });
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

  const handleDeleteDraft = async (draft: PostDraft) => {
    const preview =
      draft.prompt?.trim() ||
      draft.content.slice(0, 60).replace(/\s+/g, " ").trim();

    const confirmed = window.confirm(
      `Delete this draft?\n\n${preview}${preview.length >= 60 ? "..." : ""}`
    );

    if (!confirmed) return;

    try {
      setDeletingDraftId(draft.id);
      await deleteDraft(draft.id);
      setRefreshKey((p) => p + 1);
    } finally {
      setDeletingDraftId(null);
    }
  };

  const engagementRate = (log: PerformanceLog) => {
    if (!log.impressions) return "—";
    const rate =
      ((log.reactions + log.comments + log.reposts) / log.impressions) * 100;
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

  const formatDateTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
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

  const seedPreview = useMemo(() => {
    if (!seed?.contentSnippet) {
      return "";
    }

    return truncate(seed.contentSnippet, 180);
  }, [seed]);

  const exportRows = useMemo<ExportRow[]>(() => {
    return logs.map((log) => ({
      "Post": log.postTitle,
      "Posted At": formatDateTime(log.postedAt),
      "Last Updated": formatDateTime(log.updatedAt ?? log.createdAt),
      "Pillar": log.pillar || "",
      "Format": log.format,
      "Impressions": log.impressions,
      "Reactions": log.reactions,
      "Comments": log.comments,
      "Reposts": log.reposts,
      "Profile Views": log.profileViews,
      "Engagement Rate": engagementRate(log),
      "Notes": log.notes || "",
      "Source Draft ID": log.sourceDraftId ?? "",
      "Log ID": log.id,
    }));
  }, [logs]);

  const handleExportCsv = () => {
    if (exportRows.length === 0) return;

    const header = EXPORT_COLUMNS.map((column) => escapeCsvValue(column)).join(",");
    const lines = exportRows.map((row) =>
      EXPORT_COLUMNS.map((column) => escapeCsvValue(row[column])).join(",")
    );

    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

    downloadBlob(blob, `linkedin_analytics_${buildTimestampForFilename()}.csv`);
  };

  const handleExportTxt = () => {
    if (exportRows.length === 0) return;

    const text = exportRows
      .map((row, index) => {
        const lines = EXPORT_COLUMNS.map((column) => `${column}: ${row[column]}`);
        return [`Entry ${index + 1}`, ...lines].join("\n");
      })
      .join("\n\n----------------------------------------\n\n");

    const blob = new Blob([text], { type: "text/plain;charset=utf-8;" });

    downloadBlob(blob, `linkedin_analytics_${buildTimestampForFilename()}.txt`);
  };

  const handleExportExcel = () => {
    if (exportRows.length === 0) return;

    const worksheet = XLSX.utils.json_to_sheet(exportRows, {
      header: EXPORT_COLUMNS as string[],
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Analytics");

    XLSX.writeFile(workbook, `linkedin_analytics_${buildTimestampForFilename()}.xlsx`);
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border border-gray-200 rounded-2xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => scrollToSection(formSectionRef)}
            className="text-xs px-3 py-2 rounded-full border border-linkedin-blue text-linkedin-blue hover:bg-linkedin-light transition"
          >
            Performance Form
          </button>
          <button
            onClick={() => scrollToSection(insightsSectionRef)}
            className="text-xs px-3 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
          >
            Insights
          </button>
          <button
            onClick={() => scrollToSection(recentPostsSectionRef)}
            className="text-xs px-3 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
          >
            Recent Posts
          </button>
          <button
            onClick={() => {
              setDraftHistoryOpen(true);
              requestAnimationFrame(() => {
                scrollToSection(draftHistorySectionRef);
              });
            }}
            className="text-xs px-3 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
          >
            Draft History
          </button>
        </div>
      </div>

      {/* Log a post */}
      <div
        ref={formSectionRef}
        className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4"
      >
        <h3 className="font-semibold text-gray-800">Log Post Performance</h3>
        <p className="text-xs text-gray-400">
          Manually enter metrics from LinkedIn. Your data stays on your device.
        </p>

        {editingLog && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-blue-800">
                Editing existing metrics entry
              </div>
              <button
                onClick={handleCancelEdit}
                className="text-xs text-blue-700 underline"
              >
                Cancel edit
              </button>
            </div>

            <div className="text-sm text-blue-800">
              <span className="font-medium">{editingLog.postTitle}</span>
              {" · "}
              Posted {formatDateTime(editingLog.postedAt)}
              {" · "}
              Last updated {formatDateTime(editingLog.updatedAt ?? editingLog.createdAt)}
            </div>
          </div>
        )}

        {seed && !editingLog && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-green-800">
                Prefilled from posted draft
              </div>
              <button
                onClick={handleClearPrefill}
                className="text-xs text-green-700 underline"
              >
                Clear prefill
              </button>
            </div>

            <div className="text-sm text-green-800">
              <span className="font-medium">{seed.postTitle}</span>
              {" · "}
              {seed.pillar || "No pillar"}
              {" · "}
              Posted {formatDateTime(seed.postedAt)}
            </div>

            {seedPreview && (
              <div className="text-xs text-green-700">
                {seedPreview}
              </div>
            )}

            <div className="text-xs text-green-700">
              Metrics remain fully editable before saving.
            </div>
          </div>
        )}

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
                <option key={p} value={p}>
                  {p}
                </option>
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
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Posted date and time
            </label>
            <input
              type="datetime-local"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-linkedin-blue"
              value={form.postedAt}
              onChange={(e) => setForm({ ...form, postedAt: e.target.value })}
            />
          </div>

          {(
            [
              "impressions",
              "reactions",
              "comments",
              "reposts",
              "profileViews",
            ] as const
          ).map((field) => (
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
                  setForm({ ...form, [field]: parseInt(e.target.value, 10) || 0 })
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
          {saving
            ? editingLog
              ? "Updating..."
              : "Saving..."
            : editingLog
              ? "Update Entry"
              : "Save Entry"}
        </button>
      </div>

      {/* Insight engine */}
      <div
        ref={insightsSectionRef}
        className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">AI Insights</h3>
          <span className="text-xs text-gray-400">{logs.length} posts logged</span>
        </div>

        {logs.length < 3 ? (
          <div className="text-sm text-gray-500 bg-gray-50 rounded-xl p-4">
            Log at least 3 posts to generate insights.
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* Log table */}
      <div
        ref={recentPostsSectionRef}
        className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-gray-800 text-sm">Recent Posts</h3>
            <span className="text-xs text-gray-400">{logs.length} logged</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportCsv}
              disabled={exportRows.length === 0}
              className="text-xs px-3 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition disabled:opacity-40"
            >
              Export CSV
            </button>
            <button
              onClick={handleExportTxt}
              disabled={exportRows.length === 0}
              className="text-xs px-3 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition disabled:opacity-40"
            >
              Export TXT
            </button>
            <button
              onClick={handleExportExcel}
              disabled={exportRows.length === 0}
              className="text-xs px-3 py-2 rounded-full border border-linkedin-blue text-linkedin-blue hover:bg-linkedin-light transition disabled:opacity-40"
            >
              Export Excel
            </button>
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="p-6">
            <div className="text-sm text-gray-500 bg-gray-50 rounded-xl p-4">
              No performance entries yet. Save one from the form above to start tracking results.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Post</th>
                  <th className="px-4 py-3 font-medium">Posted</th>
                  <th className="px-4 py-3 font-medium">Last updated</th>
                  <th className="px-4 py-3 font-medium">Pillar</th>
                  <th className="px-4 py-3 font-medium">Impressions</th>
                  <th className="px-4 py-3 font-medium">Reactions</th>
                  <th className="px-4 py-3 font-medium">Engagement</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-medium text-gray-700 max-w-[220px] truncate">
                      {log.postTitle}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDateTime(log.postedAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDateTime(log.updatedAt ?? log.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{log.pillar || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {log.impressions.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{log.reactions}</td>
                    <td className="px-4 py-3 text-linkedin-blue font-semibold">
                      {engagementRate(log)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleEditMetrics(log)}
                        className="text-linkedin-blue underline"
                      >
                        Edit metrics
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Draft history */}
      <div
        ref={draftHistorySectionRef}
        className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800">Draft History</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Review your recent saved drafts and the strongest scored ones.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              {recentDrafts.length} recent · {scoredDrafts.length} scored
            </span>
            <button
              onClick={() => setDraftHistoryOpen((current) => !current)}
              className="text-xs text-linkedin-blue underline"
            >
              {draftHistoryOpen ? "Collapse" : "Expand"}
            </button>
          </div>
        </div>

        {!draftHistoryOpen ? (
          <div className="p-6">
            <div className="text-sm text-gray-500 bg-gray-50 rounded-xl p-4">
              Draft History is collapsed to keep analytics front and center. Expand it when you want to review older drafts.
            </div>
          </div>
        ) : (
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
                  {scoredDrafts.map((draft) => {
                    const isDeleting = deletingDraftId === draft.id;

                    return (
                      <div
                        key={draft.id}
                        className="border border-gray-200 rounded-xl p-4 bg-green-50/30 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-xs text-gray-400">
                            {draft.status === "posted" && draft.postedAt
                              ? `Posted · ${formatDateTime(draft.postedAt)}`
                              : `Created · ${formatDate(draft.createdAt)}`}
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
                          <button
                            onClick={() => handleDeleteDraft(draft)}
                            disabled={isDeleting}
                            className="text-xs text-red-600 underline disabled:opacity-50"
                          >
                            {isDeleting ? "Deleting..." : "Delete draft"}
                          </button>
                          <span className="text-xs text-gray-400">
                            Model: {draft.model}
                          </span>
                          <span className="text-xs text-gray-400">
                            Pillar: {draft.pillar || "—"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
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
                  {recentDrafts.map((draft) => {
                    const isDeleting = deletingDraftId === draft.id;

                    return (
                      <div
                        key={draft.id}
                        className="border border-gray-200 rounded-xl p-4 bg-gray-50/60 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-xs text-gray-400">
                            {draft.status === "posted" && draft.postedAt
                              ? `Posted · ${formatDateTime(draft.postedAt)}`
                              : `Created · ${formatDate(draft.createdAt)}`}
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
                          <button
                            onClick={() => handleDeleteDraft(draft)}
                            disabled={isDeleting}
                            className="text-xs text-red-600 underline disabled:opacity-50"
                          >
                            {isDeleting ? "Deleting..." : "Delete draft"}
                          </button>
                          <span className="text-xs text-gray-400">
                            Variants: {draft.variants.length}
                          </span>
                          <span className="text-xs text-gray-400">
                            Pillar: {draft.pillar || "—"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
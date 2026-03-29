import { useEffect, useMemo, useState } from "react";
import {
  deleteDraft,
  getDrafts,
  moveDraftLeft,
  moveDraftRight,
  updateDraftStatus,
} from "../../lib/db";
import type {
  AppSettings,
  DraftPromotionPayload,
  PostDraft,
  UserBrandProfile,
} from "../../types";

interface Props {
  profile: UserBrandProfile | null;
  settings: AppSettings | null;
  onOpenInDraft: (payload: DraftPromotionPayload) => void;
}

type StatusFilter = "all" | "draft" | "ready" | "posted";
type ScoreFilter = "all" | "scored" | "unscored";
type SortOption = "newest" | "highest_score" | "ready_first" | "pillar_az";

export default function DraftLibraryTab({ onOpenInDraft }: Props) {
  const [drafts, setDrafts] = useState<PostDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [pillarFilter, setPillarFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const loadDrafts = async () => {
    setLoading(true);
    try {
      const allDrafts = await getDrafts();
      setDrafts(allDrafts);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDrafts();
  }, []);

  const pillars = useMemo(() => {
    const unique = Array.from(
      new Set(drafts.map((d) => d.pillar).filter((p) => p && p.trim()))
    );
    return unique.sort((a, b) => a.localeCompare(b));
  }, [drafts]);

  const filteredDrafts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return drafts.filter((draft) => {
      const matchesQuery =
        !normalizedQuery ||
        draft.prompt.toLowerCase().includes(normalizedQuery) ||
        draft.content.toLowerCase().includes(normalizedQuery) ||
        draft.pillar.toLowerCase().includes(normalizedQuery);

      const matchesStatus =
        statusFilter === "all" || draft.status === statusFilter;

      const matchesScore =
        scoreFilter === "all" ||
        (scoreFilter === "scored" && !!draft.scoringResult) ||
        (scoreFilter === "unscored" && !draft.scoringResult);

      const matchesPillar =
        pillarFilter === "all" || draft.pillar === pillarFilter;

      return matchesQuery && matchesStatus && matchesScore && matchesPillar;
    });
  }, [drafts, query, statusFilter, scoreFilter, pillarFilter]);

  const sortedDrafts = useMemo(() => {
    const sorted = [...filteredDrafts];

    if (sortBy === "newest") {
      sorted.sort((a, b) => b.createdAt - a.createdAt);
      return sorted;
    }

    if (sortBy === "highest_score") {
      sorted.sort((a, b) => {
        const aScore = a.scoringResult?.totalScore ?? -1;
        const bScore = b.scoringResult?.totalScore ?? -1;

        if (bScore !== aScore) {
          return bScore - aScore;
        }

        return b.createdAt - a.createdAt;
      });

      return sorted;
    }

    if (sortBy === "ready_first") {
      const statusRank: Record<PostDraft["status"], number> = {
        ready: 0,
        draft: 1,
        posted: 2,
      };

      sorted.sort((a, b) => {
        const rankDiff = statusRank[a.status] - statusRank[b.status];

        if (rankDiff !== 0) {
          return rankDiff;
        }

        return b.createdAt - a.createdAt;
      });

      return sorted;
    }

    sorted.sort((a, b) => {
      const pillarCompare = a.pillar.localeCompare(b.pillar);

      if (pillarCompare !== 0) {
        return pillarCompare;
      }

      return b.createdAt - a.createdAt;
    });

    return sorted;
  }, [filteredDrafts, sortBy]);

  const kanbanColumns = useMemo(
    () => ({
      draft: sortedDrafts.filter((draft) => draft.status === "draft"),
      ready: sortedDrafts.filter((draft) => draft.status === "ready"),
      posted: sortedDrafts.filter((draft) => draft.status === "posted"),
    }),
    [sortedDrafts]
  );

  const handleOpenInDraft = (draft: PostDraft) => {
    onOpenInDraft({
      content: draft.content,
      sourceLabel: "Draft Library",
      sourceTopic: draft.prompt,
      sourcePillar: draft.pillar,
      scoringResult: draft.scoringResult,
      createdAt: Date.now(),
    });
  };

  const handleDelete = async (draft: PostDraft) => {
    const preview =
      draft.prompt?.trim() ||
      draft.content.slice(0, 60).replace(/\s+/g, " ").trim();

    const confirmed = window.confirm(
      `Delete this draft?\n\n${preview}${preview.length >= 60 ? "..." : ""}`
    );

    if (!confirmed) return;

    try {
      setDeletingId(draft.id);
      await deleteDraft(draft.id);
      await loadDrafts();
    } finally {
      setDeletingId(null);
    }
  };

  const handleMoveLeft = async (draft: PostDraft) => {
    try {
      setMovingId(draft.id);
      await moveDraftLeft(draft.id);
      await loadDrafts();
    } finally {
      setMovingId(null);
    }
  };

  const handleMoveRight = async (draft: PostDraft) => {
    try {
      setMovingId(draft.id);
      await moveDraftRight(draft.id);
      await loadDrafts();
    } finally {
      setMovingId(null);
    }
  };

  const handleSetStatus = async (
    draft: PostDraft,
    status: PostDraft["status"]
  ) => {
    if (draft.status === status) return;

    try {
      setMovingId(draft.id);
      await updateDraftStatus(draft.id, status);
      await loadDrafts();
    } finally {
      setMovingId(null);
    }
  };

  const draftStatusColor = (status: PostDraft["status"]) => {
    if (status === "ready") return "text-green-700 bg-green-100";
    if (status === "posted") return "text-linkedin-blue bg-linkedin-light";
    return "text-gray-600 bg-gray-100";
  };

  const draftScoreColor = (score?: number) => {
    if (score === undefined) return "text-gray-400 bg-gray-100";
    if (score >= 8) return "text-green-700 bg-green-100";
    if (score >= 6) return "text-yellow-700 bg-yellow-100";
    return "text-red-700 bg-red-100";
  };

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const truncate = (text: string, max = 260) => {
    if (text.length <= max) return text;
    return `${text.slice(0, max).trim()}...`;
  };

  const renderDraftCard = (draft: PostDraft) => {
    const isDeleting = deletingId === draft.id;
    const isMoving = movingId === draft.id;

    return (
      <div
        key={draft.id}
        className="border border-gray-200 rounded-xl p-4 bg-white space-y-3 shadow-sm"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="text-xs text-gray-400">{formatDate(draft.createdAt)}</div>

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
              className={`text-[11px] px-2 py-1 rounded-full font-semibold capitalize ${draftStatusColor(
                draft.status
              )}`}
            >
              {draft.status}
            </span>
          </div>
        </div>

        <div>
          <div className="text-sm font-semibold text-gray-800">
            {draft.prompt || "Untitled draft"}
          </div>
          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap mt-2">
            {truncate(draft.content)}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {draft.pillar && (
            <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-full border border-gray-200">
              {draft.pillar}
            </span>
          )}
          <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-full border border-gray-200">
            {draft.model}
          </span>
          <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-full border border-gray-200">
            Variants: {draft.variants.length}
          </span>
        </div>

        <div className="flex gap-2 flex-wrap pt-1">
          {draft.status !== "draft" && (
            <button
              onClick={() => void handleMoveLeft(draft)}
              disabled={isMoving}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {isMoving ? "Moving..." : "← Move Left"}
            </button>
          )}

          {draft.status !== "posted" && (
            <button
              onClick={() => void handleMoveRight(draft)}
              disabled={isMoving}
              className="text-xs px-3 py-1.5 rounded-lg border border-linkedin-blue text-linkedin-blue hover:bg-linkedin-light disabled:opacity-50"
            >
              {isMoving ? "Moving..." : "Move Right →"}
            </button>
          )}

          {draft.status !== "draft" && (
            <button
              onClick={() => void handleSetStatus(draft, "draft")}
              disabled={isMoving}
              className="text-xs text-gray-600 underline disabled:opacity-50"
            >
              Mark Draft
            </button>
          )}

          {draft.status !== "ready" && (
            <button
              onClick={() => void handleSetStatus(draft, "ready")}
              disabled={isMoving}
              className="text-xs text-green-700 underline disabled:opacity-50"
            >
              Mark Ready
            </button>
          )}

          {draft.status !== "posted" && (
            <button
              onClick={() => void handleSetStatus(draft, "posted")}
              disabled={isMoving}
              className="text-xs text-linkedin-blue underline disabled:opacity-50"
            >
              Mark Posted
            </button>
          )}
        </div>

        <div className="flex gap-3 flex-wrap pt-1">
          <button
            onClick={() => handleOpenInDraft(draft)}
            className="text-xs text-linkedin-blue underline"
          >
            Open in Draft
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(draft.content)}
            className="text-xs text-linkedin-blue underline"
          >
            Copy
          </button>
          <button
            onClick={() => handleDelete(draft)}
            disabled={isDeleting}
            className="text-xs text-red-600 underline disabled:opacity-50"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
        <div>
          <h3 className="font-semibold text-gray-800">Draft Library</h3>
          <p className="text-sm text-gray-500 mt-1">
            Search, filter, sort, reopen, and manage all your saved drafts in one place.
          </p>
        </div>

        <div className="grid md:grid-cols-5 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Search
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by topic, content, or pillar..."
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-linkedin-blue"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-linkedin-blue"
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="ready">Ready</option>
              <option value="posted">Posted</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Score
            </label>
            <select
              value={scoreFilter}
              onChange={(e) => setScoreFilter(e.target.value as ScoreFilter)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-linkedin-blue"
            >
              <option value="all">All drafts</option>
              <option value="scored">Scored only</option>
              <option value="unscored">Unscored only</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Sort
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-linkedin-blue"
            >
              <option value="newest">Newest</option>
              <option value="highest_score">Highest score</option>
              <option value="ready_first">Ready first</option>
              <option value="pillar_az">Pillar A-Z</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Pillar
            </label>
            <select
              value={pillarFilter}
              onChange={(e) => setPillarFilter(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-linkedin-blue"
            >
              <option value="all">All pillars</option>
              {pillars.map((pillar) => (
                <option key={pillar} value={pillar}>
                  {pillar}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-4 flex items-end">
            <div className="text-xs text-gray-400">
              Showing {sortedDrafts.length} of {drafts.length} saved drafts
            </div>
          </div>

          <div className="flex items-end justify-end">
            <button
              onClick={() => {
                setQuery("");
                setStatusFilter("all");
                setScoreFilter("all");
                setPillarFilter("all");
                setSortBy("newest");
              }}
              className="text-xs text-linkedin-blue underline"
            >
              Reset filters
            </button>
          </div>
        </div>
      </div>

      <div className="grid xl:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h4 className="font-semibold text-gray-800">Draft</h4>
            <span className="text-xs text-gray-400">{kanbanColumns.draft.length}</span>
          </div>
          <div className="p-4 space-y-4 min-h-[220px] bg-gray-50/40">
            {loading ? (
              <div className="text-sm text-gray-500">Loading drafts...</div>
            ) : kanbanColumns.draft.length === 0 ? (
              <div className="text-sm text-gray-500 bg-gray-50 rounded-xl p-4">
                No drafts in this column.
              </div>
            ) : (
              kanbanColumns.draft.map(renderDraftCard)
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h4 className="font-semibold text-gray-800">Ready</h4>
            <span className="text-xs text-gray-400">{kanbanColumns.ready.length}</span>
          </div>
          <div className="p-4 space-y-4 min-h-[220px] bg-green-50/30">
            {loading ? (
              <div className="text-sm text-gray-500">Loading drafts...</div>
            ) : kanbanColumns.ready.length === 0 ? (
              <div className="text-sm text-gray-500 bg-gray-50 rounded-xl p-4">
                No drafts in this column.
              </div>
            ) : (
              kanbanColumns.ready.map(renderDraftCard)
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h4 className="font-semibold text-gray-800">Posted</h4>
            <span className="text-xs text-gray-400">{kanbanColumns.posted.length}</span>
          </div>
          <div className="p-4 space-y-4 min-h-[220px] bg-linkedin-light/40">
            {loading ? (
              <div className="text-sm text-gray-500">Loading drafts...</div>
            ) : kanbanColumns.posted.length === 0 ? (
              <div className="text-sm text-gray-500 bg-gray-50 rounded-xl p-4">
                No drafts in this column.
              </div>
            ) : (
              kanbanColumns.posted.map(renderDraftCard)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
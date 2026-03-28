import Dexie, { type Table } from "dexie";
import type {
  PostDraft,
  PostDraftStatus,
  RewriteVariant,
  ScoringResult,
  PerformanceLog,
  AIRecommendation,
  WeeklyStrategySummary,
  SavedPrompt,
  ContentPillar,
} from "../types";

class LinkedInAIDatabase extends Dexie {
  drafts!: Table<PostDraft, string>;
  variants!: Table<RewriteVariant, string>;
  scoringResults!: Table<ScoringResult, string>;
  performanceLogs!: Table<PerformanceLog, string>;
  recommendations!: Table<AIRecommendation, string>;
  weeklySummaries!: Table<WeeklyStrategySummary, string>;
  savedPrompts!: Table<SavedPrompt, string>;
  contentPillars!: Table<ContentPillar, string>;

  constructor() {
    super("LinkedInAIExtension");
    this.version(1).stores({
      drafts: "id, status, pillar, createdAt",
      variants: "id, draftId, style, createdAt",
      scoringResults: "id, draftId, totalScore, createdAt",
      performanceLogs: "id, postedAt, pillar, format, createdAt",
      recommendations: "id, type, createdAt",
      weeklySummaries: "id, weekStart, createdAt",
      savedPrompts: "id, category, createdAt",
      contentPillars: "id, name, frequency",
    });
  }
}

export const db = new LinkedInAIDatabase();

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function normalizeDraft(draft: PostDraft): PostDraft {
  return {
    ...draft,
    status: draft.status ?? "draft",
    variants: draft.variants ?? [],
    createdAt: draft.createdAt ?? Date.now(),
    updatedAt: draft.updatedAt ?? draft.createdAt ?? Date.now(),
  };
}

// ─── Draft Helpers ────────────────────────────────────────────────────────────

export async function saveDraft(draft: PostDraft): Promise<void> {
  await db.drafts.put(
    normalizeDraft({
      ...draft,
      updatedAt: Date.now(),
    })
  );
}

export async function getDrafts(): Promise<PostDraft[]> {
  const drafts = await db.drafts.orderBy("createdAt").reverse().toArray();
  return drafts.map(normalizeDraft);
}

export async function getRecentDrafts(limit = 20): Promise<PostDraft[]> {
  const drafts = await db.drafts.orderBy("createdAt").reverse().limit(limit).toArray();
  return drafts.map(normalizeDraft);
}

export async function getScoredDrafts(limit = 20): Promise<PostDraft[]> {
  const drafts = (await db.drafts.orderBy("createdAt").reverse().toArray()).map(
    normalizeDraft
  );

  return drafts
    .filter((draft) => !!draft.scoringResult)
    .sort((a, b) => {
      const aScore = a.scoringResult?.totalScore ?? 0;
      const bScore = b.scoringResult?.totalScore ?? 0;
      return bScore - aScore;
    })
    .slice(0, limit);
}

export async function getTopReadyDrafts(limit = 10): Promise<PostDraft[]> {
  const drafts = await db.drafts
    .where("status")
    .equals("ready")
    .reverse()
    .sortBy("createdAt");

  return drafts.map(normalizeDraft).reverse().slice(0, limit);
}

export async function getDraft(id: string): Promise<PostDraft | undefined> {
  const draft = await db.drafts.get(id);
  return draft ? normalizeDraft(draft) : undefined;
}

export async function updateDraftStatus(
  id: string,
  status: PostDraftStatus
): Promise<void> {
  const existing = await db.drafts.get(id);

  if (!existing) {
    return;
  }

  await db.drafts.put(
    normalizeDraft({
      ...existing,
      status,
      updatedAt: Date.now(),
    })
  );
}

export async function moveDraftLeft(id: string): Promise<void> {
  const draft = await getDraft(id);

  if (!draft) {
    return;
  }

  const nextStatus: PostDraftStatus =
    draft.status === "posted"
      ? "ready"
      : draft.status === "ready"
      ? "draft"
      : "draft";

  await updateDraftStatus(id, nextStatus);
}

export async function moveDraftRight(id: string): Promise<void> {
  const draft = await getDraft(id);

  if (!draft) {
    return;
  }

  const nextStatus: PostDraftStatus =
    draft.status === "draft"
      ? "ready"
      : draft.status === "ready"
      ? "posted"
      : "posted";

  await updateDraftStatus(id, nextStatus);
}

export async function markDraftAsDraft(id: string): Promise<void> {
  await updateDraftStatus(id, "draft");
}

export async function markDraftReady(id: string): Promise<void> {
  await updateDraftStatus(id, "ready");
}

export async function markDraftPosted(id: string): Promise<void> {
  await updateDraftStatus(id, "posted");
}

export async function deleteDraft(id: string): Promise<void> {
  await db.drafts.delete(id);
  await db.variants.where("draftId").equals(id).delete();
  await db.scoringResults.where("draftId").equals(id).delete();
}

// ─── Performance Log Helpers ──────────────────────────────────────────────────

export async function savePerformanceLog(log: PerformanceLog): Promise<void> {
  await db.performanceLogs.put(log);
}

export async function getPerformanceLogs(): Promise<PerformanceLog[]> {
  return db.performanceLogs.orderBy("postedAt").reverse().toArray();
}

export async function getRecentLogs(limit = 20): Promise<PerformanceLog[]> {
  return db.performanceLogs.orderBy("postedAt").reverse().limit(limit).toArray();
}

// ─── Scoring Helpers ──────────────────────────────────────────────────────────

export async function saveScoringResult(result: ScoringResult): Promise<void> {
  await db.scoringResults.put(result);
  await db.drafts.where("id").equals(result.draftId).modify({ scoringResult: result });
}
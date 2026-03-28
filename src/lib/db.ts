import Dexie, { type Table } from "dexie";
import type {
  PostDraft,
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
      drafts:          "id, status, pillar, createdAt",
      variants:        "id, draftId, style, createdAt",
      scoringResults:  "id, draftId, totalScore, createdAt",
      performanceLogs: "id, postedAt, pillar, format, createdAt",
      recommendations: "id, type, createdAt",
      weeklySummaries: "id, weekStart, createdAt",
      savedPrompts:    "id, category, createdAt",
      contentPillars:  "id, name, frequency",
    });
  }
}

export const db = new LinkedInAIDatabase();

// ─── Draft Helpers ────────────────────────────────────────────────────────────

export async function saveDraft(draft: PostDraft): Promise<void> {
  await db.drafts.put(draft);
}

export async function getDrafts(): Promise<PostDraft[]> {
  return db.drafts.orderBy("createdAt").reverse().toArray();
}

export async function getDraft(id: string): Promise<PostDraft | undefined> {
  return db.drafts.get(id);
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

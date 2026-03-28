// ─── Core Data Models ────────────────────────────────────────────────────────

export interface UserBrandProfile {
  id: string;
  name: string;
  currentTitle: string;
  targetTitle: string;
  yearsExperience: number;
  skills: string[];           // e.g. ["SQL", "Power BI", "Python", "ETL"]
  industries: string[];       // e.g. ["Healthcare", "FinTech"]
  tone: "professional" | "conversational" | "authoritative" | "story-driven";
  contentPillars: string[];   // e.g. ["Data Quality", "Career Growth"]
  audience: string;           // Free text: who the user wants to reach
  createdAt: number;
  updatedAt: number;
}

export interface TargetRole {
  id: string;
  title: string;
  keywords: string[];
  companies: string[];        // optional target companies
  notes: string;
}

export interface ContentPillar {
  id: string;
  name: string;               // e.g. "Data Quality"
  description: string;
  exampleTopics: string[];
  frequency: "daily" | "weekly" | "biweekly";
}

export interface SavedPrompt {
  id: string;
  label: string;
  systemMessage: string;
  userTemplate: string;       // with {{placeholders}}
  category: "draft" | "rewrite" | "hook" | "cta" | "scoring" | "strategy";
  createdAt: number;
}

export interface PostDraft {
  id: string;
  prompt: string;
  content: string;
  pillar: string;
  model: string;
  scoringResult?: ScoringResult;
  variants: RewriteVariant[];
  status: "draft" | "ready" | "posted";
  createdAt: number;
  updatedAt: number;
}

export interface RewriteVariant {
  id: string;
  draftId: string;
  style: "concise" | "story" | "bold" | "data-driven" | "question-led";
  content: string;
  model: string;
  createdAt: number;
}

export interface ScoringResult {
  id: string;
  draftId: string;
  scores: {
    hook: number;           // 0–10
    clarity: number;
    relevance: number;
    cta: number;
    authenticity: number;
  };
  totalScore: number;       // average of above
  feedback: string[];       // 3–5 concrete improvement suggestions
  model: string;
  createdAt: number;
}

export interface PerformanceLog {
  id: string;
  postTitle: string;
  postedAt: number;
  pillar: string;
  format: "list" | "story" | "insight" | "question" | "data";
  impressions: number;
  reactions: number;
  comments: number;
  reposts: number;
  profileViews: number;     // manually noted
  notes: string;
  createdAt: number;
}

export interface AIRecommendation {
  id: string;
  type: "pillar" | "format" | "timing" | "topic" | "hook";
  content: string;
  basedOn: string;          // e.g. "last 10 performance logs"
  createdAt: number;
}

export interface WeeklyStrategySummary {
  id: string;
  weekStart: number;        // epoch ms
  plannedPosts: Array<{
    dayOfWeek: number;
    pillar: string;
    topicIdea: string;
    format: string;
  }>;
  aiNarrative: string;      // generated strategy summary
  createdAt: number;
}

// ─── Ollama ──────────────────────────────────────────────────────────────────

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export interface OllamaStreamChunk {
  model: string;
  response: string;
  done: boolean;
}

export type OllamaStatus = "checking" | "online" | "offline" | "error";

// ─── App Settings ─────────────────────────────────────────────────────────────

export interface AppSettings {
  ollamaUrl: string;          // default: http://localhost:11434
  defaultModel: string;       // e.g. "mistral"
  streamingEnabled: boolean;
  onboardingComplete: boolean;
  activeProfileId: string | null;
}

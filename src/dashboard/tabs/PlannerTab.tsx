import { useState } from "react";
import { generate } from "../../lib/ollama";
import { promptWeeklyPlan, promptGeneratePillars } from "../../lib/prompts";
import type {
  UserBrandProfile,
  AppSettings,
  WeeklyStrategySummary,
  ContentPillar,
  DraftPromotionPayload,
} from "../../types";
import { db } from "../../lib/db";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const FORMAT_EMOJIS: Record<string, string> = {
  list: "📋",
  story: "📖",
  insight: "💡",
  question: "❓",
  data: "📊",
};

const RECOMMENDED_DAY_MAP: Record<number, number[]> = {
  2: [2, 4],
  3: [2, 3, 4],
  4: [1, 2, 3, 4],
  5: [1, 2, 3, 4, 5],
};

const RECOMMENDED_SLOTS: Record<number, string> = {
  1: "10:30 AM",
  2: "10:00 AM",
  3: "10:30 AM",
  4: "12:00 PM",
  5: "9:30 AM",
  6: "—",
  7: "—",
};

interface Props {
  profile: UserBrandProfile | null;
  settings: AppSettings | null;
  onSendToDraft: (payload: DraftPromotionPayload) => void;
}

export default function PlannerTab({ profile, settings, onSendToDraft }: Props) {
  const [postsPerWeek, setPostsPerWeek] = useState(3);
  const [plan, setPlan] = useState<WeeklyStrategySummary | null>(null);
  const [pillars, setPillars] = useState<ContentPillar[]>([]);
  const [loading, setLoading] = useState(false);
  const [pillarLoading, setPillarLoading] = useState(false);
  const [plannerMessage, setPlannerMessage] = useState("");
  const [pillarMessage, setPillarMessage] = useState("");

  const model = settings?.defaultModel ?? "llama3.1:latest";
  const ollamaUrl = settings?.ollamaUrl ?? "http://localhost:11434";

  const handleGeneratePillars = async () => {
    if (!profile) return;

    setPillarLoading(true);
    setPillarMessage("");

    try {
      const { system, user } = promptGeneratePillars(profile);
      const raw = await generate(user, system, model, ollamaUrl);
      const parsed = extractJsonArray(raw);

      const normalized: ContentPillar[] = parsed.map((p: any, index: number) => ({
        id: crypto.randomUUID(),
        name: String(p?.name ?? `Pillar ${index + 1}`),
        description: String(p?.description ?? ""),
        exampleTopics: Array.isArray(p?.exampleTopics)
          ? p.exampleTopics.map((t: unknown) => String(t))
          : [],
        frequency: "weekly" as const,
      }));

      if (!normalized.length) {
        throw new Error("No pillar objects were returned.");
      }

      setPillars(normalized);

      for (const p of normalized) {
        await db.contentPillars.put(p);
      }

      setPillarMessage(`Generated ${normalized.length} pillar(s) successfully.`);
    } catch (error) {
      console.error("Generate pillars failed:", error);

      const fallbackPillars = (profile.contentPillars ?? []).map((name) => ({
        id: crypto.randomUUID(),
        name,
        description: `Core content pillar for ${profile.targetTitle} positioning.`,
        exampleTopics: [
          `${name} lessons from real projects`,
          `${name} best practices`,
          `${name} common mistakes to avoid`,
        ],
        frequency: "weekly" as const,
      }));

      if (fallbackPillars.length) {
        setPillars(fallbackPillars);
        setPillarMessage(
          "Pillar generation returned invalid JSON, so I loaded your saved profile pillars instead."
        );
      } else {
        const details = getErrorMessage(error);
        setPillarMessage(`Failed to generate pillars. Details: ${details}`);
      }
    } finally {
      setPillarLoading(false);
    }
  };

  const handleGeneratePlan = async () => {
    if (!profile) return;

    setLoading(true);
    setPlannerMessage("");

    try {
      const pillarNames = pillars.length ? pillars.map((p) => p.name) : profile.contentPillars;

      const { system, user } = promptWeeklyPlan(profile, pillarNames, postsPerWeek);
      const raw = await generate(user, system, model, ollamaUrl);
      const parsed = extractJsonArray(raw);

      const forcedDays = RECOMMENDED_DAY_MAP[postsPerWeek] ?? RECOMMENDED_DAY_MAP[3];

      const normalizedPosts = parsed.slice(0, postsPerWeek).map((post: any, index: number) => ({
        dayOfWeek: forcedDays[index] ?? forcedDays[forcedDays.length - 1] ?? 2,
        pillar: String(post?.pillar ?? pillarNames[index % Math.max(pillarNames.length, 1)] ?? ""),
        topicIdea: String(post?.topicIdea ?? `Topic idea ${index + 1}`),
        format: normalizeFormat(String(post?.format ?? "insight")),
      }));

      const summary: WeeklyStrategySummary = {
        id: crypto.randomUUID(),
        weekStart: getMondayEpoch(),
        plannedPosts: normalizedPosts,
        aiNarrative: buildPlannerNarrative(profile, postsPerWeek),
        createdAt: Date.now(),
      };

      setPlan(summary);
      await db.weeklySummaries.put(summary);
      setPlannerMessage("Weekly plan generated successfully.");
    } catch (error) {
      console.error("Generate weekly plan failed:", error);
      setPlannerMessage(`Failed to generate weekly plan. Details: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSendPlannedTopicToDraft = (post: {
    topicIdea: string;
    pillar: string;
    format: string;
    dayOfWeek: number;
  }) => {
    const topic = `${post.topicIdea}

Planned format: ${post.format}
Planned day: ${DAYS[post.dayOfWeek - 1] ?? "Unknown"}
Suggested time: ${RECOMMENDED_SLOTS[post.dayOfWeek] ?? "10:00 AM"}`;

    onSendToDraft({
      content: "",
      sourceLabel: "Planner topic",
      sourceTopic: topic,
      sourcePillar: post.pillar,
      createdAt: Date.now(),
    });
  };

  const handleGenerateBestDraftFromPlanner = (post: {
    topicIdea: string;
    pillar: string;
    format: string;
    dayOfWeek: number;
  }) => {
    const topic = `${post.topicIdea}

Planned format: ${post.format}
Planned day: ${DAYS[post.dayOfWeek - 1] ?? "Unknown"}
Suggested time: ${RECOMMENDED_SLOTS[post.dayOfWeek] ?? "10:00 AM"}

Write this as a publishable LinkedIn post for my target audience.`;

    onSendToDraft({
      content: "",
      sourceLabel: "Planner auto-pipeline",
      sourceTopic: topic,
      sourcePillar: post.pillar,
      autoGenerate: true,
      createdAt: Date.now(),
    });
  };

  return (
    <div className="max-w-4xl space-y-6">
      {!profile && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-900/30 dark:text-yellow-200">
          Set up your brand profile to use the planner.
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5 dark:bg-slate-900 dark:border-slate-800">
        <div>
          <h3 className="font-semibold text-gray-800 dark:text-slate-100">Weekly Content Plan</h3>
          <p className="text-sm text-gray-500 mt-1 dark:text-slate-400">
            Build a LinkedIn schedule around your best-performing professional posting windows.
          </p>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <label className="text-sm text-gray-600 font-medium dark:text-slate-300">Posts per week:</label>
          {[2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setPostsPerWeek(n)}
              className={`w-9 h-9 rounded-full text-sm font-semibold border transition ${
                postsPerWeek === n
                  ? "bg-linkedin-blue text-white border-linkedin-blue"
                  : "border-gray-200 text-gray-600 hover:border-linkedin-blue dark:border-slate-700 dark:text-slate-400 dark:hover:border-blue-400"
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="bg-linkedin-light rounded-xl p-4 text-sm text-gray-700 dark:bg-blue-900/20 dark:text-slate-300">
          <div className="font-semibold text-linkedin-blue mb-2 dark:text-blue-300">Recommended default posting windows</div>
          <div className="space-y-1">
            <div>Tuesday · 10:00 AM</div>
            <div>Wednesday · 10:30 AM</div>
            <div>Thursday · 12:00 PM</div>
          </div>
          <p className="text-xs text-gray-500 mt-3 dark:text-slate-500">
            These are enforced for the 3-post plan. Other plan sizes follow the same weekday-priority logic.
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleGeneratePillars}
            disabled={!profile || pillarLoading}
            className="px-4 py-2.5 text-sm border border-linkedin-blue text-linkedin-blue rounded-xl hover:bg-linkedin-light transition disabled:opacity-40 dark:hover:bg-slate-800"
          >
            {pillarLoading ? "Generating..." : "✦ Generate Pillars"}
          </button>

          <button
            onClick={handleGeneratePlan}
            disabled={!profile || loading}
            className="px-4 py-2.5 text-sm bg-linkedin-blue text-white rounded-xl hover:bg-linkedin-dark transition disabled:opacity-40"
          >
            {loading ? "Planning..." : "📅 Generate Weekly Plan"}
          </button>
        </div>

        {pillarMessage && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
            {pillarMessage}
          </div>
        )}

        {plannerMessage && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
            {plannerMessage}
          </div>
        )}
      </div>

      {pillars.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 dark:bg-slate-900 dark:border-slate-800">
          <h4 className="font-semibold text-gray-800 mb-4 dark:text-slate-100">Your Content Pillars</h4>
          <div className="grid md:grid-cols-2 gap-3">
            {pillars.map((p) => (
              <div key={p.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50 dark:bg-slate-800/50 dark:border-slate-800">
                <div className="font-semibold text-sm text-gray-800 dark:text-slate-100">{p.name}</div>
                <p className="text-xs text-gray-500 mt-1 dark:text-slate-400">{p.description}</p>
                <ul className="mt-3 space-y-1">
                  {p.exampleTopics.map((t, i) => (
                    <li key={i} className="text-xs text-linkedin-blue dark:text-blue-400">
                      · {t}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {plan && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5 dark:bg-slate-900 dark:border-slate-800">
          <div>
            <h4 className="font-semibold text-gray-800 dark:text-slate-100">
              Week of{" "}
              {new Date(plan.weekStart).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
              })}
            </h4>
            <p className="text-xs text-gray-500 mt-1 dark:text-slate-400">{plan.aiNarrative}</p>
          </div>

          <div className="space-y-3">
            {plan.plannedPosts.map((post, i) => (
              <div
                key={i}
                className="flex items-start gap-4 p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition dark:border-slate-800 dark:hover:bg-slate-800/50"
              >
                <div className="w-28 shrink-0">
                  <div className="text-xs font-semibold text-linkedin-blue dark:text-blue-400">
                    {DAYS[post.dayOfWeek - 1] ?? `Day ${post.dayOfWeek}`}
                  </div>
                  <div className="text-xs text-gray-400 mt-1 dark:text-slate-500">
                    Suggested: {RECOMMENDED_SLOTS[post.dayOfWeek] ?? "10:00 AM"}
                  </div>
                </div>

                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800 dark:text-slate-200">{post.topicIdea}</div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full dark:bg-slate-800 dark:text-slate-400">
                      {post.pillar}
                    </span>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full dark:bg-slate-800 dark:text-slate-400">
                      {FORMAT_EMOJIS[post.format] ?? ""} {post.format}
                    </span>
                  </div>

                  <div className="mt-3 flex gap-3 flex-wrap">
                    <button
                      onClick={() => handleSendPlannedTopicToDraft(post)}
                      className="text-xs text-linkedin-blue underline dark:text-blue-400"
                    >
                      Send planned topic to Draft
                    </button>
                    <button
                      onClick={() => handleGenerateBestDraftFromPlanner(post)}
                      className="text-xs text-linkedin-blue underline dark:text-blue-400"
                    >
                      Generate best draft automatically
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 dark:bg-slate-800/50 dark:text-slate-400">
            Best practice: post consistently for 2–4 weeks, then compare engagement and profile visits in Analytics before changing your time slots.
          </div>
        </div>
      )}
    </div>
  );
}

function extractJsonArray(raw: string): any[] {
  const cleaned = raw.replace(/```json|```/gi, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // continue
  }

  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");

  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const possibleJson = cleaned.slice(firstBracket, lastBracket + 1);
    const parsed = JSON.parse(possibleJson);
    if (Array.isArray(parsed)) return parsed;
  }

  throw new Error("Model response did not contain a valid JSON array.");
}

function normalizeFormat(format: string): string {
  const allowed = ["list", "story", "insight", "question", "data"];
  return allowed.includes(format) ? format : "insight";
}

function buildPlannerNarrative(profile: UserBrandProfile, postsPerWeek: number): string {
  const forcedDays = RECOMMENDED_DAY_MAP[postsPerWeek] ?? RECOMMENDED_DAY_MAP[3];
  const readableDays = forcedDays.map((d) => DAYS[d - 1]).join(", ");

  return `This ${postsPerWeek}-post plan is aligned to your ${profile.targetTitle} positioning, your content pillars, and your enforced default posting schedule: ${readableDays}.`;
}

function getMondayEpoch(): number {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(now.setDate(diff)).setHours(0, 0, 0, 0);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

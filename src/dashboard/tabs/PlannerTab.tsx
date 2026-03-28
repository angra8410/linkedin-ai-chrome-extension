import { useState } from "react";
import { generate } from "../../lib/ollama";
import { promptWeeklyPlan, promptGeneratePillars } from "../../lib/prompts";
import type { UserBrandProfile, AppSettings, WeeklyStrategySummary, ContentPillar } from "../../types";
import { db } from "../../lib/db";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const FORMAT_EMOJIS: Record<string, string> = {
  list: "📋", story: "📖", insight: "💡", question: "❓", data: "📊",
};

interface Props {
  profile: UserBrandProfile | null;
  settings: AppSettings | null;
}

export default function PlannerTab({ profile, settings }: Props) {
  const [postsPerWeek, setPostsPerWeek] = useState(3);
  const [plan, setPlan] = useState<WeeklyStrategySummary | null>(null);
  const [pillars, setPillars] = useState<ContentPillar[]>([]);
  const [loading, setLoading] = useState(false);
  const [pillarLoading, setPillarLoading] = useState(false);

  const model = settings?.defaultModel ?? "mistral";
  const ollamaUrl = settings?.ollamaUrl ?? "http://localhost:11434";

  const handleGeneratePillars = async () => {
    if (!profile) return;
    setPillarLoading(true);
    try {
      const { system, user } = promptGeneratePillars(profile);
      const raw = await generate(user, system, model, ollamaUrl);
      const cleaned = raw.replace(/```json|```/gi, "").trim();
      const parsed: ContentPillar[] = JSON.parse(cleaned).map((p: Omit<ContentPillar, "id" | "frequency">) => ({
        ...p,
        id: crypto.randomUUID(),
        frequency: "weekly" as const,
      }));
      setPillars(parsed);
      // Save to DB
      for (const p of parsed) await db.contentPillars.put(p);
    } catch {
      alert("Failed to generate pillars. Check Ollama is running.");
    } finally {
      setPillarLoading(false);
    }
  };

  const handleGeneratePlan = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const pillarNames = pillars.length
        ? pillars.map((p) => p.name)
        : profile.contentPillars;

      const { system, user } = promptWeeklyPlan(profile, pillarNames, postsPerWeek);
      const raw = await generate(user, system, model, ollamaUrl);
      const cleaned = raw.replace(/```json|```/gi, "").trim();
      const parsed = JSON.parse(cleaned);

      const summary: WeeklyStrategySummary = {
        id: crypto.randomUUID(),
        weekStart: getMondayEpoch(),
        plannedPosts: parsed,
        aiNarrative: "",
        createdAt: Date.now(),
      };

      setPlan(summary);
      await db.weeklySummaries.put(summary);
    } catch {
      alert("Failed to generate plan. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {!profile && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
          Set up your brand profile to use the planner.
        </div>
      )}

      {/* Controls */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-semibold text-gray-800">Weekly Content Plan</h3>

        <div className="flex items-center gap-4">
          <label className="text-sm text-gray-600 font-medium">Posts per week:</label>
          {[2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setPostsPerWeek(n)}
              className={`w-9 h-9 rounded-full text-sm font-semibold border transition ${
                postsPerWeek === n
                  ? "bg-linkedin-blue text-white border-linkedin-blue"
                  : "border-gray-200 text-gray-600 hover:border-linkedin-blue"
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleGeneratePillars}
            disabled={!profile || pillarLoading}
            className="px-4 py-2.5 text-sm border border-linkedin-blue text-linkedin-blue rounded-xl hover:bg-linkedin-light transition disabled:opacity-40"
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
      </div>

      {/* Pillars */}
      {pillars.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h4 className="font-semibold text-gray-800 mb-4">Your Content Pillars</h4>
          <div className="grid grid-cols-2 gap-3">
            {pillars.map((p) => (
              <div key={p.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50">
                <div className="font-semibold text-sm text-gray-800">{p.name}</div>
                <div className="text-xs text-gray-500 mt-1">{p.description}</div>
                <ul className="mt-2 space-y-0.5">
                  {p.exampleTopics.map((t, i) => (
                    <li key={i} className="text-xs text-linkedin-blue">· {t}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly plan */}
      {plan && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h4 className="font-semibold text-gray-800 mb-4">
            Week of {new Date(plan.weekStart).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
          </h4>
          <div className="space-y-3">
            {plan.plannedPosts.map((post, i) => (
              <div
                key={i}
                className="flex items-start gap-4 p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition"
              >
                <div className="w-24 shrink-0">
                  <span className="text-xs font-semibold text-linkedin-blue">
                    {DAYS[post.dayOfWeek - 1] ?? `Day ${post.dayOfWeek}`}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800">{post.topicIdea}</div>
                  <div className="flex gap-2 mt-1">
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{post.pillar}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {FORMAT_EMOJIS[post.format] ?? ""} {post.format}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getMondayEpoch(): number {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(now.setDate(diff)).setHours(0, 0, 0, 0);
}

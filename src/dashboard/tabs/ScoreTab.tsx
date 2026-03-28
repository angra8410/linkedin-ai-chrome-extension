import { useState } from "react";
import { generate } from "../../lib/ollama";
import { promptScoreDraft } from "../../lib/prompts";
import type { UserBrandProfile, AppSettings, ScoringResult } from "../../types";

interface Props {
  profile: UserBrandProfile | null;
  settings: AppSettings | null;
}

const SCORE_LABELS: Record<string, string> = {
  hook: "Hook strength",
  clarity: "Clarity",
  relevance: "Relevance",
  cta: "Call to action",
  authenticity: "Authenticity",
};

export default function ScoreTab({ settings }: Props) {
  const [draft, setDraft] = useState("");
  const [result, setResult] = useState<ScoringResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const model = settings?.defaultModel ?? "mistral";
  const ollamaUrl = settings?.ollamaUrl ?? "http://localhost:11434";

  const handleScore = async () => {
    if (!draft.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const { system, user } = promptScoreDraft(draft);
      const raw = await generate(user, system, model, ollamaUrl);

      // Strip markdown fences if present
      const cleaned = raw.replace(/```json|```/gi, "").trim();
      const parsed = JSON.parse(cleaned);

      const scores = parsed.scores as Record<string, number>;
      const totalScore = Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length;

      const scoringResult: ScoringResult = {
        id: crypto.randomUUID(),
        draftId: "",
        scores: {
          hook: scores.hook ?? 0,
          clarity: scores.clarity ?? 0,
          relevance: scores.relevance ?? 0,
          cta: scores.cta ?? 0,
          authenticity: scores.authenticity ?? 0,
        },
        totalScore: Math.round(totalScore * 10) / 10,
        feedback: parsed.feedback ?? [],
        model,
        createdAt: Date.now(),
      };

      setResult(scoringResult);
    } catch (e) {
      setError("Failed to parse scoring result. Try a more capable model like mistral or llama3.");
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 8) return "bg-green-500";
    if (score >= 5) return "bg-yellow-400";
    return "bg-red-400";
  };

  const totalColor = (score: number) => {
    if (score >= 8) return "text-green-600";
    if (score >= 5) return "text-yellow-600";
    return "text-red-500";
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Paste your draft to score
          </label>
          <textarea
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-linkedin-blue"
            rows={8}
            placeholder="Paste your LinkedIn post draft here..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex justify-between mt-1">
            <span className="text-xs text-gray-400">{draft.length} chars</span>
            {draft.length > 1300 && (
              <span className="text-xs text-orange-500">⚠ Over LinkedIn's recommended 1,300 chars</span>
            )}
          </div>
        </div>

        <button
          onClick={handleScore}
          disabled={!draft.trim() || loading}
          className="w-full bg-linkedin-blue text-white font-semibold py-3 rounded-xl disabled:opacity-40 hover:bg-linkedin-dark transition"
        >
          {loading ? "Scoring..." : "★ Score This Draft"}
        </button>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-xl p-3">{error}</div>
        )}
      </div>

      {result && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
          {/* Total score */}
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Score Report</h3>
            <div className={`text-3xl font-bold ${totalColor(result.totalScore)}`}>
              {result.totalScore.toFixed(1)}<span className="text-base font-normal text-gray-400">/10</span>
            </div>
          </div>

          {/* Score bars */}
          <div className="space-y-3">
            {Object.entries(result.scores).map(([key, val]) => (
              <div key={key}>
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>{SCORE_LABELS[key] ?? key}</span>
                  <span className="font-semibold">{val}/10</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${scoreColor(val)} transition-all duration-500`}
                    style={{ width: `${val * 10}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Feedback */}
          {result.feedback.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Improvement suggestions</h4>
              <ul className="space-y-2">
                {result.feedback.map((tip, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-600">
                    <span className="text-linkedin-blue font-bold shrink-0">{i + 1}.</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { generate } from "../../lib/ollama";
import { promptScoreDraft } from "../../lib/prompts";
import type {
  UserBrandProfile,
  AppSettings,
  ScoringResult,
  ScoreComparisonPayload,
} from "../../types";

interface Props {
  profile: UserBrandProfile | null;
  settings: AppSettings | null;
  seedPayload?: ScoreComparisonPayload | null;
}

type VariantKey = "main" | "variant1" | "variant2" | "variant3";

type VariantInput = {
  key: VariantKey;
  label: string;
  draft: string;
};

type VariantScoreCard = {
  key: VariantKey;
  label: string;
  draft: string;
  result: ScoringResult;
};

const SCORE_LABELS: Record<string, string> = {
  hook: "Hook strength",
  clarity: "Clarity",
  relevance: "Relevance",
  cta: "Call to action",
  authenticity: "Authenticity",
};

const VARIANT_LABELS: Record<VariantKey, string> = {
  main: "Main draft",
  variant1: "Variant 1",
  variant2: "Variant 2",
  variant3: "Variant 3",
};

export default function ScoreTab({ settings, seedPayload }: Props) {
  const [drafts, setDrafts] = useState<Record<VariantKey, string>>({
    main: "",
    variant1: "",
    variant2: "",
    variant3: "",
  });

  const [results, setResults] = useState<VariantScoreCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastSeedAt, setLastSeedAt] = useState<number | null>(null);

  const model = settings?.defaultModel ?? "llama3.1:latest";
  const ollamaUrl = settings?.ollamaUrl ?? "http://localhost:11434";

  useEffect(() => {
    if (!seedPayload) return;
    if (lastSeedAt === seedPayload.createdAt) return;

    setDrafts({
      main: seedPayload.main ?? "",
      variant1: seedPayload.variant1 ?? "",
      variant2: seedPayload.variant2 ?? "",
      variant3: seedPayload.variant3 ?? "",
    });

    setResults([]);
    setError("");
    setLastSeedAt(seedPayload.createdAt);
  }, [seedPayload, lastSeedAt]);

  const filledInputs = useMemo<VariantInput[]>(() => {
    return (Object.keys(drafts) as VariantKey[])
      .map((key) => ({
        key,
        label: VARIANT_LABELS[key],
        draft: drafts[key].trim(),
      }))
      .filter((item) => item.draft.length > 0);
  }, [drafts]);

  const bestOverall = useMemo(() => {
    if (!results.length) return null;
    return [...results].sort((a, b) => b.result.totalScore - a.result.totalScore)[0];
  }, [results]);

  const handleChange = (key: VariantKey, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const parseScoreResponse = (raw: string): ScoringResult => {
    const cleaned = raw.replace(/```json|```/gi, "").trim();
    const parsed = JSON.parse(cleaned);

    const scores = parsed.scores as Record<string, number>;
    const totalScore =
      Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length;

    return {
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
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
      model,
      createdAt: Date.now(),
    };
  };

  const handleScoreAll = async () => {
    if (!filledInputs.length) return;

    setLoading(true);
    setError("");
    setResults([]);

    try {
      const nextResults: VariantScoreCard[] = [];

      for (const item of filledInputs) {
        const { system, user } = promptScoreDraft(item.draft);
        const raw = await generate(user, system, model, ollamaUrl);
        const result = parseScoreResponse(raw);

        nextResults.push({
          key: item.key,
          label: item.label,
          draft: item.draft,
          result,
        });

        setResults([...nextResults]);
      }
    } catch (e) {
      console.error("Scoring failed:", e);
      setError(
        "Failed to score one or more drafts. Try a stronger model like gemma2:9b, llama3.1:latest, or gemma3:27b."
      );
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

  const recommendationText = (card: VariantScoreCard) => {
    const { scores } = card.result;
    const strongest = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    const weakest = Object.entries(scores).sort((a, b) => a[1] - b[1])[0]?.[0] ?? "";

    return `Best at ${SCORE_LABELS[strongest] ?? strongest.toLowerCase()}, weakest at ${
      SCORE_LABELS[weakest] ?? weakest.toLowerCase()
    }.`;
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
        <div>
          <h3 className="font-semibold text-gray-800">Compare draft quality</h3>
          <p className="text-sm text-gray-500 mt-1">
            Paste your main draft and up to 3 variants. The extension will score each one and identify the strongest option.
          </p>

          {seedPayload && (
            <p className="text-xs text-linkedin-blue mt-2">
              Draft bundle received from Draft tab{seedPayload.sourceTopic ? ` · Topic: ${seedPayload.sourceTopic}` : ""}.
            </p>
          )}
        </div>

        <div className="grid gap-4">
          {(Object.keys(drafts) as VariantKey[]).map((key) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {VARIANT_LABELS[key]}
              </label>
              <textarea
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-linkedin-blue"
                rows={key === "main" ? 6 : 4}
                placeholder={
                  key === "main"
                    ? "Paste your main LinkedIn draft here..."
                    : `Paste ${VARIANT_LABELS[key].toLowerCase()} here...`
                }
                value={drafts[key]}
                onChange={(e) => handleChange(key, e.target.value)}
              />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-gray-400">{drafts[key].length} chars</span>
                {drafts[key].length > 1300 && (
                  <span className="text-xs text-orange-500">
                    ⚠ Over LinkedIn's recommended 1,300 chars
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="text-xs text-gray-500">
          Active model: <span className="font-medium">{model}</span>
        </div>

        <button
          onClick={handleScoreAll}
          disabled={!filledInputs.length || loading}
          className="w-full bg-linkedin-blue text-white font-semibold py-3 rounded-xl disabled:opacity-40 hover:bg-linkedin-dark transition"
        >
          {loading ? "Scoring drafts..." : "★ Score All Drafts"}
        </button>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-xl p-3">{error}</div>
        )}
      </div>

      {bestOverall && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-green-800">Best overall</div>
              <div className="text-xs text-green-700 mt-1">
                {bestOverall.label} scored highest overall at {bestOverall.result.totalScore.toFixed(1)}/10.
              </div>
            </div>
            <div className={`text-3xl font-bold ${totalColor(bestOverall.result.totalScore)}`}>
              {bestOverall.result.totalScore.toFixed(1)}
              <span className="text-base font-normal text-gray-400">/10</span>
            </div>
          </div>

          <div className="bg-white/70 rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap">
            {bestOverall.draft}
          </div>

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => navigator.clipboard.writeText(bestOverall.draft)}
              className="text-xs text-linkedin-blue underline"
            >
              Copy best draft
            </button>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="grid gap-4">
          {results.map((card) => (
            <div
              key={card.key}
              className={`bg-white rounded-2xl border p-6 space-y-5 ${
                bestOverall?.key === card.key
                  ? "border-green-300 ring-2 ring-green-100"
                  : "border-gray-200"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-gray-800">{card.label}</h3>
                  <p className="text-xs text-gray-500 mt-1">{recommendationText(card)}</p>
                </div>
                <div className="text-right">
                  {bestOverall?.key === card.key && (
                    <div className="text-xs font-semibold text-green-700 mb-1">Best overall</div>
                  )}
                  <div className={`text-3xl font-bold ${totalColor(card.result.totalScore)}`}>
                    {card.result.totalScore.toFixed(1)}
                    <span className="text-base font-normal text-gray-400">/10</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap">
                {card.draft}
              </div>

              <div className="space-y-3">
                {Object.entries(card.result.scores).map(([key, val]) => (
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

              {card.result.feedback.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">
                    Improvement suggestions
                  </h4>
                  <ul className="space-y-2">
                    {card.result.feedback.map((tip, i) => (
                      <li key={i} className="flex gap-2 text-sm text-gray-600">
                        <span className="text-linkedin-blue font-bold shrink-0">{i + 1}.</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={() => navigator.clipboard.writeText(card.draft)}
                  className="text-xs text-linkedin-blue underline"
                >
                  Copy this draft
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
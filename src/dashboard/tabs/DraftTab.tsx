import { useEffect, useRef, useState } from "react";
import { generate, generateStream } from "../../lib/ollama";
import {
  promptGeneratePost,
  promptRecruiterPost,
  promptRewritePost,
  promptGenerateHooks,
  promptGenerateCTAs,
  promptScoreDraft,
  type RewriteStyle,
} from "../../lib/prompts";
import { saveDraft } from "../../lib/db";
import type {
  UserBrandProfile,
  AppSettings,
  PostDraft,
  ScoreComparisonPayload,
  DraftPromotionPayload,
  ScoringResult,
} from "../../types";

type Mode = "post" | "recruiter" | "hooks" | "cta";

type DraftVariant = {
  style: RewriteStyle;
  content: string;
  score?: ScoringResult;
};

type ScoredCandidate = {
  label: string;
  content: string;
  score: ScoringResult;
};

type PipelineState = {
  visible: boolean;
  step: number;
  total: number;
  label: string;
  status: "idle" | "running" | "success" | "error";
  error?: string;
  autoSaved?: boolean;
};

const REWRITE_STYLES: RewriteStyle[] = [
  "concise",
  "story",
  "bold",
  "data-driven",
  "question-led",
  "linkedin-polish",
  "shorter",
  "more-human",
];

const AUTO_VARIANT_STYLES: RewriteStyle[] = [
  "linkedin-polish",
  "more-human",
  "shorter",
];

const PIPELINE_STEPS = [
  "Generating main draft",
  "Generating variants",
  "Scoring candidates",
  "Selecting best draft",
  "Saving best draft candidate",
];

interface Props {
  profile: UserBrandProfile | null;
  settings: AppSettings | null;
  onSendToScore: (payload: ScoreComparisonPayload) => void;
  seedPayload?: DraftPromotionPayload | null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

function parseScoreResponse(raw: string, model: string): ScoringResult {
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
}

export default function DraftTab({
  profile,
  settings,
  onSendToScore,
  seedPayload,
}: Props) {
  const [mode, setMode] = useState<Mode>("post");
  const [topic, setTopic] = useState("");
  const [pillar, setPillar] = useState("");
  const [output, setOutput] = useState("");
  const [variants, setVariants] = useState<DraftVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [variantLoading, setVariantLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [rewriteStyle, setRewriteStyle] = useState<RewriteStyle>("linkedin-polish");
  const [rewriteOutput, setRewriteOutput] = useState("");
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [lastSeedAt, setLastSeedAt] = useState<number | null>(null);
  const [attachedScore, setAttachedScore] = useState<ScoringResult | undefined>(undefined);
  const [workflowMessage, setWorkflowMessage] = useState("");
  const [pipeline, setPipeline] = useState<PipelineState>({
    visible: false,
    step: 0,
    total: PIPELINE_STEPS.length,
    label: "",
    status: "idle",
  });
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);

  const autoRunRef = useRef<number | null>(null);

  const model = settings?.defaultModel ?? "llama3.1:latest";
  const ollamaUrl = settings?.ollamaUrl ?? "http://localhost:11434";
  const streamingEnabled = settings?.streamingEnabled ?? true;

  const canGenerate = !!profile && !!topic.trim() && !loading && !variantLoading;

  useEffect(() => {
    if (!seedPayload) return;
    if (lastSeedAt === seedPayload.createdAt) return;

    setOutput(seedPayload.content);
    setVariants([]);
    setRewriteOutput("");
    setSaved(false);
    setMode("post");
    setAttachedScore(seedPayload.scoringResult);
    setWorkflowMessage("");
    setCurrentDraftId(null);
    resetPipeline();

    if (seedPayload.sourceTopic) {
      setTopic(seedPayload.sourceTopic);
    }

    if (seedPayload.sourcePillar) {
      setPillar(seedPayload.sourcePillar);
    }

    setLastSeedAt(seedPayload.createdAt);

    if (seedPayload.autoGenerate) {
      autoRunRef.current = seedPayload.createdAt;
      setWorkflowMessage("Planner topic received. Running the automatic draft pipeline...");
    } else {
      autoRunRef.current = null;
    }
  }, [seedPayload, lastSeedAt]);

  useEffect(() => {
    const shouldAutoRun =
      !!profile &&
      !!seedPayload?.autoGenerate &&
      !!topic.trim() &&
      autoRunRef.current === seedPayload.createdAt &&
      !loading &&
      !variantLoading;

    if (!shouldAutoRun) return;

    autoRunRef.current = null;
    void generateBestDraftPipeline();
  }, [profile, seedPayload, topic]);

  const resetPipeline = () => {
    setPipeline({
      visible: false,
      step: 0,
      total: PIPELINE_STEPS.length,
      label: "",
      status: "idle",
    });
  };

  const updatePipeline = (
    step: number,
    label: string,
    status: "running" | "success" | "error" = "running",
    error?: string,
    autoSaved?: boolean
  ) => {
    setPipeline({
      visible: true,
      step,
      total: PIPELINE_STEPS.length,
      label,
      status,
      error,
      autoSaved,
    });
  };

  const buildPrompt = () => {
    if (!profile) return { system: "", user: "" };

    if (mode === "post") {
      return promptGeneratePost(
        profile,
        topic,
        pillar || profile.contentPillars[0] || ""
      );
    }

    if (mode === "recruiter") {
      return promptRecruiterPost(profile, topic);
    }

    if (mode === "hooks") {
      return promptGenerateHooks(profile, topic);
    }

    return promptGenerateCTAs(topic);
  };

  const runGenerate = async (
    user: string,
    system: string,
    onProgress?: (text: string) => void
  ): Promise<string> => {
    if (streamingEnabled) {
      let finalText = "";

      await generateStream(
        user,
        system,
        model,
        (chunk) => {
          finalText += chunk;
          onProgress?.(finalText);
        },
        () => {},
        ollamaUrl
      );

      return finalText.trim();
    }

    const text = await generate(user, system, model, ollamaUrl);
    const trimmed = text.trim();
    onProgress?.(trimmed);
    return trimmed;
  };

  const scoreCandidate = async (content: string): Promise<ScoringResult> => {
    const { system, user } = promptScoreDraft(content);
    const raw = await generate(user, system, model, ollamaUrl);
    return parseScoreResponse(raw, model);
  };

  const generateVariants = async (baseDraft: string): Promise<DraftVariant[]> => {
    if (!profile || (mode !== "post" && mode !== "recruiter")) {
      setVariants([]);
      return [];
    }

    setVariantLoading(true);
    setVariants([]);

    const nextVariants: DraftVariant[] = [];

    for (const style of AUTO_VARIANT_STYLES) {
      try {
        const { system, user } = promptRewritePost(profile, baseDraft, style);
        const rewritten = await runGenerate(user, system);

        if (rewritten) {
          nextVariants.push({
            style,
            content: rewritten,
          });
          setVariants([...nextVariants]);
        }
      } catch (error) {
        console.error(`Auto variant generation failed for ${style}:`, error);
      }
    }

    setVariantLoading(false);
    return nextVariants;
  };

  const generateDraft = async () => {
    if (!profile) return;

    setOutput("");
    setVariants([]);
    setSaved(false);
    setRewriteOutput("");
    setAttachedScore(undefined);
    setWorkflowMessage("");
    setCurrentDraftId(null);
    resetPipeline();
    setLoading(true);

    const { system, user } = buildPrompt();

    try {
      const trimmed = await runGenerate(user, system, setOutput);

      if (!trimmed) {
        setOutput(
          "⚠️ Ollama responded, but no text was returned. Try another model like llama3.1:latest or gemma2:9b."
        );
        setLoading(false);
        return;
      }

      setOutput(trimmed);
      setLoading(false);

      if (mode === "post" || mode === "recruiter") {
        await generateVariants(trimmed);
      }
    } catch (error) {
      console.error("Draft generation failed:", error);
      setOutput(
        `⚠️ Draft generation failed.\nModel: ${model}\nURL: ${ollamaUrl}\nDetails: ${getErrorMessage(error)}`
      );
      setLoading(false);
      setVariantLoading(false);
    }
  };

  const autoSaveWinner = async (
    winner: ScoredCandidate,
    allVariants: DraftVariant[]
  ): Promise<string> => {
    const draftId = currentDraftId ?? crypto.randomUUID();
    const status = winner.score.totalScore >= 8 ? "ready" : "draft";

    const draft: PostDraft = {
      id: draftId,
      prompt: topic,
      content: winner.content,
      pillar: pillar || (profile?.contentPillars[0] ?? ""),
      model,
      scoringResult: winner.score,
      variants: allVariants.map((v) => v.content),
      status,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveDraft(draft);
    return draftId;
  };

  const generateBestDraftPipeline = async () => {
    if (!profile || !topic.trim()) return;

    setOutput("");
    setVariants([]);
    setSaved(false);
    setRewriteOutput("");
    setAttachedScore(undefined);
    setCurrentDraftId(null);
    setLoading(true);
    setVariantLoading(false);
    setWorkflowMessage("Automatic pipeline started.");

    try {
      const { system, user } = buildPrompt();

      updatePipeline(1, PIPELINE_STEPS[0], "running");
      const mainDraft = await runGenerate(user, system, setOutput);

      if (!mainDraft) {
        setOutput("⚠️ Ollama responded, but no text was returned.");
        updatePipeline(1, "No draft text was returned.", "error", "No draft text was returned.");
        setWorkflowMessage("Automatic pipeline stopped because no draft text was returned.");
        setLoading(false);
        return;
      }

      setOutput(mainDraft);
      setLoading(false);

      updatePipeline(2, PIPELINE_STEPS[1], "running");
      const generatedVariants = await generateVariants(mainDraft);

      updatePipeline(3, PIPELINE_STEPS[2], "running");
      const candidates: ScoredCandidate[] = [];
      const mainScore = await scoreCandidate(mainDraft);
      candidates.push({
        label: "Main draft",
        content: mainDraft,
        score: mainScore,
      });

      const scoredVariants: DraftVariant[] = [];
      for (const variant of generatedVariants) {
        try {
          const score = await scoreCandidate(variant.content);
          const enriched = { ...variant, score };
          scoredVariants.push(enriched);
          candidates.push({
            label: variant.style,
            content: variant.content,
            score,
          });
        } catch (error) {
          console.error(`Scoring failed for ${variant.style}:`, error);
          scoredVariants.push(variant);
        }
      }

      setVariants(scoredVariants);

      updatePipeline(4, PIPELINE_STEPS[3], "running");
      const winner = [...candidates].sort(
        (a, b) => b.score.totalScore - a.score.totalScore
      )[0];

      if (!winner) {
        updatePipeline(4, "No winning draft could be selected.", "error", "No winning draft could be selected.");
        setWorkflowMessage("Drafts were generated, but automatic scoring did not complete.");
        return;
      }

      setOutput(winner.content);
      setAttachedScore(winner.score);

      updatePipeline(5, PIPELINE_STEPS[4], "running");
      const savedDraftId = await autoSaveWinner(winner, scoredVariants);
      setCurrentDraftId(savedDraftId);
      setSaved(true);

      const savedStatus = winner.score.totalScore >= 8 ? "ready" : "draft";
      updatePipeline(
        5,
        `Best draft selected and auto-saved as ${savedStatus}.`,
        "success",
        undefined,
        true
      );

      setWorkflowMessage(
        `Best draft selected automatically: ${winner.label} (${winner.score.totalScore.toFixed(1)}/10) and saved as a ${savedStatus} candidate.`
      );
    } catch (error) {
      console.error("Automatic planner-to-draft pipeline failed:", error);
      updatePipeline(
        pipeline.step || 1,
        "Automatic pipeline failed.",
        "error",
        getErrorMessage(error)
      );
      setWorkflowMessage(`Automatic pipeline failed. Details: ${getErrorMessage(error)}`);
      setLoading(false);
      setVariantLoading(false);
    } finally {
      setLoading(false);
      setVariantLoading(false);
    }
  };

  const handleRewrite = async () => {
    if (!profile || !output.trim()) return;

    setRewriteOutput("");
    setRewriteLoading(true);

    const { system, user } = promptRewritePost(profile, output, rewriteStyle);

    try {
      const text = await runGenerate(user, system, setRewriteOutput);
      setRewriteOutput(text?.trim() ? text : "⚠️ Rewrite returned no text.");
      setRewriteLoading(false);
    } catch (error) {
      console.error("Rewrite failed:", error);
      setRewriteOutput(`⚠️ Rewrite failed.\nDetails: ${getErrorMessage(error)}`);
      setRewriteLoading(false);
    }
  };

  const handleSave = async () => {
    if (!output.trim()) return;

    const draftId = currentDraftId ?? crypto.randomUUID();

    const draft: PostDraft = {
      id: draftId,
      prompt: topic,
      content: output,
      pillar: pillar || (profile?.contentPillars[0] ?? ""),
      model,
      scoringResult: attachedScore,
      variants: [
        ...variants.map((v) => v.content),
        ...(rewriteOutput.trim() ? [rewriteOutput] : []),
      ],
      status: attachedScore && attachedScore.totalScore >= 8 ? "ready" : "draft",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveDraft(draft);
    setCurrentDraftId(draftId);
    setSaved(true);
    setWorkflowMessage(attachedScore ? "Draft and score saved successfully." : "Draft saved successfully.");
  };

  const useAsMainDraft = (text: string) => {
    setOutput(text);
    setSaved(false);
    setRewriteOutput("");
    setAttachedScore(undefined);
    setWorkflowMessage("Variant promoted to main draft. Score detached until rescored.");
  };

  const handleSendAllToScore = () => {
    if (!output.trim()) return;

    onSendToScore({
      main: output,
      variant1: variants[0]?.content ?? "",
      variant2: variants[1]?.content ?? "",
      variant3: variants[2]?.content ?? "",
      sourceTopic: topic,
      createdAt: Date.now(),
    });
  };

  return (
    <div className="max-w-4xl space-y-6">
      {!profile && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
          Set up your brand profile to unlock personalized AI generation.
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {(["post", "recruiter", "hooks", "cta"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setOutput("");
              setVariants([]);
              setRewriteOutput("");
              setAttachedScore(undefined);
              setWorkflowMessage("");
              setCurrentDraftId(null);
              resetPipeline();
            }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${
              mode === m
                ? "bg-linkedin-blue text-white border-linkedin-blue"
                : "text-gray-600 border-gray-200 hover:border-linkedin-blue hover:text-linkedin-blue"
            }`}
          >
            {m === "post" && "📝 Post"}
            {m === "recruiter" && "🎯 Recruiter"}
            {m === "hooks" && "🪝 Hooks"}
            {m === "cta" && "📢 CTAs"}
          </button>
        ))}
      </div>

      {seedPayload && lastSeedAt === seedPayload.createdAt && !seedPayload.autoGenerate && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
          Draft received from {seedPayload.sourceLabel ?? "another tab"}.
        </div>
      )}

      {(pipeline.visible || workflowMessage) && (
        <div
          className={`rounded-2xl border p-4 space-y-3 ${
            pipeline.status === "error"
              ? "bg-red-50 border-red-200"
              : pipeline.status === "success"
                ? "bg-green-50 border-green-200"
                : "bg-blue-50 border-blue-200"
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-semibold text-gray-800">
              Automatic Draft Pipeline
            </div>
            {pipeline.visible && (
              <div className="text-xs font-medium text-gray-500">
                Step {Math.min(Math.max(pipeline.step, 1), pipeline.total)}/{pipeline.total}
              </div>
            )}
          </div>

          <div className="text-sm text-gray-700">
            {pipeline.label || workflowMessage}
          </div>

          {pipeline.error && (
            <div className="text-xs text-red-700 bg-white/70 rounded-lg px-3 py-2">
              {pipeline.error}
            </div>
          )}

          <div className="grid gap-2">
            {PIPELINE_STEPS.map((stepLabel, index) => {
              const stepNumber = index + 1;
              const isDone = pipeline.step > stepNumber || (pipeline.status === "success" && pipeline.step >= stepNumber);
              const isCurrent = pipeline.step === stepNumber && pipeline.status === "running";
              const isPending = pipeline.step < stepNumber;

              return (
                <div
                  key={stepLabel}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${
                    isDone
                      ? "bg-white/70 text-green-700"
                      : isCurrent
                        ? "bg-white text-linkedin-blue"
                        : "bg-white/50 text-gray-400"
                  }`}
                >
                  <span className="w-5 text-center font-semibold">
                    {isDone ? "✓" : stepNumber}
                  </span>
                  <span>{stepLabel}</span>
                  {isCurrent && <span className="ml-auto text-xs animate-pulse">running...</span>}
                  {isPending && <span className="ml-auto text-xs">pending</span>}
                </div>
              );
            })}
          </div>

          {pipeline.autoSaved && (
            <div className="text-xs text-green-700 font-medium">
              Best draft candidate saved automatically.
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {mode === "post" && "Topic / Idea"}
            {mode === "recruiter" && "Achievement to showcase"}
            {mode === "hooks" && "Topic to generate hooks for"}
            {mode === "cta" && "Post topic"}
          </label>
          <textarea
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-linkedin-blue"
            rows={4}
            placeholder={
              mode === "post"
                ? "e.g. Why data quality matters more than data volume"
                : mode === "recruiter"
                  ? "e.g. Improved reporting accuracy by redesigning data validation logic"
                  : mode === "hooks"
                    ? "e.g. Common mistakes in BI dashboard design"
                    : "e.g. Why most dashboards fail to drive decisions"
            }
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </div>

        {mode === "post" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Content Pillar
            </label>
            <select
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-linkedin-blue"
              value={pillar}
              onChange={(e) => setPillar(e.target.value)}
            >
              <option value="">— auto-select —</option>
              {(profile?.contentPillars ?? []).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="text-xs text-gray-500">
          Active model: <span className="font-medium">{model}</span> · Streaming:{" "}
          <span className="font-medium">{streamingEnabled ? "on" : "off"}</span>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={generateDraft}
            disabled={!canGenerate}
            className="flex-1 min-w-[220px] bg-linkedin-blue text-white font-semibold py-3 rounded-xl disabled:opacity-40 hover:bg-linkedin-dark transition"
          >
            {loading ? "Generating..." : "✦ Generate"}
          </button>

          {(mode === "post" || mode === "recruiter") && (
            <button
              onClick={generateBestDraftPipeline}
              disabled={!canGenerate}
              className="flex-1 min-w-[220px] border border-linkedin-blue text-linkedin-blue font-semibold py-3 rounded-xl disabled:opacity-40 hover:bg-linkedin-light transition"
            >
              {loading || variantLoading ? "Running auto-pipeline..." : "⚡ Generate Best Draft Automatically"}
            </button>
          )}
        </div>
      </div>

      {(output || loading) && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-gray-800 text-sm">Main Output</h3>
            <span className="text-xs text-gray-400">{output.length} chars</span>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap min-h-[120px]">
            {output || <span className="text-gray-400 animate-pulse">Writing...</span>}
          </div>

          {attachedScore && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800">
              Attached score: <span className="font-semibold">{attachedScore.totalScore.toFixed(1)}/10</span>
              {" · "}
              This draft will be saved with its scoring result.
            </div>
          )}

          {output && !loading && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => navigator.clipboard.writeText(output)}
                className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 transition"
              >
                Copy
              </button>

              <button
                onClick={handleSave}
                disabled={saved}
                className="px-4 py-2 text-sm border border-linkedin-blue text-linkedin-blue rounded-xl hover:bg-linkedin-light transition disabled:opacity-50"
              >
                {saved ? "✓ Saved" : attachedScore ? "Save Draft + Score" : "Save Draft"}
              </button>

              {(mode === "post" || mode === "recruiter") && (
                <button
                  onClick={handleSendAllToScore}
                  className="px-4 py-2 text-sm bg-gray-800 text-white rounded-xl hover:bg-gray-700 transition"
                >
                  Send main + variants to Score
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {(variantLoading || variants.length > 0) && (mode === "post" || mode === "recruiter") && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-gray-800 text-sm">
              Auto-generated variants
            </h3>
            {variantLoading && (
              <span className="text-xs text-gray-400 animate-pulse">
                Creating linkedin-polish, more-human, and shorter...
              </span>
            )}
          </div>

          <div className="grid gap-4">
            {variants.map((variant) => (
              <div
                key={variant.style}
                className="border border-gray-200 rounded-xl p-4 space-y-3 bg-blue-50/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-gray-800 capitalize">
                    {variant.style}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {variant.score && (
                      <span className="text-[11px] px-2 py-1 rounded-full bg-green-100 text-green-700 font-semibold">
                        {variant.score.totalScore.toFixed(1)}/10
                      </span>
                    )}
                    <div className="text-xs text-gray-400">
                      {variant.content.length} chars
                    </div>
                  </div>
                </div>

                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                  {variant.content}
                </div>

                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={() => navigator.clipboard.writeText(variant.content)}
                    className="text-xs text-linkedin-blue underline"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => useAsMainDraft(variant.content)}
                    className="text-xs text-linkedin-blue underline"
                  >
                    Use as main draft
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {output && !loading && (mode === "post" || mode === "recruiter") && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <h4 className="text-sm font-semibold text-gray-700">
            Manual rewrite in a different style
          </h4>

          <div className="flex gap-2 flex-wrap">
            {REWRITE_STYLES.map((s) => (
              <button
                key={s}
                onClick={() => setRewriteStyle(s)}
                className={`px-3 py-1 text-xs rounded-full border transition ${
                  rewriteStyle === s
                    ? "bg-linkedin-blue text-white border-linkedin-blue"
                    : "text-gray-500 border-gray-200 hover:border-gray-400"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <button
            onClick={handleRewrite}
            disabled={rewriteLoading}
            className="px-4 py-2 text-sm bg-gray-800 text-white rounded-xl hover:bg-gray-700 transition disabled:opacity-40"
          >
            {rewriteLoading ? "Rewriting..." : "↺ Rewrite"}
          </button>

          {rewriteOutput && (
            <div className="bg-blue-50 rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap">
              {rewriteOutput}
              <div className="mt-3 flex gap-3 flex-wrap">
                <button
                  onClick={() => navigator.clipboard.writeText(rewriteOutput)}
                  className="text-xs text-linkedin-blue underline"
                >
                  Copy rewrite
                </button>
                <button
                  onClick={() => useAsMainDraft(rewriteOutput)}
                  className="text-xs text-linkedin-blue underline"
                >
                  Use rewrite as main draft
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
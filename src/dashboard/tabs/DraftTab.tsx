import { useState } from "react";
import { generate, generateStream } from "../../lib/ollama";
import {
  promptGeneratePost,
  promptRecruiterPost,
  promptRewritePost,
  promptGenerateHooks,
  promptGenerateCTAs,
  type RewriteStyle,
} from "../../lib/prompts";
import { saveDraft } from "../../lib/db";
import type { UserBrandProfile, AppSettings, PostDraft } from "../../types";

type Mode = "post" | "recruiter" | "hooks" | "cta";

const REWRITE_STYLES: RewriteStyle[] = [
  "concise",
  "story",
  "bold",
  "data-driven",
  "question-led",
];

interface Props {
  profile: UserBrandProfile | null;
  settings: AppSettings | null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

export default function DraftTab({ profile, settings }: Props) {
  const [mode, setMode] = useState<Mode>("post");
  const [topic, setTopic] = useState("");
  const [pillar, setPillar] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [rewriteStyle, setRewriteStyle] = useState<RewriteStyle>("story");
  const [rewriteOutput, setRewriteOutput] = useState("");
  const [rewriteLoading, setRewriteLoading] = useState(false);

  const model = settings?.defaultModel ?? "llama3.1:latest";
  const ollamaUrl = settings?.ollamaUrl ?? "http://localhost:11434";
  const streamingEnabled = settings?.streamingEnabled ?? true;

  const canGenerate = !!profile && !!topic.trim() && !loading;

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

  const generateDraft = async () => {
    if (!profile) return;

    setOutput("");
    setSaved(false);
    setLoading(true);

    const { system, user } = buildPrompt();

    try {
      if (streamingEnabled) {
        let finalText = "";

        await generateStream(
          user,
          system,
          model,
          (chunk) => {
            finalText += chunk;
            setOutput(finalText);
          },
          () => {
            setLoading(false);
          },
          ollamaUrl
        );

        if (!finalText.trim()) {
          setOutput(
            "⚠️ Ollama responded, but no text was returned. Try another model like llama3.1:latest or gemma2:9b."
          );
          setLoading(false);
        }
      } else {
        const text = await generate(user, system, model, ollamaUrl);
        setOutput(
          text?.trim()
            ? text
            : "⚠️ Ollama responded, but no text was returned."
        );
        setLoading(false);
      }
    } catch (error) {
      console.error("Draft generation failed:", error);
      setOutput(
        `⚠️ Draft generation failed.\nModel: ${model}\nURL: ${ollamaUrl}\nDetails: ${getErrorMessage(error)}`
      );
      setLoading(false);
    }
  };

  const handleRewrite = async () => {
    if (!profile || !output.trim()) return;

    setRewriteOutput("");
    setRewriteLoading(true);

    const { system, user } = promptRewritePost(profile, output, rewriteStyle);

    try {
      if (streamingEnabled) {
        let finalText = "";

        await generateStream(
          user,
          system,
          model,
          (chunk) => {
            finalText += chunk;
            setRewriteOutput(finalText);
          },
          () => {
            setRewriteLoading(false);
          },
          ollamaUrl
        );

        if (!finalText.trim()) {
          setRewriteOutput("⚠️ Rewrite returned no text.");
          setRewriteLoading(false);
        }
      } else {
        const text = await generate(user, system, model, ollamaUrl);
        setRewriteOutput(text?.trim() ? text : "⚠️ Rewrite returned no text.");
        setRewriteLoading(false);
      }
    } catch (error) {
      console.error("Rewrite failed:", error);
      setRewriteOutput(`⚠️ Rewrite failed.\nDetails: ${getErrorMessage(error)}`);
      setRewriteLoading(false);
    }
  };

  const handleSave = async () => {
    if (!output.trim()) return;

    const draft: PostDraft = {
      id: crypto.randomUUID(),
      prompt: topic,
      content: output,
      pillar: pillar || (profile?.contentPillars[0] ?? ""),
      model,
      variants: [],
      status: "draft",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveDraft(draft);
    setSaved(true);
  };

  return (
    <div className="max-w-3xl space-y-6">
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
              setRewriteOutput("");
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
            rows={3}
            placeholder={
              mode === "post"
                ? "e.g. Why data quality matters more than data volume"
                : mode === "recruiter"
                ? "e.g. Reduced data pipeline errors by 40% using dbt tests"
                : mode === "hooks"
                ? "e.g. Common mistakes in BI dashboard design"
                : "e.g. Why most data dashboards fail to drive decisions"
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
          <span className="font-medium">
            {streamingEnabled ? "on" : "off"}
          </span>
        </div>

        <button
          onClick={generateDraft}
          disabled={!canGenerate}
          className="w-full bg-linkedin-blue text-white font-semibold py-3 rounded-xl disabled:opacity-40 hover:bg-linkedin-dark transition"
        >
          {loading ? "Generating..." : "✦ Generate"}
        </button>
      </div>

      {(output || loading) && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-gray-800 text-sm">Output</h3>
            <span className="text-xs text-gray-400">{output.length} chars</span>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap min-h-[120px]">
            {output || (
              <span className="text-gray-400 animate-pulse">Writing...</span>
            )}
          </div>

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
                {saved ? "✓ Saved" : "Save Draft"}
              </button>
            </div>
          )}

          {output && !loading && (mode === "post" || mode === "recruiter") && (
            <div className="pt-4 border-t border-gray-100 space-y-3">
              <h4 className="text-sm font-semibold text-gray-700">
                Rewrite in a different style
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
                  <div className="mt-3">
                    <button
                      onClick={() => navigator.clipboard.writeText(rewriteOutput)}
                      className="text-xs text-linkedin-blue underline"
                    >
                      Copy rewrite
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
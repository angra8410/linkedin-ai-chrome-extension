import { useState, useEffect } from "react";
import { getSettings, saveSettings } from "../../lib/storage";
import { checkOllamaStatus, listModels } from "../../lib/ollama";
import type { AppSettings, OllamaModel, OllamaStatus } from "../../types";

const FALLBACK_URL = "http://localhost:11434";
const FALLBACK_MODEL = "llama3.1:latest";

const RECOMMENDED_MODELS = [
  { name: "llama3.1:latest", desc: "Strong general writing quality. Great default choice.", pull: "ollama pull llama3.1" },
  { name: "gemma3:4b", desc: "Lightweight and fast. Good for lower-resource machines.", pull: "ollama pull gemma3:4b" },
  { name: "gemma2:9b", desc: "Very solid rewriting and balanced quality.", pull: "ollama pull gemma2:9b" },
  { name: "gemma3:27b", desc: "Higher quality, but much heavier.", pull: "ollama pull gemma3:27b" },
  { name: "mistral", desc: "Optional if you install it manually.", pull: "ollama pull mistral" },
];

interface Props {
  onSave: () => void;
}

export default function SettingsTab({ onSave }: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [ollamaUrl, setOllamaUrl] = useState(FALLBACK_URL);
  const [defaultModel, setDefaultModel] = useState(FALLBACK_MODEL);
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [status, setStatus] = useState<OllamaStatus>("checking");
  const [availableModels, setAvailableModels] = useState<OllamaModel[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setSettings(s);

      const savedUrl = s?.ollamaUrl || FALLBACK_URL;
      const savedModel = s?.defaultModel || FALLBACK_MODEL;
      const savedStreaming = s?.streamingEnabled ?? true;

      setOllamaUrl(savedUrl);
      setDefaultModel(savedModel);
      setStreamingEnabled(savedStreaming);

      await refreshOllamaStatus(savedUrl, savedModel);
    })();
  }, []);

  const refreshOllamaStatus = async (url: string, preferredModel?: string) => {
    setStatus("checking");

    const nextStatus = await checkOllamaStatus(url);
    setStatus(nextStatus);

    if (nextStatus !== "online") {
      setAvailableModels([]);
      return;
    }

    try {
      const models = await listModels(url);
      setAvailableModels(models);

      if (models.length === 0) return;

      const preferred = preferredModel ?? defaultModel;
      const exists = models.some((m) => m.name === preferred);

      if (!exists) {
        const bestFallback =
          models.find((m) => m.name === "llama3.1:latest")?.name ||
          models.find((m) => m.name === "gemma3:4b")?.name ||
          models.find((m) => m.name === "gemma2:9b")?.name ||
          models[0]?.name ||
          FALLBACK_MODEL;

        setDefaultModel(bestFallback);
      }
    } catch (error) {
      console.error("Failed to list Ollama models:", error);
      setAvailableModels([]);
      setStatus("error");
    }
  };

  const handleSave = async () => {
    setSaving(true);

    let modelToSave = defaultModel;

    if (availableModels.length > 0) {
      const exists = availableModels.some((m) => m.name === defaultModel);
      if (!exists) {
        modelToSave = availableModels[0].name;
        setDefaultModel(modelToSave);
      }
    }

    await saveSettings({
      ollamaUrl,
      defaultModel: modelToSave,
      streamingEnabled,
    });

    const updatedSettings = await getSettings();
    setSettings(updatedSettings);

    await refreshOllamaStatus(ollamaUrl, modelToSave);

    setSaving(false);
    onSave();
  };

  const statusColors: Record<OllamaStatus, string> = {
    checking: "text-yellow-600 bg-yellow-50",
    online: "text-green-700 bg-green-50",
    offline: "text-red-600 bg-red-50",
    error: "text-orange-600 bg-orange-50",
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
        <h3 className="font-semibold text-gray-800">Ollama Configuration</h3>

        <div>
          <label className="text-sm font-medium text-gray-700 mb-1.5 block">
            Ollama URL
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-linkedin-blue"
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
            />
            <button
              onClick={() => refreshOllamaStatus(ollamaUrl, defaultModel)}
              className="px-4 py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 transition"
            >
              Test
            </button>
          </div>
        </div>

        <div className={`text-sm font-medium px-4 py-2.5 rounded-xl ${statusColors[status]}`}>
          {status === "checking" && "⏳ Checking connection..."}
          {status === "online" && `✅ Ollama is online — ${availableModels.length} model(s) available`}
          {status === "offline" && "❌ Ollama not found at this URL."}
          {status === "error" && "⚠️ Connected, but there was a problem reading models or responses."}
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 mb-1.5 block">
            Active Model
          </label>

          {availableModels.length > 0 ? (
            <select
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-linkedin-blue"
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
            >
              {availableModels.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name} ({formatBytes(m.size)})
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-linkedin-blue"
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              placeholder={FALLBACK_MODEL}
            />
          )}

          {availableModels.length > 0 && !availableModels.some((m) => m.name === defaultModel) && (
            <p className="text-xs text-orange-600 mt-2">
              The saved model was not found in Ollama, so choose one from the detected list.
            </p>
          )}
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setStreamingEnabled((p) => !p)}
            className={`w-11 h-6 rounded-full transition relative ${
              streamingEnabled ? "bg-linkedin-blue" : "bg-gray-300"
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                streamingEnabled ? "translate-x-5.5" : "translate-x-0.5"
              }`}
            />
          </div>
          <span className="text-sm text-gray-700">Streaming responses</span>
        </label>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-linkedin-blue text-white font-semibold py-3 rounded-xl hover:bg-linkedin-dark transition disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-800 mb-4">Recommended Models</h3>
        <div className="space-y-3">
          {RECOMMENDED_MODELS.map((m) => (
            <div key={m.name} className="border border-gray-100 rounded-xl p-4 hover:bg-gray-50 transition">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-800">{m.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{m.desc}</div>
                </div>
                <button
                  onClick={() => {
                    setDefaultModel(m.name);
                    navigator.clipboard.writeText(m.pull);
                  }}
                  className="text-xs px-3 py-1.5 border border-linkedin-blue text-linkedin-blue rounded-lg hover:bg-linkedin-light transition shrink-0"
                >
                  Use
                </button>
              </div>
              <code className="mt-2 block text-xs bg-gray-800 text-green-300 rounded-lg px-3 py-2">
                {m.pull}
              </code>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-red-100 p-6">
        <h3 className="font-semibold text-red-700 mb-2 text-sm">Danger Zone</h3>
        <p className="text-xs text-gray-500 mb-3">
          Clear all settings. Your profile and logs will remain in IndexedDB.
        </p>
        <button
          onClick={async () => {
            if (confirm("Reset all settings to defaults?")) {
              await saveSettings({
                ollamaUrl: FALLBACK_URL,
                defaultModel: FALLBACK_MODEL,
                streamingEnabled: true,
              });
              onSave();
            }
          }}
          className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition"
        >
          Reset Settings
        </button>
      </div>

      {settings && (
        <div className="text-xs text-gray-400 px-1">
          Current saved URL: {settings.ollamaUrl} · Current saved model: {settings.defaultModel}
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "—";
  const gb = bytes / 1e9;
  return gb >= 1 ? `${gb.toFixed(1)}GB` : `${(bytes / 1e6).toFixed(0)}MB`;
}
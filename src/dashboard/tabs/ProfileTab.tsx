import { useState, useEffect } from "react";
import { getProfiles, saveProfile, saveSettings } from "../../lib/storage";
import type { UserBrandProfile } from "../../types";

const TONE_OPTIONS: UserBrandProfile["tone"][] = [
  "professional", "conversational", "authoritative", "story-driven",
];

interface Props {
  onSave: () => void;
}

const EMPTY_PROFILE: Omit<UserBrandProfile, "id" | "createdAt" | "updatedAt"> = {
  name: "",
  currentTitle: "",
  targetTitle: "",
  yearsExperience: 0,
  skills: [],
  industries: [],
  tone: "conversational",
  contentPillars: [],
  audience: "",
};

export default function ProfileTab({ onSave }: Props) {
  const [form, setForm] = useState({ ...EMPTY_PROFILE });
  const [skillsInput, setSkillsInput] = useState("");
  const [industriesInput, setIndustriesInput] = useState("");
  const [pillarsInput, setPillarsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [existingProfileId, setExistingProfileId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const profiles = await getProfiles();
      if (profiles.length > 0) {
        const p = profiles[0];
        setForm({
          name: p.name,
          currentTitle: p.currentTitle,
          targetTitle: p.targetTitle,
          yearsExperience: p.yearsExperience,
          skills: p.skills,
          industries: p.industries,
          tone: p.tone,
          contentPillars: p.contentPillars,
          audience: p.audience,
        });
        setSkillsInput(p.skills.join(", "));
        setIndustriesInput(p.industries.join(", "));
        setPillarsInput(p.contentPillars.join(", "));
        setExistingProfileId(p.id);
      }
    })();
  }, []);

  const parseCSV = (str: string) =>
    str.split(",").map((s) => s.trim()).filter(Boolean);

  const handleSave = async () => {
    if (!form.name || !form.currentTitle) {
      alert("Name and current title are required.");
      return;
    }
    setSaving(true);

    const profile: UserBrandProfile = {
      ...form,
      id: existingProfileId ?? crypto.randomUUID(),
      skills: parseCSV(skillsInput),
      industries: parseCSV(industriesInput),
      contentPillars: parseCSV(pillarsInput),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await saveProfile(profile);
    await saveSettings({ activeProfileId: profile.id, onboardingComplete: true });
    setSaving(false);
    onSave();
    alert("Profile saved!");
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5 dark:bg-slate-900 dark:border-slate-800">
        <div>
          <h3 className="font-semibold text-gray-800 dark:text-slate-100">Brand Profile</h3>
          <p className="text-xs text-gray-400 mt-1 dark:text-slate-400">
            This is injected into every AI prompt to personalize your content.
          </p>
        </div>

        <Field label="Full name">
          <input
            type="text"
            className={inputCls}
            placeholder="e.g. María García"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Current title">
            <input
              type="text"
              className={inputCls}
              placeholder="e.g. Data Analyst"
              value={form.currentTitle}
              onChange={(e) => setForm({ ...form, currentTitle: e.target.value })}
            />
          </Field>
          <Field label="Target role">
            <input
              type="text"
              className={inputCls}
              placeholder="e.g. Senior BI Analyst"
              value={form.targetTitle}
              onChange={(e) => setForm({ ...form, targetTitle: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Years of experience">
          <input
            type="number"
            min={0}
            max={40}
            className={inputCls}
            value={form.yearsExperience || ""}
            onChange={(e) => setForm({ ...form, yearsExperience: parseInt(e.target.value) || 0 })}
          />
        </Field>

        <Field label="Core skills (comma-separated)" hint="e.g. SQL, Power BI, Python, dbt, ETL">
          <input
            type="text"
            className={inputCls}
            placeholder="SQL, Power BI, Python, dbt"
            value={skillsInput}
            onChange={(e) => setSkillsInput(e.target.value)}
          />
        </Field>

        <Field label="Industries (comma-separated)" hint="e.g. Healthcare, FinTech, Operations">
          <input
            type="text"
            className={inputCls}
            placeholder="Healthcare, FinTech"
            value={industriesInput}
            onChange={(e) => setIndustriesInput(e.target.value)}
          />
        </Field>

        <Field label="Content pillars (comma-separated)" hint="Topics you post about consistently">
          <input
            type="text"
            className={inputCls}
            placeholder="Data Quality, Career Growth, BI Tools, SQL Tips"
            value={pillarsInput}
            onChange={(e) => setPillarsInput(e.target.value)}
          />
        </Field>

        <Field label="Writing tone">
          <div className="flex gap-2 flex-wrap">
            {TONE_OPTIONS.map((t) => (
              <button
                key={t}
                onClick={() => setForm({ ...form, tone: t })}
                className={`px-3 py-1.5 text-xs rounded-full border transition ${
                  form.tone === t
                    ? "bg-linkedin-blue text-white border-linkedin-blue"
                    : "border-gray-200 text-gray-600 hover:border-linkedin-blue dark:border-slate-700 dark:text-slate-400 dark:hover:border-blue-400"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Target audience" hint="Who you want to reach — be specific">
          <textarea
            className={`${inputCls} resize-none`}
            rows={2}
            placeholder="e.g. Data team leads and BI managers at healthcare companies looking to hire senior analysts"
            value={form.audience}
            onChange={(e) => setForm({ ...form, audience: e.target.value })}
          />
        </Field>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-linkedin-blue text-white font-semibold py-3 rounded-xl hover:bg-linkedin-dark transition disabled:opacity-40"
        >
          {saving ? "Saving..." : existingProfileId ? "Update Profile" : "Save Profile"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">{label}</label>
      {hint && <p className="text-xs text-gray-400 mb-1.5 dark:text-slate-500">{hint}</p>}
      {children}
    </div>
  );
}

const inputCls =
  "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-linkedin-blue dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500";

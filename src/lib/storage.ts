import type { AppSettings, UserBrandProfile } from "../types";

// ─── Default Values ───────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: AppSettings = {
  ollamaUrl: "http://localhost:11434",
  defaultModel: "mistral",
  streamingEnabled: true,
  onboardingComplete: false,
  activeProfileId: null,
};

// ─── Generic Helpers ──────────────────────────────────────────────────────────

function get<T>(key: string): Promise<T | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] ?? null);
    });
  });
}

function set<T>(key: string, value: T): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

function remove(key: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(key, resolve);
  });
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<AppSettings> {
  const saved = await get<Partial<AppSettings>>("settings");
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  await set("settings", { ...current, ...settings });
}

// ─── Brand Profile ────────────────────────────────────────────────────────────

export async function getProfiles(): Promise<UserBrandProfile[]> {
  return (await get<UserBrandProfile[]>("profiles")) ?? [];
}

export async function saveProfile(profile: UserBrandProfile): Promise<void> {
  const profiles = await getProfiles();
  const idx = profiles.findIndex((p) => p.id === profile.id);
  if (idx >= 0) {
    profiles[idx] = profile;
  } else {
    profiles.push(profile);
  }
  await set("profiles", profiles);
}

export async function deleteProfile(id: string): Promise<void> {
  const profiles = await getProfiles();
  await set("profiles", profiles.filter((p) => p.id !== id));
}

export async function getActiveProfile(): Promise<UserBrandProfile | null> {
  const settings = await getSettings();
  if (!settings.activeProfileId) return null;
  const profiles = await getProfiles();
  return profiles.find((p) => p.id === settings.activeProfileId) ?? null;
}

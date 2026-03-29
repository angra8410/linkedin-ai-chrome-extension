import type {
  AppSettings,
  UserBrandProfile,
  PostDraft,
  PostDraftStatus,
} from "../types";

// ─── Default Values ───────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: AppSettings = {
  ollamaUrl: "http://localhost:11434",
  defaultModel: "mistral",
  streamingEnabled: true,
  onboardingComplete: false,
  activeProfileId: null,
  theme: "light",
};

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const SETTINGS_KEY = "settings";
const PROFILES_KEY = "profiles";
const DRAFTS_KEY = "drafts";

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

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(): Promise<AppSettings> {
  const saved = await get<Partial<AppSettings>>(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  await set(SETTINGS_KEY, { ...current, ...settings });
}

// ─── Brand Profile ────────────────────────────────────────────────────────────

export async function getProfiles(): Promise<UserBrandProfile[]> {
  return (await get<UserBrandProfile[]>(PROFILES_KEY)) ?? [];
}

export async function saveProfile(profile: UserBrandProfile): Promise<void> {
  const profiles = await getProfiles();
  const idx = profiles.findIndex((p) => p.id === profile.id);

  if (idx >= 0) {
    profiles[idx] = profile;
  } else {
    profiles.push(profile);
  }

  await set(PROFILES_KEY, profiles);
}

export async function deleteProfile(id: string): Promise<void> {
  const profiles = await getProfiles();
  await set(
    PROFILES_KEY,
    profiles.filter((p) => p.id !== id)
  );
}

export async function getActiveProfile(): Promise<UserBrandProfile | null> {
  const settings = await getSettings();

  if (!settings.activeProfileId) {
    return null;
  }

  const profiles = await getProfiles();
  return profiles.find((p) => p.id === settings.activeProfileId) ?? null;
}

// ─── Drafts / Kanban ──────────────────────────────────────────────────────────

function normalizeDraft(draft: PostDraft): PostDraft {
  return {
    ...draft,
    status: draft.status ?? "draft",
    variants: draft.variants ?? [],
    createdAt: draft.createdAt ?? Date.now(),
    updatedAt: draft.updatedAt ?? draft.createdAt ?? Date.now(),
    postedAt:
      draft.status === "posted"
        ? draft.postedAt ?? draft.updatedAt ?? draft.createdAt ?? Date.now()
        : undefined,
  };
}

export async function getDrafts(): Promise<PostDraft[]> {
  const drafts = (await get<PostDraft[]>(DRAFTS_KEY)) ?? [];
  return drafts.map(normalizeDraft);
}

export async function getDraftById(id: string): Promise<PostDraft | null> {
  const drafts = await getDrafts();
  return drafts.find((draft) => draft.id === id) ?? null;
}

export async function saveDraft(draft: PostDraft): Promise<void> {
  const drafts = await getDrafts();
  const idx = drafts.findIndex((d) => d.id === draft.id);

  const normalizedDraft = normalizeDraft({
    ...draft,
    updatedAt: Date.now(),
    postedAt:
      draft.status === "posted"
        ? draft.postedAt ?? Date.now()
        : undefined,
  });

  if (idx >= 0) {
    drafts[idx] = normalizedDraft;
  } else {
    drafts.unshift(normalizedDraft);
  }

  await set(DRAFTS_KEY, drafts);
}

export async function saveDrafts(drafts: PostDraft[]): Promise<void> {
  await set(
    DRAFTS_KEY,
    drafts.map(normalizeDraft)
  );
}

export async function deleteDraft(id: string): Promise<void> {
  const drafts = await getDrafts();
  await set(
    DRAFTS_KEY,
    drafts.filter((draft) => draft.id !== id)
  );
}

export async function updateDraftStatus(
  id: string,
  status: PostDraftStatus
): Promise<void> {
  const drafts = await getDrafts();

  const updated = drafts.map((draft) => {
    if (draft.id !== id) {
      return draft;
    }

    return normalizeDraft({
      ...draft,
      status,
      updatedAt: Date.now(),
      postedAt:
        status === "posted"
          ? draft.postedAt ?? Date.now()
          : undefined,
    });
  });

  await set(DRAFTS_KEY, updated);
}

export async function moveDraftLeft(id: string): Promise<void> {
  const draft = await getDraftById(id);

  if (!draft) {
    return;
  }

  const nextStatus: PostDraftStatus =
    draft.status === "posted"
      ? "ready"
      : draft.status === "ready"
        ? "draft"
        : "draft";

  await updateDraftStatus(id, nextStatus);
}

export async function moveDraftRight(id: string): Promise<void> {
  const draft = await getDraftById(id);

  if (!draft) {
    return;
  }

  const nextStatus: PostDraftStatus =
    draft.status === "draft"
      ? "ready"
      : draft.status === "ready"
        ? "posted"
        : "posted";

  await updateDraftStatus(id, nextStatus);
}

export async function getDraftsByStatus(
  status: PostDraftStatus
): Promise<PostDraft[]> {
  const drafts = await getDrafts();
  return drafts.filter((draft) => draft.status === status);
}

export async function markDraftAsDraft(id: string): Promise<void> {
  await updateDraftStatus(id, "draft");
}

export async function markDraftReady(id: string): Promise<void> {
  await updateDraftStatus(id, "ready");
}

export async function markDraftPosted(id: string): Promise<void> {
  await updateDraftStatus(id, "posted");
}
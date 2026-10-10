/**
 * A creator's public profile, shared by the browser and the server: self-chosen style tags from a
 * curated list, and the preset sample scenes. Likeness never asks for, stores or infers ethnicity,
 * religion, health or any other sensitive attribute; the optional age range is self-declared.
 */
export const TONES = ["warm", "playful", "serious", "edgy"] as const;
export const SETTINGS = ["studio", "outdoor", "urban", "home"] as const;
export const AGE_RANGES = ["18–24", "25–34", "35–44", "45–54", "55+"] as const;

export type StyleTags = { tone: string[]; setting: string[]; ageRange: string | null };
export const EMPTY_TAGS: StyleTags = { tone: [], setting: [], ageRange: null };

/** Keep only values from the curated lists (anything else is dropped, never stored). */
export function cleanTags(t: Partial<StyleTags> | null | undefined): StyleTags {
  const pick = (vals: unknown, allowed: readonly string[]) => [...new Set((Array.isArray(vals) ? vals : []).filter((v): v is string => typeof v === "string" && allowed.includes(v)))];
  return {
    tone: pick(t?.tone, TONES),
    setting: pick(t?.setting, SETTINGS),
    ageRange: typeof t?.ageRange === "string" && (AGE_RANGES as readonly string[]).includes(t.ageRange) ? t.ageRange : null,
  };
}

export const SAMPLE_SCENES = [
  { key: "cafe", label: "Café product shot", prompt: "Sitting at a sunlit café table holding a ceramic coffee cup, relaxed smile, product shot, natural light" },
  { key: "street", label: "Street fashion", prompt: "Walking down a city street in a denim jacket, confident stride, street fashion photo, golden-hour light" },
  { key: "studio", label: "Studio portrait", prompt: "Studio portrait against a plain light-grey backdrop, soft key light, friendly expression, head and shoulders" },
  { key: "outdoor", label: "Outdoor lifestyle", prompt: "Outdoors in a green park on a bright day, laughing, casual clothes, lifestyle photo" },
] as const;

/** At most this many sample generations per creator per UTC day (Likeness pays the model cost). */
export const SAMPLES_PER_DAY = 6;
/** At most this many in one request. */
export const SAMPLES_PER_REQUEST = 4;

/** What anyone can see about a creator's public profile. */
export type PublicProfile = {
  address: string;
  /** Public photo URL (512 px, watermarked), or null: show a silhouette. */
  photo: string | null;
  /** The public photo is an AI-generated image (one of the creator's approved samples), not a photo. */
  photoAi: boolean;
  tags: StyleTags;
  listed: boolean;
  /** Number of approved sample renders (the images themselves need a brand session). */
  samples: number;
};

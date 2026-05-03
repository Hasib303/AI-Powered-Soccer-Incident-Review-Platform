/**
 * Tiny inline profanity filter for referee notes.
 *
 * Production should swap this for a moderation service (OpenAI Moderation,
 * Perspective API, etc.). This list covers a handful of obvious English
 * words so the BRD §3.1 requirement ("No profanity permitted in referee
 * notes or any user-generated content") has a real implementation behind it.
 *
 * Matching is case-insensitive and respects word boundaries to minimise
 * false positives on substrings (e.g. "scunthorpe").
 */

const BANNED_WORDS = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "dick",
  "pussy",
  "cunt",
  "wanker",
  "twat",
  "motherfucker",
  "bullshit",
  "douche",
];

const PATTERN = new RegExp(
  `\\b(${BANNED_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "i",
);

export function containsProfanity(text: string): boolean {
  if (!text) return false;
  return PATTERN.test(text);
}

export function findProfanity(text: string): string | null {
  if (!text) return null;
  const m = text.match(PATTERN);
  return m ? m[0] : null;
}

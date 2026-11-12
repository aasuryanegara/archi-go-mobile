/**
 * storage.ts — localStorage persistence (banked candies, meta upgrades, best score, player name).
 * Browser-local: doesn't sync across devices, and clearing browser data loses it — the online
 * leaderboard lives in the cloud database instead.
 */

import { UPGRADES, type UpgradeId } from "./config";

const PREFIX = "archigo.";
const LEGACY_PREFIX = "puffhop.";

export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const currentKey = PREFIX + key;
      const raw = localStorage.getItem(currentKey);
      if (raw !== null) return JSON.parse(raw) as T;

      // One-time migration: keep existing player progress after the rebrand.
      const legacyRaw = localStorage.getItem(LEGACY_PREFIX + key);
      if (legacyRaw === null) return fallback;
      localStorage.setItem(currentKey, legacyRaw);
      return JSON.parse(legacyRaw) as T;
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // fails silently when storage is full/in private mode, without affecting the game
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      // same as set(): storage unavailable is not a game error
    }
  },
};

export const bestScore = {
  get: () => storage.get<number>("bestScore", 0),
  set: (v: number) => storage.set("bestScore", v),
};

export const bankedCandies = {
  get: () => storage.get<number>("bank", 0),
  set: (v: number) => storage.set("bank", v),
};

export const playerName = {
  get: () => storage.get<string>("name", ""),
  set: (v: string) => storage.set("name", v),
};

/** Meta-upgrade tiers (0..max per track), with defensive validation on read. */
export const upgrades = {
  get(): Record<UpgradeId, number> {
    const raw = storage.get<Partial<Record<UpgradeId, number>>>("upgrades", {});
    const out = {} as Record<UpgradeId, number>;
    for (const id of Object.keys(UPGRADES) as UpgradeId[]) {
      const v = raw[id];
      out[id] = typeof v === "number" && v >= 0 ? Math.min(UPGRADES[id].max, Math.floor(v)) : 0;
    }
    return out;
  },
  set(tiers: Record<UpgradeId, number>): void {
    storage.set("upgrades", tiers);
  },
};


/** Selected character is stored locally; unknown IDs safely fall back to Puff. */
export const selectedCharacter = {
  get: () => {
    const id = storage.get<string>("selectedCharacter", "puff");
    return ["puff", "fox", "bot", "penguin"].includes(id) ? id : "puff";
  },
  set: (id: string) => storage.set("selectedCharacter", id),
};

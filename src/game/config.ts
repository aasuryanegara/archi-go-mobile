/**
 * config.ts — global tuning for ARCHi Go.
 * Input sensitivity and invert switches live here (sync verify-game.mjs when changing the mapping).
 */

export const INPUT_CONFIG = {
  /** Mouse/touch camera sensitivity (radians/pixel). */
  MOUSE_SENS_X: 0.0026,
  MOUSE_SENS_Y: 0.0022,
  /** Camera invert switches: default false = mouse right turns camera right, mouse up looks up. */
  INVERT_X: false,
  INVERT_Y: false,
} as const;

export const QUALITY = {
  /** Instanced particle pool size. */
  PARTICLES: 320,
  /** Auto-degrade when the frame rate stays below this for 2s. */
  DEGRADE_FPS: 45,
} as const;

/** Physics & feel — heights tuned so a max jump (~2.2u) clears a 1.6u rise and a 5u flat gap. */
export const PHYS = {
  GRAVITY: -30,
  JUMP_V: 12.2,
  MOVE_SPEED: 7.2,
  AIR_CTRL: 0.82,
  COYOTE: 0.11,
  JUMP_BUFFER: 0.13,
  MAX_FALL: -24,
  PLAYER_R: 0.42,
} as const;

export const CAMERA = {
  DIST: 8.2,
  HEIGHT: 4.6,
  PITCH_MIN: -0.15,
  PITCH_MAX: 0.85,
  FOLLOW_LERP: 8,
  LOOKAHEAD: 0.9,
  FOV: 55,
} as const;

export const RUN = {
  /** Starting time on the clock (seconds); +CLOCK_STEP per Clock upgrade tier. */
  START_TIME: 120,
  CLOCK_STEP: 20,
  /** Score formula. */
  CANDY_PTS: 10,
  GEM_PTS: 100,
  TIME_PTS: 5,
  /** Low-time warning threshold. */
  LOW_TIME: 20,
} as const;

export const POWERS = {
  SUGAR_RUSH_TIME: 9,
  SUGAR_RUSH_MULT: 1.55,
  FEATHER_JUMPS: 1, // extra mid-air jumps
  SHIELD_TIME: 30,
} as const;

/** Meta upgrades: cost per tier, effect per tier, max tiers. Paid with banked candies. */
export const UPGRADES = {
  bounce: { name: "Bounce", desc: "+12% jump power per tier", costs: [40, 90, 160], max: 3 },
  swift: { name: "Swift", desc: "+10% move speed per tier", costs: [40, 90, 160], max: 3 },
  clock: { name: "Clock", desc: "+20s start time per tier", costs: [60, 120, 200], max: 3 },
} as const;

export type UpgradeId = keyof typeof UPGRADES;

export const COLORS = {
  sky: 0x9fd9ff,
  fog: 0xbfe8ff,
  sun: 0xfff3d6,
  islandTop: 0x8fe07f,
  islandSide: 0xf6e3c1,
  islandSoil: 0xc98d5f,
  candy: 0xff6fa5,
  gem: 0x6fe3ff,
  grump: 0x6b4f8f,
  portal: 0xffd45e,
} as const;

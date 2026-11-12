/**
 * level.ts — seeded procedural generation of the floating-island course.
 * The path wanders roughly forward (-Z) with lateral drift; difficulty ramps by
 * shrinking islands, adding moving platforms, grumps and tighter gaps.
 * All gameplay content is data — tune the tables below, not scattered literals.
 */

import { mulberry32, randRange, randInt, type Rng } from "./rng";
import type { LevelData, Platform, Pickup, Grump, PickupKind } from "./types";

const GEN = {
  ISLANDS: 22,
  /** Island radius range (ramped by progress). */
  R_LO_EARLY: 2.6, R_HI_EARLY: 3.4,
  R_LO_LATE: 1.7, R_HI_LATE: 2.6,
  /** Horizontal gap between island edges (ramped). */
  GAP_LO: 2.4, GAP_HI: 3.4, GAP_HI_LATE: 4.3,
  /** Height change between consecutive island tops. */
  UP_MAX: 1.4,
  DOWN_MAX: 2.2,
  HEADING_DRIFT: 0.55,
  ISLAND_THICKNESS: 1.6,
  /** Moving platform chance ramps in from island index 6. */
  MOVE_FROM: 6, MOVE_CHANCE: 0.34,
  /** Grump chance on roomy islands ramps in from index 8. */
  GRUMP_FROM: 8, GRUMP_CHANCE: 0.5,
  /** Side branch (gem) islands appear from index 5, at most every this many islands. */
  BRANCH_FROM: 5, BRANCH_EVERY: 4,
} as const;

function makeIsland(
  rng: Rng,
  x: number,
  z: number,
  r: number,
  topY: number,
  move: Platform["move"],
): Platform {
  // Collider is a square inscribed slightly inside the visual cylinder so the
  // player never stands where the mesh has already curved away.
  const half = r * 0.8;
  return {
    minX: x - half, maxX: x + half,
    minY: topY - GEN.ISLAND_THICKNESS, maxY: topY,
    minZ: z - half, maxZ: z + half,
    move,
    baseX: x, baseZ: z,
    deltaX: 0, deltaZ: 0,
  };
}

function addPickup(list: Pickup[], kind: PickupKind, x: number, y: number, z: number): void {
  list.push({ kind, x, y, z, taken: false, instance: -1 });
}

export function generateLevel(seed: number): LevelData {
  const rng = mulberry32(seed);
  const platforms: Platform[] = [];
  const pickups: Pickup[] = [];
  const grumps: Grump[] = [];

  let x = 0, z = 0, topY = 0;
  let heading = 0; // 0 = straight -Z
  const r0 = randRange(rng, GEN.R_LO_EARLY, GEN.R_HI_EARLY);
  const first = makeIsland(rng, x, z, r0, topY, null);
  platforms.push(first);

  let lastR = r0;
  let lastTop = topY;
  let sinceBranch = 0;

  for (let i = 1; i < GEN.ISLANDS; i++) {
    const t = i / (GEN.ISLANDS - 1); // 0..1 difficulty ramp
    heading += randRange(rng, -GEN.HEADING_DRIFT, GEN.HEADING_DRIFT) * 0.5;
    heading = Math.max(-0.9, Math.min(0.9, heading));

    const rLo = GEN.R_LO_EARLY + (GEN.R_LO_LATE - GEN.R_LO_EARLY) * t;
    const rHi = GEN.R_HI_EARLY + (GEN.R_HI_LATE - GEN.R_HI_EARLY) * t;
    const r = randRange(rng, rLo, Math.max(rLo + 0.3, rHi));

    const gapHi = GEN.GAP_HI + (GEN.GAP_HI_LATE - GEN.GAP_HI) * t;
    const gap = randRange(rng, GEN.GAP_LO, gapHi);
    const dist = lastR + gap + r;

    const dx = Math.sin(heading);
    const dz = -Math.cos(heading);
    x += dx * dist;
    z += dz * dist;
    const upMax = GEN.UP_MAX;
    topY = lastTop + randRange(rng, -GEN.DOWN_MAX, upMax);

    // Moving platforms slide perpendicular to the path so the jump timing matters.
    let move: Platform["move"] = null;
    if (i >= GEN.MOVE_FROM && rng() < GEN.MOVE_CHANCE * (0.4 + 0.6 * t)) {
      move = {
        amp: randRange(rng, 1.6, 2.6),
        speed: randRange(rng, 0.7, 1.15),
        phase: rng() * Math.PI * 2,
        axis: rng() < 0.5 ? "x" : "z",
      };
    }
    const isl = makeIsland(rng, x, z, r, topY, move);
    platforms.push(isl);

    // Candies: a small arc over each island, sometimes a risky string across the gap.
    const candyCount = randInt(rng, 2, 4);
    for (let c = 0; c < candyCount; c++) {
      const a = (c / Math.max(1, candyCount - 1) - 0.5) * Math.PI * 0.7;
      const cx = x + Math.sin(a) * r * 0.5;
      const cz = z + Math.cos(a) * r * 0.5 * (rng() < 0.5 ? 1 : -1);
      addPickup(pickups, "candy", cx, topY + 0.75, cz);
    }
    if (rng() < 0.35 && i > 1) {
      // string of 3 candies over the gap just crossed
      const prev = platforms[i - 1];
      const px = (prev.baseX + x) / 2;
      const pz = (prev.baseZ + z) / 2;
      const py = Math.max(prev.maxY, topY) + 0.9;
      for (let c = -1; c <= 1; c++) {
        addPickup(pickups, "candy", px + dx * c * 1.2, py, pz + dz * c * 1.2);
      }
    }

    // Grump patrols on roomy non-moving later islands.
    if (i >= GEN.GRUMP_FROM && r > 2.1 && !move && rng() < GEN.GRUMP_CHANCE * (0.35 + 0.65 * t)) {
      const axis: "x" | "z" = rng() < 0.5 ? "x" : "z";
      const span = r * 0.55;
      grumps.push({
        x, y: topY + 0.45, z,
        dir: rng() < 0.5 ? 1 : -1,
        speed: randRange(rng, 1.5, 2.3),
        min: (axis === "x" ? x : z) - span,
        max: (axis === "x" ? x : z) + span,
        axis,
        alive: true,
      });
    }

    // Side branch island with a gem.
    sinceBranch++;
    if (i >= GEN.BRANCH_FROM && sinceBranch >= GEN.BRANCH_EVERY && rng() < 0.8) {
      sinceBranch = 0;
      const side = rng() < 0.5 ? -1 : 1;
      const bx = x + Math.cos(heading) * side * (r + 2.6);
      const bz = z + Math.sin(heading) * side * (r + 2.6);
      const by = topY + randRange(rng, 0.2, 1.0);
      platforms.push(makeIsland(rng, bx, bz, 1.25, by, null));
      addPickup(pickups, "gem", bx, by + 0.85, bz);
    }

    // Power-ups sprinkled along the course.
    if (i === 5) addPickup(pickups, "sugar", x, topY + 0.8, z);
    else if (i === 10) addPickup(pickups, "feather", x, topY + 0.8, z);
    else if (i === 15) addPickup(pickups, "shield", x, topY + 0.8, z);
    else if (i > 15 && rng() < 0.12) {
      addPickup(pickups, rng() < 0.5 ? "sugar" : "shield", x, topY + 0.8, z);
    }

    lastR = r;
    lastTop = topY;
  }

  const goal = { x, y: topY + 1.5, z };
  return {
    seed,
    platforms,
    pickups,
    grumps,
    spawn: { x: 0, y: first.maxY + 1.2, z: 0 },
    goal,
    islandCount: GEN.ISLANDS,
  };
}

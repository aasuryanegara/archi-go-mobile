/**
 * types.ts — shared types for ARCHi Go.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Axis-aligned platform collider (also used for pickups trigger boxes). */
export interface Aabb {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface Platform extends Aabb {
  /** Moving platforms oscillate along one axis between basePos ± amp. */
  move: {
    amp: number;
    speed: number;
    phase: number;
    axis: "x" | "z";
  } | null;
  baseX: number;
  baseZ: number;
  deltaX: number;
  deltaZ: number;
}

export type PickupKind = "candy" | "gem" | "sugar" | "feather" | "shield";

export interface Pickup {
  kind: PickupKind;
  x: number;
  y: number;
  z: number;
  taken: boolean;
  /** Index into the instanced mesh for hide/show. */
  instance: number;
}

export interface Grump {
  x: number;
  y: number;
  z: number;
  dir: 1 | -1;
  speed: number;
  min: number;
  max: number;
  axis: "x" | "z";
  alive: boolean;
}

export interface LevelData {
  seed: number;
  platforms: Platform[];
  pickups: Pickup[];
  grumps: Grump[];
  spawn: Vec3;
  goal: { x: number; y: number; z: number };
  /** Rough path length, used for difficulty ramp checks. */
  islandCount: number;
}

/** Common interface for pooled objects: avoids allocation in the hot loop. */
export interface Poolable {
  alive: boolean;
  reset(): void;
}

export class Pool<T extends Poolable> {
  private items: T[] = [];
  constructor(private factory: () => T, size: number) {
    for (let i = 0; i < size; i++) this.items.push(factory());
  }
  obtain(): T | null {
    for (const it of this.items) {
      if (!it.alive) {
        it.alive = true;
        it.reset();
        return it;
      }
    }
    return null; // pool exhausted: rather spawn nothing than allocate in the hot loop
  }
  each(fn: (it: T) => void): void {
    for (const it of this.items) if (it.alive) fn(it);
  }
}

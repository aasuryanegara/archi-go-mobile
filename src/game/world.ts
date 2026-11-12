/**
 * world.ts — builds and animates the candy-sky world for a generated level:
 * islands, clouds, instanced pickups, grump meshes, the goal portal and a pooled
 * instanced particle system. Hot-loop rules: reused temp vectors, instanced draws,
 * no per-frame allocation.
 */

import * as THREE from "three";
import { COLORS, QUALITY } from "./config";
import { mulberry32, randRange, type Rng } from "./rng";
import type { LevelData, Pickup, Platform } from "./types";

const tmpMat = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpColor = new THREE.Color();
const AXIS_Y = new THREE.Vector3(0, 1, 0);

/* ------------------------------------------------------------------ */
/* Particles — one InstancedMesh pool, fixed capacity, zero alloc     */
/* ------------------------------------------------------------------ */

class ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  private readonly cap: number;
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size: Float32Array;
  private readonly grav: Float32Array;
  private cursor = 0;

  constructor(cap: number) {
    this.cap = cap;
    this.px = new Float32Array(cap); this.py = new Float32Array(cap); this.pz = new Float32Array(cap);
    this.vx = new Float32Array(cap); this.vy = new Float32Array(cap); this.vz = new Float32Array(cap);
    this.life = new Float32Array(cap); this.maxLife = new Float32Array(cap);
    this.size = new Float32Array(cap); this.grav = new Float32Array(cap);
    const geo = new THREE.SphereGeometry(0.09, 6, 5);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    // park everything at zero scale
    tmpMat.makeScale(0, 0, 0);
    for (let i = 0; i < cap; i++) this.mesh.setMatrixAt(i, tmpMat);
    this.mesh.count = cap;
  }

  burst(x: number, y: number, z: number, color: number, count: number, speed: number, gravity = -9): void {
    tmpColor.setHex(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.cap;
      this.px[i] = x; this.py[i] = y; this.pz[i] = z;
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.vx[i] = Math.cos(a) * Math.cos(b) * s;
      this.vy[i] = Math.sin(b) * s + speed * 0.35;
      this.vz[i] = Math.sin(a) * Math.cos(b) * s;
      this.maxLife[i] = this.life[i] = 0.45 + Math.random() * 0.5;
      this.size[i] = 0.7 + Math.random() * 0.9;
      this.grav[i] = gravity;
      this.mesh.setColorAt(i, tmpColor);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        tmpMat.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, tmpMat);
        continue;
      }
      this.vy[i] += this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      const k = (this.life[i] / this.maxLife[i]) * this.size[i];
      tmpPos.set(this.px[i], this.py[i], this.pz[i]);
      tmpScale.setScalar(Math.max(0.001, k));
      tmpMat.compose(tmpPos, tmpQuat.identity(), tmpScale);
      this.mesh.setMatrixAt(i, tmpMat);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/* ------------------------------------------------------------------ */
/* World                                                              */
/* ------------------------------------------------------------------ */

export class World {
  readonly particles: ParticlePool;
  private readonly root = new THREE.Group();
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly level: LevelData;

  private readonly candyMesh: THREE.InstancedMesh;
  private readonly gemMesh: THREE.InstancedMesh;
  private readonly gemCount: number;
  private readonly powerMeshes = new Map<Pickup, THREE.Group>();
  private readonly grumpMeshes: THREE.Group[] = [];
  private readonly portal: THREE.Group;
  private readonly portalDisc: THREE.Mesh;
  private readonly clouds: THREE.InstancedMesh;
  private readonly sun: THREE.DirectionalLight;
  private readonly glowLights: THREE.PointLight[] = [];

  constructor(scene: THREE.Scene, level: LevelData) {
    this.level = level;
    scene.add(this.root);
    const rng = mulberry32(level.seed ^ 0x9e3779b9);

    // --- atmosphere: vertical gradient sky + soft cartoon sun ---
    const skyCanvas = document.createElement("canvas");
    skyCanvas.width = 4; skyCanvas.height = 256;
    const skyCtx = skyCanvas.getContext("2d")!;
    const grad = skyCtx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#5eb8ff");
    grad.addColorStop(0.55, "#a5dcff");
    grad.addColorStop(0.85, "#ffe9c4");
    grad.addColorStop(1, "#ffd9a8");
    skyCtx.fillStyle = grad;
    skyCtx.fillRect(0, 0, 4, 256);
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    this.disposables.push(skyTex);
    scene.background = skyTex;
    scene.fog = new THREE.Fog(0xd6ecff, 34, 110);

    const sunGroup = new THREE.Group();
    const sunOuter = new THREE.Mesh(
      new THREE.CircleGeometry(16, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.55, fog: false }),
    );
    const sunInner = new THREE.Mesh(
      new THREE.CircleGeometry(9, 32),
      new THREE.MeshBasicMaterial({ color: 0xfffbe8, fog: false }),
    );
    sunGroup.add(sunOuter, sunInner);
    sunGroup.position.set(70, 55, -190);
    sunGroup.lookAt(0, 0, 0);
    this.root.add(sunGroup);
    this.disposables.push(sunOuter.geometry, sunOuter.material as THREE.Material, sunInner.geometry, sunInner.material as THREE.Material);

    const hemi = new THREE.HemisphereLight(0xcfefff, 0xf7d9b0, 0.95);
    this.root.add(hemi);
    this.sun = new THREE.DirectionalLight(COLORS.sun, 1.6);
    this.sun.position.set(12, 20, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 70;
    const sc = 18;
    this.sun.shadow.camera.left = -sc; this.sun.shadow.camera.right = sc;
    this.sun.shadow.camera.top = sc; this.sun.shadow.camera.bottom = -sc;
    this.sun.shadow.bias = -0.0004;
    this.root.add(this.sun);
    this.root.add(this.sun.target);

    // --- islands ---
    const topMat = new THREE.MeshStandardMaterial({ color: COLORS.islandTop, roughness: 0.95 });
    const sideMat = new THREE.MeshStandardMaterial({ color: COLORS.islandSoil, roughness: 1 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0xa9714b, roughness: 1 });
    this.disposables.push(topMat, sideMat, capMat);

    for (const p of level.platforms) {
      const r = Math.max(p.maxX - p.minX, p.maxZ - p.minZ) / 2 / 0.8;
      const group = new THREE.Group();
      const topGeo = new THREE.CylinderGeometry(r, r * 0.96, 0.5, 20);
      const bodyGeo = new THREE.CylinderGeometry(r * 0.96, r * 0.28, 1.4, 20);
      const tipGeo = new THREE.ConeGeometry(r * 0.28, 1.2, 20);
      this.disposables.push(topGeo, bodyGeo, tipGeo);
      const top = new THREE.Mesh(topGeo, topMat);
      top.position.y = -0.25;
      const body = new THREE.Mesh(bodyGeo, sideMat);
      body.position.y = -1.2;
      const tip = new THREE.Mesh(tipGeo, capMat);
      tip.rotation.x = Math.PI;
      tip.position.y = -2.5;
      top.castShadow = true; top.receiveShadow = true;
      body.castShadow = true;
      group.add(top, body, tip);
      group.position.set((p.minX + p.maxX) / 2, p.maxY, (p.minZ + p.maxZ) / 2);
      // slight per-island tint + rotation variety
      top.scale.setScalar(0.98 + rng() * 0.05);
      group.rotation.y = rng() * Math.PI * 2;
      this.root.add(group);
      (p as Platform & { mesh?: THREE.Group }).mesh = group;
    }

    // --- trees on roomy early islands ---
    const trunkGeo = new THREE.CylinderGeometry(0.09, 0.12, 0.5, 6);
    const leafGeo = new THREE.ConeGeometry(0.42, 0.9, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x9c6b4a, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x5ecf7d, roughness: 0.9 });
    this.disposables.push(trunkGeo, leafGeo, trunkMat, leafMat);
    let treeBudget = 26;
    for (const p of level.platforms) {
      const r = (p.maxX - p.minX) / 2 / 0.8;
      if (r < 2.3 || treeBudget <= 0) continue;
      if (rng() < 0.55) {
        treeBudget--;
        const cx = (p.minX + p.maxX) / 2 + randRange(rng, -r * 0.4, r * 0.4);
        const cz = (p.minZ + p.maxZ) / 2 + randRange(rng, -r * 0.4, r * 0.4);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(cx, p.maxY + 0.25, cz);
        const leaves = new THREE.Mesh(leafGeo, leafMat);
        leaves.position.set(cx, p.maxY + 0.95, cz);
        leaves.castShadow = true;
        this.root.add(trunk, leaves);
      }
    }

    // --- clouds ---
    const cloudGeo = new THREE.IcosahedronGeometry(1, 1);
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: 0.92 });
    this.disposables.push(cloudGeo, cloudMat);
    const cloudCount = 64;
    this.clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, cloudCount);
    for (let i = 0; i < cloudCount; i++) {
      const cx = randRange(rng, -70, 70);
      const cz = randRange(rng, -180, 40);
      // keep the camera corridor clear: clouds drift below the course or high above it
      const cy = rng() < 0.72 ? randRange(rng, -26, -9) : randRange(rng, 13, 26);
      tmpPos.set(cx, cy, cz);
      tmpQuat.setFromAxisAngle(AXIS_Y, rng() * Math.PI);
      tmpScale.set(randRange(rng, 2, 5.5), randRange(rng, 0.8, 1.6), randRange(rng, 1.6, 3.4));
      tmpMat.compose(tmpPos, tmpQuat, tmpScale);
      this.clouds.setMatrixAt(i, tmpMat);
    }
    this.root.add(this.clouds);

    // --- pickups (instanced by kind) ---
    const candies = level.pickups.filter((p) => p.kind === "candy");
    const gems = level.pickups.filter((p) => p.kind === "gem");
    this.gemCount = gems.length;

    const candyGeo = new THREE.SphereGeometry(0.26, 10, 8);
    const candyMat = new THREE.MeshStandardMaterial({ color: COLORS.candy, roughness: 0.35, emissive: 0x551122 });
    this.disposables.push(candyGeo, candyMat);
    this.candyMesh = new THREE.InstancedMesh(candyGeo, candyMat, Math.max(1, candies.length));
    this.candyMesh.frustumCulled = false;
    this.root.add(this.candyMesh);
    candies.forEach((p, i) => {
      p.instance = i;
      tmpMat.makeScale(0, 0, 0);
      this.candyMesh.setMatrixAt(i, tmpMat);
    });

    const gemGeo = new THREE.OctahedronGeometry(0.34);
    const gemMat = new THREE.MeshStandardMaterial({ color: COLORS.gem, roughness: 0.2, emissive: 0x0a3344 });
    this.disposables.push(gemGeo, gemMat);
    this.gemMesh = new THREE.InstancedMesh(gemGeo, gemMat, Math.max(1, gems.length));
    this.gemMesh.frustumCulled = false;
    this.root.add(this.gemMesh);
    gems.forEach((p, i) => {
      p.instance = i;
      tmpMat.makeScale(0, 0, 0);
      this.gemMesh.setMatrixAt(i, tmpMat);
    });

    // power-ups get individual little scenes (there are only a handful)
    for (const p of level.pickups) {
      if (p.kind === "candy" || p.kind === "gem") continue;
      const g = new THREE.Group();
      let core: THREE.Mesh;
      if (p.kind === "sugar") {
        core = new THREE.Mesh(
          new THREE.TorusGeometry(0.3, 0.13, 10, 18),
          new THREE.MeshStandardMaterial({ color: 0xff5f66, roughness: 0.4, emissive: 0x440a0c }),
        );
      } else if (p.kind === "feather") {
        core = new THREE.Mesh(
          new THREE.ConeGeometry(0.22, 0.7, 8),
          new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x333344 }),
        );
        core.rotation.z = 0.5;
      } else {
        core = new THREE.Mesh(
          new THREE.SphereGeometry(0.34, 12, 10),
          new THREE.MeshStandardMaterial({ color: 0x8fd0ff, roughness: 0.15, transparent: true, opacity: 0.75, emissive: 0x113355 }),
        );
      }
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.5, 0.1, 12),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }),
      );
      base.position.y = -0.55;
      g.add(core, base);
      g.position.set(p.x, p.y, p.z);
      this.root.add(g);
      this.powerMeshes.set(p, g);
      const l = new THREE.PointLight(
        p.kind === "sugar" ? 0xff6666 : p.kind === "feather" ? 0xfff6c8 : 0x88ccff,
        4, 6,
      );
      l.position.set(p.x, p.y + 0.4, p.z);
      this.root.add(l);
      this.glowLights.push(l);
    }

    // --- grumps ---
    const grumpBodyGeo = new THREE.SphereGeometry(0.48, 14, 12);
    const grumpMat = new THREE.MeshStandardMaterial({ color: COLORS.grump, roughness: 0.85 });
    const eyeGeo = new THREE.SphereGeometry(0.11, 8, 8);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const pupilGeo = new THREE.SphereGeometry(0.05, 6, 6);
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x221133, roughness: 0.4 });
    const spikeGeo = new THREE.ConeGeometry(0.1, 0.32, 6);
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0x4a3566, roughness: 0.9 });
    this.disposables.push(grumpBodyGeo, grumpMat, eyeGeo, eyeMat, pupilGeo, pupilMat, spikeGeo, spikeMat);
    for (const g of level.grumps) {
      const grp = new THREE.Group();
      const body = new THREE.Mesh(grumpBodyGeo, grumpMat);
      body.castShadow = true;
      grp.add(body);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(s * 0.18, 0.12, 0.4);
        const pupil = new THREE.Mesh(pupilGeo, pupilMat);
        pupil.position.set(s * 0.18, 0.12, 0.49);
        grp.add(eye, pupil);
      }
      for (let k = 0; k < 7; k++) {
        const spike = new THREE.Mesh(spikeGeo, spikeMat);
        const a = (k / 7) * Math.PI * 2;
        spike.position.set(Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0);
        spike.rotation.z = a - Math.PI / 2;
        grp.add(spike);
      }
      grp.position.set(g.x, g.y, g.z);
      this.root.add(grp);
      this.grumpMeshes.push(grp);
    }

    // --- goal portal ---
    this.portal = new THREE.Group();
    const ringGeo = new THREE.TorusGeometry(1.25, 0.16, 12, 32);
    const ringMat = new THREE.MeshStandardMaterial({ color: COLORS.portal, roughness: 0.3, metalness: 0.4, emissive: 0x664411 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    this.portalDisc = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff2b8, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    this.disposables.push(ringGeo, ringMat, this.portalDisc.geometry, this.portalDisc.material as THREE.Material);
    this.portal.add(ring, this.portalDisc);
    const baseGeo = new THREE.CylinderGeometry(1.1, 1.4, 0.25, 20);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    this.disposables.push(baseGeo, baseMat);
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -1.35;
    this.portal.add(base);
    this.portal.position.set(level.goal.x, level.goal.y, level.goal.z);
    this.root.add(this.portal);
    const pl = new THREE.PointLight(0xffd45e, 12, 12);
    pl.position.copy(this.portal.position);
    this.root.add(pl);

    // void plane far below — something soft to fall toward
    const voidGeo = new THREE.CircleGeometry(300, 32);
    const voidMat = new THREE.MeshBasicMaterial({ color: 0xa8d8f0, fog: false });
    this.disposables.push(voidGeo, voidMat);
    const voidMesh = new THREE.Mesh(voidGeo, voidMat);
    voidMesh.rotation.x = -Math.PI / 2;
    voidMesh.position.y = -40;
    this.root.add(voidMesh);

    this.particles = new ParticlePool(QUALITY.PARTICLES);
    this.root.add(this.particles.mesh);
  }

  /** Advance platform motion and ambient animation. Returns nothing; colliders are mutated in place. */
  update(dt: number, t: number, playerPos: THREE.Vector3): void {
    // moving platforms
    for (const p of this.level.platforms) {
      if (!p.move) continue;
      const off = Math.sin(t * p.move.speed + p.move.phase) * p.move.amp;
      const nx = p.move.axis === "x" ? p.baseX + off : p.baseX;
      const nz = p.move.axis === "z" ? p.baseZ + off : p.baseZ;
      const hw = (p.maxX - p.minX) / 2;
      const hd = (p.maxZ - p.minZ) / 2;
      p.deltaX = nx - (p.minX + p.maxX) / 2;
      p.deltaZ = nz - (p.minZ + p.maxZ) / 2;
      p.minX = nx - hw; p.maxX = nx + hw;
      p.minZ = nz - hd; p.maxZ = nz + hd;
      const mesh = (p as Platform & { mesh?: THREE.Group }).mesh;
      if (mesh) mesh.position.set(nx, p.maxY, nz);
    }

    // pickups: bob + spin (instanced kinds only; power meshes are groups)
    for (const p of this.level.pickups) {
      if (p.taken) continue;
      if (p.kind === "candy") {
        tmpPos.set(p.x, p.y + Math.sin(t * 2.4 + p.instance) * 0.12, p.z);
        tmpQuat.setFromAxisAngle(AXIS_Y, t * 2 + p.instance);
        tmpScale.setScalar(1);
        tmpMat.compose(tmpPos, tmpQuat, tmpScale);
        this.candyMesh.setMatrixAt(p.instance, tmpMat);
      } else if (p.kind === "gem") {
        tmpPos.set(p.x, p.y + Math.sin(t * 2 + p.instance * 1.7) * 0.15, p.z);
        tmpQuat.setFromAxisAngle(AXIS_Y, t * 1.6 + p.instance);
        tmpScale.setScalar(1);
        tmpMat.compose(tmpPos, tmpQuat, tmpScale);
        this.gemMesh.setMatrixAt(p.instance, tmpMat);
      } else {
        const g = this.powerMeshes.get(p);
        if (g) {
          g.rotation.y = t * 1.8;
          g.position.y = p.y + Math.sin(t * 2.2 + p.x) * 0.15;
        }
      }
    }
    this.candyMesh.instanceMatrix.needsUpdate = true;
    if (this.gemCount > 0) this.gemMesh.instanceMatrix.needsUpdate = true;

    // portal shimmer
    this.portal.rotation.y = t * 0.8;
    const s = 1 + Math.sin(t * 3) * 0.04;
    this.portalDisc.scale.setScalar(s);
    (this.portalDisc.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 3) * 0.18;

    // grump visual bob
    for (let i = 0; i < this.grumpMeshes.length; i++) {
      const g = this.grumpMeshes[i];
      g.position.y = this.level.grumps[i].y + Math.abs(Math.sin(t * 6 + i)) * 0.08;
      g.rotation.y += dt * 1.5 * this.level.grumps[i].dir;
    }

    // shadow camera follows the player
    this.sun.target.position.copy(playerPos);
    this.sun.position.set(playerPos.x + 12, playerPos.y + 20, playerPos.z + 8);

    this.particles.update(dt);
  }

  /** Hide a collected pickup and pop particles. */
  collect(p: Pickup): void {
    p.taken = true;
    if (p.kind === "candy") {
      tmpMat.makeScale(0, 0, 0);
      this.candyMesh.setMatrixAt(p.instance, tmpMat);
      this.candyMesh.instanceMatrix.needsUpdate = true;
      this.particles.burst(p.x, p.y, p.z, COLORS.candy, 8, 3.2);
    } else if (p.kind === "gem") {
      tmpMat.makeScale(0, 0, 0);
      this.gemMesh.setMatrixAt(p.instance, tmpMat);
      this.gemMesh.instanceMatrix.needsUpdate = true;
      this.particles.burst(p.x, p.y, p.z, COLORS.gem, 16, 4.2);
    } else {
      const g = this.powerMeshes.get(p);
      if (g) g.visible = false;
      this.particles.burst(p.x, p.y, p.z, 0xfff0a8, 14, 4);
    }
  }

  /** Grump defeated — poof. */
  poofGrump(index: number): void {
    const g = this.level.grumps[index];
    if (g) this.particles.burst(g.x, g.y, g.z, COLORS.grump, 18, 4.5);
    const mesh = this.grumpMeshes[index];
    if (mesh) mesh.visible = false;
  }

  /** Enable/disable sun shadows (quality degradation). */
  setShadows(on: boolean): void {
    this.sun.castShadow = on;
  }

  /** Respawn a level: restore pickups/grumps visibility. */
  reset(): void {
    for (const p of this.level.pickups) {
      if (!p.taken) continue;
      p.taken = false;
      if (p.kind === "candy" || p.kind === "gem") {
        tmpMat.makeScale(1, 1, 1);
        const mesh = p.kind === "candy" ? this.candyMesh : this.gemMesh;
        tmpPos.set(p.x, p.y, p.z);
        tmpQuat.identity();
        tmpScale.setScalar(1);
        tmpMat.compose(tmpPos, tmpQuat, tmpScale);
        mesh.setMatrixAt(p.instance, tmpMat);
        mesh.instanceMatrix.needsUpdate = true;
      } else {
        const g = this.powerMeshes.get(p);
        if (g) g.visible = true;
      }
    }
    this.level.grumps.forEach((g, i) => {
      g.alive = true;
      if (this.grumpMeshes[i]) this.grumpMeshes[i].visible = true;
    });
  }

  dispose(): void {
    this.root.parent?.remove(this.root);
    for (const d of this.disposables) d.dispose();
    this.particles.dispose();
    this.candyMesh.dispose();
    this.gemMesh.dispose();
    this.clouds.dispose();
    for (const g of this.powerMeshes.values()) {
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    }
  }
}

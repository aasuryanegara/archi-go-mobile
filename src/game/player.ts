/**
 * player.ts — character-independent AABB platforming physics with swappable visual rigs (coyote time, jump
 * buffering, feather double-jump, moving-platform carry), squash & stretch,
 * camera-relative movement (W = forward = away from camera, -Z at yaw 0).
 */

import * as THREE from "three";
import { PHYS } from "./config";
import type { Platform, Vec3 } from "./types";
import type { Input } from "./input";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DEFAULT_CHARACTER_ID, getCharacter } from "./characters";

const HALF = 0.34; // player AABB half-extent (visual radius 0.42, collider slightly tighter)

export interface MoveModifiers {
  speedMult: number;
  extraJumps: number;
}

export class Player {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  grounded = false;
  facing = 0; // visual heading

  private coyote = 0;
  private buffer = 0;
  private extraJumpsLeft = 0;
  private groundPlatform: Platform | null = null;
  private stretch = 0; // >0 stretched, <0 squashed
  private shieldMesh: THREE.Mesh;
  private readonly body: THREE.Mesh;
  private readonly eyeL: THREE.Mesh;
  private readonly eyeR: THREE.Mesh;
  private walkPhase = 0;
  private readonly proceduralRoot = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private animationActions = new Map<string, THREE.AnimationAction>();
  private activeAnimation = "";
  private externalModel: THREE.Object3D | null = null;

  constructor(characterId = DEFAULT_CHARACTER_ID) {
    const character = getCharacter(characterId);
    const bodyGeo = new THREE.SphereGeometry(PHYS.PLAYER_R, 18, 14);
    const bodyMat = new THREE.MeshStandardMaterial({ color: character.bodyColor, roughness: 0.6 });
    this.body = new THREE.Mesh(bodyGeo, bodyMat);
    this.body.castShadow = true;
    this.proceduralRoot.add(this.body);

    const eyeGeo = new THREE.SphereGeometry(0.075, 8, 8);
    const eyeMat = new THREE.MeshStandardMaterial({ color: character.eyeColor, roughness: 0.3 });
    this.eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    this.eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    this.eyeL.position.set(-0.15, 0.08, -0.34);
    this.eyeR.position.set(0.15, 0.08, -0.34);
    this.proceduralRoot.add(this.eyeL, this.eyeR);

    const blushGeo = new THREE.SphereGeometry(0.06, 6, 6);
    const blushMat = new THREE.MeshStandardMaterial({ color: character.accentColor, roughness: 0.8 });
    const bl = new THREE.Mesh(blushGeo, blushMat);
    const br = new THREE.Mesh(blushGeo, blushMat);
    bl.position.set(-0.26, -0.04, -0.3);
    br.position.set(0.26, -0.04, -0.3);
    bl.scale.set(1, 0.6, 0.5);
    br.scale.set(1, 0.6, 0.5);
    this.proceduralRoot.add(bl, br);

    // feet
    const footGeo = new THREE.SphereGeometry(0.11, 8, 6);
    const footMat = new THREE.MeshStandardMaterial({ color: character.accentColor, roughness: 0.7 });
    const fl = new THREE.Mesh(footGeo, footMat);
    const fr = new THREE.Mesh(footGeo, footMat);
    fl.position.set(-0.16, -0.38, 0);
    fr.position.set(0.16, -0.38, 0);
    fl.scale.set(1, 0.55, 1.3);
    fr.scale.set(1, 0.55, 1.3);
    this.proceduralRoot.add(fl, fr);

    // Character-specific silhouette details. All remain cosmetic: the AABB collider is unchanged.
    if (character.id === "fox") {
      const earGeo = new THREE.ConeGeometry(0.13, 0.34, 8);
      const earMat = new THREE.MeshStandardMaterial({ color: character.bodyColor, roughness: 0.7 });
      const innerMat = new THREE.MeshStandardMaterial({ color: 0xffd6c4, roughness: 0.8 });
      for (const x of [-0.2, 0.2]) {
        const ear = new THREE.Mesh(earGeo, earMat);
        ear.position.set(x, 0.43, -0.02);
        ear.rotation.z = x < 0 ? 0.18 : -0.18;
        this.proceduralRoot.add(ear);
        const inner = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.2, 8), innerMat);
        inner.position.set(x, 0.43, -0.115);
        inner.rotation.z = x < 0 ? 0.18 : -0.18;
        this.proceduralRoot.add(inner);
      }
      const tail = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshStandardMaterial({ color: character.bodyColor, roughness: 0.7 }));
      tail.position.set(0, -0.08, 0.38);
      tail.scale.set(0.75, 0.75, 1.5);
      this.proceduralRoot.add(tail);
    } else if (character.id === "bot") {
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x65788c, metalness: 0.55, roughness: 0.35 }));
      antenna.position.set(0, 0.48, 0);
      this.proceduralRoot.add(antenna);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), new THREE.MeshStandardMaterial({ color: character.accentColor, emissive: character.accentColor, emissiveIntensity: 0.35 }));
      beacon.position.set(0, 0.59, 0);
      this.proceduralRoot.add(beacon);
      const belly = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.25, 0.12), new THREE.MeshStandardMaterial({ color: 0xd8f6fa, metalness: 0.2, roughness: 0.45 }));
      belly.position.set(0, -0.08, -0.32);
      belly.scale.set(1, 1, 0.5);
      this.proceduralRoot.add(belly);
    } else if (character.id === "penguin") {
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.29, 14, 12), new THREE.MeshStandardMaterial({ color: 0xf5f2e9, roughness: 0.9 }));
      belly.position.set(0, -0.08, -0.27);
      belly.scale.set(0.83, 0.9, 0.42);
      this.proceduralRoot.add(belly);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 8), new THREE.MeshStandardMaterial({ color: character.accentColor, roughness: 0.65 }));
      beak.position.set(0, -0.02, -0.43);
      beak.rotation.x = -Math.PI / 2;
      this.proceduralRoot.add(beak);
      const wingMat = new THREE.MeshStandardMaterial({ color: character.bodyColor, roughness: 0.8 });
      for (const x of [-0.34, 0.34]) {
        const wing = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), wingMat);
        wing.position.set(x, -0.12, -0.02);
        wing.scale.set(0.65, 1.25, 0.65);
        this.proceduralRoot.add(wing);
      }
    }

    this.group.add(this.proceduralRoot);
    if (character.modelUrl) this.loadExternalModel(character.modelUrl);

    // shield bubble (hidden unless active)
    const shieldGeo = new THREE.SphereGeometry(0.62, 16, 12);
    const shieldMat = new THREE.MeshStandardMaterial({
      color: 0x9fd4ff, transparent: true, opacity: 0.35, roughness: 0.1,
    });
    this.shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    this.shieldMesh.visible = false;
    this.group.add(this.shieldMesh);
  }

  spawnAt(p: Vec3): void {
    this.pos.set(p.x, p.y, p.z);
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.coyote = 0;
    this.buffer = 0;
    this.extraJumpsLeft = 0;
    this.stretch = 0;
    this.syncMesh(0);
  }

  setShield(on: boolean): void {
    this.shieldMesh.visible = on;
  }

  /** Bounce off a grump head. */
  bounce(): void {
    this.vel.y = PHYS.JUMP_V * 0.85;
    this.grounded = false;
    this.stretch = 1;
  }

  jumpRequested(): boolean {
    return this.buffer > 0;
  }

  update(dt: number, input: Input, camYaw: number, mods: MoveModifiers, platforms: Platform[]): void {
    // --- intent in camera space ---
    const fx = Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = Math.sin(camYaw);
    let mx = rx * input.moveX + fx * input.moveZ;
    let mz = rz * input.moveX + fz * input.moveZ;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }

    const speed = PHYS.MOVE_SPEED * mods.speedMult;
    const ctrl = this.grounded ? 1 : PHYS.AIR_CTRL;
    const tx = mx * speed, tz = mz * speed;
    const k = Math.min(1, 14 * ctrl * dt);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.z += (tz - this.vel.z) * k;

    // --- jumping ---
    if (input.consumeAction("Space")) this.buffer = PHYS.JUMP_BUFFER;
    this.buffer -= dt;
    this.coyote -= dt;
    if (mods.extraJumps > 0 && !this.grounded) {
      // feather grants its extra jumps on leaving the ground
      this.extraJumpsLeft = Math.max(this.extraJumpsLeft, mods.extraJumps);
    }
    if (this.buffer > 0) {
      if (this.grounded || this.coyote > 0) {
        this.vel.y = PHYS.JUMP_V;
        this.grounded = false;
        this.coyote = 0;
        this.buffer = 0;
        this.stretch = 1;
        this.justJumped = true;
      } else if (this.extraJumpsLeft > 0) {
        this.extraJumpsLeft--;
        this.buffer = 0;
        this.vel.y = PHYS.JUMP_V * 0.92;
        this.stretch = 1;
        this.justDoubleJumped = true;
      }
    }

    // --- gravity ---
    this.vel.y += PHYS.GRAVITY * dt;
    if (this.vel.y < PHYS.MAX_FALL) this.vel.y = PHYS.MAX_FALL;

    // --- carry by moving platform ---
    if (this.grounded && this.groundPlatform?.move) {
      this.pos.x += this.groundPlatform.deltaX;
      this.pos.z += this.groundPlatform.deltaZ;
    }

    // --- integrate & collide ---
    const wasGrounded = this.grounded;
    this.grounded = false;
    const prevGround = this.groundPlatform;
    this.groundPlatform = null;

    // horizontal move + side push-out
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    for (const p of platforms) {
      if (!this.overlapsXZ(p)) continue;
      const bottom = this.pos.y - HALF;
      const top = this.pos.y + HALF;
      if (bottom >= p.maxY - 0.08 || top <= p.minY) continue; // can step onto it or passes under
      // blocked: push out along the axis of least penetration
      const penX1 = p.maxX - (this.pos.x - HALF);
      const penX2 = (this.pos.x + HALF) - p.minX;
      const penZ1 = p.maxZ - (this.pos.z - HALF);
      const penZ2 = (this.pos.z + HALF) - p.minZ;
      const px = Math.min(penX1, penX2);
      const pz = Math.min(penZ1, penZ2);
      if (px < pz) {
        this.pos.x += penX1 < penX2 ? px : -px;
        this.vel.x = 0;
      } else {
        this.pos.z += penZ1 < penZ2 ? pz : -pz;
        this.vel.z = 0;
      }
    }

    // vertical move + landing
    const prevY = this.pos.y;
    this.pos.y += this.vel.y * dt;
    if (this.vel.y <= 0) {
      for (const p of platforms) {
        if (!this.overlapsXZ(p)) continue;
        if (prevY - HALF >= p.maxY - 0.001 && this.pos.y - HALF <= p.maxY) {
          this.pos.y = p.maxY + HALF;
          this.vel.y = 0;
          this.grounded = true;
          this.groundPlatform = p;
          break;
        }
      }
    }
    if (this.grounded) {
      this.coyote = PHYS.COYOTE;
      this.extraJumpsLeft = mods.extraJumps;
      if (!wasGrounded) this.landed = true;
    } else if (wasGrounded && prevGround) {
      // walked off an edge
      this.coyote = PHYS.COYOTE;
    }

    // --- visual heading ---
    if (len > 0.1) {
      const target = Math.atan2(-this.vel.x, -this.vel.z);
      let d = target - this.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.facing += d * Math.min(1, 16 * dt);
    }
    this.walkPhase += Math.hypot(this.vel.x, this.vel.z) * dt * 2.2;

    this.syncMesh(dt);
    this.updateExternalAnimation(dt);
  }

  private loadExternalModel(url: string): void {
    const loader = new GLTFLoader();
    loader.load(url, (gltf) => {
      if (!this.group.parent) {
        gltf.scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material.dispose());
          }
        });
        return;
      }
      const model = gltf.scene;
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const targetHeight = 0.95;
      const scale = size.y > 0 ? targetHeight / size.y : 1;
      model.scale.setScalar(scale);
      model.position.set(-center.x * scale, -bounds.min.y * scale - 0.34, -center.z * scale);
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      this.group.remove(this.proceduralRoot);
      this.group.add(model);
      this.externalModel = model;
      if (gltf.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(model);
        for (const clip of gltf.animations) {
          const key = /idle|stand/i.test(clip.name) ? "idle"
            : /run|walk|move/i.test(clip.name) ? "run"
            : /jump|up/i.test(clip.name) ? "jump"
            : /fall|drop/i.test(clip.name) ? "fall"
            : /land/i.test(clip.name) ? "land" : clip.name.toLowerCase();
          if (!this.animationActions.has(key)) this.animationActions.set(key, this.mixer.clipAction(clip));
        }
        this.playExternalAnimation("idle");
      }
    }, undefined, (error) => {
      console.warn(`[ARCHi Go] Could not load character model ${url}; using procedural fallback.`, error);
    });
  }

  private playExternalAnimation(name: string): void {
    if (!this.mixer) return;
    const next = this.animationActions.get(name) ?? this.animationActions.get("idle") ?? this.animationActions.values().next().value;
    if (!next || this.activeAnimation === name) return;
    this.animationActions.get(this.activeAnimation)?.fadeOut(0.12);
    next.reset().fadeIn(0.12).play();
    this.activeAnimation = name;
  }

  private updateExternalAnimation(dt: number): void {
    if (!this.mixer) return;
    const horizontalSpeed = Math.hypot(this.vel.x, this.vel.z);
    const state = this.landed ? "land" : !this.grounded ? (this.vel.y > 0.5 ? "jump" : "fall") : horizontalSpeed > 0.55 ? "run" : "idle";
    this.playExternalAnimation(state);
    this.mixer.update(dt);
  }

  // one-frame event flags, read & cleared by the game
  justJumped = false;
  justDoubleJumped = false;
  landed = false;

  private overlapsXZ(p: Platform): boolean {
    return (
      this.pos.x + HALF > p.minX && this.pos.x - HALF < p.maxX &&
      this.pos.z + HALF > p.minZ && this.pos.z - HALF < p.maxZ
    );
  }

  private syncMesh(dt: number): void {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.facing;

    // squash & stretch spring
    this.stretch *= Math.max(0, 1 - 9 * (dt || 0.016));
    const vy = Math.max(-1, Math.min(1, this.vel.y / 14));
    let sy = 1 + this.stretch * 0.28 + vy * 0.1;
    let sxz = 1 - this.stretch * 0.16 - vy * 0.06;
    if (this.grounded && this.landedImpulse > 0) {
      sy -= this.landedImpulse * 0.35;
      sxz += this.landedImpulse * 0.2;
      this.landedImpulse = Math.max(0, this.landedImpulse - (dt || 0.016) * 4);
    }
    this.body.scale.set(sxz, sy, sxz);

    // walking waddle
    const wob = this.grounded ? Math.sin(this.walkPhase * 6) * 0.06 : 0;
    this.group.rotation.z = wob;

    if (this.landed) this.landedImpulse = 0.7;
  }

  private landedImpulse = 0;

  dispose(): void {
    this.mixer?.stopAllAction();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.mixer = null;
    this.animationActions.clear();
  }
}

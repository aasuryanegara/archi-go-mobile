/**
 * game.ts — ARCHi Go orchestrator: renderer + camera rig + run state + all the
 * systems (timer, pickups, grumps, powers, hearts, scoring) and the state machine
 * wiring. The React shell (src/pages/Home.tsx) only owns the canvas and the overlay
 * root — everything here is imperative.
 */

import * as THREE from "three";
import { GameLoop } from "./engine";
import { TouchControls } from "./touchcontrols";
import { Input } from "./input";
import { AudioSystem } from "./audio";
import { GameStateMachine } from "./state";
import { Hud } from "./hud";
import { World } from "./world";
import { Player } from "./player";
import { generateLevel } from "./level";
import { POWERS, RUN, UPGRADES, CAMERA, QUALITY, type UpgradeId } from "./config";
import { bankedCandies, bestScore, playerName, selectedCharacter, upgrades } from "./storage";
import { CHARACTERS, DEFAULT_CHARACTER_ID } from "./characters";
import { fetchLeaderboard, submitScore, type LeaderboardEntry } from "./backend";
import type { LevelData } from "./types";

const tmpV = new THREE.Vector3();

interface RunState {
  time: number;
  candies: number;
  gems: number;
  hearts: number;
  score: number;
  sugarT: number;
  feather: boolean;
  shieldT: number;
  invulnT: number;
  lowTimeWarned: boolean;
  lastTick: number;
}

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly input = new Input();
  private readonly audio = new AudioSystem();
  private readonly fsm = new GameStateMachine();
  private readonly hud: Hud;
  private readonly touch: TouchControls;
  private readonly loop: GameLoop;

  private level: LevelData;
  private world: World;
  private player: Player;

  private run: RunState = this.freshRunState();
  private camYaw = 0;
  private camElev = 0.5;
  private readonly camTarget = new THREE.Vector3();
  private shake = 0;
  private clock = 0; // wall time for ambient animation
  private fpsAccum = 0;
  private fpsFrames = 0;
  private shadowsOn = true;
  private victoryFxT = 0;
  private disposed = false;
  private seed = 1;
  private submitting = false;
  private characterSelectOpen = false;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(CAMERA.FOV, window.innerWidth / window.innerHeight, 0.1, 220);

    this.hud = new Hud(overlay, {
      onPlay: () => this.startRun(),
      onResume: () => this.resume(),
      onRestart: () => this.restart(),
      onQuit: () => this.quitToTitle(),
      onBuy: (id) => this.buyUpgrade(id),
      onSubmit: (name) => this.submit(name),
      onMute: () => this.toggleMute(),
      onCharacters: () => this.openCharacterSelect(),
      onSelectCharacter: (id) => this.selectCharacter(id),
      onBackToTitle: () => this.backFromCharacterSelect(),
      onSettings: () => this.toggleSettings(),
      onToggleShadows: () => this.toggleShadows(),
    });
    this.touch = new TouchControls(this.input, overlay.parentElement ?? document.body);
    this.hud.setMute(this.audio.muted);
    this.hud.setShadows(this.shadowsOn);

    this.seed = this.initialSeed();
    this.level = generateLevel(this.seed);
    this.world = new World(this.scene, this.level);
    this.player = new Player(selectedCharacter.get() || DEFAULT_CHARACTER_ID);
    this.scene.add(this.player.group);
    this.player.spawnAt(this.level.spawn);

    this.fsm.onChange((s) => this.onStateChange(s));
    this.showTitle();

    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: () => this.render(),
    });
    this.loop.start();

    window.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  private initialSeed(): number {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("seed");
    if (q !== null) {
      const n = Number(q);
      if (Number.isFinite(n)) return n >>> 0;
    }
    return (Math.random() * 0xffffffff) >>> 0;
  }

  /* ------------------------------ state flow ------------------------------ */

  private onStateChange(s: string): void {
    this.touch.setVisible(s === "playing");
    if (s === "playing") {
      this.hud.showPlayingHud();
      this.audio.setMusic("play", this.run.time <= RUN.LOW_TIME);
    } else if (s === "paused") {
      this.hud.showPause();
    }
  }

  private showTitle(): void {
    this.characterSelectOpen = false;
    this.audio.setMusic("title");
    void fetchLeaderboard().then((rows) => {
      if (this.disposed || !this.fsm.is("title") || this.characterSelectOpen) return;
      this.hud.showTitle({
        bank: bankedCandies.get(),
        upgrades: upgrades.get(),
        best: bestScore.get(),
        name: playerName.get(),
        leaderboard: rows,
        leaderboardError: rows === null,
      });
    });
    // render synchronously with cached/null data first
    this.hud.showTitle({
      bank: bankedCandies.get(),
      upgrades: upgrades.get(),
      best: bestScore.get(),
      name: playerName.get(),
      leaderboard: null,
      leaderboardError: false,
    });
  }

  private openCharacterSelect(): void {
    if (!this.fsm.is("title")) return;
    this.characterSelectOpen = true;
    this.hud.showCharacterSelect(selectedCharacter.get());
  }

  private selectCharacter(id: string): void {
    if (!this.fsm.is("title") || !CHARACTERS.some((character) => character.id === id)) return;
    selectedCharacter.set(id);
    const spawn = { x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z };
    this.scene.remove(this.player.group);
    this.player.dispose();
    this.player = new Player(id);
    this.scene.add(this.player.group);
    this.player.spawnAt(spawn);
    this.hud.showCharacterSelect(id);
  }

  private backFromCharacterSelect(): void {
    if (!this.fsm.is("title")) return;
    this.characterSelectOpen = false;
    this.showTitle();
  }

  private freshRunState(): RunState {
    const tiers = upgrades.get();
    return {
      time: RUN.START_TIME + tiers.clock * RUN.CLOCK_STEP,
      candies: 0,
      gems: 0,
      hearts: 3,
      score: 0,
      sugarT: 0,
      feather: false,
      shieldT: 0,
      invulnT: 0,
      lowTimeWarned: false,
      lastTick: -1,
    };
  }

  private startRun(): void {
    if (!this.fsm.is("title")) return;
    this.audio.sfx("ui");
    this.resetRun();
    this.fsm.transition("playing");
  }

  private restart(): void {
    if (!this.fsm.is("paused", "victory", "gameover")) return;
    this.audio.sfx("ui");
    this.resetRun();
    this.fsm.transition("playing");
  }

  private resetRun(): void {
    this.seed = (Math.random() * 0xffffffff) >>> 0;
    this.level = generateLevel(this.seed);
    this.scene.remove(this.player.group);
    this.player.dispose();
    this.world.dispose();
    this.world = new World(this.scene, this.level);
    this.player = new Player(selectedCharacter.get() || DEFAULT_CHARACTER_ID);
    this.scene.add(this.player.group);
    this.player.spawnAt(this.level.spawn);
    this.run = this.freshRunState();
    this.camYaw = 0;
    this.camElev = 0.5;
    this.victoryFxT = 0;
    this.submitting = false;
  }

  private resume(): void {
    if (!this.fsm.is("paused")) return;
    this.audio.sfx("ui");
    this.fsm.transition("playing");
  }

  private pause(): void {
    if (!this.fsm.is("playing")) return;
    this.audio.sfx("ui");
    this.fsm.transition("paused");
  }

  private quitToTitle(): void {
    if (!this.fsm.is("paused", "victory", "gameover")) return;
    this.audio.sfx("ui");
    this.fsm.transition("title");
    this.showTitle();
  }

  private toggleMute(): void {
    const muted = this.audio.toggleMute();
    this.hud.setMute(muted);
  }

  private toggleSettings(): void {
    if (this.hud.isSettings()) {
      if (this.fsm.is("paused")) this.hud.showPause();
      else if (this.fsm.is("title")) this.showTitle();
      else this.hud.hideScreen();
      return;
    }
    if (this.fsm.is("playing")) this.pause();
    this.hud.showSettings();
  }

  private toggleShadows(): void {
    this.shadowsOn = !this.shadowsOn;
    this.renderer.shadowMap.enabled = this.shadowsOn;
    this.world.setShadows(this.shadowsOn);
    this.hud.setShadows(this.shadowsOn);
  }

  /* ------------------------------ shop & scores ------------------------------ */

  private buyUpgrade(id: UpgradeId): void {
    const tiers = upgrades.get();
    const u = UPGRADES[id];
    const tier = tiers[id];
    const bank = bankedCandies.get();
    if (tier >= u.max || u.costs[tier] > bank) {
      this.audio.sfx("deny");
      return;
    }
    bankedCandies.set(bank - u.costs[tier]);
    tiers[id] = tier + 1;
    upgrades.set(tiers);
    this.audio.sfx("buy");
    this.hud.toast(`${u.name} upgraded!`);
    this.showTitle();
  }

  private endRun(victory: boolean): void {
    if (!this.fsm.is("playing")) return;
    const timeBonus = victory ? Math.ceil(this.run.time) * RUN.TIME_PTS : 0;
    this.run.score += timeBonus;
    const bank = bankedCandies.get() + this.run.candies + this.run.gems * 3;
    bankedCandies.set(bank);
    const prevBest = bestScore.get();
    const newBest = this.run.score > prevBest;
    if (newBest) bestScore.set(this.run.score);

    this.fsm.transition(victory ? "victory" : "gameover");
    this.audio.sfx(victory ? "win" : "lose");
    this.audio.setMusic("title");
    if (victory) this.victoryFxT = 2.2;

    const data = {
      title: victory ? "🎉 You made it!" : "💀 Out of hops!",
      victory,
      score: this.run.score,
      candies: this.run.candies,
      gems: this.run.gems,
      timeBonus,
      bank,
      best: Math.max(prevBest, this.run.score),
      newBest,
      name: playerName.get(),
      submitted: false,
      leaderboard: null as LeaderboardEntry[] | null,
      leaderboardError: false,
    };
    this.hud.showEnd(data);
    void fetchLeaderboard(true).then((rows) => {
      if (this.disposed) return;
      data.leaderboard = rows;
      data.leaderboardError = rows === null;
      if (!this.fsm.is("victory", "gameover")) return;
      // auto-submit when we already know the player's name
      const known = playerName.get();
      if (known && this.run.score > 0 && !this.submitting) {
        this.submitting = true;
        void submitScore(known, this.run.score).then((submitted) => {
          this.submitting = false;
          if (this.disposed || !this.fsm.is("victory", "gameover")) return;
          data.submitted = submitted !== null;
          data.leaderboard = submitted ?? data.leaderboard;
          data.leaderboardError = submitted === null && data.leaderboard === null;
          this.hud.showEnd(data);
        });
      } else {
        this.hud.showEnd(data);
      }
    });
  }

  private submit(name: string): void {
    if (this.submitting) return;
    this.submitting = true;
    playerName.set(name);
    this.audio.sfx("ui");
    void submitScore(name, this.run.score).then((rows) => {
      this.submitting = false;
      if (this.disposed || !this.fsm.is("victory", "gameover")) return;
      this.endDataCache(rows !== null, rows);
    });
  }

  // last end-screen data so a late submit can re-render without re-computing
  private endDataCache(submitted: boolean, rows: LeaderboardEntry[] | null): void {
    // recompute cheaply — the run state is still intact
    const victory = this.fsm.state === "victory";
    this.hud.showEnd({
      title: victory ? "🎉 You made it!" : "💀 Out of hops!",
      victory,
      score: this.run.score,
      candies: this.run.candies,
      gems: this.run.gems,
      timeBonus: victory ? Math.ceil(this.run.time) * RUN.TIME_PTS : 0,
      bank: bankedCandies.get(),
      best: bestScore.get(),
      newBest: false,
      name: playerName.get(),
      submitted,
      leaderboard: rows,
      leaderboardError: rows === null,
    });
  }

  /* ------------------------------ per-frame ------------------------------ */

  private update(dt: number): void {
    this.clock += dt;

    if (this.input.consumeAction("KeyM")) this.toggleMute();

    const s = this.fsm.state;
    if (s === "title") {
      const startPressed = this.input.consumeAction("Space") || this.input.consumeAction("Enter");
      if (startPressed && !this.characterSelectOpen && !this.hud.isSettings()) this.startRun();
      this.world.update(dt, this.clock, this.player.pos);
      return;
    }
    if (s === "paused") {
      if (this.input.consumeAction("Escape") || this.input.consumeAction("KeyP")) {
        if (this.hud.isSettings()) this.toggleSettings();
        else this.resume();
      }
      return;
    }
    if (s === "victory" || s === "gameover") {
      if (this.input.consumeAction("Space") || this.input.consumeAction("Enter")) this.restart();
      this.world.update(dt, this.clock, this.player.pos);
      if (s === "victory" && this.victoryFxT > 0) {
        this.victoryFxT -= dt;
        this.world.particles.burst(
          this.level.goal.x + (Math.random() - 0.5) * 2,
          this.level.goal.y + Math.random() * 2,
          this.level.goal.z + (Math.random() - 0.5) * 2,
          [0xff6fa5, 0x6fe3ff, 0xffd45e, 0x8fe07f][Math.floor(Math.random() * 4)],
          10, 5, -4,
        );
      }
      return;
    }

    // ---- playing ----
    if (this.input.consumeAction("Escape") || this.input.consumeAction("KeyP")) {
      this.pause();
      return;
    }

    // auto quality: sustained low fps drops shadows (chearest visual cost, keeps readability)
    this.fpsAccum += dt; this.fpsFrames++;
    if (this.fpsAccum >= 2) {
      const fps = this.fpsFrames / this.fpsAccum;
      this.fpsAccum = 0; this.fpsFrames = 0;
      if (fps < QUALITY.DEGRADE_FPS && this.shadowsOn) {
        this.shadowsOn = false;
        this.renderer.shadowMap.enabled = false;
        this.world.setShadows(false);
        this.hud.setShadows(false);
        this.hud.toast("Performance mode: shadows off");
      }
    }

    const look = this.input.consumeLook();
    this.camYaw -= look.yaw;
    this.camElev = Math.max(CAMERA.PITCH_MIN, Math.min(CAMERA.PITCH_MAX, this.camElev + look.pitch));

    // timer
    this.run.time -= dt;
    if (this.run.time <= RUN.LOW_TIME && !this.run.lowTimeWarned) {
      this.run.lowTimeWarned = true;
      this.hud.toast("⏰ Hurry! The portal is waiting!");
      this.audio.setMusic("play", true);
    }
    if (this.run.time <= 10 && this.run.time > 0) {
      const sec = Math.ceil(this.run.time);
      if (sec !== this.run.lastTick) {
        this.run.lastTick = sec;
        this.audio.sfx("tick");
      }
    }
    if (this.run.time <= 0) {
      this.run.time = 0;
      this.endRun(false);
      return;
    }

    // power timers
    if (this.run.sugarT > 0) this.run.sugarT -= dt;
    if (this.run.shieldT > 0) {
      this.run.shieldT -= dt;
      if (this.run.shieldT <= 0) this.player.setShield(false);
    }
    if (this.run.invulnT > 0) {
      this.run.invulnT -= dt;
      this.player.group.visible = Math.floor(this.clock * 12) % 2 === 0 || this.run.invulnT <= 0;
      if (this.run.invulnT <= 0) this.player.group.visible = true;
    }

    // player physics
    const tiers = upgrades.get();
    const mods = {
      speedMult: (this.run.sugarT > 0 ? POWERS.SUGAR_RUSH_MULT : 1) * (1 + 0.1 * tiers.swift),
      extraJumps: this.run.feather ? POWERS.FEATHER_JUMPS : 0,
    };
    this.player.update(dt, this.input, this.camYaw, mods, this.level.platforms);

    // event feedback from the player
    if (this.player.justJumped) {
      this.player.justJumped = false;
      this.audio.sfx("jump");
      this.world.particles.burst(this.player.pos.x, this.player.pos.y - 0.35, this.player.pos.z, 0xffffff, 5, 1.6);
    }
    if (this.player.justDoubleJumped) {
      this.player.justDoubleJumped = false;
      this.audio.sfx("doubleJump");
      this.world.particles.burst(this.player.pos.x, this.player.pos.y - 0.3, this.player.pos.z, 0xfff6c8, 10, 2.6);
    }
    if (this.player.landed) {
      this.player.landed = false;
      this.audio.sfx("land");
      this.world.particles.burst(this.player.pos.x, this.player.pos.y - 0.35, this.player.pos.z, 0xdff3ff, 6, 1.8);
    }

    this.updateGrumps(dt);
    this.updatePickups();
    this.checkGoal();

    // fell off the world
    if (this.player.pos.y < -14) {
      this.hurtPlayer(true);
    }

    // camera follows
    this.updateCamera(dt);

    // ambient world
    this.world.update(dt, this.clock, this.player.pos);

    // HUD
    this.hud.update({
      time: this.run.time,
      candies: this.run.candies,
      gems: this.run.gems,
      hearts: this.run.hearts,
      score: this.run.score,
      sugarT: Math.max(0, this.run.sugarT),
      feather: this.run.feather,
      shieldT: Math.max(0, this.run.shieldT),
      invulnT: Math.max(0, this.run.invulnT),
    });
  }

  private updateGrumps(dt: number): void {
    for (let i = 0; i < this.level.grumps.length; i++) {
      const g = this.level.grumps[i];
      if (!g.alive) continue;
      const cur = g.axis === "x" ? g.x : g.z;
      let next = cur + g.dir * g.speed * dt;
      if (next > g.max) { next = g.max; g.dir = -1; }
      if (next < g.min) { next = g.min; g.dir = 1; }
      if (g.axis === "x") g.x = next; else g.z = next;

      // player interaction
      const dx = this.player.pos.x - g.x;
      const dz = this.player.pos.z - g.z;
      const dy = this.player.pos.y - g.y;
      const rr = 0.85;
      if (dx * dx + dz * dz < rr * rr && dy > -0.6 && dy < 1.1) {
        this.lastGrumpHit = { dy: +dy.toFixed(3), velY: +this.player.vel.y.toFixed(3), dhz: +Math.hypot(dx, dz).toFixed(3), stomped: false };
        // stomp when descending onto the grump's head (center clearly above its
        // midline) — walking into it or rising into it from below still hurts
        if (this.player.vel.y < 0 && dy > 0.3) {
          // stomp!
          this.lastGrumpHit.stomped = true;
          g.alive = false;
          this.world.poofGrump(i);
          this.player.bounce();
          this.run.score += 25;
          this.audio.sfx("bounce");
          this.hud.toast("Stomp! +25");
        } else {
          this.hurtPlayer(false);
        }
      }
    }
  }

  private updatePickups(): void {
    const p = this.player.pos;
    for (const pk of this.level.pickups) {
      if (pk.taken) continue;
      const dx = pk.x - p.x, dy = pk.y - p.y, dz = pk.z - p.z;
      if (dx * dx + dz * dz > 1.1 || dy > 1.2 || dy < -1.2) continue;
      this.world.collect(pk);
      switch (pk.kind) {
        case "candy":
          this.run.candies++;
          this.run.score += RUN.CANDY_PTS;
          this.audio.sfx("coin");
          break;
        case "gem":
          this.run.gems++;
          this.run.score += RUN.GEM_PTS;
          this.audio.sfx("gem");
          this.hud.toast("💎 Gem! +100");
          break;
        case "sugar":
          this.run.sugarT = POWERS.SUGAR_RUSH_TIME;
          this.audio.sfx("powerup");
          this.hud.toast("⚡ Sugar Rush!");
          break;
        case "feather":
          this.run.feather = true;
          this.audio.sfx("powerup");
          this.hud.toast("🪶 Double jump unlocked!");
          break;
        case "shield":
          this.run.shieldT = POWERS.SHIELD_TIME;
          this.player.setShield(true);
          this.audio.sfx("powerup");
          this.hud.toast("🛡 Bubble shield!");
          break;
      }
    }
  }

  private checkGoal(): void {
    const g = this.level.goal;
    const dx = g.x - this.player.pos.x;
    const dy = g.y - this.player.pos.y;
    const dz = g.z - this.player.pos.z;
    if (dx * dx + dy * dy + dz * dz < 1.7 * 1.7) {
      this.audio.sfx("portal");
      this.endRun(true);
    }
  }

  private lastGrumpHit: { dy: number; velY: number; dhz: number; stomped: boolean } | null = null;

  private hurtPlayer(fell: boolean): void {
    if (this.run.invulnT > 0 && !fell) return;
    if (fell) {
      // falling always costs a heart (shield can't help gravity)
      this.run.hearts--;
      this.audio.sfx("hurt");
      this.shake = 0.5;
      if (this.run.hearts <= 0) {
        this.endRun(false);
        return;
      }
      this.respawn();
      return;
    }
    if (this.run.shieldT > 0) {
      this.run.shieldT = 0;
      this.player.setShield(false);
      this.run.invulnT = 1.2;
      this.audio.sfx("shieldBreak");
      this.hud.toast("🛡 Shield saved you!");
      this.shake = 0.35;
      this.knockback();
      return;
    }
    this.run.hearts--;
    this.run.invulnT = 1.5;
    this.audio.sfx("hurt");
    this.shake = 0.6;
    if (this.run.hearts <= 0) {
      this.endRun(false);
      return;
    }
    this.knockback();
  }

  private knockback(): void {
    this.player.vel.y = 8;
    this.player.vel.x *= -0.6;
    this.player.vel.z *= -0.6;
  }

  private respawn(): void {
    this.player.spawnAt(this.level.spawn);
    this.run.invulnT = 1.6;
    this.camYaw = 0;
    this.world.particles.burst(this.player.pos.x, this.player.pos.y, this.player.pos.z, 0xffffff, 14, 3);
  }

  private updateCamera(dt: number): void {
    // gentle auto-align behind movement? keep player-controlled only
    const dist = CAMERA.DIST;
    const cy = Math.cos(this.camElev), sy = Math.sin(this.camElev);
    tmpV.set(
      this.player.pos.x + Math.sin(this.camYaw) * cy * dist,
      this.player.pos.y + sy * dist + 0.6,
      this.player.pos.z + Math.cos(this.camYaw) * cy * dist,
    );
    const k = Math.min(1, CAMERA.FOLLOW_LERP * dt);
    this.camTarget.lerp(tmpV, k);

    this.camera.position.copy(this.camTarget);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.8);
      const m = this.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * m;
      this.camera.position.y += (Math.random() - 0.5) * m;
    }
    this.camera.lookAt(
      this.player.pos.x + this.player.vel.x * CAMERA.LOOKAHEAD * 0.08,
      this.player.pos.y + 0.8,
      this.player.pos.z + this.player.vel.z * CAMERA.LOOKAHEAD * 0.08,
    );
  }

  private render(): void {
    if (this.fsm.is("title")) {
      // slow orbit around the spawn island
      const t = this.clock * 0.18;
      const c = this.level.spawn;
      this.camera.position.set(c.x + Math.sin(t) * 11, c.y + 4.5, c.z + Math.cos(t) * 11);
      this.camera.lookAt(c.x, c.y + 0.5, c.z);
    }
    this.renderer.render(this.scene, this.camera);
    window.__GAME_READY__ = true;
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  };

  private onVisibility = (): void => {
    if (document.hidden && this.fsm.is("playing")) this.pause();
  };

  /**
   * Minimal hooks for automated verification only (never shown in the UI):
   * state transitions, teleports for pickup/goal checks, run stats, render counts.
   */
  debugApi() {
    return {
      state: () => this.fsm.state,
      character: () => selectedCharacter.get(),
      pos: () => ({ x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z }),
      teleport: (x: number, y: number, z: number) => {
        this.player.pos.set(x, y, z);
        this.player.vel.set(0, 0, 0);
      },
      run: () => ({ ...this.run }),
      pickups: () => this.level.pickups.map((p) => ({ kind: p.kind, x: p.x, y: p.y, z: p.z, taken: p.taken })),
      goal: () => ({ ...this.level.goal }),
      spawn: () => ({ ...this.level.spawn }),
      counts: () => ({
        calls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
      }),
      setTime: (t: number) => { this.run.time = t; },
      setHearts: (n: number) => { this.run.hearts = Math.max(0, Math.min(3, n)); },
      setInvuln: (t: number) => { this.run.invulnT = Math.max(0, t); },
      grumps: () => this.level.grumps.map((g) => ({ x: g.x, y: g.y, z: g.z, alive: g.alive })),
      lastGrumpHit: () => this.lastGrumpHit,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop.stop();
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.hud.dispose();
    this.audio.dispose();
    this.touch.dispose();
    this.input.dispose();
    this.world.dispose();
    this.player.dispose();
    this.renderer.dispose();
    window.__GAME_READY__ = false;
  }
}

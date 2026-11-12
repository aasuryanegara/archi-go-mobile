/**
 * audio.ts — Web Audio synthesized SFX + adaptive step-sequenced music + mute toggle
 * (remembered in localStorage). No audio asset files — everything is synthesized at runtime.
 *
 * Music has two layers: a calm waltz-ish bed on the title screen, and a busier bounce
 * groove during play that adds a bass line + hats. A "danger" layer (fast pulse) joins
 * when the clock runs low. Layers follow the game state and the remaining time.
 */

export type SfxId =
  | "jump"
  | "doubleJump"
  | "land"
  | "coin"
  | "gem"
  | "powerup"
  | "hurt"
  | "shieldBreak"
  | "bounce"
  | "ui"
  | "buy"
  | "deny"
  | "tick"
  | "win"
  | "lose"
  | "portal";

const MUTE_KEY = "archigo.muted";
const LEGACY_MUTE_KEY = "puffhop.muted";

// localStorage can throw (storage disabled, private mode, third-party storage blocked
// inside a preview iframe) — a game must never fail to start because of that.
function readMuted(): boolean {
  try {
    const current = localStorage.getItem(MUTE_KEY);
    if (current !== null) return current === "1";
    const legacy = localStorage.getItem(LEGACY_MUTE_KEY);
    if (legacy !== null) {
      localStorage.setItem(MUTE_KEY, legacy);
      return legacy === "1";
    }
    return false;
  } catch {
    return false;
  }
}
function writeMuted(v: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  } catch {
    // not persisted this session; the in-memory flag still works
  }
}

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private disposed = false;
  muted = false;

  // music state
  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private mode: "off" | "title" | "play" = "off";
  private danger = false;

  // browsers require a first user interaction before the AudioContext can start
  private readonly unlock = () => {
    this.ensureCtx();
    this.detachUnlock();
    // resume music if it was requested before the first gesture
    if (this.mode !== "off") this.scheduleLoop();
  };

  constructor() {
    this.muted = readMuted();
    window.addEventListener("pointerdown", this.unlock);
    window.addEventListener("keydown", this.unlock);
  }

  private detachUnlock(): void {
    window.removeEventListener("pointerdown", this.unlock);
    window.removeEventListener("keydown", this.unlock);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detachUnlock();
    this.stopMusic();
    this.master?.disconnect();
    this.master = null;
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx.state !== "closed") void ctx.close();
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    writeMuted(this.muted);
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  /** One-shot synthesized effect. */
  sfx(id: SfxId): void {
    if (this.disposed || this.muted) return;
    const ctx = this.ensureCtx();
    if (!this.master) return;
    const t = ctx.currentTime;
    const spec: Record<SfxId, { f0: number; f1: number; dur: number; gain: number; type?: OscillatorType }> = {
      jump: { f0: 320, f1: 620, dur: 0.14, gain: 0.22, type: "triangle" },
      doubleJump: { f0: 460, f1: 920, dur: 0.16, gain: 0.24, type: "triangle" },
      land: { f0: 180, f1: 90, dur: 0.09, gain: 0.18, type: "sine" },
      coin: { f0: 880, f1: 1320, dur: 0.11, gain: 0.22, type: "sine" },
      gem: { f0: 660, f1: 1760, dur: 0.28, gain: 0.26, type: "sine" },
      powerup: { f0: 392, f1: 1046, dur: 0.32, gain: 0.28, type: "square" },
      hurt: { f0: 220, f1: 55, dur: 0.28, gain: 0.34, type: "sawtooth" },
      shieldBreak: { f0: 520, f1: 130, dur: 0.2, gain: 0.3, type: "square" },
      bounce: { f0: 240, f1: 720, dur: 0.16, gain: 0.26, type: "sine" },
      ui: { f0: 440, f1: 520, dur: 0.05, gain: 0.14, type: "sine" },
      buy: { f0: 523, f1: 1046, dur: 0.22, gain: 0.26, type: "triangle" },
      deny: { f0: 200, f1: 120, dur: 0.16, gain: 0.22, type: "square" },
      tick: { f0: 980, f1: 980, dur: 0.05, gain: 0.16, type: "square" },
      win: { f0: 523, f1: 1568, dur: 0.6, gain: 0.3, type: "triangle" },
      lose: { f0: 220, f1: 55, dur: 0.6, gain: 0.3, type: "sawtooth" },
      portal: { f0: 330, f1: 1320, dur: 0.5, gain: 0.28, type: "sine" },
    };
    const s = spec[id];
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = s.type ?? "sine";
    osc.frequency.setValueAtTime(s.f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, s.f1), t + s.dur);
    env.gain.setValueAtTime(s.gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + s.dur);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + s.dur + 0.02);
    // sparkle tail on gem/win/portal
    if (id === "gem" || id === "win" || id === "portal") {
      const o2 = ctx.createOscillator();
      const e2 = ctx.createGain();
      o2.type = "sine";
      o2.frequency.setValueAtTime(s.f1 * 1.5, t + 0.06);
      o2.frequency.exponentialRampToValueAtTime(s.f1 * 2, t + s.dur + 0.15);
      e2.gain.setValueAtTime(0.0001, t);
      e2.gain.exponentialRampToValueAtTime(s.gain * 0.5, t + 0.08);
      e2.gain.exponentialRampToValueAtTime(0.001, t + s.dur + 0.18);
      o2.connect(e2).connect(this.master);
      o2.start(t);
      o2.stop(t + s.dur + 0.2);
    }
  }

  /** Switch music mode ("title" | "play") and the danger flag (low clock). */
  setMusic(mode: "title" | "play", danger = false): void {
    if (this.mode === mode && this.danger === danger) return;
    this.mode = mode;
    this.danger = danger;
    if (this.disposed) return;
    this.ensureCtx();
    this.scheduleLoop();
  }

  stopMusic(): void {
    this.mode = "off";
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  /** 8th-note steps; C major pentatonic melody over a I–vi–IV–V loop (2 bars per chord, 8 bars total). */
  private static readonly BPM = 112;
  private static readonly MELODY: number[] = [
    523, 0, 659, 0, 784, 0, 659, 523,
    587, 0, 698, 784, 0, 698, 587, 0,
    659, 0, 784, 880, 0, 784, 659, 587,
    523, 659, 784, 0, 1046, 0, 0, 0,
  ];
  private static readonly BASS_ROOTS = [131, 110, 87, 98]; // C A F G

  private scheduleLoop(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    const ctx = this.ctx;
    if (!ctx || !this.master || this.mode === "off") return;
    this.step = 0;
    this.nextNoteTime = ctx.currentTime + 0.08;
    const stepDur = 60 / AudioSystem.BPM / 2; // 8th notes
    this.musicTimer = window.setInterval(() => {
      if (this.disposed || !this.ctx) return;
      const ahead = this.ctx.currentTime + 0.18;
      while (this.nextNoteTime < ahead) {
        this.scheduleStep(this.step, this.nextNoteTime, stepDur);
        this.nextNoteTime += stepDur;
        this.step = (this.step + 1) % 64;
      }
    }, 90);
  }

  private scheduleStep(step: number, t: number, stepDur: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const bar = (step >> 3) % 8; // 8 bars of 8 steps
    const chord = bar >> 1; // each chord lasts 2 bars

    // melody (always on)
    const f = AudioSystem.MELODY[step % 32];
    if (f > 0) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = this.mode === "title" ? "sine" : "triangle";
      osc.frequency.value = this.mode === "title" ? f : f * 1.001;
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(this.mode === "title" ? 0.09 : 0.11, t + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.8);
      osc.connect(env).connect(master);
      osc.start(t);
      osc.stop(t + stepDur * 2);
    }

    if (this.mode === "play") {
      // bass on beat
      if (step % 4 === 0) {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = AudioSystem.BASS_ROOTS[chord];
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(0.08, t + 0.015);
        env.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.9);
        osc.connect(env).connect(master);
        osc.start(t);
        osc.stop(t + stepDur * 2);
      }
      // hat on off-beat
      if (step % 2 === 1) {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = 6000;
        env.gain.setValueAtTime(0.018, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        osc.connect(env).connect(master);
        osc.start(t);
        osc.stop(t + 0.05);
      }
    }

    // danger pulse (low clock): urgent quarter-note beep every bar
    if (this.danger && step % 4 === 0) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = step % 8 === 0 ? 880 : 660;
      env.gain.setValueAtTime(0.05, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + stepDur);
      osc.connect(env).connect(master);
      osc.start(t);
      osc.stop(t + stepDur + 0.02);
    }
  }
}

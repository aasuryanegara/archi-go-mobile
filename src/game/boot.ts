/**
 * boot.ts — bootstrap for ARCHi Go. Mounts the Game onto the shell's canvas and
 * exposes the verification hooks (window.__gameProbe / __GAME_READY__).
 */

import { Game } from "./game";

declare global {
  interface Window {
    /** Player-coordinate probe — scripts/verify-game.mjs asserts direction mapping through it. */
    __gameProbe?: () => { x: number; y: number; z: number };
    /** Readiness signal — the self-check waits for it before screenshotting/asserting. */
    __GAME_READY__?: boolean;
    /** Invisible debug hooks for automated verification (not part of the UI). */
    __gameDebug?: ReturnType<Game["debugApi"]>;
  }
}

let game: Game | null = null;

export function startGame(canvas: HTMLCanvasElement, overlay: HTMLElement): void {
  stopGame();
  game = new Game(canvas, overlay);
  window.__gameProbe = () => game?.debugApi().pos() ?? { x: 0, y: 0, z: 0 };
  window.__gameDebug = game.debugApi();
}

export function stopGame(): void {
  game?.dispose();
  game = null;
  delete window.__gameProbe;
  delete window.__gameDebug;
  window.__GAME_READY__ = false;
}

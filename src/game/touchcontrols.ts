/**
 * touchcontrols.ts — on-screen controller for touch devices.
 *
 *   left side  : floating joystick (appears where the thumb lands) → Input.setStick (up = forward)
 *   right side : drag anywhere to orbit the camera → Input.addLookPixels
 *   JUMP button: bottom-right → Input "Space" action
 *
 * Shown only on touch devices (coarse pointer or after the first real touch) and only while
 * playing. Pure DOM, mounted next to the canvas (not inside the React-managed overlay).
 */

import type { Input } from "./input";

const STICK_RADIUS = 56; // px of thumb travel for full deflection

export class TouchControls {
  private readonly root = document.createElement("div");
  private readonly moveZone = document.createElement("div");
  private readonly lookZone = document.createElement("div");
  private readonly base = document.createElement("div");
  private readonly knob = document.createElement("div");
  private readonly jump = document.createElement("button");
  private stickId: number | null = null;
  private lookId: number | null = null;
  private jumpId: number | null = null;
  private origin = { x: 0, y: 0 };
  private last = { x: 0, y: 0 };
  private wantVisible = false;
  private enabled: boolean;
  private off: Array<() => void> = [];

  constructor(private readonly input: Input, parent: HTMLElement) {
    this.enabled = window.matchMedia?.("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    this.root.className = "touch-controls";
    this.moveZone.className = "tc-zone tc-move";
    this.lookZone.className = "tc-zone tc-look";
    this.base.className = "tc-base";
    this.knob.className = "tc-knob";
    this.base.appendChild(this.knob);
    this.jump.className = "tc-jump";
    this.jump.type = "button";
    this.jump.textContent = "JUMP";
    this.jump.setAttribute("aria-label", "Jump");
    this.root.append(this.moveZone, this.lookZone, this.base, this.jump);
    parent.appendChild(this.root);

    const on = (el: EventTarget, type: string, fn: (e: any) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn, opts);
      this.off.push(() => el.removeEventListener(type, fn, opts));
    };

    // Hybrid laptops: reveal the controller on the first genuine touch.
    on(window, "touchstart", () => { if (!this.enabled) { this.enabled = true; this.apply(); } }, { passive: true });
    on(this.root, "contextmenu", (e) => e.preventDefault());

    // --- joystick ---
    on(this.moveZone, "pointerdown", (e: PointerEvent) => {
      if (this.stickId !== null) return;
      e.preventDefault();
      this.stickId = e.pointerId;
      this.moveZone.setPointerCapture(e.pointerId);
      this.origin = { x: e.clientX, y: e.clientY };
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.base.style.bottom = "auto";
      this.base.classList.add("active");
      this.moveKnob(0, 0);
    });
    on(this.moveZone, "pointermove", (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      let dx = e.clientX - this.origin.x, dy = e.clientY - this.origin.y;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RADIUS) { dx = (dx / len) * STICK_RADIUS; dy = (dy / len) * STICK_RADIUS; }
      this.moveKnob(dx, dy);
      // push up = forward (+moveZ), push right = right (+moveX) — identical to WASD
      this.input.setStick(dx / STICK_RADIUS, -dy / STICK_RADIUS);
    });
    const endStick = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.releaseStick();
    };
    on(this.moveZone, "pointerup", endStick);
    on(this.moveZone, "pointercancel", endStick);
    on(this.moveZone, "lostpointercapture", endStick);

    // --- camera drag ---
    on(this.lookZone, "pointerdown", (e: PointerEvent) => {
      if (this.lookId !== null) return;
      e.preventDefault();
      this.lookId = e.pointerId;
      this.lookZone.setPointerCapture(e.pointerId);
      this.last = { x: e.clientX, y: e.clientY };
    });
    on(this.lookZone, "pointermove", (e: PointerEvent) => {
      if (e.pointerId !== this.lookId) return;
      this.input.addLookPixels(e.clientX - this.last.x, e.clientY - this.last.y);
      this.last = { x: e.clientX, y: e.clientY };
    });
    const endLook = (e: PointerEvent) => { if (e.pointerId === this.lookId) this.lookId = null; };
    on(this.lookZone, "pointerup", endLook);
    on(this.lookZone, "pointercancel", endLook);
    on(this.lookZone, "lostpointercapture", endLook);

    // --- jump ---
    on(this.jump, "pointerdown", (e: PointerEvent) => {
      e.preventDefault();
      this.jumpId = e.pointerId;
      this.jump.setPointerCapture(e.pointerId);
      this.jump.classList.add("down");
      this.input.pressAction("Space");
    });
    const endJump = (e: PointerEvent) => {
      if (e.pointerId !== this.jumpId) return;
      this.jumpId = null;
      this.jump.classList.remove("down");
    };
    on(this.jump, "pointerup", endJump);
    on(this.jump, "pointercancel", endJump);

    this.apply();
  }

  /** Show while playing, hide on every menu / pause / end screen. */
  setVisible(v: boolean): void {
    this.wantVisible = v;
    this.apply();
  }

  private apply(): void {
    const show = this.enabled && this.wantVisible;
    this.root.style.display = show ? "block" : "none";
    if (!show) { this.releaseStick(); this.lookId = null; this.jumpId = null; this.jump.classList.remove("down"); }
  }

  private moveKnob(dx: number, dy: number): void {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  private releaseStick(): void {
    this.stickId = null;
    this.base.classList.remove("active");
    this.base.style.left = this.base.style.top = this.base.style.bottom = "";
    this.moveKnob(0, 0);
    this.input.setStick(0, 0);
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off = [];
    this.root.remove();
  }
}

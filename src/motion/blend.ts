// Easings, interpolation and a timed crossfade weight
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

export type Easing = (x: number) => number;

export function clamp01(x: number): number {
  if (!(x > 0)) return 0;
  return x > 1 ? 1 : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Ken Perlin's smoother step: zero first and second derivative at both ends. */
export function smootherstep(x: number): number {
  const t = clamp01(x);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Overshoots a little past 1 before settling. */
export function easeOutBack(x: number, overshoot = 1.70158): number {
  const t = clamp01(x) - 1;
  return 1 + (overshoot + 1) * t * t * t + overshoot * t * t;
}

export function easeInOutCubic(x: number): number {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * A timed weight from 0 to 1 with eased progress. The motion engine uses one per mood layer to
 * blend the outgoing mood into the incoming one.
 */
export class Crossfade {
  private elapsedMs = 0;
  private durationMs: number;

  constructor(
    durationMs: number,
    private readonly easing: Easing = smootherstep,
    startDone = false
  ) {
    this.durationMs = Math.max(0, durationMs);
    if (startDone || this.durationMs === 0) this.elapsedMs = this.durationMs;
  }

  /** Begin again from 0, optionally with a new duration. */
  restart(durationMs: number = this.durationMs): void {
    this.durationMs = Math.max(0, durationMs);
    this.elapsedMs = 0;
  }

  advance(dtMs: number): void {
    if (dtMs > 0) this.elapsedMs = Math.min(this.durationMs, this.elapsedMs + dtMs);
  }

  /** Eased weight, 0 at the start and 1 when finished. */
  get weight(): number {
    if (this.durationMs === 0) return 1;
    return this.easing(this.elapsedMs / this.durationMs);
  }

  get done(): boolean {
    return this.elapsedMs >= this.durationMs;
  }
}

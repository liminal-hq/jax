// Critically damped spring smoothing for pose channels
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

export interface SpringState {
  value: number;
  velocity: number;
}

/**
 * Moves `current` toward `target` with a critically damped spring, the formulation from Game
 * Programming Gems 4 (as used by Unity's `SmoothDamp`). It never overshoots a step target, is exact
 * at `dt = 0` and stays stable for any `dt` (non-finite and negative values count as zero, huge
 * waits of eight smooth times or more land on the target).
 *
 * `smoothTime` is roughly the time to reach the target, in seconds. `maxSpeed` limits the speed
 * in units per second.
 */
export function smoothDamp(
  current: number,
  target: number,
  velocity: number,
  smoothTime: number,
  dt: number,
  maxSpeed = Infinity
): SpringState {
  if (!Number.isFinite(dt) || dt <= 0) return { value: current, velocity };
  const time = Math.max(0.0001, smoothTime);
  // Long enough to have settled completely: land on the target rather than integrate.
  if (dt >= time * 8) return { value: target, velocity: 0 };
  const step = dt;
  const omega = 2 / time;
  const x = omega * step;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const maxChange = maxSpeed * time;
  const change = Math.min(maxChange, Math.max(-maxChange, current - target));
  const limitedTarget = current - change;
  const temp = (velocity + omega * change) * step;
  let nextVelocity = (velocity - omega * temp) * decay;
  let value = limitedTarget + (change + temp) * decay;
  // Stop the polynomial approximation from carrying past the target.
  if (target - current > 0 === value > target) {
    value = target;
    nextVelocity = 0;
  }
  return { value, velocity: nextVelocity };
}

/** One animated number with its own target, velocity and smooth time. */
export class SpringChannel {
  value: number;
  velocity = 0;
  target: number;
  smoothTime: number;

  constructor(initial = 0, smoothTime = 0.18) {
    this.value = initial;
    this.target = initial;
    this.smoothTime = smoothTime;
  }

  /** Advance by `dt` seconds toward the current target. */
  step(dt: number, maxSpeed = Infinity): number {
    const next = smoothDamp(this.value, this.target, this.velocity, this.smoothTime, dt, maxSpeed);
    this.value = next.value;
    this.velocity = next.velocity;
    return this.value;
  }

  /** Jump to a value with no velocity. */
  snap(value: number): void {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }
}

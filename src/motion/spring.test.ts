// Tests for the critically damped spring helpers
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { SpringChannel, smoothDamp } from './spring.js';

function simulate(hz: number, seconds: number, from: number, to: number, smoothTime: number) {
  let value = from;
  let velocity = 0;
  const dt = 1 / hz;
  const steps = Math.round(seconds * hz);
  for (let i = 0; i < steps; i++)
    ({ value, velocity } = smoothDamp(value, to, velocity, smoothTime, dt));
  return { value, velocity };
}

describe('smoothDamp', () => {
  it('converges on the target', () => {
    const { value, velocity } = simulate(60, 3, 0, 1, 0.18);
    expect(value).toBeCloseTo(1, 4);
    expect(Math.abs(velocity)).toBeLessThan(1e-3);
  });

  it('never overshoots a step target, up or down', () => {
    for (const [from, to] of [
      [0, 1],
      [1, -2]
    ]) {
      let value = from;
      let velocity = 0;
      for (let i = 0; i < 600; i++) {
        ({ value, velocity } = smoothDamp(value, to, velocity, 0.2, 1 / 60));
        if (to > from) expect(value).toBeLessThanOrEqual(to + 1e-12);
        else expect(value).toBeGreaterThanOrEqual(to - 1e-12);
      }
    }
  });

  it('is exact at dt = 0', () => {
    const out = smoothDamp(0.3, 1, 0.7, 0.18, 0);
    expect(out.value).toBe(0.3);
    expect(out.velocity).toBe(0.7);
  });

  it('is frame-rate independent over one second', () => {
    const a = simulate(30, 1, 0, 1, 0.18);
    const b = simulate(60, 1, 0, 1, 0.18);
    const c = simulate(144 * 1, 1, 0, 1, 0.18);
    expect(Math.abs(a.value - b.value)).toBeLessThan(2e-3);
    expect(Math.abs(c.value - b.value)).toBeLessThan(2e-3);
    expect(Math.abs(a.velocity - c.velocity)).toBeLessThan(2e-2);
  });

  it('stays stable for huge, negative and non-finite dt', () => {
    for (const dt of [10, 1e6, -1, Number.NaN, Infinity]) {
      const out = smoothDamp(0, 1, 0.5, 0.18, dt);
      expect(Number.isFinite(out.value)).toBe(true);
      expect(Number.isFinite(out.velocity)).toBe(true);
      expect(out.value).toBeGreaterThanOrEqual(0);
      expect(out.value).toBeLessThanOrEqual(1);
    }
    expect(smoothDamp(0, 1, 0, 0.18, 1e6).value).toBeCloseTo(1, 2);
  });

  it('respects a speed limit', () => {
    const out = smoothDamp(0, 100, 0, 0.5, 0.1, 2);
    expect(out.value).toBeLessThan(0.5);
  });

  it('survives a zero smooth time', () => {
    const out = smoothDamp(0, 1, 0, 0, 1 / 60);
    expect(Number.isFinite(out.value)).toBe(true);
  });
});

describe('SpringChannel', () => {
  it('moves toward its target and settles', () => {
    const ch = new SpringChannel(0, 0.15);
    ch.target = 2;
    for (let i = 0; i < 300; i++) ch.step(1 / 60);
    expect(ch.value).toBeCloseTo(2, 3);
  });

  it('can be snapped', () => {
    const ch = new SpringChannel(0);
    ch.snap(5);
    expect(ch.value).toBe(5);
    expect(ch.velocity).toBe(0);
    expect(ch.target).toBe(5);
  });
});

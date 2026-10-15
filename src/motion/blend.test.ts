// Tests for easings and the crossfade
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { Crossfade, clamp01, easeInOutCubic, easeOutBack, lerp, smootherstep } from './blend';

const samples = Array.from({ length: 101 }, (_, i) => i / 100);

describe('easings', () => {
  it('hit their endpoints', () => {
    for (const fn of [smootherstep, easeInOutCubic, easeOutBack]) {
      expect(fn(0)).toBeCloseTo(0, 10);
      expect(fn(1)).toBeCloseTo(1, 10);
    }
  });

  it('clamp their input', () => {
    expect(smootherstep(-3)).toBe(0);
    expect(smootherstep(4)).toBe(1);
    expect(clamp01(Number.NaN)).toBe(0);
  });

  it('rise monotonically for smootherstep and easeInOutCubic', () => {
    for (const fn of [smootherstep, easeInOutCubic]) {
      for (let i = 1; i < samples.length; i++)
        expect(fn(samples[i])).toBeGreaterThanOrEqual(fn(samples[i - 1]));
    }
  });

  it('has zero slope at both ends of smootherstep', () => {
    const h = 1e-4;
    expect((smootherstep(h) - smootherstep(0)) / h).toBeLessThan(1e-3);
    expect((smootherstep(1) - smootherstep(1 - h)) / h).toBeLessThan(1e-3);
    expect(smootherstep(0.5)).toBeCloseTo(0.5, 10);
  });

  it('overshoots slightly with easeOutBack', () => {
    expect(Math.max(...samples.map(easeOutBack))).toBeGreaterThan(1);
  });

  it('lerps', () => {
    expect(lerp(2, 4, 0.25)).toBe(2.5);
  });
});

describe('Crossfade', () => {
  it('starts at 0 and finishes at 1', () => {
    const fade = new Crossfade(500);
    expect(fade.weight).toBe(0);
    expect(fade.done).toBe(false);
    fade.advance(500);
    expect(fade.weight).toBe(1);
    expect(fade.done).toBe(true);
  });

  it('rises monotonically with eased progress', () => {
    const fade = new Crossfade(400);
    let last = 0;
    for (let i = 0; i < 60; i++) {
      fade.advance(10);
      expect(fade.weight).toBeGreaterThanOrEqual(last);
      last = fade.weight;
    }
    expect(last).toBe(1);
  });

  it('can start finished and be restarted', () => {
    const fade = new Crossfade(300, smootherstep, true);
    expect(fade.weight).toBe(1);
    fade.restart(600);
    expect(fade.weight).toBe(0);
    fade.advance(300);
    expect(fade.weight).toBeCloseTo(0.5, 6);
  });

  it('treats a zero duration as instantly done', () => {
    const fade = new Crossfade(0);
    expect(fade.weight).toBe(1);
  });
});

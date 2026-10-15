// Tests for the shared contract helpers
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import {
  IDLE_ROTATION,
  MOODS,
  POSE_CHANNELS,
  PROP_CHANNELS,
  SUSTAINED_MOODS,
  TRANSIENT_MOODS,
  neutralPose
} from './types.js';

describe('the contract', () => {
  it('has a neutral pose with one value per channel and open eyes', () => {
    const pose = neutralPose();
    expect(Object.keys(pose).sort()).toEqual([...POSE_CHANNELS].sort());
    expect(pose.eyeOpen).toBe(1);
    expect(pose.bodyBob).toBe(0);
  });

  it('returns a fresh neutral pose each time', () => {
    const a = neutralPose();
    a.tail = 5;
    expect(neutralPose().tail).toBe(0);
  });

  it('lists prop channels separately from body channels', () => {
    expect(PROP_CHANNELS).toContain('propMug');
    expect(PROP_CHANNELS).not.toContain('tail');
  });

  it('carries the book, page, thumb and roll channels', () => {
    for (const channel of ['bodyRoll', 'pageFlip', 'propBook', 'propThumb'] as const) {
      expect(POSE_CHANNELS).toContain(channel);
    }
    expect(PROP_CHANNELS).toContain('propBook');
    expect(PROP_CHANNELS).toContain('propThumb');
    expect(PROP_CHANNELS).not.toContain('pageFlip');
    expect(PROP_CHANNELS).not.toContain('bodyRoll');
  });

  it('shows the book at rest and nothing else', () => {
    const pose = neutralPose();
    expect(pose.propBook).toBe(1);
    const others = PROP_CHANNELS.filter((c) => c !== 'propBook').map((c) => pose[c]);
    expect(others.every((v) => v === 0)).toBe(true);
  });

  it('keeps transient, sustained and idle moods inside the mood list and apart', () => {
    for (const mood of [...TRANSIENT_MOODS, ...SUSTAINED_MOODS, ...IDLE_ROTATION]) {
      expect(MOODS).toContain(mood);
    }
    expect(TRANSIENT_MOODS.filter((m) => SUSTAINED_MOODS.includes(m))).toEqual([]);
  });
});

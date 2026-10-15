// Tests for the motion engine: continuity, props, reduced motion, gestures and determinism
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import { MOODS, POSE_CHANNELS, type Mood, type Pose, type PoseChannel } from '../types';
import { createMotion, type MotionEngineOptions } from './motion';
import { defaultPatterns } from './patterns';

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const H = 1 / 120;

function engine(options: Partial<MotionEngineOptions> = {}) {
  return createMotion({ patterns: defaultPatterns, random: seeded(5), ...options });
}

/** Steps at `hz` for `seconds` and returns a copy of each pose. */
function run(motion: ReturnType<typeof engine>, seconds: number, hz = 120): Pose[] {
  const out: Pose[] = [];
  const steps = Math.round(seconds * hz);
  for (let i = 0; i < steps; i++) out.push({ ...motion.step(1 / hz) });
  return out;
}

const channelsExceptEyes = POSE_CHANNELS.filter((c) => c !== 'eyeOpen');

function worstSteps(poses: Pose[], from: number) {
  let step = 0;
  let accel = 0;
  for (const channel of channelsExceptEyes) {
    for (let i = from + 2; i < poses.length; i++) {
      const a = poses[i][channel] - poses[i - 1][channel];
      const b = poses[i - 1][channel] - poses[i - 2][channel];
      step = Math.max(step, Math.abs(a));
      accel = Math.max(accel, Math.abs(a - b));
    }
  }
  return { step, accel };
}

function change(from: Mood, to: Mood, after = 4) {
  const motion = engine();
  motion.setMood(from);
  const poses = run(motion, 6);
  const at = poses.length;
  motion.setMood(to);
  poses.push(...run(motion, after));
  return { poses, at };
}

describe('poses', () => {
  it.each(MOODS)('is a full pose of finite numbers in %s', (mood) => {
    const motion = engine();
    motion.setMood(mood);
    const bad: string[] = [];
    for (const pose of run(motion, 5, 60)) {
      if (Object.keys(pose).length !== POSE_CHANNELS.length) bad.push('channel count');
      for (const channel of POSE_CHANNELS) {
        if (!Number.isFinite(pose[channel])) bad.push(`${channel} not finite`);
        if (channel.startsWith('prop') && (pose[channel] < 0 || pose[channel] > 1))
          bad.push(channel);
      }
    }
    expect(bad).toEqual([]);
  });

  it('has a pattern for every mood', () => {
    expect(defaultPatterns.map((p) => p.mood).sort()).toEqual([...MOODS].sort());
  });
});

// The bounds are per 1/120 s step, in radians or model units, and were set from the measured worst
// cases with headroom. A calm peak (a 1 rad move over half a second) is about 0.016 per step, so
// 0.04 is more than twice that and a hard swap of any channel (0.2 or more) would fail by a mile.
// `accel` is the change in step from one sample to the next, so a velocity spike shows up here.
// Big moves (the party hop and spin, the 9 Hz wave, the scratch) are held to a looser ceiling,
// because those patterns are fast on purpose, though every transition is still crossfaded.
const CALM = { step: 0.04, accel: 0.006 };
const BIG = { step: 0.12, accel: 0.05 };
const IMMEDIATE_STEP = 0.004;

describe('continuity (the smoothness proof)', () => {
  const calmPairs: [Mood, Mood][] = [
    ['chill', 'tea'],
    ['tea', 'flipping'],
    ['flipping', 'fishing'],
    ['fishing', 'writing'],
    ['writing', 'checking'],
    ['checking', 'printing'],
    ['printing', 'chill'],
    ['chill', 'nap'],
    ['nap', 'chill'],
    ['nap', 'fishing']
  ];
  const bigPairs: [Mood, Mood][] = [
    ['chill', 'party'],
    ['party', 'chill'],
    ['chill', 'wave'],
    ['tea', 'thumbsup'],
    ['writing', 'stuck']
  ];
  const pairs = [...calmPairs, ...bigPairs];

  it.each(calmPairs)('%s to %s has no jump in position or velocity', (from, to) => {
    const { poses, at } = change(from, to);
    const worst = worstSteps(poses, at);
    expect(worst.step).toBeLessThan(CALM.step);
    expect(worst.accel).toBeLessThan(CALM.accel);
  });

  it.each(bigPairs)('%s to %s stays within the ceiling for big moves', (from, to) => {
    const { poses, at } = change(from, to);
    const worst = worstSteps(poses, at);
    expect(worst.step).toBeLessThan(BIG.step);
    expect(worst.accel).toBeLessThan(BIG.accel);
  });

  it.each(pairs)('%s to %s does not move at the instant of the change', (from, to) => {
    const { poses, at } = change(from, to);
    // The incoming mood starts at zero weight, so the first moments carry on as before: no step
    // beyond what the old mood was already doing, plus a sliver for the new one's first push.
    const worst: string[] = [];
    for (const channel of channelsExceptEyes) {
      let before = 0;
      for (let i = at - 20; i < at; i++) {
        before = Math.max(before, Math.abs(poses[i][channel] - poses[i - 1][channel]));
      }
      for (let i = at; i < at + 10; i++) {
        const now = Math.abs(poses[i][channel] - poses[i - 1][channel]);
        if (now > before + IMMEDIATE_STEP) worst.push(`${channel} ${now} > ${before}`);
      }
    }
    expect(worst).toEqual([]);
  });

  it('keeps velocity continuous when a mood is interrupted mid-blend', () => {
    const motion = engine();
    motion.setMood('writing');
    const poses = run(motion, 3);
    const at = poses.length;
    motion.setMood('tea');
    poses.push(...run(motion, 0.3));
    motion.setMood('nap'); // dwell may hold this back; either way nothing may jump
    poses.push(...run(motion, 4));
    const worst = worstSteps(poses, at);
    expect(worst.accel).toBeLessThan(CALM.accel);
    expect(worst.step).toBeLessThan(CALM.step);
  });

  it('does not unwind a full spin after the party', () => {
    const motion = engine();
    motion.setMood('party');
    const poses = run(motion, 3.6);
    poses.push(...run(motion, 6));
    const end = poses.filter((_, i) => i > 450).map((p) => p.bodyYaw);
    expect(Math.min(...end)).toBeGreaterThan(Math.PI * 2 - 0.6);
  });
});

describe('props', () => {
  it('ramp in monotonically from 0 to their target, and back out', () => {
    const motion = engine();
    motion.setMood('chill');
    run(motion, 3);
    motion.setMood('tea');
    const up = run(motion, 4).map((p) => p.propMug);
    expect(up[0]).toBeLessThan(0.01);
    for (let i = 1; i < up.length; i++) expect(up[i]).toBeGreaterThanOrEqual(up[i - 1] - 1e-12);
    expect(up[up.length - 1]).toBeGreaterThan(0.99);
    motion.setMood('chill');
    const down = run(motion, 4).map((p) => p.propMug);
    for (let i = 1; i < down.length; i++) expect(down[i]).toBeLessThanOrEqual(down[i - 1] + 1e-12);
    expect(down[down.length - 1]).toBeLessThan(0.01);
  });

  it('shows the right props for the moods', () => {
    const expectations: [Mood, PoseChannel][] = [
      ['flipping', 'propPage'],
      ['writing', 'propPencil'],
      ['checking', 'propMagnifier'],
      ['fishing', 'propRod'],
      ['tea', 'propMug'],
      ['printing', 'propPrinter'],
      ['party', 'propHat'],
      ['nap', 'propWater']
    ];
    for (const [mood, channel] of expectations) {
      const motion = engine();
      motion.setMood(mood);
      const poses = run(motion, 2.5);
      expect(poses[poses.length - 1][channel]).toBeGreaterThan(0.9);
    }
  });
});

describe('book, page, thumb and roll channels', () => {
  const bookAway: Mood[] = ['checking', 'fishing', 'tea', 'party', 'printing', 'nap'];

  it('keeps every new channel finite through every mood', () => {
    for (const mood of MOODS) {
      const motion = engine();
      motion.setMood(mood);
      for (const pose of run(motion, 8, 60)) {
        for (const channel of ['bodyRoll', 'pageFlip', 'propBook', 'propThumb'] as const) {
          expect(Number.isFinite(pose[channel]), `${mood} ${channel}`).toBe(true);
        }
      }
    }
  });

  it('puts the book away in the moods that hold something else, and shows it otherwise', () => {
    for (const mood of MOODS) {
      const motion = engine();
      motion.setMood(mood);
      const last = run(motion, 3)[359];
      if (bookAway.includes(mood)) expect(last.propBook, mood).toBeLessThan(0.05);
      else expect(last.propBook, mood).toBeGreaterThan(0.95);
    }
  });

  it('ramps the book away and back without wobbling', () => {
    const motion = engine();
    motion.setMood('tea');
    const away = run(motion, 4).map((p) => p.propBook);
    for (let i = 1; i < away.length; i++) expect(away[i]).toBeLessThanOrEqual(away[i - 1] + 1e-9);
    motion.setMood('chill');
    const back = run(motion, 4).map((p) => p.propBook);
    for (let i = 1; i < back.length; i++)
      expect(back[i]).toBeGreaterThanOrEqual(back[i - 1] - 1e-9);
  });

  it('raises the thumb with the arm and lowers it again, each monotonic', () => {
    const motion = engine();
    motion.setMood('thumbsup');
    const poses = run(motion, 1.2);
    const rising = poses.map((p) => p.propThumb);
    for (let i = 1; i < rising.length; i++) {
      expect(rising[i]).toBeGreaterThanOrEqual(rising[i - 1] - 1e-9);
    }
    expect(rising[rising.length - 1]).toBeGreaterThan(0.9);
    const rest = run(motion, 5);
    const peak = rest.findIndex((p) => p.propThumb < 0.95);
    const falling = rest.slice(peak).map((p) => p.propThumb);
    for (let i = 1; i < falling.length; i++) {
      expect(falling[i]).toBeLessThanOrEqual(falling[i - 1] + 1e-9);
    }
    expect(falling[falling.length - 1]).toBeLessThan(0.01);
  });

  it('lies on his back for a nap and stands up again', () => {
    const motion = engine();
    motion.setMood('nap');
    const napping = run(motion, 6)[719];
    expect(napping.bodyRoll).toBeLessThan(-1.2);
    motion.setMood('chill');
    expect(Math.abs(run(motion, 6)[719].bodyRoll)).toBeLessThan(0.05);
  });

  it('swings the page over the book while flipping, between 0 and 1', () => {
    const motion = engine();
    motion.setMood('flipping');
    const flips = run(motion, 10).map((p) => p.pageFlip);
    expect(Math.max(...flips)).toBeGreaterThan(0.8);
    expect(Math.min(...flips)).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.max(...flips)).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe('reduced motion', () => {
  it('has still patterns', () => {
    for (const pattern of defaultPatterns) {
      const a = pattern.target({ t: 0, random: () => 0.5, reducedMotion: true });
      const b = pattern.target({ t: 1.234, random: () => 0.5, reducedMotion: true });
      expect(b).toEqual(a);
    }
  });

  it.each(['chill', 'tea', 'fishing', 'writing', 'nap'] as Mood[])(
    'holds %s perfectly still',
    (mood) => {
      const motion = engine({ reducedMotion: true });
      motion.setMood(mood);
      run(motion, 12);
      const a = { ...motion.step(H) };
      run(motion, 1);
      const b = { ...motion.step(H) };
      for (const channel of POSE_CHANNELS) expect(b[channel]).toBeCloseTo(a[channel], 6);
    }
  );

  it('can be switched on and off while running', () => {
    const motion = engine();
    run(motion, 2);
    motion.setReducedMotion(true);
    run(motion, 4);
    const a = { ...motion.step(H) };
    run(motion, 1);
    const still = { ...motion.step(H) };
    for (const channel of POSE_CHANNELS) expect(still[channel]).toBeCloseTo(a[channel], 6);
    motion.setReducedMotion(false);
    run(motion, 3);
    const b = { ...motion.step(H) };
    run(motion, 1);
    expect({ ...motion.step(H) }).not.toEqual(b);
  });
});

describe('pet', () => {
  it('waves on top of the current mood and then returns', () => {
    const motion = engine();
    motion.setMood('chill');
    const before = run(motion, 4);
    const rest = before[before.length - 1].armRRaise;
    motion.pet();
    const during = run(motion, 2.4);
    expect(Math.max(...during.map((p) => p.armRRaise))).toBeGreaterThan(1.8);
    expect(motion.mood).toBe('chill');
    const after = run(motion, 3);
    expect(Math.abs(after[after.length - 1].armRRaise - rest)).toBeLessThan(0.05);
    const worst = worstSteps([...before.slice(-3), ...during, ...after], 0);
    expect(worst.step).toBeLessThan(BIG.step);
  });

  it('does not stack while one is running', () => {
    const motion = engine();
    run(motion, 1);
    motion.pet();
    run(motion, 1);
    motion.pet();
    const tail = run(motion, 4);
    expect(Math.abs(tail[tail.length - 1].armRRaise)).toBeLessThan(0.1);
  });
});

describe('time', () => {
  it('gives the same party at 30, 60 and 144 Hz', () => {
    const at = (hz: number, seconds: number) => {
      const motion = engine();
      motion.setMood('party');
      run(motion, seconds - 1 / hz, hz);
      return { ...motion.step(1 / hz) };
    };
    for (const seconds of [0.5, 1.2, 2, 3, 5]) {
      const a = at(30, seconds);
      const b = at(60, seconds);
      const c = at(144, seconds);
      for (const channel of channelsExceptEyes) {
        // Compare against the 60 Hz run, within a sliver of the channel's travel.
        expect(Math.abs(a[channel] - b[channel])).toBeLessThan(0.03);
        expect(Math.abs(c[channel] - b[channel])).toBeLessThan(0.03);
      }
    }
  });

  it('clamps a huge dt to 0.1 s, so a resumed tab does not lurch', () => {
    const a = engine();
    const b = engine();
    a.setMood('party');
    b.setMood('party');
    const pa = { ...a.step(30) };
    const pb = { ...b.step(0.1) };
    expect(pa).toEqual(pb);
  });

  it('ignores negative and non-finite dt', () => {
    const motion = engine();
    const a = { ...motion.step(0) };
    expect({ ...motion.step(-1) }).toEqual(a);
    expect({ ...motion.step(Number.NaN) }).toEqual(a);
  });

  it('is deterministic for a seed', () => {
    const trace = (seed: number) => {
      const motion = engine({ random: seeded(seed) });
      motion.setMood('writing');
      return JSON.stringify(run(motion, 20, 60));
    };
    expect(trace(1)).toBe(trace(1));
    expect(trace(1)).not.toBe(trace(2));
  });
});

describe('blinks', () => {
  it('happen every few seconds and last roughly 120 to 180 ms', () => {
    const motion = engine();
    const poses = run(motion, 60);
    const spans: number[] = [];
    let start = -1;
    poses.forEach((pose, i) => {
      if (pose.eyeOpen < 0.9 && start < 0) start = i;
      if (pose.eyeOpen >= 0.9 && start >= 0) {
        spans.push((i - start) * H);
        start = -1;
      }
    });
    expect(spans.length).toBeGreaterThanOrEqual(8);
    expect(spans.length).toBeLessThanOrEqual(30);
    for (const span of spans) {
      expect(span).toBeGreaterThanOrEqual(0.12);
      expect(span).toBeLessThanOrEqual(0.18);
    }
    expect(Math.min(...poses.map((p) => p.eyeOpen))).toBeLessThan(0.2);
  });

  it('keep his eyes shut in a nap', () => {
    const motion = engine();
    motion.setMood('nap');
    run(motion, 8);
    for (const pose of run(motion, 10)) expect(pose.eyeOpen).toBeLessThan(0.1);
  });
});

describe('moods', () => {
  it('holds a host mood until the next setMood', () => {
    const motion = engine();
    motion.setMood('writing');
    run(motion, 300);
    expect(motion.mood).toBe('writing');
    motion.setMood('tea');
    run(motion, 2);
    expect(motion.mood).toBe('tea');
  });

  it('returns a transient to chill', () => {
    const motion = engine();
    motion.setMood('writing');
    run(motion, 3);
    motion.setMood('wave');
    expect(motion.mood).toBe('wave');
    run(motion, 2.2);
    expect(motion.mood).toBe('wave');
    run(motion, 0.8);
    expect(motion.mood).toBe('chill');
  });

  it('does not idle or nap on its own without autoIdle', () => {
    const motion = engine();
    // No copies needed here, so step in the largest allowed slices.
    for (let i = 0; i < 2000; i++) motion.step(0.1);
    expect(motion.mood).toBe('chill');
  });

  it('rotates idle moods and naps with autoIdle, and wakes on setMood', () => {
    const motion = engine({ autoIdle: true, random: () => 0.1 });
    const seen = new Set<Mood>();
    for (let i = 0; i < 90; i++) {
      run(motion, 0.5, 60);
      seen.add(motion.mood);
    }
    expect(seen.has('flipping')).toBe(true);
    run(motion, 20, 60);
    expect(motion.mood).toBe('nap');
    motion.setMood('chill');
    run(motion, 2, 60);
    expect(motion.mood).toBe('chill');
  });

  it('wakes from a nap on activity, and puts the next nap off while there is some', () => {
    const motion = engine({ autoIdle: true, random: () => 0.1 });
    run(motion, 50, 60);
    expect(motion.mood).toBe('nap');
    motion.activity();
    run(motion, 2, 60);
    expect(motion.mood).not.toBe('nap');
    // Regular activity keeps him from napping for far longer than the nap delay.
    for (let i = 0; i < 100; i++) {
      run(motion, 1, 30);
      motion.activity();
    }
    expect(motion.mood).not.toBe('nap');
  });

  it('does not let activity change a mood the host is holding', () => {
    const motion = engine({ autoIdle: true, random: () => 0 });
    motion.setMood('writing');
    for (let i = 0; i < 30; i++) {
      run(motion, 2, 30);
      motion.activity();
    }
    expect(motion.mood).toBe('writing');
  });

  it('ignores activity without autoIdle', () => {
    const motion = engine();
    motion.activity();
    run(motion, 2, 30);
    expect(motion.mood).toBe('chill');
  });

  it('holds a host mood against the idle rotation', () => {
    const motion = engine({ autoIdle: true, random: () => 0 });
    motion.setMood('writing');
    for (let i = 0; i < 20; i++) run(motion, 10, 30);
    expect(motion.mood).toBe('writing');
  });
});

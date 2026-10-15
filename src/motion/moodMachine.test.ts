// Tests for the mood machine with fake time and injected random
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it } from 'vitest';
import type { Mood } from '../types.js';
import { createMoodMachine, type MoodMachineOptions } from './moodMachine.js';

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

function make(options: Partial<MoodMachineOptions> = {}, random: () => number = () => 0.99) {
  const clock = { ms: 0 };
  const machine = createMoodMachine({ now: () => clock.ms, random, ...options });
  const advance = (ms: number, tick = 100): Mood => {
    const end = clock.ms + ms;
    while (clock.ms < end) {
      clock.ms = Math.min(end, clock.ms + tick);
      machine.step(clock.ms);
    }
    return machine.mood;
  };
  return { machine, clock, advance };
}

describe('mood machine basics', () => {
  it('starts in chill', () => {
    expect(make().machine.mood).toBe('chill');
  });

  it('plays a transient for its duration, then returns', () => {
    const { machine, advance } = make();
    machine.request('wave');
    expect(advance(100)).toBe('wave');
    expect(advance(2200)).toBe('wave');
    expect(advance(200)).toBe('chill');
  });

  it.each([
    ['wave', 2400],
    ['thumbsup', 2600],
    ['stuck', 3200],
    ['party', 3200]
  ] as const)('plays %s for %d ms', (mood, ms) => {
    const { machine, advance } = make();
    machine.request(mood);
    advance(10);
    expect(advance(ms - 50 - 10)).toBe(mood);
    expect(advance(100)).toBe('chill');
  });

  it('returns to what was running after a transient', () => {
    const { machine, advance } = make();
    machine.request('writing');
    advance(2000);
    machine.request('wave');
    expect(advance(100)).toBe('wave');
    expect(advance(2600)).toBe('writing');
  });

  it('holds a sustained mood until it is released', () => {
    const { machine, advance } = make();
    machine.request('checking');
    expect(advance(120_000)).toBe('checking');
    machine.release('checking');
    expect(advance(1500)).toBe('chill');
  });

  it('prefers the most recent sustained request and falls back when it is released', () => {
    const { machine, advance } = make();
    machine.request('writing');
    advance(2000);
    machine.request('printing');
    expect(advance(2000)).toBe('printing');
    machine.release('printing');
    expect(advance(2000)).toBe('writing');
  });

  it('gives transients priority over sustained moods', () => {
    const { machine, advance } = make();
    machine.request('printing');
    advance(2000);
    machine.request('party');
    expect(advance(500)).toBe('party');
  });
});

describe('minimum dwell', () => {
  it('does not leave a mood before the dwell time', () => {
    const { machine, advance } = make();
    machine.request('writing');
    advance(100);
    machine.release('writing');
    expect(advance(500)).toBe('writing');
    expect(advance(700)).toBe('chill');
  });

  it('honours a custom dwell and applies to the first change only after it', () => {
    const { machine, advance } = make({ minDwellMs: 300 });
    machine.request('writing');
    expect(advance(100)).toBe('writing');
    machine.release('writing');
    expect(advance(100)).toBe('writing');
    expect(advance(200)).toBe('chill');
  });

  it('does not flap when requests alternate quickly', () => {
    const { machine, clock } = make();
    const changes: number[] = [];
    let last: Mood = machine.mood;
    for (let i = 0; i < 100; i++) {
      clock.ms += 100;
      if (i % 2) machine.release('writing');
      else machine.request('writing');
      machine.step(clock.ms);
      if (machine.mood !== last) {
        changes.push(clock.ms);
        last = machine.mood;
      }
    }
    for (let i = 1; i < changes.length; i++)
      expect(changes[i] - changes[i - 1]).toBeGreaterThanOrEqual(1200);
  });
});

describe('transient queue', () => {
  it('queues one transient behind the playing one and replaces the queued one', () => {
    const { machine, advance } = make();
    machine.request('wave');
    advance(100);
    machine.request('stuck');
    machine.request('thumbsup');
    expect(advance(2000)).toBe('wave');
    expect(advance(500)).toBe('thumbsup');
    expect(advance(2600)).toBe('chill');
  });

  it('ignores a repeat of the transient already playing', () => {
    const { machine, advance } = make();
    machine.request('wave');
    advance(100);
    machine.request('wave');
    expect(advance(2400)).toBe('chill');
  });
});

describe('nap and idle', () => {
  it('naps after 45 s of no activity and wakes on activity', () => {
    const { machine, advance } = make();
    expect(advance(44_000)).not.toBe('nap');
    expect(advance(2500)).toBe('nap');
    machine.activity();
    expect(advance(200)).toBe('chill');
  });

  it('resets the nap timer on activity', () => {
    const { machine, advance } = make();
    advance(40_000);
    machine.activity();
    expect(advance(40_000)).not.toBe('nap');
    expect(advance(6000)).toBe('nap');
  });

  it('honours a custom nap time', () => {
    const { advance } = make({ napAfterMs: 10_000 });
    expect(advance(11_000)).toBe('nap');
  });

  it('never naps while a sustained mood holds', () => {
    const { machine, advance } = make();
    machine.request('writing');
    expect(advance(200_000)).toBe('writing');
    machine.release('writing');
    advance(1500);
    expect(machine.mood).toBe('chill');
  });

  it('does not rotate before 15 s of quiet', () => {
    const { advance } = make({}, () => 0);
    expect(advance(15_000)).toBe('chill');
  });

  it('rotates through the idle moods in order when the roll succeeds', () => {
    const { advance } = make({ napAfterMs: Infinity }, () => 0.1);
    advance(20_000);
    const seen: Mood[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(advance(100));
      advance(4900);
    }
    expect(seen.slice(0, 3)).toEqual(['flipping', 'fishing', 'tea']);
  });

  it('does not rotate when the roll fails (0.35 is the cut-off)', () => {
    const { advance } = make({ napAfterMs: Infinity }, () => 0.35);
    expect(advance(60_000)).toBe('chill');
  });

  it('rotates at roughly 35 % per roll with a seeded random', () => {
    let rotations = 0;
    const rolls = 400;
    const { machine, clock } = make({ napAfterMs: Infinity, minDwellMs: 0 }, seeded(7));
    let last: Mood = 'chill';
    for (let i = 0; i < rolls * 50; i++) {
      clock.ms += 100;
      machine.step(clock.ms);
      if (machine.mood !== last) {
        rotations++;
        last = machine.mood;
      }
    }
    const rate = rotations / ((rolls * 50 * 100) / 5000 - 3);
    expect(rate).toBeGreaterThan(0.28);
    expect(rate).toBeLessThan(0.42);
  });

  it('never rotates while a sustained mood holds', () => {
    const { machine, advance } = make({ napAfterMs: Infinity }, () => 0);
    machine.request('checking');
    expect(advance(120_000)).toBe('checking');
  });

  it('returns to chill on activity during idle rotation', () => {
    const { machine, advance } = make({ napAfterMs: Infinity }, () => 0);
    advance(21_000);
    expect(machine.mood).not.toBe('chill');
    machine.activity();
    expect(advance(200)).toBe('chill');
  });

  it('can switch idle behaviour off', () => {
    const { advance } = make({ napAfterMs: Infinity, idleChance: 0 }, () => 0);
    expect(advance(120_000)).toBe('chill');
  });
});

describe('determinism', () => {
  it('gives the same sequence for the same seed', () => {
    const run = (seed: number) => {
      const { machine, clock } = make({ napAfterMs: 90_000 }, seeded(seed));
      const trace: Mood[] = [];
      for (let i = 0; i < 2000; i++) {
        clock.ms += 100;
        machine.step(clock.ms);
        trace.push(machine.mood);
      }
      return trace.join(',');
    };
    expect(run(3)).toBe(run(3));
    expect(run(3)).not.toBe(run(4));
  });
});

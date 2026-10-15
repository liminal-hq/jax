// Pure mood state machine: priorities, transients, holds, nap and idle rotation
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { IDLE_ROTATION, TRANSIENT_MOODS, type AnimationPattern, type Mood } from '../types';

/** How long each transient mood plays when no pattern says otherwise, in milliseconds. */
export const TRANSIENT_DURATION_MS: Readonly<Partial<Record<Mood, number>>> = {
  wave: 2400,
  thumbsup: 2600,
  stuck: 3200,
  party: 3200
};

export interface MoodMachineOptions {
  /** The clock, in milliseconds. Injected so tests and hosts control time. Default `performance.now`. */
  now?: () => number;
  /** A random source in [0, 1). Default `Math.random`. */
  random?: () => number;
  /** Where transient durations come from (`durationMs`). Default: the built-in table. */
  patterns?: readonly AnimationPattern[];
  /** Quiet time before he naps. Default 45 000. `Infinity` turns napping off. */
  napAfterMs?: number;
  /** Quiet time before idle rotation starts. Default 15 000. */
  idleAfterMs?: number;
  /** Time between idle rotation rolls. Default 5 000. */
  idleCheckMs?: number;
  /** Chance that a roll moves on to the next idle mood. Default 0.35. `0` turns rotation off. */
  idleChance?: number;
  /** The idle moods, in order. Default `IDLE_ROTATION`. */
  idleRotation?: readonly Mood[];
  /** The least time any mood stays up before another takes over. Default 1 200. */
  minDwellMs?: number;
}

export interface MoodMachine {
  /** The mood he is in now. */
  readonly mood: Mood;
  /**
   * Ask for a mood. A transient plays for its duration, then hands back to whatever applies. If a
   * transient is already playing, one more is queued (a newer request replaces the queued one, and
   * repeating the one playing is ignored). Any other mood is held until `release`; when several are
   * held, the most recent request wins.
   */
  request(mood: Mood): void;
  /** Let go of a held mood. */
  release(mood: Mood): void;
  /**
   * Let go of every held mood and any queued transient. A transient already playing finishes. It
   * takes effect with the next `request`, `activity` or `step`, so `releaseAll()` then `request(x)`
   * goes straight to `x` without passing through chill.
   */
  releaseAll(): void;
  /** Something happened: wake from a nap and restart the quiet clock. */
  activity(): void;
  /** Advance to `nowMs` and return the mood. */
  step(nowMs: number): Mood;
}

const MAX_ROLLS_PER_STEP = 10_000;

/**
 * Priority, highest first: transients, held moods, nap (after `napAfterMs` of quiet), the idle
 * rotation (after `idleAfterMs` of quiet, with a chance roll every `idleCheckMs`), then chill.
 * Requests, releases and finished transients count as activity.
 */
export function createMoodMachine(options: MoodMachineOptions = {}): MoodMachine {
  const now = options.now ?? (() => performance.now());
  const random = options.random ?? Math.random;
  const napAfterMs = options.napAfterMs ?? 45_000;
  const idleAfterMs = options.idleAfterMs ?? 15_000;
  const idleCheckMs = Math.max(1, options.idleCheckMs ?? 5_000);
  const idleChance = options.idleChance ?? 0.35;
  const rotation = options.idleRotation?.length ? options.idleRotation : IDLE_ROTATION;
  const minDwellMs = options.minDwellMs ?? 1_200;

  const durationOf = (mood: Mood): number =>
    options.patterns?.find((p) => p.mood === mood)?.durationMs ??
    TRANSIENT_DURATION_MS[mood] ??
    2_400;

  let current: Mood = 'chill';
  let since = -Infinity;
  let transientEnd: number | null = null;
  let queued: Mood | null = null;
  let holds: Mood[] = [];
  let lastActivity = now();
  let idleIndex = 0;
  let idleRollAt = lastActivity + idleAfterMs + idleCheckMs;

  const touch = (at: number): void => {
    lastActivity = at;
    idleIndex = 0;
    idleRollAt = at + idleAfterMs + idleCheckMs;
  };

  const update = (at: number): Mood => {
    if (transientEnd !== null && at >= transientEnd) {
      touch(transientEnd);
      transientEnd = null;
    }

    const busy = transientEnd !== null || queued !== null || holds.length > 0;
    if (idleChance > 0) {
      let rolls = 0;
      while (
        at >= idleRollAt &&
        idleRollAt < lastActivity + napAfterMs &&
        rolls++ < MAX_ROLLS_PER_STEP
      ) {
        if (!busy && random() < idleChance) idleIndex = (idleIndex + 1) % rotation.length;
        idleRollAt += idleCheckMs;
      }
    }

    let desired: Mood;
    if (transientEnd !== null) desired = current;
    else if (queued !== null) desired = queued;
    else if (holds.length > 0) desired = holds[holds.length - 1];
    else if (at - lastActivity >= napAfterMs) desired = 'nap';
    else desired = idleChance > 0 ? rotation[idleIndex] : 'chill';

    if (desired !== current && at - since >= minDwellMs) {
      current = desired;
      since = at;
      if (queued === desired && TRANSIENT_MOODS.includes(desired)) {
        queued = null;
        transientEnd = at + durationOf(desired);
      }
    }
    return current;
  };

  return {
    get mood() {
      return current;
    },
    request(mood) {
      const at = now();
      touch(at);
      if (TRANSIENT_MOODS.includes(mood)) {
        const playing = transientEnd !== null && current === mood;
        if (!playing) queued = mood;
      } else {
        holds = holds.filter((m) => m !== mood);
        holds.push(mood);
      }
      update(at);
    },
    release(mood) {
      const at = now();
      holds = holds.filter((m) => m !== mood);
      touch(at);
      update(at);
    },
    releaseAll() {
      const at = now();
      holds = [];
      queued = null;
      touch(at);
    },
    activity() {
      const at = now();
      touch(at);
      update(at);
    },
    step: update
  };
}

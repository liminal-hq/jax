// The motion engine: layered, spring-smoothed, fixed-step and deterministic
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  POSE_CHANNELS,
  PROP_CHANNELS,
  neutralPose,
  type AnimationPattern,
  type Mood,
  type Motion,
  type MotionOptions,
  type Pose,
  type PoseChannel
} from '../types';
import { Crossfade, clamp01, lerp, smootherstep } from './blend';
import { createMoodMachine, type MoodMachineOptions } from './moodMachine';
import { defaultPatterns } from './patterns';
import { SpringChannel } from './spring';

/** The fixed internal step, in seconds. Every frame rate is folded onto this grid. */
export const MOTION_STEP_SECONDS = 1 / 120;
/** The largest `dt` one `step` call accepts, in seconds. Longer gaps (a resumed tab) are cut short. */
export const MOTION_MAX_DT_SECONDS = 0.1;

const TAU = Math.PI * 2;
const DEFAULT_BLEND_IN_MS = 500;
/** Leaving a nap always takes at least this long, so waking is slow and soft. */
const WAKE_BLEND_MS = 1200;
const DEFAULT_SMOOTH_TIME = 0.18;
const PROP_SMOOTH_TIME = 0.25;
const EYE_SMOOTH_TIME = 0.025;
const PET_FADE_IN_S = 0.3;
const PET_FADE_OUT_S = 0.5;
const BLINK_SECONDS = 0.17;
const BLINK_DEPTH = 0.96;

/** How much of the always-on base motion each mood lets through. Missing means all of it. */
const BASE_SCALE: Partial<Record<Mood, number>> = { nap: 0.35, party: 0.5 };

const ANGLE_CHANNELS: readonly PoseChannel[] = ['bodyYaw', 'headYaw'];

export interface MotionEngineOptions extends MotionOptions {
  /**
   * Let the engine rotate through idle moods (chill, flipping, fishing, tea) after quiet, and nap
   * after 45 s. Off by default: the host decides the mood with `setMood`.
   */
  autoIdle?: boolean;
  /** Crossfade time for patterns that do not set `blendInMs`, in milliseconds. Default 500. */
  blendInMs?: number;
  /** Overrides for the mood machine behind `autoIdle` and transient return. */
  machine?: Pick<
    MoodMachineOptions,
    'napAfterMs' | 'idleAfterMs' | 'idleCheckMs' | 'idleChance' | 'idleRotation' | 'minDwellMs'
  >;
}

interface Layer {
  mood: Mood;
  pattern: AnimationPattern;
  startedAt: number;
  fade: Crossfade;
}

const stillPattern = (mood: Mood): AnimationPattern => ({ mood, target: () => ({}) });

/**
 * Builds the motion engine. Three layers feed each channel's critically damped spring:
 *
 * 1. an always-on base (breathing, micro-sway, tail idle, scheduled blinks, slow gaze drift);
 * 2. the mood layer, where each mood change adds the new pattern and crossfades it over the old,
 *    so targets (and therefore the springs' velocities) stay continuous;
 * 3. gestures on top: `pet()` blends in a wave and blends back out.
 *
 * Time moves in fixed 1/120 s sub-steps (the input `dt` is clamped to 0.1 s) and the returned pose
 * is interpolated between the last two, so 30, 60 and 144 Hz callers get the same motion. The
 * result is deterministic for a given `random`. The returned pose object is reused between calls.
 *
 * Moods: `setMood` is the host's direct request. A held mood stays until the next `setMood`. A
 * transient (`wave`, `thumbsup`, `stuck`, `party`) plays for its duration and then returns to
 * `chill`, or to the idle rotation when `autoIdle` is on, not to the mood held before it. With
 * `autoIdle`, `setMood('chill')` hands control back to the idle rotation and nap. `mood` is the
 * mood in force now; it can trail a request by up to the minimum dwell (1.2 s) after a recent change.
 */
export function createMotion(options: MotionEngineOptions): Motion {
  const random = options.random ?? Math.random;
  const autoIdle = options.autoIdle === true;
  const defaultBlend = options.blendInMs ?? DEFAULT_BLEND_IN_MS;
  let reducedMotion = options.reducedMotion === true;

  const patterns = new Map<Mood, AnimationPattern>();
  for (const p of defaultPatterns) patterns.set(p.mood, p);
  for (const p of options.patterns) patterns.set(p.mood, p);
  const patternFor = (mood: Mood): AnimationPattern => patterns.get(mood) ?? stillPattern(mood);

  let timeSeconds = 0;
  let simMs = 0;
  const machine = createMoodMachine({
    now: () => simMs,
    random,
    patterns: [...patterns.values()],
    napAfterMs: autoIdle ? 45_000 : Infinity,
    idleChance: autoIdle ? 0.35 : 0,
    ...options.machine
  });

  const springs = {} as Record<PoseChannel, SpringChannel>;
  const neutral = neutralPose();
  for (const channel of POSE_CHANNELS) springs[channel] = new SpringChannel(neutral[channel]);

  const layers: Layer[] = [
    {
      mood: machine.mood,
      pattern: patternFor(machine.mood),
      startedAt: 0,
      fade: new Crossfade(0, smootherstep, true)
    }
  ];

  // Slow gaze drift and sway use unrelated periods and random phases, so the loop never reads as one.
  const phase = [random() * TAU, random() * TAU, random() * TAU, random() * TAU];
  let blinkStart = -1;
  let nextBlinkAt = 1.5 + random() * 3;
  let pet: { startedAt: number } | null = null;

  const previous = neutralPose();
  const current = neutralPose();
  const output = neutralPose();
  let carry = 0;

  const smoothTimeDefault = (channel: PoseChannel): number =>
    channel === 'eyeOpen'
      ? EYE_SMOOTH_TIME
      : PROP_CHANNELS.includes(channel)
        ? PROP_SMOOTH_TIME
        : DEFAULT_SMOOTH_TIME;

  const syncLayers = (): void => {
    const top = layers[layers.length - 1];
    if (machine.mood === top.mood) return;
    const slowWake = top.mood === 'nap' ? WAKE_BLEND_MS : 0;
    const pattern = patternFor(machine.mood);
    const ms = Math.max(pattern.blendInMs ?? defaultBlend, slowWake);
    layers.push({
      mood: machine.mood,
      pattern,
      startedAt: timeSeconds,
      fade: new Crossfade(ms)
    });
  };

  const patternTarget = (pattern: AnimationPattern, t: number): Partial<Pose> =>
    pattern.target({ t, random, reducedMotion });

  const blinkAmount = (): number => {
    if (reducedMotion) return 0;
    if (blinkStart < 0) {
      if (timeSeconds < nextBlinkAt) return 0;
      blinkStart = timeSeconds;
    }
    const u = (timeSeconds - blinkStart) / BLINK_SECONDS;
    if (u >= 1) {
      blinkStart = -1;
      // Now and then a quick double blink.
      nextBlinkAt = timeSeconds + (random() < 0.15 ? 0.22 : 2.5 + random() * 3.5);
      return 0;
    }
    return u < 0.4 ? smootherstep(u / 0.4) : 1 - smootherstep((u - 0.4) / 0.6);
  };

  const substep = (): void => {
    timeSeconds += MOTION_STEP_SECONDS;
    simMs = timeSeconds * 1000;
    machine.step(simMs);
    syncLayers();

    const stepMs = MOTION_STEP_SECONDS * 1000;
    for (const layer of layers) layer.fade.advance(stepMs);
    let settled = 0;
    for (let i = layers.length - 1; i > 0; i--) {
      if (layers[i].fade.done) {
        settled = i;
        break;
      }
    }
    if (settled > 0) layers.splice(0, settled);

    // Fold the layers oldest to newest: each blends toward its own targets by its crossfade weight.
    const target = neutralPose();
    const smooth = {} as Record<PoseChannel, number>;
    let baseScale = 1;
    layers.forEach((layer, index) => {
      const weight = index === 0 ? 1 : layer.fade.weight;
      const values = patternTarget(layer.pattern, timeSeconds - layer.startedAt);
      const scale = BASE_SCALE[layer.mood] ?? 1;
      baseScale = index === 0 ? scale : lerp(baseScale, scale, weight);
      for (const channel of POSE_CHANNELS) {
        let value = values[channel] ?? neutral[channel];
        if (ANGLE_CHANNELS.includes(channel)) {
          // Full turns are the same pose: aim at the nearest equivalent so spins never unwind.
          value += TAU * Math.round((springs[channel].value - value) / TAU);
        }
        const time = layer.pattern.smoothTime?.[channel] ?? smoothTimeDefault(channel);
        target[channel] = index === 0 ? value : lerp(target[channel], value, weight);
        smooth[channel] = index === 0 ? time : lerp(smooth[channel], time, weight);
      }
    });

    // Base layer.
    if (!reducedMotion) {
      const t = timeSeconds;
      target.bodyBob += 0.03 * baseScale * Math.sin((TAU * t) / 4.1);
      target.bodySquash += 0.012 * baseScale * Math.sin((TAU * t) / 4.1 - 0.8);
      target.headRoll += 0.035 * baseScale * Math.sin((TAU * t) / 7.3 + phase[0]);
      target.bodyYaw += 0.1 * baseScale * Math.sin((TAU * t) / 11.7 + phase[1]);
      target.tail += 0.12 * baseScale * Math.sin((TAU * t) / 2.9 + phase[2]);
      const gaze = (period: number, offset: number) =>
        (Math.sin((TAU * t) / period + offset) +
          0.5 * Math.sin((TAU * t) / (period * 0.41) + offset * 2)) /
        1.5;
      target.lookX += 0.25 * gaze(13.1, phase[3]);
      target.lookY += 0.15 * gaze(17.3, phase[0] + 1);
      target.eyeOpen *= 1 - BLINK_DEPTH * blinkAmount();
    }

    // Gestures on top.
    if (pet) {
      const wave = patternFor('wave');
      const length = (wave.durationMs ?? 2400) / 1000;
      const age = timeSeconds - pet.startedAt;
      if (age >= length) {
        pet = null;
      } else {
        const weight =
          smootherstep(age / PET_FADE_IN_S) *
          (1 - smootherstep((age - (length - PET_FADE_OUT_S)) / PET_FADE_OUT_S));
        const values = patternTarget(wave, age);
        for (const channel of POSE_CHANNELS) {
          const value = values[channel];
          if (value === undefined) continue;
          target[channel] = lerp(target[channel], value, weight);
          const time = wave.smoothTime?.[channel] ?? smoothTimeDefault(channel);
          smooth[channel] = lerp(smooth[channel], time, weight);
        }
      }
    }

    // Spring every channel toward its target.
    for (const channel of POSE_CHANNELS) {
      const spring = springs[channel];
      spring.smoothTime = smooth[channel];
      spring.target = target[channel];
      spring.step(MOTION_STEP_SECONDS);
      let value = spring.value;
      if (channel === 'eyeOpen' || PROP_CHANNELS.includes(channel)) value = clamp01(value);
      previous[channel] = current[channel];
      current[channel] = value;
    }
  };

  const motion: Motion = {
    get mood() {
      return machine.mood;
    },
    setMood(mood) {
      machine.releaseAll();
      if (autoIdle && mood === 'chill') machine.activity();
      else machine.request(mood);
      syncLayers();
    },
    pet() {
      if (machine.mood === 'wave' || pet) return;
      pet = { startedAt: timeSeconds };
    },
    setReducedMotion(on) {
      reducedMotion = on;
    },
    step(dt) {
      const clamped = Number.isFinite(dt) ? Math.min(MOTION_MAX_DT_SECONDS, Math.max(0, dt)) : 0;
      carry += clamped;
      while (carry >= MOTION_STEP_SECONDS - 1e-9) {
        carry -= MOTION_STEP_SECONDS;
        substep();
      }
      const blend = clamp01(carry / MOTION_STEP_SECONDS);
      for (const channel of POSE_CHANNELS) {
        output[channel] = lerp(previous[channel], current[channel], blend);
      }
      return output;
    }
  };
  return motion;
}

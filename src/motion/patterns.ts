// The default animation pattern for every mood, as pure functions of time
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { AnimationPattern, Mood, PatternContext, Pose } from '../types.js';
import { smootherstep } from './blend.js';
import { TRANSIENT_DURATION_MS } from './moodMachine.js';

// Channel conventions the patterns follow (the renderer maps them onto the model):
// - Angles are radians. `*Raise` lifts an arm outwards and up (0 hangs, about 2.4 is overhead) and
//   has the same sign for both arms; the renderer mirrors the left. `*Forward` swings it toward the viewer.
// - `headPitch` is positive when tipped down, `lookY` is positive when looking up.
// - `bodySquash` is positive when squashed (shorter and wider), negative when stretched.
// - `bodyLift` is a vertical offset in model units; `bodyBob` is the small breathing float.
// - `bodyRoll` is zero upright and about -pi/2 lying on his back. `pageFlip` swings the loose page over the book.
// - Prop channels are presence from 0 to 1. `propBook` is 1 at rest, so a pattern that puts the book
//   away sets it to 0 and one that does not mention it keeps the book showing.
// Base-layer motion (breathing, micro-sway, blinks, gaze drift) belongs to the engine, so patterns
// only describe what is particular to the mood.

const TAU = Math.PI * 2;

/** A sine wave with the given period in seconds. */
const osc = (t: number, period: number, phase = 0): number => Math.sin((TAU * t) / period + phase);

/** Eases from 0 to 1 between `a` and `b` seconds. */
const ramp = (t: number, a: number, b: number): number => smootherstep((t - a) / (b - a));

/** Rises between `a` and `b`, holds, then falls between `c` and `d`. */
const window = (t: number, a: number, b: number, c: number, d: number): number =>
  ramp(t, a, b) * (1 - ramp(t, c, d));

/** A smooth bump from 0 up to 1 and back to 0 across `a` to `b`. */
const bump = (t: number, a: number, b: number): number => {
  const s = Math.sin(Math.PI * Math.min(1, Math.max(0, (t - a) / (b - a))));
  return s * s;
};

/** A repeating position inside a cycle of `period` seconds. */
const cycle = (t: number, period: number): number => ((t % period) + period) % period;

type Target = Partial<Pose>;
type Make = (t: number, ctx: PatternContext) => Target;

function pattern(
  mood: Mood,
  still: Target,
  moving: Make,
  extra: Omit<AnimationPattern, 'mood' | 'target'> = {}
): AnimationPattern {
  return {
    mood,
    ...extra,
    target: (ctx) => (ctx.reducedMotion ? { ...still } : moving(ctx.t, ctx))
  };
}

const READING_PITCH = 0.16;

const chill = pattern(
  'chill',
  { headPitch: READING_PITCH, lookY: -0.3 },
  (t) => ({
    headPitch: READING_PITCH + 0.015 * osc(t, 6.1),
    headRoll: 0.04 * osc(t, 8.3),
    bodyYaw: 0.09 * osc(t, 9.7),
    tail: 0.3 * osc(t, 2.8),
    lookY: -0.3
  }),
  { smoothTime: { tail: 0.12 } }
);

const FLIP_PERIOD = 2.4;
const flipping = pattern(
  'flipping',
  { headPitch: READING_PITCH, propPage: 1, pageFlip: 0, lookY: -0.3 },
  (t) => {
    const c = cycle(t, FLIP_PERIOD) / FLIP_PERIOD;
    const lift = window(c, 0.18, 0.3, 0.75, 0.87);
    // The page swings over while the paw is up and swings back as it lowers.
    const flip = bump(c, 0.2, 0.85);
    return {
      headPitch: READING_PITCH + 0.03 * lift,
      headRoll: 0.03 * osc(t, 8.3),
      bodyYaw: 0.06 * osc(t, 9.7),
      armRRaise: 1.15 * lift,
      armRForward: 0.25 * lift,
      armLRaise: 0.25 * lift,
      tail: 0.2 * osc(t, 3.1),
      propPage: 1,
      pageFlip: flip,
      lookY: -0.3
    };
  }
);

const writing = pattern(
  'writing',
  { headPitch: 0.24, armRRaise: 0.25, propPencil: 1, lookY: -0.35 },
  (t) => {
    const scribble = osc(t, 0.5) * (0.7 + 0.3 * osc(t, 3.1));
    const line = osc(t, 3.3);
    return {
      headPitch: 0.24 + 0.02 * osc(t, 1.65),
      headYaw: 0.12 * line,
      lookX: 0.3 * line,
      lookY: -0.35,
      bodyYaw: 0.04 * line,
      armRRaise: 0.25 + 0.07 * scribble,
      armRForward: 0.25 + 0.05 * line,
      propPencil: 1,
      tail: 0.1 * osc(t, 3.9)
    };
  },
  { smoothTime: { armRRaise: 0.05, armRForward: 0.14 } }
);

const checking = pattern(
  'checking',
  { headPitch: 0.05, armRRaise: 1, armRForward: 0.3, propMagnifier: 1, propBook: 0 },
  (t) => {
    const sweep = osc(t, 5.2);
    return {
      bodyYaw: 0.25 * sweep,
      headYaw: 0.3 * sweep,
      headRoll: 0.1 * osc(t, 2.6),
      headPitch: 0.05,
      lookX: 0.5 * sweep,
      armRRaise: 1 + 0.3 * osc(t, 2.6),
      armRForward: 0.3,
      propMagnifier: 1,
      propBook: 0,
      tail: 0.15 * osc(t, 3.3)
    };
  },
  { smoothTime: { bodyYaw: 0.25, headYaw: 0.2 } }
);

const FISH_PERIOD = 7;
const fishing = pattern(
  'fishing',
  { bodyYaw: -0.3, armRRaise: 0.45, headRoll: -0.08, propRod: 1, propBook: 0 },
  (t) => {
    const c = cycle(t, FISH_PERIOD);
    // Cast, float, bite, reel in. Every term is zero at both ends of the cycle.
    const swing = c < 0.8 ? Math.sin(smootherstep(c / 0.8) * Math.PI) * 0.7 : 0;
    const bite = bump(c, 4.4, 5.6);
    const reel = bump(c, 5.8, 6.9);
    return {
      bodyYaw: -0.3 + 0.08 * osc(t, 15.7),
      headRoll: -0.08 - 0.08 * bite,
      headYaw: -0.1,
      lookX: 0.5,
      armRRaise: 0.45 + 0.08 * osc(t, 4.8) + 0.35 * bite + swing + 0.5 * reel,
      armRForward: 0.3 + 0.15 * reel,
      propRod: 1,
      propBook: 0,
      tail: 0.15 * osc(t, 3.7)
    };
  },
  { smoothTime: { bodyYaw: 0.3, armRRaise: 0.14 } }
);

const TEA_PERIOD = 5;
const tea = pattern(
  'tea',
  { armLRaise: 0.3, propMug: 1, propBook: 0, headPitch: 0.05 },
  (t) => {
    const c = cycle(t, TEA_PERIOD);
    const sip = window(c, 0.1, 0.55, 1.0, 1.45);
    return {
      armLRaise: 0.3 + 0.65 * sip,
      armLForward: 0.35 * sip,
      headPitch: 0.05 - 0.17 * sip,
      headRoll: 0.03 * osc(t, 8.3),
      propMug: 1,
      propBook: 0,
      tail: 0.2 * osc(t, 3.3)
    };
  },
  { smoothTime: { armLRaise: 0.2, headPitch: 0.22 } }
);

const wave = pattern(
  'wave',
  { armRRaise: 2.4, headRoll: 0.1 },
  (t) => {
    const arm = window(t, 0, 0.75, 1.85, 2.4);
    const flutter = window(t, 0.35, 0.65, 1.75, 2.1);
    return {
      armRRaise: 2.4 * arm + 0.7 * flutter * osc(t, 1 / 9),
      headRoll: 0.1 * arm,
      headPitch: -0.04 * arm,
      tail: 0.4 * arm * osc(t, 0.7)
    };
  },
  { durationMs: TRANSIENT_DURATION_MS.wave, blendInMs: 350, smoothTime: { armRRaise: 0.06 } }
);

const thumbsup = pattern(
  'thumbsup',
  { armRRaise: 1.8, headRoll: 0.12, propThumb: 1 },
  (t) => {
    const arm = window(t, 0, 0.5, 2.0, 2.6);
    return {
      armRRaise: 1.5 * arm + 0.3 * ramp(t, 0, 0.25) * (1 - ramp(t, 2.0, 2.6)),
      armRForward: 0.2 * arm,
      propThumb: ramp(t, 0.3, 0.7) * (1 - ramp(t, 1.9, 2.3)),
      headRoll: 0.12 * arm,
      bodyBob: 0.04 * bump(t, 0.3, 0.9),
      tail: 0.35 * arm * osc(t, 0.8)
    };
  },
  { durationMs: TRANSIENT_DURATION_MS.thumbsup, blendInMs: 400 }
);

const stuck = pattern(
  'stuck',
  { armRRaise: 2.75, headRoll: 0.2, headPitch: -0.06 },
  (t) => {
    const arm = window(t, 0, 0.9, 2.5, 3.2);
    return {
      armRRaise: 2.75 * arm + 0.1 * arm * osc(t, 0.45),
      headRoll: 0.2 * arm + 0.015 * osc(t, 0.45),
      headPitch: -0.06 * arm,
      lookY: 0.2 * arm,
      bodyYaw: 0.05 * arm
    };
  },
  { durationMs: TRANSIENT_DURATION_MS.stuck, blendInMs: 450, smoothTime: { armRRaise: 0.05 } }
);

const printing = pattern(
  'printing',
  { headPitch: 0.25, propPrinter: 1, propBook: 0, lookY: -0.3 },
  (t) => ({
    headPitch: 0.25 + 0.02 * osc(t, 1.8),
    headRoll: 0.03 * osc(t, 7.1),
    lookY: -0.3,
    propPrinter: 1,
    propBook: 0,
    tail: 0.12 * osc(t, 3.4)
  })
);

const party = pattern(
  'party',
  { armLRaise: 2.2, armRRaise: 2.2, propHat: 1, propConfetti: 1, propBook: 0 },
  (t) => {
    // Anticipation squat, then a hop with one full spin, then a soft landing.
    const hop = Math.min(1, Math.max(0, (t - 0.55) / 1.4));
    const air = Math.sin(Math.PI * hop) ** 2;
    const arms = ramp(t, 0.3, 0.95);
    return {
      bodySquash: 0.18 * bump(t, 0, 0.55) - 0.08 * air + 0.1 * bump(t, 1.95, 2.45),
      bodyLift: 0.5 * air - 0.05 * bump(t, 0, 0.55),
      bodyYaw: Math.PI * 2 * smootherstep(hop),
      headRoll: 0.08 * osc(t, 0.8),
      headPitch: -0.05 * arms,
      armLRaise: 2.2 * arms + 0.15 * osc(t, 0.8) * arms,
      armRRaise: 2.2 * arms - 0.15 * osc(t, 0.8) * arms,
      propHat: 1,
      propBook: 0,
      propConfetti: ramp(t, 0.7, 1.1),
      tail: 0.5 * osc(t, 0.5) * arms
    };
  },
  {
    durationMs: TRANSIENT_DURATION_MS.party,
    blendInMs: 350,
    smoothTime: { bodyLift: 0.08, bodySquash: 0.07, bodyYaw: 0.1, armLRaise: 0.12, armRRaise: 0.12 }
  }
);

const NAP_SLOW = 0.35;
/** Lying on his back: a quarter turn, a touch short of flat so the belly tilts to the viewer. */
const NAP_ROLL = -Math.PI / 2 + Math.PI * 0.04;
const nap = pattern(
  'nap',
  {
    bodyRoll: NAP_ROLL,
    bodyLift: 0,
    headRoll: 0.1,
    armLRaise: 0.5,
    armRRaise: 0.5,
    eyeOpen: 0.06,
    propWater: 1,
    propBook: 0
  },
  (t) => ({
    bodyRoll: NAP_ROLL + 0.03 * osc(t, 8.6),
    bodyLift: 0.06 * osc(t, 7),
    bodySquash: 0.02 * osc(t, 5),
    headRoll: 0.1 + 0.02 * osc(t, 9),
    armLRaise: 0.5,
    armRRaise: 0.5,
    eyeOpen: 0.06,
    propWater: 1,
    propBook: 0,
    tail: 0.15 * osc(t, 7.8)
  }),
  {
    blendInMs: 1400,
    smoothTime: {
      bodyRoll: 0.6,
      bodyLift: NAP_SLOW,
      bodySquash: NAP_SLOW,
      headRoll: NAP_SLOW,
      armLRaise: NAP_SLOW,
      armRRaise: NAP_SLOW,
      tail: NAP_SLOW,
      eyeOpen: 0.25,
      propWater: 0.5
    }
  }
);

/** One pattern for each of the twelve moods. */
export const defaultPatterns: AnimationPattern[] = [
  chill,
  flipping,
  writing,
  checking,
  fishing,
  tea,
  wave,
  thumbsup,
  stuck,
  printing,
  party,
  nap
];

// TEMPORARY stand-in motion: holds a neutral pose with a gentle bob until `createMotion` replaces it
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// This file exists only so the renderer and demo run before the motion engine is wired in. It has
// no springs, blending or mood patterns. Delete it when `createJax` uses `createMotion`.

import { neutralPose, type Mood, type Motion, type MotionOptions, type Pose } from '../types';

export function createStubMotion(options: MotionOptions): Motion {
  let mood: Mood = 'chill';
  let reduced = options.reducedMotion ?? false;
  let time = 0;
  const pose: Pose = neutralPose();

  return {
    get mood() {
      return mood;
    },
    setMood(next) {
      mood = next;
    },
    pet() {
      mood = 'wave';
    },
    setReducedMotion(on) {
      reduced = on;
    },
    step(dt) {
      time += Math.min(Math.max(dt, 0), 0.1);
      pose.bodyBob = reduced ? 0 : Math.sin(time * 1.6) * 0.05;
      return pose;
    }
  };
}

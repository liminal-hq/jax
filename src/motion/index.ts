// Public exports of the motion engine
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

export { createMotion, MOTION_MAX_DT_SECONDS, MOTION_STEP_SECONDS } from './motion.js';
export type { MotionEngineOptions } from './motion.js';
export { createMoodMachine, TRANSIENT_DURATION_MS } from './moodMachine.js';
export type { MoodMachine, MoodMachineOptions } from './moodMachine.js';
export { defaultPatterns } from './patterns.js';
export { smoothDamp, SpringChannel } from './spring.js';
export type { SpringState } from './spring.js';
export { Crossfade, clamp01, easeInOutCubic, easeOutBack, lerp, smootherstep } from './blend.js';
export type { Easing } from './blend.js';

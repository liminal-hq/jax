// Public exports of the motion engine
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

export { createMotion, MOTION_MAX_DT_SECONDS, MOTION_STEP_SECONDS } from './motion';
export type { MotionEngineOptions } from './motion';
export { createMoodMachine, TRANSIENT_DURATION_MS } from './moodMachine';
export type { MoodMachine, MoodMachineOptions } from './moodMachine';
export { defaultPatterns } from './patterns';
export { smoothDamp, SpringChannel } from './spring';
export type { SpringState } from './spring';
export { Crossfade, clamp01, easeInOutCubic, easeOutBack, lerp, smootherstep } from './blend';
export type { Easing } from './blend';

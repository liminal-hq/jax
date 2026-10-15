// The shared contract: moods, pose channels, animation patterns, skins and the public interfaces
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** Everything Jax can be doing. Each has one animation pattern. */
export const MOODS = [
  'chill',
  'flipping',
  'writing',
  'checking',
  'fishing',
  'tea',
  'wave',
  'thumbsup',
  'stuck',
  'printing',
  'party',
  'nap'
] as const;

export type Mood = (typeof MOODS)[number];

/** Moods that play once and then hand back to whatever was going on. */
export const TRANSIENT_MOODS: readonly Mood[] = ['wave', 'thumbsup', 'stuck', 'party'];

/** Moods an app holds on while something lasts, and releases when it ends. */
export const SUSTAINED_MOODS: readonly Mood[] = ['writing', 'checking', 'printing'];

/** The moods he drifts through when nothing is happening, in order. */
export const IDLE_ROTATION: readonly Mood[] = ['chill', 'flipping', 'fishing', 'tea'];

/**
 * Every animated number. Angles are radians, offsets are model units (the torso is about 2 units
 * tall), and the `prop*` channels are presence from 0 (hidden) to 1 (fully shown), which the
 * renderer turns into an enter or exit tween so props never pop.
 *
 * Sign conventions, shared by the motion engine and the renderer:
 *
 * - `bodyBob`: vertical float in model units, positive is up. `bodyLift` is a larger vertical offset
 *   with the same sign.
 * - `bodySquash`: positive squashes (shorter and wider), negative stretches.
 * - `bodyYaw`, `headYaw`: turn about the vertical axis, positive turns towards his left (the
 *   viewer's right). They are not wrapped: a spin may take them past plus or minus pi.
 * - `bodyRoll`: lean about the front-to-back axis. Zero is upright and about -pi/2 is lying on his
 *   back, as for a nap.
 * - `headPitch`: positive nods down. `headRoll`: tilts the head sideways.
 * - `armLRaise`, `armRRaise`: positive lifts the arm outwards and up, with the same sign for both
 *   arms (the renderer mirrors the left). Zero hangs at his side and about 2.4 is overhead.
 * - `armLForward`, `armRForward`: positive swings the arm towards the viewer.
 * - `tail`: sway of the tail about the vertical axis.
 * - `eyeOpen`: 1 is open, 0 is shut.
 * - `lookX`, `lookY`: where the eyes glance, positive is right and up as the viewer sees it.
 * - `pageFlip`: 0 to 1 swing of the loose page across the book.
 * - `propBook` is presence of the book he holds and is 1 at rest. `propThumb` is presence of the
 *   raised thumb. The other `prop*` channels are presence of one prop each.
 */
export const POSE_CHANNELS = [
  'bodyBob',
  'bodySquash',
  'bodyYaw',
  'bodyRoll',
  'bodyLift',
  'headYaw',
  'headPitch',
  'headRoll',
  'armLRaise',
  'armLForward',
  'armRRaise',
  'armRForward',
  'tail',
  'eyeOpen',
  'lookX',
  'lookY',
  'pageFlip',
  'propBook',
  'propPage',
  'propThumb',
  'propRod',
  'propMug',
  'propPencil',
  'propMagnifier',
  'propPrinter',
  'propHat',
  'propConfetti',
  'propWater'
] as const;

export type PoseChannel = (typeof POSE_CHANNELS)[number];

/** One value per channel. The renderer draws exactly this and never invents motion of its own. */
export type Pose = Record<PoseChannel, number>;

/** Channels that are prop presence rather than body motion. */
export const PROP_CHANNELS: readonly PoseChannel[] = POSE_CHANNELS.filter((c) =>
  c.startsWith('prop')
);

/** The resting pose: eyes open and the book showing, everything else at zero. */
export function neutralPose(): Pose {
  const pose = {} as Pose;
  for (const channel of POSE_CHANNELS) {
    pose[channel] = channel === 'eyeOpen' || channel === 'propBook' ? 1 : 0;
  }
  return pose;
}

/** What a pattern may read when it works out where its channels should be. */
export interface PatternContext {
  /** Seconds since this mood began. */
  t: number;
  /** A seeded or injected random source, for repeatable motion. */
  random: () => number;
  /** True when the user asked for reduced motion: patterns should return a still pose. */
  reducedMotion: boolean;
}

/**
 * The motion for one mood. `target` returns where each channel it cares about should be at time
 * `ctx.t`; channels it leaves out ease back to neutral. The motion engine smooths every channel
 * with a spring and crossfades between moods, so a pattern never needs to ease anything itself.
 */
export interface AnimationPattern {
  mood: Mood;
  target(ctx: PatternContext): Partial<Pose>;
  /** How long the crossfade into this mood takes, in milliseconds. Default 500. */
  blendInMs?: number;
  /** How long a transient mood plays before handing back, in milliseconds. */
  durationMs?: number;
  /** Per-channel spring smoothing time in seconds (smaller is snappier). Default 0.18. */
  smoothTime?: Partial<Record<PoseChannel, number>>;
}

/** Looks only; no behaviour. An app swaps skins to dress him differently. */
export interface Skin {
  name: string;
  /** Hex colours as numbers, e.g. `0xb8743a`. */
  colours: {
    fur: number;
    furDark: number;
    cream: number;
    nose: number;
    eye: number;
    shine: number;
    blush: number;
    book: number;
    pages: number;
    accent: number;
    prop: number;
    water: number;
  };
  /** The key light, fill and rim colours. */
  lights: { sky: number; ground: number; key: number; rim: number };
  /** Which props this skin allows. Missing means allowed. */
  props?: Partial<
    Record<
      | 'page'
      | 'thumb'
      | 'rod'
      | 'mug'
      | 'pencil'
      | 'magnifier'
      | 'printer'
      | 'hat'
      | 'confetti'
      | 'water',
      boolean
    >
  >;
}

export interface JaxOptions {
  skin?: Skin;
  patterns?: readonly AnimationPattern[];
  /** Width and height of the square canvas in CSS pixels. Default 120. */
  size?: number;
  /** Frame rate cap. Default 30. */
  fps?: number;
  /** Cap on the device pixel ratio. Default 2. */
  maxDpr?: number;
  /**
   * Let him drift between idle moods (chill, flipping, fishing, tea) when nothing is happening, and
   * nap after a long quiet. A mood set with `setMood` is held until the next one. Default `true`;
   * pass `false` to keep him on exactly the mood the app sets.
   */
  autoIdle?: boolean;
  /** Start with reduced motion on. The renderer also follows the system setting. */
  reducedMotion?: boolean;
  /** A class for the canvas element, so apps style it without inline styles. */
  canvasClass?: string;
}

/** A running companion. */
export interface Jax {
  readonly mood: Mood;
  setMood(mood: Mood): void;
  /** A friendly wave, as if he were petted. */
  pet(): void;
  /**
   * Tell him something is happening in the app. With `autoIdle`, he wakes if he is napping and puts
   * off the next nap and idle change, without changing a mood that is being held.
   */
  activity(): void;
  setReducedMotion(on: boolean): void;
  /** Stop, release the GPU and remove the canvas. Safe to call twice. */
  dispose(): void;
}

/** Drives the pose over time. Pure: no DOM, no WebGL, no clock of its own. */
export interface Motion {
  readonly mood: Mood;
  setMood(mood: Mood): void;
  pet(): void;
  /** Something happened in the app; see `Jax.activity`. */
  activity(): void;
  setReducedMotion(on: boolean): void;
  /** Advance by `dt` seconds (clamped inside) and return the pose to draw now. */
  step(dt: number): Readonly<Pose>;
}

export interface MotionOptions {
  patterns: readonly AnimationPattern[];
  random?: () => number;
  reducedMotion?: boolean;
  /**
   * Rotate through the idle moods after quiet, and nap after 45 s. Off by default for the engine:
   * the host decides the mood with `setMood`. `createJax` turns it on unless told otherwise.
   */
  autoIdle?: boolean;
}

/** Thrown when there is no WebGL, or the context is lost for good. Apps show the fallback. */
export class JaxUnavailableError extends Error {
  constructor(message = 'WebGL is not available') {
    super(message);
    this.name = 'JaxUnavailableError';
  }
}

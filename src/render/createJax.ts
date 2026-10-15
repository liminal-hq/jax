// Creates a running Jax: one WebGL renderer, the otter rig and a render loop that behaves itself
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { PerspectiveCamera, Scene, WebGLRenderer, type Camera } from 'three';
import { defaultSkin } from '../model/defaultSkin';
import { buildOtter, type OtterRig } from '../model/otter';
import { createMotion } from '../motion/motion';
import { defaultPatterns } from '../motion/patterns';
import {
  JaxUnavailableError,
  neutralPose,
  type Jax,
  type JaxOptions,
  type Mood,
  type Motion,
  type MotionOptions
} from '../types';
import { ensureSizeRule, sizeClass } from './sizeStyle';

/** The part of a renderer the loop needs. `WebGLRenderer` satisfies it. */
export interface RendererLike {
  readonly domElement: HTMLCanvasElement;
  setPixelRatio(ratio: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: Scene, camera: Camera): void;
  dispose(): void;
  forceContextLoss?(): void;
}

/** Makes the renderer. Tests inject a fake so no real context is ever created. */
export type RendererFactory = () => RendererLike;

/** Makes the motion engine. */
export type MotionFactory = (options: MotionOptions) => Motion;

/** Time and frame scheduling, replaceable so tests can drive the loop by hand. */
export interface Scheduler {
  now(): number;
  request(callback: (now: number) => void): number;
  cancel(handle: number): void;
}

/** Seams for tests and for wiring. Not part of the public API. */
export interface JaxInternals {
  createRenderer?: RendererFactory;
  createMotion?: MotionFactory;
  scheduler?: Scheduler;
}

/** The longest step the motion ever sees, so a stalled tab cannot cause a lurch. */
export const MAX_DT = 0.1;
/** Fixed steps used to settle into a still pose for reduced motion. */
const SETTLE_STEP = 1 / 30;
const SETTLE_STEPS = 90;

export const createWebGLRenderer: RendererFactory = () => {
  try {
    return new WebGLRenderer({ alpha: true, antialias: true });
  } catch (cause) {
    throw new JaxUnavailableError(
      cause instanceof Error ? `WebGL is not available: ${cause.message}` : undefined
    );
  }
};

const defaultScheduler: Scheduler = {
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle)
};

export async function createJax(
  host: HTMLElement,
  options: JaxOptions = {},
  internal: JaxInternals = {}
): Promise<Jax> {
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  const scheduler = internal.scheduler ?? defaultScheduler;
  const skin = options.skin ?? defaultSkin;
  const size = options.size ?? 120;
  const frameMs = 1000 / Math.max(1, options.fps ?? 30);
  const maxDpr = options.maxDpr ?? 2;

  const renderer = (internal.createRenderer ?? createWebGLRenderer)();
  const canvas = renderer.domElement;
  const dpr = Math.min((win?.devicePixelRatio ?? 1) || 1, maxDpr);
  renderer.setPixelRatio(dpr);
  renderer.setSize(size, size, false);
  ensureSizeRule(doc, size);
  canvas.classList.add('lq-jax-canvas', sizeClass(size));
  if (options.canvasClass)
    canvas.classList.add(...options.canvasClass.split(/\s+/).filter(Boolean));
  host.appendChild(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, -0.35, 8.6);
  camera.lookAt(0, -0.45, 0);

  let rig: OtterRig = buildOtter(skin);
  scene.add(rig.group);

  const mediaQuery = win?.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
  let reduced = options.reducedMotion ?? mediaQuery?.matches ?? false;
  const patterns = options.patterns?.length ? options.patterns : defaultPatterns;
  const motion = (internal.createMotion ?? createMotion)({
    patterns,
    reducedMotion: reduced,
    autoIdle: options.autoIdle ?? true
  });
  // The motion engine reuses the pose it returns, so the rig draws from this copy
  const drawn = neutralPose();

  let disposed = false;
  let contextLost = false;
  let onScreen = true;
  let documentVisible = !doc.hidden;
  let frame = 0;
  let lastTime: number | null = null;
  let stillDirty = true;

  const canRender = () => !disposed && !contextLost && onScreen && documentVisible;

  function draw(dt: number): void {
    Object.assign(drawn, motion.step(dt));
    rig.apply(drawn);
    rig.update(dt);
    renderer.render(scene, camera);
  }

  /** Settle into the current mood's still pose and draw it once. */
  function drawStill(): void {
    stillDirty = false;
    for (let i = 0; i < SETTLE_STEPS; i++) motion.step(SETTLE_STEP);
    draw(0);
  }

  function tick(now: number): void {
    frame = 0;
    if (!canRender() || reduced) return;
    frame = scheduler.request(tick);
    const elapsed = lastTime === null ? 0 : now - lastTime;
    if (lastTime !== null && elapsed < frameMs - 2) return;
    const dt = Math.min(elapsed / 1000, MAX_DT);
    lastTime = now;
    draw(dt);
  }

  /** Start or stop the loop to match the current conditions. */
  function evaluate(): void {
    if (disposed) return;
    if (!canRender()) {
      if (frame) scheduler.cancel(frame);
      frame = 0;
      lastTime = null;
      return;
    }
    if (reduced) {
      if (frame) scheduler.cancel(frame);
      frame = 0;
      lastTime = null;
      if (stillDirty) drawStill();
      return;
    }
    if (!frame) {
      lastTime = null;
      frame = scheduler.request(tick);
    }
  }

  const markChanged = () => {
    stillDirty = true;
    evaluate();
  };

  const onVisibility = () => {
    documentVisible = !doc.hidden;
    evaluate();
  };
  doc.addEventListener('visibilitychange', onVisibility);

  const IO = (win as (Window & typeof globalThis) | null)?.IntersectionObserver;
  const observer = IO
    ? new IO((entries) => {
        const latest = entries[entries.length - 1];
        if (!latest) return;
        onScreen = latest.isIntersecting;
        evaluate();
      })
    : null;
  observer?.observe(canvas);

  const onMotionPreference = (event: MediaQueryListEvent) => api.setReducedMotion(event.matches);
  mediaQuery?.addEventListener?.('change', onMotionPreference);

  const onContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    evaluate();
  };
  const onContextRestored = () => {
    scene.remove(rig.group);
    rig.dispose();
    rig = buildOtter(skin);
    scene.add(rig.group);
    contextLost = false;
    markChanged();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  const api: Jax = {
    get mood(): Mood {
      return motion.mood;
    },
    setMood(mood) {
      motion.setMood(mood);
      markChanged();
    },
    pet() {
      motion.pet();
      markChanged();
    },
    setReducedMotion(on) {
      if (on === reduced) return;
      reduced = on;
      motion.setReducedMotion(on);
      markChanged();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) scheduler.cancel(frame);
      frame = 0;
      doc.removeEventListener('visibilitychange', onVisibility);
      mediaQuery?.removeEventListener?.('change', onMotionPreference);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      observer?.disconnect();
      scene.remove(rig.group);
      rig.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove();
    }
  };

  evaluate();
  return api;
}

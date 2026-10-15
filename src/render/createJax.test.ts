// @vitest-environment happy-dom
// Tests for the renderer lifecycle, driven by a fake renderer, scheduler, observer and motion
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BufferGeometry, Material, type Scene } from 'three';
import { JaxUnavailableError, neutralPose, type Motion, type Mood } from '../types.js';
import { createJax, MAX_DT, type JaxInternals, type RendererLike } from './createJax.js';

function makeScheduler() {
  let now = 0;
  let id = 0;
  const queue = new Map<number, (t: number) => void>();
  return {
    now: () => now,
    request: (cb: (t: number) => void) => {
      queue.set(++id, cb);
      return id;
    },
    cancel: (h: number) => void queue.delete(h),
    advance(ms: number) {
      now += ms;
      const callbacks = [...queue.values()];
      queue.clear();
      callbacks.forEach((cb) => cb(now));
    },
    get pending() {
      return queue.size;
    }
  };
}

function makeRenderer() {
  const domElement = document.createElement('canvas');
  const scenes: Scene[] = [];
  const renderer: RendererLike = {
    domElement,
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn((scene: Scene) => void scenes.push(scene)),
    dispose: vi.fn(),
    forceContextLoss: vi.fn()
  };
  return { renderer, scenes };
}

function makeMotion() {
  const dts: number[] = [];
  let mood: Mood = 'chill';
  const motion: Motion = {
    get mood() {
      return mood;
    },
    setMood: vi.fn((m: Mood) => void (mood = m)),
    pet: vi.fn(),
    setReducedMotion: vi.fn(),
    step: vi.fn((dt: number) => {
      dts.push(dt);
      return neutralPose();
    })
  };
  return { motion, dts };
}

class FakeObserver {
  static last: FakeObserver;
  disconnect = vi.fn();
  observe = vi.fn();
  constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {
    FakeObserver.last = this;
  }
  show(on: boolean) {
    this.callback([{ isIntersecting: on }]);
  }
}

class FakeQuery extends EventTarget {
  matches = false;
  set(on: boolean) {
    this.matches = on;
    const event = new Event('change') as Event & { matches: boolean };
    event.matches = on;
    this.dispatchEvent(event);
  }
}

let hidden = false;
let query: FakeQuery;
let host: HTMLElement;

beforeEach(() => {
  hidden = false;
  query = new FakeQuery();
  host = document.createElement('div');
  document.body.appendChild(host);
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  for (const target of [window, globalThis] as unknown as Record<string, unknown>[]) {
    target.IntersectionObserver = FakeObserver;
    target.matchMedia = () => query;
  }
});

afterEach(() => {
  host.remove();
  vi.restoreAllMocks();
});

async function setup(options = {}, extra: Partial<JaxInternals> = {}) {
  const scheduler = makeScheduler();
  const { renderer, scenes } = makeRenderer();
  const { motion, dts } = makeMotion();
  const jax = await createJax(host, options, {
    createRenderer: () => renderer,
    createMotion: () => motion,
    scheduler,
    ...extra
  });
  return { jax, scheduler, renderer, scenes, motion, dts };
}

describe('createJax motion wiring', () => {
  it('uses the real motion engine with the default patterns and idle drift on', async () => {
    const { renderer } = makeRenderer();
    const scheduler = makeScheduler();
    const jax = await createJax(host, {}, { createRenderer: () => renderer, scheduler });
    expect(jax.mood).toBe('chill');
    jax.setMood('nap');
    // A nap takes the slow wake blend, so just check that the engine took the mood
    expect(jax.mood).toBe('nap');
    scheduler.advance(16);
    scheduler.advance(40);
    expect(renderer.render).toHaveBeenCalled();
    jax.dispose();
  });

  it('asks for idle drift unless told otherwise, and falls back to the default patterns', async () => {
    const seen: { autoIdle?: boolean; count: number }[] = [];
    const factory = (options: { autoIdle?: boolean; patterns: readonly unknown[] }) => {
      seen.push({ autoIdle: options.autoIdle, count: options.patterns.length });
      return makeMotion().motion;
    };
    for (const options of [{}, { autoIdle: false, patterns: [] }]) {
      const { renderer } = makeRenderer();
      const jax = await createJax(host, options, {
        createRenderer: () => renderer,
        createMotion: factory,
        scheduler: makeScheduler()
      });
      jax.dispose();
    }
    expect(seen[0]).toEqual({ autoIdle: true, count: 12 });
    expect(seen[1]).toEqual({ autoIdle: false, count: 12 });
  });
});

describe('createJax', () => {
  it('throws JaxUnavailableError when a renderer cannot be made', async () => {
    const failing = () => {
      throw new JaxUnavailableError();
    };
    await expect(createJax(host, {}, { createRenderer: failing })).rejects.toBeInstanceOf(
      JaxUnavailableError
    );
    expect(host.querySelector('canvas')).toBeNull();
  });

  it('adds a classed canvas with no inline style, sized and capped for the screen', async () => {
    const { renderer } = await setup({ size: 300, maxDpr: 1.5, canvasClass: 'my-jax' });
    const canvas = host.querySelector('canvas')!;
    expect(canvas.classList.contains('my-jax')).toBe(true);
    expect(canvas.hasAttribute('style')).toBe(false);
    expect(renderer.setSize).toHaveBeenCalledWith(300, 300, false);
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(
      Math.min(window.devicePixelRatio || 1, 1.5)
    );
  });

  it('draws frames at the capped rate using real elapsed time', async () => {
    const { scheduler, renderer, dts } = await setup({ fps: 30 });
    scheduler.advance(0);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    scheduler.advance(16);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    scheduler.advance(17);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(dts[0]).toBe(0);
    expect(dts[1]).toBeCloseTo(0.033, 3);
  });

  it('clamps a long gap between frames', async () => {
    const { scheduler, dts } = await setup();
    scheduler.advance(0);
    scheduler.advance(5000);
    expect(dts[dts.length - 1]).toBe(MAX_DT);
  });

  it('stops off screen and resumes without a time jump', async () => {
    const { scheduler, renderer, dts } = await setup();
    scheduler.advance(0);
    scheduler.advance(34);
    const drawn = vi.mocked(renderer.render).mock.calls.length;

    FakeObserver.last.show(false);
    expect(scheduler.pending).toBe(0);
    scheduler.advance(10_000);
    expect(renderer.render).toHaveBeenCalledTimes(drawn);

    FakeObserver.last.show(true);
    expect(scheduler.pending).toBe(1);
    scheduler.advance(10_000);
    expect(dts[dts.length - 1]).toBe(0);
    scheduler.advance(34);
    expect(dts[dts.length - 1]).toBeCloseTo(0.034, 3);
  });

  it('stops while the document is hidden and resumes cleanly', async () => {
    const { scheduler, renderer, dts } = await setup();
    scheduler.advance(0);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(scheduler.pending).toBe(0);
    const drawn = vi.mocked(renderer.render).mock.calls.length;
    scheduler.advance(60_000);
    expect(renderer.render).toHaveBeenCalledTimes(drawn);

    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    scheduler.advance(60_000);
    expect(dts[dts.length - 1]).toBe(0);
  });

  it('draws one still frame under reduced motion and loops again when it ends', async () => {
    const { jax, scheduler, renderer, motion } = await setup({ reducedMotion: true });
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(scheduler.pending).toBe(0);
    scheduler.advance(1000);
    expect(renderer.render).toHaveBeenCalledTimes(1);

    jax.setMood('party');
    expect(motion.setMood).toHaveBeenCalledWith('party');
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(scheduler.pending).toBe(0);

    query.set(false);
    expect(motion.setReducedMotion).toHaveBeenCalledWith(false);
    expect(scheduler.pending).toBe(1);
  });

  it('follows the system reduced-motion setting', async () => {
    const { scheduler, motion } = await setup();
    scheduler.advance(0);
    query.set(true);
    expect(motion.setReducedMotion).toHaveBeenCalledWith(true);
    expect(scheduler.pending).toBe(0);
  });

  it('stops on context loss and rebuilds the rig on restore', async () => {
    const { scheduler, scenes } = await setup();
    scheduler.advance(0);
    const canvas = host.querySelector('canvas')!;
    const before = scenes[0].children[0];

    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(scheduler.pending).toBe(0);

    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(scheduler.pending).toBe(1);
    scheduler.advance(40);
    const after = scenes[scenes.length - 1].children[0];
    expect(after).not.toBe(before);
  });

  it('disposes everything once and removes what it added', async () => {
    const geometry = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const material = vi.spyOn(Material.prototype, 'dispose');
    const { jax, scheduler, renderer } = await setup();
    scheduler.advance(0);
    const canvas = host.querySelector('canvas')!;

    jax.dispose();
    expect(host.querySelector('canvas')).toBeNull();
    expect(scheduler.pending).toBe(0);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(geometry.mock.calls.length).toBeGreaterThan(10);
    expect(material.mock.calls.length).toBeGreaterThan(5);
    expect(FakeObserver.last.disconnect).toHaveBeenCalled();

    const geometryCalls = geometry.mock.calls.length;
    jax.dispose();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(geometry.mock.calls.length).toBe(geometryCalls);

    // Listeners are gone, so late events do nothing
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(scheduler.pending).toBe(0);
  });
});

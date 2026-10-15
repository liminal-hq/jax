// Tests for the slab cache: geometry and material sharing, and releasing everything together
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it, vi } from 'vitest';
import { createSlabCache, ellipse, rect, ring, slab, triangle } from './slab';

describe('slab cache', () => {
  it('reuses geometry for the same shape, depth and bevel', () => {
    const cache = createSlabCache();
    const a = cache.geometry(ellipse(1, 2), 0.5, 0.05);
    const b = cache.geometry(ellipse(1, 2), 0.5, 0.05);
    expect(a).toBe(b);
    expect(cache.geometry(ellipse(1, 2), 0.6, 0.05)).not.toBe(a);
    expect(cache.geometry(rect(1, 2), 0.5, 0.05)).not.toBe(a);
    expect(cache.geometryCount).toBe(3);
  });

  it('reuses materials by colour and keeps tagged ones apart', () => {
    const cache = createSlabCache();
    expect(cache.material(0xff0000)).toBe(cache.material(0xff0000));
    const tagged = cache.material(0xff0000, { tag: 'hat' });
    expect(tagged).not.toBe(cache.material(0xff0000));
    expect(tagged.transparent).toBe(true);
    expect(cache.materialsFor('hat')).toEqual([tagged]);
  });

  it('shares geometry and material between slabs built from the same spec', () => {
    const cache = createSlabCache();
    const a = slab(cache, {
      shape: ellipse(1, 1),
      depth: 0.2,
      colour: 0x123456,
      position: [1, 2, 3]
    });
    const b = slab(cache, { shape: ellipse(1, 1), depth: 0.2, colour: 0x123456 });
    expect(a.geometry).toBe(b.geometry);
    expect(a.material).toBe(b.material);
    expect(a.position.toArray()).toEqual([1, 2, 3]);
  });

  it('builds every helper shape without doing work at import time', () => {
    const cache = createSlabCache();
    for (const shape of [ellipse(1, 1), rect(1, 1), triangle(1, 1), ring(1, 0.2)]) {
      expect(cache.geometry(shape, 0.1, 0.02).attributes.position.count).toBeGreaterThan(0);
    }
  });

  it('disposes everything it made once, even when asked twice', () => {
    const cache = createSlabCache();
    const geometry = cache.geometry(rect(1, 1), 0.1, 0.01);
    const material = cache.material(0x000000);
    const extra = { dispose: vi.fn() };
    cache.adopt(extra);
    const g = vi.spyOn(geometry, 'dispose');
    const m = vi.spyOn(material, 'dispose');
    cache.dispose();
    cache.dispose();
    expect(g).toHaveBeenCalledTimes(1);
    expect(m).toHaveBeenCalledTimes(1);
    expect(extra.dispose).toHaveBeenCalledTimes(1);
  });
});

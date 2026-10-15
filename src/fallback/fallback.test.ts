// @vitest-environment happy-dom
// Tests for the SVG fallback: moods as `data-mood`, no inline styles and no three.js
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOODS } from '../types';
import { createFallbackJax } from './index';
import { FALLBACK_STYLE_ID } from './fallback.css';

afterEach(() => {
  document.body.replaceChildren();
  document.getElementById(FALLBACK_STYLE_ID)?.remove();
  vi.useRealTimers();
});

describe('fallback Jax', () => {
  it('creates an SVG that carries the mood and has no inline styles', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const jax = createFallbackJax(host, { size: 200, canvasClass: 'mine' });
    const svg = host.querySelector('svg')!;
    expect(svg.getAttribute('data-mood')).toBe('chill');
    expect(svg.classList.contains('mine')).toBe(true);
    expect(host.querySelectorAll('[style]')).toHaveLength(0);
    for (const mood of MOODS) {
      jax.setMood(mood);
      expect(svg.getAttribute('data-mood')).toBe(mood);
      expect(jax.mood).toBe(mood);
    }
  });

  it('injects one scoped style element however many Jaxes there are', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);
    createFallbackJax(a, {});
    createFallbackJax(b, {});
    expect(document.querySelectorAll(`style#${FALLBACK_STYLE_ID}`)).toHaveLength(1);
    const css = document.getElementById(FALLBACK_STYLE_ID)!.textContent!;
    expect(css).toContain('prefers-reduced-motion');
    expect(css).not.toMatch(/(^|[}\s,])\.(?!lq-jax-)[a-z]/);
  });

  it('settles back after a transient mood and honours reduced motion', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const jax = createFallbackJax(host, {});
    const svg = host.querySelector('svg')!;
    jax.setMood('writing');
    jax.setMood('wave');
    expect(jax.mood).toBe('wave');
    vi.advanceTimersByTime(5000);
    expect(jax.mood).toBe('writing');

    jax.setReducedMotion(true);
    expect(svg.classList.contains('lq-jax-still')).toBe(true);
    jax.setReducedMotion(false);
    expect(svg.classList.contains('lq-jax-still')).toBe(false);
  });

  it('removes itself and is safe to dispose twice', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const jax = createFallbackJax(host, {});
    jax.dispose();
    jax.dispose();
    expect(host.querySelector('svg')).toBeNull();
  });

  it('never imports three', () => {
    const dir = join(process.cwd(), 'src', 'fallback');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.includes('.test.'))) {
      const text = readFileSync(join(dir, file), 'utf8');
      expect(text, file).not.toMatch(/from\s+['"]three/);
      expect(text, file).not.toMatch(/\.\.\/(model|render)/);
    }
  });
});

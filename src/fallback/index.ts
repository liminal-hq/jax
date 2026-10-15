// The no-WebGL companion: an inline SVG otter whose moods are CSS, with no three.js anywhere
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { TRANSIENT_MOODS, type Jax, type JaxOptions, type Mood } from '../types';
import { FALLBACK_CSS, FALLBACK_STYLE_ID } from './fallback.css';

export { FALLBACK_CSS, FALLBACK_STYLE_ID } from './fallback.css';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** How long a transient mood plays before he settles back, in milliseconds. */
const TRANSIENT_MS = 2800;

type Attrs = Record<string, string | number>;

function el(doc: Document, name: string, attrs: Attrs = {}, ...children: Element[]): SVGElement {
  const node = doc.createElementNS(SVG_NS, name) as SVGElement;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  for (const child of children) node.appendChild(child);
  return node;
}

function buildSvg(doc: Document, options: JaxOptions): SVGElement {
  const colours = options.skin?.colours;
  const hex = (n: number | undefined, fallback: string) =>
    n === undefined ? fallback : `#${n.toString(16).padStart(6, '0')}`;
  const fur = hex(colours?.fur, '#b8743a');
  const furDark = hex(colours?.furDark, '#8a5428');
  const cream = hex(colours?.cream, '#f6dcb4');
  const nose = hex(colours?.nose, '#2a1a14');
  const eye = hex(colours?.eye, '#1a1210');
  const blush = hex(colours?.blush, '#e25d75');
  const book = hex(colours?.book, '#e25d75');
  const pages = hex(colours?.pages, '#fbfaf6');
  const accent = hex(colours?.accent, '#ffb454');
  const prop = hex(colours?.prop, '#6ecddc');
  const size = options.size ?? 120;

  const prop_ = (name: string, ...children: Element[]) =>
    el(doc, 'g', { class: `lq-jax-prop lq-jax-prop-${name}` }, ...children);

  const svg = el(
    doc,
    'svg',
    {
      class: 'lq-jax-fallback',
      viewBox: '0 0 200 200',
      width: size,
      height: size,
      role: 'img',
      'data-mood': 'chill'
    },
    el(doc, 'title'),
    el(
      doc,
      'g',
      { class: 'lq-jax-body' },
      el(doc, 'ellipse', { class: 'lq-jax-tail', cx: 142, cy: 168, rx: 34, ry: 9, fill: furDark }),
      el(doc, 'ellipse', { cx: 100, cy: 140, rx: 42, ry: 50, fill: fur }),
      el(doc, 'ellipse', { cx: 100, cy: 146, rx: 26, ry: 36, fill: cream }),
      el(doc, 'ellipse', { cx: 80, cy: 188, rx: 14, ry: 6, fill: furDark }),
      el(doc, 'ellipse', { cx: 120, cy: 188, rx: 14, ry: 6, fill: furDark }),
      el(doc, 'rect', { x: 74, y: 128, width: 52, height: 34, rx: 3, fill: book }),
      el(doc, 'rect', { x: 78, y: 131, width: 44, height: 28, rx: 2, fill: pages }),
      el(doc, 'rect', { x: 99, y: 131, width: 2, height: 28, fill: furDark }),
      el(
        doc,
        'g',
        { class: 'lq-jax-arm-l' },
        el(doc, 'ellipse', {
          cx: 62,
          cy: 128,
          rx: 8,
          ry: 22,
          fill: fur,
          transform: 'rotate(20 62 128)'
        }),
        el(doc, 'ellipse', { cx: 72, cy: 146, rx: 8, ry: 6, fill: furDark })
      ),
      el(
        doc,
        'g',
        { class: 'lq-jax-arm-r' },
        el(doc, 'ellipse', {
          cx: 138,
          cy: 128,
          rx: 8,
          ry: 22,
          fill: fur,
          transform: 'rotate(-20 138 128)'
        }),
        el(doc, 'ellipse', { cx: 128, cy: 146, rx: 8, ry: 6, fill: furDark })
      ),
      prop_(
        'printer',
        el(doc, 'rect', { x: 72, y: 160, width: 56, height: 20, rx: 4, fill: '#d6d3d1' })
      ),
      prop_('mug', el(doc, 'rect', { x: 60, y: 138, width: 18, height: 20, rx: 3, fill: prop })),
      prop_(
        'rod',
        el(doc, 'line', { x1: 134, y1: 140, x2: 184, y2: 70, stroke: furDark, 'stroke-width': 3 }),
        el(doc, 'circle', { cx: 184, cy: 120, r: 4, fill: blush })
      ),
      prop_(
        'pencil',
        el(doc, 'rect', { x: 126, y: 118, width: 5, height: 28, rx: 1, fill: accent })
      ),
      prop_(
        'magnifier',
        el(doc, 'circle', {
          cx: 140,
          cy: 108,
          r: 13,
          fill: 'none',
          stroke: '#9ca3af',
          'stroke-width': 4
        })
      ),
      prop_('thumb', el(doc, 'ellipse', { cx: 140, cy: 108, rx: 5, ry: 9, fill: furDark })),
      prop_('page', el(doc, 'rect', { x: 100, y: 131, width: 22, height: 28, fill: pages }))
    ),
    el(
      doc,
      'g',
      { class: 'lq-jax-head' },
      el(doc, 'circle', { cx: 64, cy: 50, r: 11, fill: furDark }),
      el(doc, 'circle', { cx: 136, cy: 50, r: 11, fill: furDark }),
      el(doc, 'ellipse', { cx: 100, cy: 74, rx: 48, ry: 40, fill: fur }),
      el(doc, 'ellipse', { cx: 100, cy: 86, rx: 24, ry: 16, fill: cream }),
      el(doc, 'ellipse', { cx: 100, cy: 70, rx: 7, ry: 5, fill: nose }),
      el(doc, 'ellipse', { cx: 70, cy: 82, rx: 6, ry: 4, fill: blush, opacity: 0.8 }),
      el(doc, 'ellipse', { cx: 130, cy: 82, rx: 6, ry: 4, fill: blush, opacity: 0.8 }),
      el(
        doc,
        'g',
        { class: 'lq-jax-eyes' },
        el(doc, 'ellipse', { cx: 82, cy: 62, rx: 5, ry: 6, fill: eye }),
        el(doc, 'ellipse', { cx: 118, cy: 62, rx: 5, ry: 6, fill: eye })
      ),
      prop_(
        'hat',
        el(doc, 'polygon', { points: '100,6 122,40 78,40', fill: book }),
        el(doc, 'circle', { cx: 100, cy: 6, r: 5, fill: accent })
      )
    ),
    prop_(
      'confetti',
      el(doc, 'rect', { x: 40, y: 30, width: 6, height: 4, fill: accent }),
      el(doc, 'rect', { x: 160, y: 40, width: 6, height: 4, fill: blush }),
      el(doc, 'rect', { x: 30, y: 90, width: 6, height: 4, fill: '#a78bfa' }),
      el(doc, 'rect', { x: 170, y: 100, width: 6, height: 4, fill: prop })
    ),
    prop_(
      'zzz',
      el(doc, 'text', { x: 140, y: 40, fill: '#a78bfa', 'font-size': 22 }, textNode(doc, 'z'))
    ),
    prop_(
      'question',
      el(doc, 'text', { x: 140, y: 40, fill: accent, 'font-size': 28 }, textNode(doc, '?'))
    )
  );
  return svg;
}

function textNode(doc: Document, text: string): Element {
  // A bare text child is wrapped so `el` can take it with the other children.
  return doc.createTextNode(text) as unknown as Element;
}

function injectStyles(doc: Document): void {
  if (doc.getElementById(FALLBACK_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = FALLBACK_STYLE_ID;
  style.textContent = FALLBACK_CSS;
  doc.head.appendChild(style);
}

/**
 * A static-friendly Jax for when WebGL is unavailable. It shows an inline SVG otter and expresses
 * each mood with `data-mood` and CSS animation. It needs no WebGL and loads nothing.
 */
export function createFallbackJax(host: HTMLElement, options: JaxOptions = {}): Jax {
  const doc = host.ownerDocument;
  injectStyles(doc);
  const svg = buildSvg(doc, options);
  if (options.canvasClass) svg.classList.add(...options.canvasClass.split(/\s+/).filter(Boolean));
  host.appendChild(svg);

  let mood: Mood = 'chill';
  let resting: Mood = 'chill';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const show = (next: Mood) => {
    mood = next;
    svg.setAttribute('data-mood', next);
    svg.querySelector('title')!.textContent = `Jax the otter, ${next}`;
  };
  const setStill = (on: boolean) => svg.classList.toggle('lq-jax-still', on);
  setStill(options.reducedMotion === true);
  show(mood);

  const api: Jax = {
    get mood() {
      return mood;
    },
    setMood(next) {
      if (disposed) return;
      clearTimeout(timer);
      if (TRANSIENT_MOODS.includes(next)) {
        timer = setTimeout(() => show(resting), TRANSIENT_MS);
      } else {
        resting = next;
      }
      show(next);
    },
    pet() {
      api.setMood('wave');
    },
    activity() {
      // The fallback has no idle moods, so there is nothing to wake or put off.
    },
    setReducedMotion: (on) => {
      if (!disposed) setStill(on);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      svg.remove();
    }
  };
  return api;
}

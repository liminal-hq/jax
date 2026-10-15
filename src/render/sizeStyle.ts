// Gives canvases a CSS size through a class, so no element carries an inline style
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

const STYLE_ID = 'lq-jax-canvas-sizes';
const known = new WeakMap<Document, Set<number>>();

/** The class name that sizes a canvas to `size` CSS pixels. */
export const sizeClass = (size: number): string => `lq-jax-size-${Math.round(size)}`;

/** Add the rule for `size` to one shared stylesheet. Does nothing if styles cannot be added. */
export function ensureSizeRule(doc: Document, size: number): void {
  const px = Math.round(size);
  let seen = known.get(doc);
  if (!seen) known.set(doc, (seen = new Set()));
  if (seen.has(px)) return;
  try {
    let style = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = doc.createElement('style');
      style.id = STYLE_ID;
      doc.head.appendChild(style);
    }
    style.appendChild(
      doc.createTextNode(`.${sizeClass(px)}{display:block;width:${px}px;height:${px}px}`)
    );
    seen.add(px);
  } catch {
    // A page that forbids styles can size the canvas with `canvasClass` instead.
  }
}

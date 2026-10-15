// The default skin: Afterglow-style warm fur, a crimson book and a purple rim light
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { Skin } from '../types.js';

export const defaultSkin: Skin = {
  name: 'afterglow',
  colours: {
    fur: 0xb8743a,
    furDark: 0x8a5428,
    cream: 0xf6dcb4,
    nose: 0x2a1a14,
    eye: 0x1a1210,
    shine: 0xffffff,
    blush: 0xe25d75,
    hat: 0x3a3550,
    hatBand: 0xe25d75,
    book: 0xe25d75,
    pages: 0xfbfaf6,
    accent: 0xffb454,
    prop: 0x6ecddc,
    water: 0x6ecddc
  },
  cheeks: false,
  hat: 'none',
  lights: { sky: 0xfff1e0, ground: 0x3a2a40, key: 0xffe2c0, rim: 0xa78bfa }
};

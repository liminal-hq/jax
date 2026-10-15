// Builds Jax the otter from a skin and maps every pose channel onto named pivots
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Shape,
  Vector3,
  DoubleSide,
  type Material,
  type Object3D
} from 'three';
import { POSE_CHANNELS, neutralPose, type Pose, type PoseChannel, type Skin } from '../types.js';
import {
  ellipse,
  rect,
  ring,
  slab,
  triangle,
  createSlabCache,
  type ShapeDef,
  type SlabCache
} from './slab.js';

export const PROP_NAMES = [
  'page',
  'thumb',
  'rod',
  'mug',
  'pencil',
  'magnifier',
  'printer',
  'hat',
  'confetti',
  'water'
] as const;

export type PropName = (typeof PROP_NAMES)[number];

/**
 * The pose channel that drives each prop's presence. The book he holds is not a prop: it has its
 * own channel, `propBook`, and is shown at rest.
 */
export const PROP_CHANNEL: Record<PropName, PoseChannel> = {
  page: 'propPage',
  thumb: 'propThumb',
  rod: 'propRod',
  mug: 'propMug',
  pencil: 'propPencil',
  magnifier: 'propMagnifier',
  printer: 'propPrinter',
  hat: 'propHat',
  confetti: 'propConfetti',
  water: 'propWater'
};

/** The otter, ready to add to a scene. */
export interface OtterRig {
  /** Add this to the scene: the figure and its lights. */
  readonly group: Group;
  /** Torso, arms, tail and head hang from here. Yaw, bob, lift and squash land on it. */
  readonly body: Group;
  readonly head: Group;
  readonly eyes: Group;
  readonly armL: Group;
  readonly armR: Group;
  readonly tail: Group;
  readonly book: Group;
  /** One pivot per prop. Hidden when its channel is exactly 0. */
  readonly props: Readonly<Record<PropName, Group>>;
  /** The hat the skin asks for, parented to the head. Missing when the skin has none. */
  readonly hat: Group | undefined;
  readonly cache: SlabCache;
  /** Draw this pose: every pose channel lands somewhere on the rig. */
  apply(pose: Readonly<Pose>): void;
  /** Advance small ambient details (steam, confetti, ripples) that belong to a prop being shown. */
  update(dt: number): void;
  /** Free every geometry and material. Safe to call twice. */
  dispose(): void;
}

const BASE_Y = 0.55;
const FEET_Y = -2.2;
/** The `bodyRoll` at which he lies fully on his back, as a nap does. */
const LIE_ANGLE = -Math.PI / 2 + Math.PI * 0.04;
const PAW: readonly [number, number, number] = [-0.27, -0.7, 0.42];
const FISH_ORIGIN = new Vector3(1.55, -2.4, 0.65);
const BOBBER_REST = new Vector3(0, 0.1, 0.05);
const LINE_POINTS = 16;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Ease out with a small overshoot, so props settle rather than pop. */
export function easeOutBack(t: number): number {
  const p = clamp01(t);
  if (p === 0 || p === 1) return p;
  const c1 = 1.2;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
}

interface Presence {
  channel: PoseChannel;
  object: Object3D;
  scales: boolean;
}

interface Fader {
  material: Material;
  base: number;
}

/** The upper half of an ellipse with its flat base on y = 0: a cap's crown. */
const dome = (rx: number, ry: number): ShapeDef => ({
  key: `dome:${rx}:${ry}`,
  make() {
    const shape = new Shape();
    shape.moveTo(-rx, 0);
    shape.absellipse(0, 0, rx, ry, Math.PI, 0, true, 0);
    shape.closePath();
    return shape;
  }
});

/** The hat's tag: its materials fade together as the party hat takes over. */
const SKIN_HAT_TAG = 'skinHat';

export function buildOtter(skin: Skin): OtterRig {
  const cache = createSlabCache();
  const c = skin.colours;
  const allowed = (name: PropName) => skin.props?.[name] !== false;

  const group = new Group();
  group.add(new HemisphereLight(skin.lights.sky, skin.lights.ground, 1.6));
  const key = new DirectionalLight(skin.lights.key, 2.2);
  key.position.set(2.5, 3, 5);
  group.add(key);
  const rim = new DirectionalLight(skin.lights.rim, 1.4);
  rim.position.set(-4, 1, -3);
  group.add(rim);

  const body = new Group();
  body.position.y = BASE_Y;
  group.add(body);

  // Body
  const tail = new Group();
  tail.position.set(0.45, -1.75, -0.35);
  const tailPaddle = new Mesh(tailGeometry(cache), cache.material(c.furDark));
  tailPaddle.rotation.z = -0.35;
  tail.add(tailPaddle);
  body.add(tail);

  body.add(
    slab(cache, { shape: ellipse(0.78, 1.02), depth: 0.72, colour: c.fur, position: [0, -1.12, 0] })
  );
  body.add(
    slab(cache, {
      shape: ellipse(0.5, 0.72),
      depth: 0.1,
      colour: c.cream,
      position: [0, -1.18, 0.42],
      bevel: 0.04
    })
  );
  for (const side of [-1, 1]) {
    body.add(
      slab(cache, {
        shape: ellipse(0.26, 0.14),
        depth: 0.4,
        colour: c.furDark,
        position: [side * 0.38, -2.12, 0.18]
      })
    );
  }

  // The crimson book held against the belly
  const book = new Group();
  book.position.set(0, -1.02, 0.6);
  book.rotation.x = -0.25;
  book.add(slab(cache, { shape: rect(1, 0.64), depth: 0.08, colour: c.book, bevel: 0.02 }));
  book.add(
    slab(cache, {
      shape: rect(0.92, 0.56),
      depth: 0.04,
      colour: c.pages,
      position: [0, 0, 0.07],
      bevel: 0.01
    })
  );
  book.add(
    slab(cache, {
      shape: rect(0.03, 0.56),
      depth: 0.02,
      colour: c.furDark,
      position: [0, 0, 0.1],
      bevel: 0.005
    })
  );
  body.add(book);

  // Arms pivot at the shoulder
  const makeArm = (side: -1 | 1) => {
    const pivot = new Group();
    pivot.position.set(side * 0.55, -0.55, 0.35);
    const upper = slab(cache, {
      shape: ellipse(0.16, 0.42),
      depth: 0.26,
      colour: c.fur,
      position: [side * -0.12, -0.34, 0]
    });
    upper.rotation.z = side * -0.4;
    pivot.add(upper);
    pivot.add(
      slab(cache, {
        shape: ellipse(0.15, 0.12),
        depth: 0.26,
        colour: c.furDark,
        position: [side * -0.27, -0.7, 0.3]
      })
    );
    body.add(pivot);
    return pivot;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  // Head
  const head = new Group();
  head.position.set(0, 0.22, 0.05);
  body.add(head);
  for (const side of [-1, 1]) {
    head.add(
      slab(cache, {
        shape: ellipse(0.16, 0.16),
        depth: 0.2,
        colour: c.furDark,
        position: [side * 0.6, 0.48, -0.12]
      })
    );
  }
  head.add(slab(cache, { shape: ellipse(0.8, 0.66), depth: 0.7, colour: c.fur }));
  head.add(
    slab(cache, {
      shape: ellipse(0.4, 0.27),
      depth: 0.14,
      colour: c.cream,
      position: [0, -0.2, 0.36],
      bevel: 0.05
    })
  );
  head.add(
    slab(cache, {
      shape: ellipse(0.12, 0.08),
      depth: 0.1,
      colour: c.nose,
      position: [0, -0.08, 0.47],
      bevel: 0.04
    })
  );
  if (skin.cheeks === true) {
    for (const side of [-1, 1]) {
      const cheek = slab(cache, {
        shape: ellipse(0.11, 0.07),
        depth: 0.03,
        colour: c.blush,
        position: [side * 0.54, -0.16, 0.43],
        bevel: 0.02
      });
      cheek.name = 'cheek';
      head.add(cheek);
    }
  }
  const eyes = new Group();
  eyes.position.set(0, 0.12, 0.38);
  head.add(eyes);
  for (const x of [-0.3, 0.3]) {
    eyes.add(
      slab(cache, {
        shape: ellipse(0.085, 0.095),
        depth: 0.06,
        colour: c.eye,
        position: [x, 0, 0],
        bevel: 0.02
      })
    );
    eyes.add(
      slab(cache, {
        shape: ellipse(0.025, 0.025),
        depth: 0.02,
        colour: c.shine,
        position: [x + 0.03, 0.035, 0.05],
        bevel: 0.005
      })
    );
  }
  for (const side of [-1, 1]) {
    for (const dy of [0.02, -0.06]) {
      const whisker = slab(cache, {
        shape: ellipse(0.2, 0.008),
        depth: 0.01,
        colour: c.furDark,
        position: [side * 0.52, -0.16 + dy, 0.42],
        bevel: 0.003
      });
      whisker.rotation.z = side * dy * 2;
      head.add(whisker);
    }
  }

  // Props
  const props = {} as Record<PropName, Group>;
  const presences: Presence[] = [];
  const extraFaders: Partial<Record<PropName, Fader[]>> = {};
  const makeProp = (name: PropName, parent: Object3D, scales = true): Group => {
    const pivot = new Group();
    pivot.visible = false;
    parent.add(pivot);
    props[name] = pivot;
    presences.push({ channel: PROP_CHANNEL[name], object: pivot, scales });
    return pivot;
  };
  const tagged = (name: PropName, opacity = 1) => ({ tag: name, opacity });

  // Page: a loose page that swings across the book with `pageFlip`
  const page = makeProp('page', book);
  page.position.set(0, 0, 0.1);
  if (allowed('page')) {
    page.add(
      slab(cache, {
        shape: rect(0.44, 0.54),
        depth: 0.012,
        colour: c.pages,
        position: [0.23, 0, 0],
        bevel: 0.004,
        material: tagged('page')
      })
    );
  }

  // Pencil, held in the right paw
  const pencil = makeProp('pencil', armR);
  pencil.position.set(...PAW);
  pencil.rotation.z = -0.55;
  if (allowed('pencil')) {
    const m = tagged('pencil');
    pencil.add(
      slab(cache, {
        shape: rect(0.08, 0.62),
        depth: 0.07,
        colour: c.accent,
        position: [0, 0.18, 0],
        bevel: 0.015,
        material: m
      })
    );
    pencil.add(
      slab(cache, {
        shape: rect(0.08, 0.1),
        depth: 0.07,
        colour: c.blush,
        position: [0, 0.53, 0],
        bevel: 0.015,
        material: m
      })
    );
    const nib = slab(cache, {
      shape: triangle(0.08, 0.14),
      depth: 0.07,
      colour: c.cream,
      position: [0, -0.13, 0],
      bevel: 0.01,
      material: m
    });
    nib.rotation.z = Math.PI;
    pencil.add(nib);
    const lead = slab(cache, {
      shape: triangle(0.03, 0.05),
      depth: 0.072,
      colour: c.nose,
      position: [0, -0.22, 0],
      bevel: 0.005,
      material: m
    });
    lead.rotation.z = Math.PI;
    pencil.add(lead);
  }

  // Thumb, raised from the right paw: it points along the arm's local +x, which is upright once the
  // arm is lifted out to the side
  const thumb = makeProp('thumb', armR);
  thumb.position.set(...PAW);
  if (allowed('thumb')) {
    const m = tagged('thumb');
    thumb.add(
      slab(cache, {
        shape: ellipse(0.2, 0.1),
        depth: 0.24,
        colour: c.fur,
        position: [0.14, 0.02, 0],
        bevel: 0.03,
        material: m
      })
    );
    thumb.add(
      slab(cache, {
        shape: ellipse(0.07, 0.06),
        depth: 0.2,
        colour: c.furDark,
        position: [0.34, 0.02, 0],
        bevel: 0.02,
        material: m
      })
    );
  }

  // Magnifying glass, right paw
  const magnifier = makeProp('magnifier', armR);
  magnifier.position.set(...PAW);
  if (allowed('magnifier')) {
    const m = tagged('magnifier');
    magnifier.add(
      slab(cache, {
        shape: rect(0.07, 0.42),
        depth: 0.07,
        colour: c.furDark,
        position: [0, 0.18, 0],
        bevel: 0.015,
        material: m
      })
    );
    magnifier.add(
      slab(cache, {
        shape: ring(0.24, 0.05),
        depth: 0.07,
        colour: 0x9ca3af,
        position: [0, 0.62, 0],
        bevel: 0.015,
        material: m
      })
    );
    const lens = new Mesh(
      cache.adopt(new CircleGeometry(0.2, 28)),
      cache.material(0xbfe9f2, { tag: 'magnifier', opacity: 0.45, roughness: 0.1 })
    );
    lens.position.set(0, 0.62, 0.02);
    magnifier.add(lens);
  }

  // Fishing rod, right paw, with a line to a bobber on a little pond
  const rod = makeProp('rod', armR);
  rod.position.set(...PAW);
  rod.rotation.z = -0.9;
  // The pond, bobber and ripple share the rod's presence but hang from the body
  const fishing = new Group();
  fishing.visible = false;
  fishing.position.copy(FISH_ORIGIN);
  body.add(fishing);
  presences.push({ channel: 'propRod', object: fishing, scales: true });
  const line = new Line(
    cache.adopt(
      new BufferGeometry().setAttribute(
        'position',
        new BufferAttribute(new Float32Array(LINE_POINTS * 3), 3)
      )
    ),
    cache.adopt(new LineBasicMaterial({ color: 0xf5f5f4, transparent: true }))
  );
  line.frustumCulled = false;
  line.visible = false;
  body.add(line);
  presences.push({ channel: 'propRod', object: line, scales: false });
  const ripple = new Mesh(
    cache.adopt(new RingGeometry(0.14, 0.17, 32)),
    cache.adopt(
      new MeshBasicMaterial({ color: 0xbfe9f2, transparent: true, opacity: 0.5, side: DoubleSide })
    )
  );
  ripple.rotation.x = -Math.PI / 2.4;
  ripple.position.set(0, -0.06, 0);
  const bobber = new Group();
  bobber.position.copy(BOBBER_REST);
  if (allowed('rod')) {
    const m = tagged('rod');
    rod.add(
      slab(cache, {
        shape: rect(0.05, 2),
        depth: 0.05,
        colour: c.furDark,
        position: [0, 1, 0],
        bevel: 0.01,
        material: m
      })
    );
    const pond = slab(cache, {
      shape: ellipse(0.75, 0.13),
      depth: 0.04,
      colour: c.water,
      position: [0, -0.02, -0.03],
      bevel: 0.02,
      material: { tag: 'rod', opacity: 0.5 }
    });
    pond.rotation.x = -0.25;
    fishing.add(pond);
    bobber.add(
      slab(cache, {
        shape: ellipse(0.1, 0.1),
        depth: 0.1,
        colour: c.blush,
        bevel: 0.02,
        material: m
      })
    );
    bobber.add(
      slab(cache, {
        shape: rect(0.2, 0.05),
        depth: 0.11,
        colour: 0xffffff,
        position: [0, 0.03, 0],
        bevel: 0.01,
        material: m
      })
    );
    fishing.add(bobber);
    fishing.add(ripple);
    extraFaders.rod = [
      { material: line.material as Material, base: 1 },
      { material: ripple.material as Material, base: 0.5 }
    ];
  }

  // Mug and steam, left paw
  const mug = makeProp('mug', armL);
  mug.position.set(0.5, -0.66, 0.42);
  const steam: Mesh[] = [];
  if (allowed('mug')) {
    const m = tagged('mug');
    mug.add(
      slab(cache, { shape: rect(0.34, 0.38), depth: 0.3, colour: c.prop, bevel: 0.04, material: m })
    );
    mug.add(
      slab(cache, {
        shape: ring(0.12, 0.045),
        depth: 0.08,
        colour: c.prop,
        position: [-0.21, 0.02, 0],
        bevel: 0.01,
        material: m
      })
    );
    mug.add(
      slab(cache, {
        shape: ellipse(0.12, 0.1),
        depth: 0.18,
        colour: c.furDark,
        position: [-0.22, 0, 0.12],
        bevel: 0.02,
        material: m
      })
    );
    mug.add(
      slab(cache, {
        shape: ellipse(0.13, 0.03),
        depth: 0.02,
        colour: 0x7a4b2a,
        position: [0, 0.18, 0.12],
        bevel: 0.005,
        material: m
      })
    );
    for (let i = 0; i < 2; i++) {
      const wisp = slab(cache, {
        shape: ellipse(0.025, 0.12),
        depth: 0.01,
        colour: 0xffffff,
        position: [-0.06 + i * 0.12, 0.42, 0.05],
        bevel: 0.004,
        material: { tag: 'mug', opacity: 0.7 }
      });
      mug.add(wisp);
      steam.push(wisp);
    }
  }

  // Party hat on the head
  const hat = makeProp('hat', head);
  hat.position.set(0.18, 0.55, 0);
  hat.rotation.z = -0.3;
  if (allowed('hat')) {
    const m = tagged('hat');
    hat.add(
      slab(cache, {
        shape: triangle(0.56, 0.7),
        depth: 0.3,
        colour: c.book,
        bevel: 0.03,
        material: m
      })
    );
    hat.add(
      slab(cache, {
        shape: rect(0.4, 0.06),
        depth: 0.31,
        colour: c.accent,
        position: [0, 0.18, 0.01],
        bevel: 0.01,
        material: m
      })
    );
    hat.add(
      slab(cache, {
        shape: ellipse(0.08, 0.08),
        depth: 0.12,
        colour: c.accent,
        position: [0, 0.72, 0],
        bevel: 0.02,
        material: m
      })
    );
  }

  // The hat the skin asks for, worn on the head. The party hat takes priority while it shows.
  let skinHat: Group | undefined;
  if (skin.hat === 'peakCap' || skin.hat === 'topHat') {
    skinHat = new Group();
    skinHat.name = `hat-${skin.hat}`;
    const main = c.hat ?? 0x3a3550;
    const band = c.hatBand ?? c.accent;
    const m = { tag: SKIN_HAT_TAG, opacity: 1 };
    if (skin.hat === 'peakCap') {
      skinHat.add(
        slab(cache, {
          shape: dome(0.44, 0.4),
          depth: 0.8,
          colour: main,
          position: [0, 0.5, 0],
          bevel: 0.03,
          material: m
        })
      );
      skinHat.add(
        slab(cache, {
          shape: rect(0.9, 0.08),
          depth: 0.9,
          colour: band,
          position: [0, 0.5, 0],
          bevel: 0.01,
          material: m
        })
      );
      const peak = slab(cache, {
        shape: rect(0.66, 0.06),
        depth: 0.42,
        colour: main,
        position: [0, 0.46, 0.5],
        bevel: 0.015,
        material: m
      });
      peak.rotation.x = 0.4;
      skinHat.add(peak);
      skinHat.add(
        slab(cache, {
          shape: ellipse(0.05, 0.05),
          depth: 0.1,
          colour: band,
          position: [0, 0.9, 0],
          bevel: 0.02,
          material: m
        })
      );
    } else {
      skinHat.add(
        slab(cache, {
          shape: rect(0.5, 0.5),
          depth: 0.76,
          colour: main,
          position: [0, 0.85, 0],
          bevel: 0.03,
          material: m
        })
      );
      const brim = slab(cache, {
        shape: ellipse(0.46, 0.56),
        depth: 0.05,
        colour: main,
        position: [0, 0.62, 0],
        bevel: 0.015,
        material: m
      });
      brim.rotation.x = Math.PI / 2;
      skinHat.add(brim);
      skinHat.add(
        slab(cache, {
          shape: rect(0.52, 0.14),
          depth: 0.8,
          colour: band,
          position: [0, 0.72, 0],
          bevel: 0.01,
          material: m
        })
      );
    }
    head.add(skinHat);
  }

  // Confetti falls in the figure's own space, so it does not spin with him
  const confetti = makeProp('confetti', group, false);
  interface Piece {
    mesh: Mesh;
    x: number;
    speed: number;
    spin: number;
    delay: number;
  }
  const pieces: Piece[] = [];
  if (allowed('confetti')) {
    const colours = [c.accent, c.blush, 0xa78bfa, 0x6ecddc, 0x4ade80];
    let seed = 7;
    const next = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 20; i++) {
      const mesh = slab(cache, {
        shape: rect(0.09, 0.05),
        depth: 0.01,
        colour: colours[i % colours.length],
        bevel: 0.004,
        material: tagged('confetti')
      });
      confetti.add(mesh);
      pieces.push({
        mesh,
        x: (next() - 0.5) * 3.4,
        speed: 0.6 + next() * 0.8,
        spin: next() * 6,
        delay: next()
      });
    }
  }

  // Printer and paper on the belly
  const printer = makeProp('printer', body);
  printer.position.set(0, -1.6, 0.95);
  let paper: Mesh | undefined;
  if (allowed('printer')) {
    const m = tagged('printer');
    printer.add(
      slab(cache, {
        shape: rect(1.1, 0.42),
        depth: 0.5,
        colour: 0xd6d3d1,
        bevel: 0.05,
        material: m
      })
    );
    printer.add(
      slab(cache, {
        shape: rect(0.8, 0.06),
        depth: 0.52,
        colour: 0x44403c,
        position: [0, 0.12, 0],
        bevel: 0.01,
        material: m
      })
    );
    printer.add(
      slab(cache, {
        shape: ellipse(0.04, 0.04),
        depth: 0.52,
        colour: 0x4ade80,
        position: [0.4, -0.08, 0],
        bevel: 0.01,
        material: m
      })
    );
    paper = slab(cache, {
      shape: rect(0.66, 0.5),
      depth: 0.01,
      colour: c.pages,
      position: [0, 0.2, -0.05],
      bevel: 0.004,
      material: m
    });
    printer.add(paper);
  }

  // The water he floats on for a nap
  const water = makeProp('water', group);
  water.position.set(0, -1.2, -0.4);
  if (allowed('water')) {
    water.add(
      slab(cache, {
        shape: ellipse(2.3, 0.28),
        depth: 0.1,
        colour: c.water,
        bevel: 0.04,
        material: { tag: 'water', opacity: 0.55 }
      })
    );
  }

  // Which materials fade with each prop, and how opaque they are when fully present
  const faders = {} as Record<PropName, Fader[]>;
  for (const name of PROP_NAMES) {
    faders[name] = [
      ...cache
        .materialsFor(name)
        .map((material) => ({ material: material as Material, base: material.opacity })),
      ...(extraFaders[name] ?? [])
    ];
  }

  const skinHatMaterials = cache.materialsFor(SKIN_HAT_TAG);

  const presence = {} as Record<PoseChannel, number>;
  for (const channel of POSE_CHANNELS) presence[channel] = 0;
  let ambient = 0;
  const tip = new Vector3();
  const linePosition = line.geometry.getAttribute('position') as BufferAttribute;

  function updateLine(): void {
    if (presence.propRod <= 0) return;
    group.updateMatrixWorld(true);
    tip.set(0, 2, 0);
    rod.localToWorld(tip);
    body.worldToLocal(tip);
    const endX = FISH_ORIGIN.x + bobber.position.x;
    const endY = FISH_ORIGIN.y + bobber.position.y + 0.08;
    const endZ = FISH_ORIGIN.z + bobber.position.z;
    for (let i = 0; i < LINE_POINTS; i++) {
      const u = i / (LINE_POINTS - 1);
      linePosition.setXYZ(
        i,
        tip.x + (endX - tip.x) * u,
        tip.y + (endY - tip.y) * u - Math.sin(u * Math.PI) * 0.3,
        tip.z + (endZ - tip.z) * u
      );
    }
    linePosition.needsUpdate = true;
  }

  function apply(pose: Readonly<Pose>): void {
    for (const channel of POSE_CHANNELS) presence[channel] = pose[channel];

    // The book has its own presence: it shrinks away rather than popping out
    const bookIn = clamp01(pose.propBook);
    book.visible = bookIn > 0;
    book.scale.setScalar(Math.max(easeOutBack(bookIn), 0.001));

    // Lying on his back raises the offsets that float him on the water
    const lie = clamp01(pose.bodyRoll / LIE_ANGLE);
    const squashY = 1 - pose.bodySquash;
    const squashXZ = 1 + pose.bodySquash * 0.5;
    body.scale.set(squashXZ, squashY, squashXZ);
    body.position.set(
      0.55 * lie,
      BASE_Y - 1.1 * lie + pose.bodyBob + pose.bodyLift - FEET_Y * (squashY - 1),
      0
    );
    // Yaw is in radians and may be past a full turn after a spin: the rotation takes it as it is
    body.rotation.set(-0.2 * lie, pose.bodyYaw, pose.bodyRoll);

    head.rotation.set(pose.headPitch, pose.headYaw, pose.headRoll);
    // Both arms hang from the shoulder and lift outwards for a positive raise, so the left is mirrored
    armL.rotation.set(-pose.armLForward, 0, -pose.armLRaise);
    armR.rotation.set(-pose.armRForward, 0, pose.armRRaise);
    tail.rotation.y = pose.tail;

    eyes.scale.y = Math.max(0.04, pose.eyeOpen);
    eyes.position.set(pose.lookX * 0.06, 0.12 + pose.lookY * 0.04, 0.38);

    for (const { channel, object, scales } of presences) {
      const p = clamp01(pose[channel]);
      object.visible = p > 0;
      if (scales) object.scale.setScalar(easeOutBack(p));
    }
    // The page swings across the book as `pageFlip` runs from 0 to 1
    page.rotation.y = -Math.PI * clamp01(pose.pageFlip);

    // The chosen hat is present exactly when the party hat is not
    if (skinHat) {
      const worn = 1 - clamp01(pose.propHat);
      skinHat.visible = worn > 0;
      skinHat.scale.setScalar(Math.max(easeOutBack(worn), 0.001));
      const hatFade = Math.min(1, worn * 2);
      for (const material of skinHatMaterials) material.opacity = hatFade;
    }

    for (const name of PROP_NAMES) {
      const fade = Math.min(1, clamp01(pose[PROP_CHANNEL[name]]) * 2);
      for (const { material, base } of faders[name]) material.opacity = base * fade;
    }
    updateLine();
  }

  function update(dt: number): void {
    ambient += dt;
    const t = ambient;
    if (presence.propMug > 0) {
      steam.forEach((wisp, i) => {
        const u = (t * 0.5 + i * 0.5) % 1;
        wisp.position.y = 0.42 + u * 0.35;
        wisp.scale.y = Math.max(0.05, 1 - u);
      });
    }
    if (presence.propConfetti > 0) {
      for (const piece of pieces) {
        const y = 2.2 - ((t * piece.speed + piece.delay * 3) % 4.4);
        piece.mesh.position.set(piece.x + Math.sin(t * 2 + piece.spin) * 0.15, y, 0.6);
        piece.mesh.rotation.set(t * 3 + piece.spin, t * 2 + piece.spin, 0);
      }
    }
    if (presence.propPrinter > 0 && paper) {
      const cycle = (t % 1.8) / 1.8;
      paper.position.y = 0.05 + cycle * 0.42;
      paper.visible = cycle < 0.95;
    }
    if (presence.propWater > 0) water.position.y = -1.2 + Math.sin(t * 0.9) * 0.02;
    if (presence.propRod > 0) {
      bobber.position.y = BOBBER_REST.y + Math.sin(t * 2.4) * 0.05;
      bobber.rotation.z = Math.sin(t * 2.4) * 0.18;
      const u = (t * 0.6) % 1;
      ripple.scale.setScalar(1 + u * 1.6);
      updateLine();
    }
  }

  // Lay out the ambient details once so the first frame is already complete
  update(0);
  apply(neutralPose());

  return {
    group,
    body,
    head,
    eyes,
    armL,
    armR,
    tail,
    book,
    props,
    hat: skinHat,
    cache,
    apply,
    update,
    dispose: () => cache.dispose()
  };
}

function tailGeometry(cache: SlabCache): BufferGeometry {
  return cache.geometry(
    {
      key: 'tail',
      make() {
        const shape = new Shape();
        shape.moveTo(0, 0.18);
        shape.quadraticCurveTo(0.9, 0.22, 1.35, -0.05);
        shape.quadraticCurveTo(0.9, -0.12, 0, -0.18);
        shape.closePath();
        return shape;
      }
    },
    0.22,
    0.06
  );
}

// The slab builder: flat silhouettes extruded into soft, bevelled slabs, with a shared cache
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  ExtrudeGeometry,
  Mesh,
  MeshStandardMaterial,
  Path,
  Shape,
  Vector2,
  type BufferGeometry,
  type Material
} from 'three';

/** A silhouette with a stable key, so identical shapes share one geometry. */
export interface ShapeDef {
  key: string;
  make(): Shape;
}

export const ellipse = (rx: number, ry: number): ShapeDef => ({
  key: `ellipse:${rx}:${ry}`,
  make() {
    const shape = new Shape();
    shape.absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
    return shape;
  }
});

export const rect = (w: number, h: number): ShapeDef => ({
  key: `rect:${w}:${h}`,
  make: () =>
    new Shape([
      new Vector2(-w / 2, -h / 2),
      new Vector2(w / 2, -h / 2),
      new Vector2(w / 2, h / 2),
      new Vector2(-w / 2, h / 2)
    ])
});

/** A triangle with its base on y = 0 and its apex at y = h. */
export const triangle = (w: number, h: number): ShapeDef => ({
  key: `triangle:${w}:${h}`,
  make: () => new Shape([new Vector2(-w / 2, 0), new Vector2(w / 2, 0), new Vector2(0, h)])
});

export const ring = (radius: number, thickness: number): ShapeDef => ({
  key: `ring:${radius}:${thickness}`,
  make() {
    const shape = new Shape();
    shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
    const hole = new Path();
    hole.absarc(0, 0, radius - thickness, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    return shape;
  }
});

/** Anything with a `dispose` method that the cache can release for its owner. */
export interface Disposable {
  dispose(): void;
}

export interface MaterialOptions {
  /** Props that fade in and out get their own materials, grouped under a tag. */
  tag?: string;
  /** The opacity when fully present. Anything below 1 makes the material transparent. */
  opacity?: number;
  roughness?: number;
}

/** Shared geometries and materials for one renderer. Everything it hands out is freed together. */
export interface SlabCache {
  geometry(shape: ShapeDef, depth: number, bevel: number): ExtrudeGeometry;
  material(colour: number, options?: MaterialOptions): MeshStandardMaterial;
  /** Hand over something else to free when the cache is disposed. */
  adopt<T extends Disposable>(resource: T): T;
  /** The materials created under a tag. */
  materialsFor(tag: string): MeshStandardMaterial[];
  readonly geometryCount: number;
  readonly materialCount: number;
  dispose(): void;
}

const CURVE_SEGMENTS = 24;

export function createSlabCache(): SlabCache {
  const geometries = new Map<string, ExtrudeGeometry>();
  const materials = new Map<string, MeshStandardMaterial>();
  const tagged = new Map<string, MeshStandardMaterial[]>();
  const adopted = new Set<Disposable>();
  let disposed = false;

  return {
    geometry(shape, depth, bevel) {
      const key = `${shape.key}|${depth}|${bevel}`;
      let geometry = geometries.get(key);
      if (!geometry) {
        geometry = new ExtrudeGeometry(shape.make(), {
          depth,
          bevelEnabled: bevel > 0,
          bevelThickness: bevel,
          bevelSize: bevel,
          bevelSegments: 3,
          curveSegments: CURVE_SEGMENTS
        });
        geometry.translate(0, 0, -depth / 2);
        geometries.set(key, geometry);
      }
      return geometry;
    },
    material(colour, options = {}) {
      const { tag, opacity = 1, roughness = 0.78 } = options;
      const key = `${colour}|${tag ?? ''}|${opacity}|${roughness}`;
      let material = materials.get(key);
      if (!material) {
        material = new MeshStandardMaterial({
          color: colour,
          roughness,
          metalness: 0,
          transparent: tag !== undefined || opacity < 1,
          opacity
        });
        materials.set(key, material);
        if (tag !== undefined) {
          const list = tagged.get(tag) ?? [];
          list.push(material);
          tagged.set(tag, list);
        }
      }
      return material;
    },
    adopt(resource) {
      adopted.add(resource);
      return resource;
    },
    materialsFor: (tag) => tagged.get(tag) ?? [],
    get geometryCount() {
      return geometries.size;
    },
    get materialCount() {
      return materials.size;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries.values()) geometry.dispose();
      for (const material of materials.values()) material.dispose();
      for (const resource of adopted) resource.dispose();
      geometries.clear();
      materials.clear();
      tagged.clear();
      adopted.clear();
    }
  };
}

export interface SlabSpec {
  shape: ShapeDef;
  depth: number;
  colour: number;
  position?: readonly [number, number, number];
  /** Rounds the edges. Default 0.06. */
  bevel?: number;
  material?: MaterialOptions;
}

/** Build one slab mesh from cached geometry and material. */
export function slab(cache: SlabCache, spec: SlabSpec): Mesh<BufferGeometry, Material> {
  const mesh = new Mesh(
    cache.geometry(spec.shape, spec.depth, spec.bevel ?? 0.06),
    cache.material(spec.colour, spec.material)
  );
  if (spec.position) mesh.position.set(...spec.position);
  return mesh;
}

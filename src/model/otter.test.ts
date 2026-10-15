// Tests for the otter rig: every pose channel lands somewhere, props enter and exit, and disposal
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it, vi } from 'vitest';
import type { BufferGeometry, Material, Object3D } from 'three';
import { POSE_CHANNELS, PROP_CHANNELS, neutralPose, type PoseChannel } from '../types';
import { defaultSkin } from './defaultSkin';
import { PROP_CHANNEL, PROP_NAMES, buildOtter } from './otter';

/** Everything about the rig that a pose can change, as one comparable string. */
function snapshot(root: Object3D): string {
  const rows: unknown[] = [];
  root.traverse((o) => {
    const material = (o as { material?: Material }).material;
    rows.push([
      o.visible,
      ...o.position.toArray(),
      o.rotation.x,
      o.rotation.y,
      o.rotation.z,
      ...o.scale.toArray(),
      material?.opacity
    ]);
  });
  return JSON.stringify(rows);
}

describe('otter rig', () => {
  it('exposes the named pivots and a group per prop', () => {
    const rig = buildOtter(defaultSkin);
    for (const pivot of [rig.body, rig.head, rig.eyes, rig.armL, rig.armR, rig.tail, rig.book]) {
      expect(pivot.isGroup).toBe(true);
    }
    expect(Object.keys(rig.props).sort()).toEqual([...PROP_NAMES].sort());
  });

  it('maps every pose channel onto the rig', () => {
    const rig = buildOtter(defaultSkin);
    rig.apply(neutralPose());
    const baseline = snapshot(rig.group);
    for (const channel of POSE_CHANNELS) {
      const pose = neutralPose();
      pose[channel] = channel === 'eyeOpen' ? 0.4 : 0.7;
      rig.apply(pose);
      expect(snapshot(rig.group), `channel ${channel} changes nothing`).not.toBe(baseline);
      rig.apply(neutralPose());
      expect(snapshot(rig.group), `channel ${channel} does not reset`).toBe(baseline);
    }
  });

  it('has a prop for every prop channel', () => {
    expect(PROP_NAMES.map((n) => PROP_CHANNEL[n]).sort()).toEqual([...PROP_CHANNELS].sort());
  });

  it('hides a prop at exactly 0 and shows it at 1', () => {
    const rig = buildOtter(defaultSkin);
    for (const name of PROP_NAMES) {
      const channel = PROP_CHANNEL[name] as PoseChannel;
      rig.apply(neutralPose());
      expect(rig.props[name].visible, `${name} at 0`).toBe(false);
      const on = neutralPose();
      on[channel] = 1;
      rig.apply(on);
      expect(rig.props[name].visible, `${name} at 1`).toBe(true);
      expect(rig.props[name].scale.x).toBeCloseTo(1, 5);
    }
  });

  it('fades a prop in with its presence rather than popping', () => {
    const rig = buildOtter(defaultSkin);
    const pose = neutralPose();
    pose.propHat = 0.2;
    rig.apply(pose);
    const [material] = rig.cache.materialsFor('hat');
    expect(material.opacity).toBeGreaterThan(0);
    expect(material.opacity).toBeLessThan(1);
    pose.propHat = 1;
    rig.apply(pose);
    expect(material.opacity).toBe(1);
  });

  it('leaves out props a skin disallows', () => {
    const rig = buildOtter({ ...defaultSkin, props: { hat: false } });
    expect(rig.props.hat.children).toHaveLength(0);
  });

  it('blinks by squashing the eyes', () => {
    const rig = buildOtter(defaultSkin);
    const pose = neutralPose();
    pose.eyeOpen = 0;
    rig.apply(pose);
    expect(rig.eyes.scale.y).toBeLessThan(0.1);
    expect(rig.eyes.scale.y).toBeGreaterThan(0);
  });

  it('disposes every geometry and material exactly once', () => {
    const rig = buildOtter(defaultSkin);
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    rig.group.traverse((o) => {
      const mesh = o as { geometry?: BufferGeometry; material?: Material };
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) materials.add(mesh.material);
    });
    expect(geometries.size).toBeGreaterThan(10);
    const spies = [...geometries, ...materials].map((r) => vi.spyOn(r, 'dispose'));
    rig.dispose();
    rig.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});

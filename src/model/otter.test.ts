// Tests for the otter rig: every pose channel lands somewhere, props enter and exit, and disposal
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, expect, it, vi } from 'vitest';
import { Vector3, type BufferGeometry, type Material, type Object3D } from 'three';
import { POSE_CHANNELS, PROP_CHANNELS, neutralPose, type PoseChannel } from '../types.js';
import { defaultSkin } from './defaultSkin.js';
import { PROP_CHANNEL, PROP_NAMES, buildOtter } from './otter.js';

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
    // The book he holds has its own channel and is not one of the swappable props
    const expected = PROP_CHANNELS.filter((c) => c !== 'propBook');
    expect(PROP_NAMES.map((n) => PROP_CHANNEL[n]).sort()).toEqual([...expected].sort());
  });

  it('shows the book at rest, shrinks it away with `propBook` and brings it back', () => {
    const rig = buildOtter(defaultSkin);
    rig.apply(neutralPose());
    expect(rig.book.visible).toBe(true);
    expect(rig.book.scale.x).toBeCloseTo(1, 5);
    const away = neutralPose();
    away.propBook = 0;
    rig.apply(away);
    expect(rig.book.visible).toBe(false);
    // Other props do not move the book any more
    const hat = neutralPose();
    hat.propHat = 1;
    rig.apply(hat);
    expect(rig.book.visible).toBe(true);
  });

  it('shows the thumb with `propThumb` and nothing else', () => {
    const rig = buildOtter(defaultSkin);
    const pose = neutralPose();
    pose.propThumb = 1;
    rig.apply(pose);
    expect(rig.props.thumb.visible).toBe(true);
    for (const name of PROP_NAMES)
      if (name !== 'thumb') expect(rig.props[name].visible).toBe(false);
  });

  it('lies him on his back with `bodyRoll` alone, not with a prop', () => {
    const rig = buildOtter(defaultSkin);
    const water = neutralPose();
    water.propWater = 1;
    rig.apply(water);
    expect(rig.body.rotation.z).toBe(0);
    const roll = neutralPose();
    roll.bodyRoll = -Math.PI / 2;
    rig.apply(roll);
    expect(rig.body.rotation.z).toBeCloseTo(-Math.PI / 2, 5);
  });

  describe('sign conventions', () => {
    /** Where the end of an arm (one unit down its length) lands in the figure's space. */
    function armEnd(rig: ReturnType<typeof buildOtter>, arm: 'armL' | 'armR'): Vector3 {
      rig.group.updateMatrixWorld(true);
      return rig.group.worldToLocal(rig[arm].localToWorld(new Vector3(0, -1, 0)));
    }

    it('lifts both arms outwards for a positive raise, mirroring the left', () => {
      const rig = buildOtter(defaultSkin);
      rig.apply(neutralPose());
      const hangL = armEnd(rig, 'armL');
      const hangR = armEnd(rig, 'armR');
      const pose = neutralPose();
      pose.armLRaise = 1;
      pose.armRRaise = 1;
      rig.apply(pose);
      const l = armEnd(rig, 'armL');
      const r = armEnd(rig, 'armR');
      expect(l.x - hangL.x).toBeLessThan(-0.5);
      expect(r.x - hangR.x).toBeGreaterThan(0.5);
      expect(l.y).toBeGreaterThan(hangL.y);
      expect(r.y).toBeGreaterThan(hangR.y);
      expect(l.y).toBeCloseTo(r.y, 5);
    });

    it('swings both arms towards the viewer for a positive forward', () => {
      const rig = buildOtter(defaultSkin);
      const pose = neutralPose();
      pose.armLForward = 0.6;
      pose.armRForward = 0.6;
      rig.apply(pose);
      expect(armEnd(rig, 'armL').z).toBeGreaterThan(0.3);
      expect(armEnd(rig, 'armR').z).toBeGreaterThan(0.3);
    });

    it('nods down for a positive pitch, squashes for a positive squash and looks up for a positive lookY', () => {
      const rig = buildOtter(defaultSkin);
      rig.apply(neutralPose());
      const nose = () => {
        rig.group.updateMatrixWorld(true);
        return rig.group.worldToLocal(rig.head.localToWorld(new Vector3(0, 0, 1)));
      };
      const level = nose().y;
      const pose = neutralPose();
      pose.headPitch = 0.4;
      pose.bodySquash = 0.2;
      pose.lookY = 1;
      rig.apply(pose);
      expect(nose().y).toBeLessThan(level - 0.2);
      expect(rig.body.scale.y).toBeLessThan(1);
      expect(rig.eyes.position.y).toBeGreaterThan(0.12);
    });

    it('accepts yaw past a full turn and draws it as the same pose', () => {
      const rig = buildOtter(defaultSkin);
      const pose = neutralPose();
      pose.bodyYaw = 0.5;
      pose.headYaw = 0.3;
      rig.apply(pose);
      rig.group.updateMatrixWorld(true);
      const before = rig.body.matrix.clone();
      const headBefore = rig.head.matrix.clone();
      pose.bodyYaw = 0.5 + Math.PI * 4;
      pose.headYaw = 0.3 - Math.PI * 2;
      rig.apply(pose);
      rig.group.updateMatrixWorld(true);
      expect(rig.body.rotation.y).toBeCloseTo(0.5 + Math.PI * 4, 9);
      for (const [a, b] of [
        [before, rig.body.matrix],
        [headBefore, rig.head.matrix]
      ]) {
        for (let i = 0; i < 16; i++) expect(b.elements[i]).toBeCloseTo(a.elements[i], 5);
      }
    });
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

  describe('cheeks and hats', () => {
    const cheeksIn = (rig: ReturnType<typeof buildOtter>) => {
      const found: Object3D[] = [];
      rig.group.traverse((o) => o.name === 'cheek' && found.push(o));
      return found;
    };

    it('defaults to no cheeks and no hat', () => {
      expect(defaultSkin.cheeks).toBe(false);
      expect(defaultSkin.hat).toBe('none');
      const rig = buildOtter(defaultSkin);
      expect(cheeksIn(rig)).toHaveLength(0);
      expect(rig.hat).toBeUndefined();
    });

    it('builds both cheeks only when asked', () => {
      expect(cheeksIn(buildOtter({ ...defaultSkin, cheeks: true }))).toHaveLength(2);
      expect(cheeksIn(buildOtter({ ...defaultSkin, cheeks: false }))).toHaveLength(0);
    });

    it('builds the named group for each hat on the head', () => {
      for (const hat of ['peakCap', 'topHat', 'party'] as const) {
        const rig = buildOtter({ ...defaultSkin, hat });
        expect(rig.hat?.name).toBe(`hat-${hat}`);
        expect(rig.hat?.parent).toBe(rig.head);
        expect(rig.hat!.children.length).toBeGreaterThan(2);
      }
    });

    it('steps aside for the party hat and returns afterwards', () => {
      const rig = buildOtter({ ...defaultSkin, hat: 'topHat' });
      const hat = rig.hat!;
      const pose = neutralPose();
      rig.apply(pose);
      expect(hat.visible).toBe(true);
      expect(hat.scale.x).toBeCloseTo(1, 5);
      pose.propHat = 0.75;
      rig.apply(pose);
      expect(hat.visible).toBe(true);
      expect(hat.scale.x).toBeLessThan(1.1);
      const [material] = rig.cache.materialsFor('skinHat');
      expect(material.opacity).toBeLessThan(1);
      pose.propHat = 1;
      rig.apply(pose);
      expect(hat.visible).toBe(false);
      expect(rig.props.hat.visible).toBe(true);
      pose.propHat = 0;
      rig.apply(pose);
      expect(hat.visible).toBe(true);
      expect(material.opacity).toBe(1);
    });

    it('keeps a chosen party hat on at every party strength, never doubled', () => {
      const rig = buildOtter({ ...defaultSkin, hat: 'party' });
      const pose = neutralPose();
      for (const propHat of [0, 0.5, 1, 0]) {
        pose.propHat = propHat;
        rig.apply(pose);
        const visible: Object3D[] = [];
        rig.group.traverse((o) => {
          const shown = (n: Object3D | null): boolean => !n || (n.visible && shown(n.parent));
          if (o.name === 'hat-party' || o === rig.props.hat) {
            if (shown(o) && o.children.length > 0) visible.push(o);
          }
        });
        expect(visible).toHaveLength(1);
        expect(visible[0]).toBe(rig.hat);
        expect(rig.props.hat.visible).toBe(false);
        expect(rig.hat!.scale.x).toBeCloseTo(1, 5);
        const [material] = rig.cache.materialsFor('skinHat');
        expect(material.opacity).toBe(1);
      }
    });

    it('leaves the mood hat prop alone for the other hats', () => {
      const rig = buildOtter({ ...defaultSkin, hat: 'topHat' });
      expect(rig.props.hat.children.length).toBeGreaterThan(2);
      const plain = buildOtter(defaultSkin);
      expect(plain.props.hat.children.length).toBeGreaterThan(2);
      const pose = neutralPose();
      pose.propHat = 0.5;
      plain.apply(pose);
      expect(plain.props.hat.visible).toBe(true);
    });

    it('frees the hat and cheek geometry on dispose', () => {
      const rig = buildOtter({ ...defaultSkin, hat: 'peakCap', cheeks: true });
      const spies: ReturnType<typeof vi.spyOn>[] = [];
      rig.hat!.traverse((o) => {
        const mesh = o as { geometry?: BufferGeometry };
        if (mesh.geometry) spies.push(vi.spyOn(mesh.geometry, 'dispose'));
      });
      expect(spies.length).toBeGreaterThan(2);
      rig.dispose();
      for (const spy of spies) expect(spy).toHaveBeenCalled();
    });
  });
});

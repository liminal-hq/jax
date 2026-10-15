// The demo page: a hero Jax, a row of mood chips, a tile for every mood and a few switches
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
  createJax,
  defaultSkin,
  JaxUnavailableError,
  MOODS,
  type Jax,
  type Mood,
  type Skin
} from '../src';
import { createFallbackJax } from '../src/fallback';

const moonlight: Skin = {
  ...defaultSkin,
  name: 'moonlight',
  colours: {
    ...defaultSkin.colours,
    fur: 0x6b7a99,
    furDark: 0x47536d,
    cream: 0xdde6f5,
    book: 0xffb454
  },
  lights: { ...defaultSkin.lights, key: 0xdbe7ff, rim: 0xe25d75 }
};

const state = {
  skin: defaultSkin,
  fallback: false,
  reduced: false,
  cycling: false,
  mood: 'chill' as Mood
};
let instances: Jax[] = [];
let heroJax: Jax | undefined;
let cycleTimer: ReturnType<typeof setInterval> | undefined;
let generation = 0;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

async function spawn(host: HTMLElement, size: number): Promise<Jax> {
  const options = { size, skin: state.skin, reducedMotion: state.reduced };
  if (!state.fallback) {
    try {
      return await createJax(host, options);
    } catch (error) {
      if (!(error instanceof JaxUnavailableError)) throw error;
    }
  }
  return createFallbackJax(host, options);
}

async function mountAll(): Promise<void> {
  const mine = ++generation;
  for (const jax of instances) jax.dispose();
  instances = [];
  $('hero').replaceChildren();
  $('grid').replaceChildren();

  const hero = await spawn($('hero'), Math.min(560, window.innerWidth - 72));
  if (mine !== generation) return hero.dispose();
  hero.setMood(state.mood);
  heroJax = hero;
  instances.push(hero);

  for (const mood of MOODS) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    const holder = document.createElement('div');
    const label = document.createElement('span');
    label.textContent = mood;
    tile.append(holder, label);
    $('grid').append(tile);
    const jax = await spawn(holder, 140);
    if (mine !== generation) return jax.dispose();
    jax.setMood(mood);
    tile.addEventListener('click', () => {
      setMood(mood);
    });
    instances.push(jax);
  }
}

function setMood(mood: Mood): void {
  state.mood = mood;
  heroJax?.setMood(mood);
  for (const chip of Array.from($('chips').children)) {
    chip.setAttribute('aria-current', String(chip.textContent === mood));
  }
}

function toggle(label: string, key: 'fallback' | 'reduced' | 'cycling', after: () => void) {
  const b = button(label, () => {
    state[key] = !state[key];
    b.setAttribute('aria-pressed', String(state[key]));
    after();
  });
  b.setAttribute('aria-pressed', 'false');
  $('controls').append(b);
}

for (const mood of MOODS) $('chips').append(button(mood, () => setMood(mood)));

toggle('Auto-cycle', 'cycling', () => {
  clearInterval(cycleTimer);
  if (!state.cycling) return;
  cycleTimer = setInterval(() => {
    setMood(MOODS[(MOODS.indexOf(state.mood) + 1) % MOODS.length]);
  }, 4000);
});
const skinButton = button('Skin: afterglow', () => {
  state.skin = state.skin === defaultSkin ? moonlight : defaultSkin;
  skinButton.textContent = `Skin: ${state.skin.name}`;
  void mountAll();
});
$('controls').append(skinButton);
toggle('Force fallback', 'fallback', () => void mountAll());
toggle('Reduced motion', 'reduced', () => {
  for (const jax of instances) jax.setReducedMotion(state.reduced);
});

setMood('chill');
void mountAll();

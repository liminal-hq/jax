// The stylesheet for the SVG fallback: moods as `data-mood` selectors and CSS-only animation
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// Class-name contract: every class starts with `lq-jax-`. The root `<svg>` carries
// `lq-jax-fallback`, a `data-mood` attribute and, when motion is off, `lq-jax-still`. Parts are
// `lq-jax-body`, `lq-jax-head`, `lq-jax-eyes`, `lq-jax-arm-l`, `lq-jax-arm-r` and `lq-jax-tail`.
// Props are `lq-jax-prop-<name>` and show only for the moods that use them. The optional cheeks are `lq-jax-cheek` and the worn hat is `lq-jax-worn-hat`, hidden for the party mood.

export const FALLBACK_STYLE_ID = 'lq-jax-fallback-styles';

const PROP_MOODS: Record<string, string[]> = {
  page: ['flipping'],
  pencil: ['writing'],
  magnifier: ['checking'],
  rod: ['fishing'],
  mug: ['tea'],
  thumb: ['thumbsup'],
  printer: ['printing'],
  hat: ['party'],
  confetti: ['party'],
  zzz: ['nap'],
  question: ['stuck']
};

const propRules = Object.entries(PROP_MOODS)
  .map(([prop, moods]) => {
    const shown = moods.map((m) => `.lq-jax-fallback[data-mood='${m}'] .lq-jax-prop-${prop}`);
    return `${shown.join(',')}{opacity:1}`;
  })
  .join('\n');

export const FALLBACK_CSS = `
.lq-jax-fallback{display:block;overflow:visible}
.lq-jax-fallback .lq-jax-prop{opacity:0;transition:opacity .4s ease}
${propRules}
.lq-jax-fallback .lq-jax-worn-hat{transition:opacity .4s ease}
.lq-jax-fallback[data-mood='party'] .lq-jax-worn-hat{opacity:0}
.lq-jax-fallback[data-mood='nap'] .lq-jax-eyes{transform:scaleY(.12)}
.lq-jax-fallback .lq-jax-eyes,.lq-jax-fallback .lq-jax-head,.lq-jax-fallback .lq-jax-arm-r,
.lq-jax-fallback .lq-jax-arm-l,.lq-jax-fallback .lq-jax-body,.lq-jax-fallback .lq-jax-prop-confetti,
.lq-jax-fallback .lq-jax-prop-zzz,.lq-jax-fallback .lq-jax-prop-page{transform-box:fill-box;transform-origin:center}
.lq-jax-fallback .lq-jax-head{transform-origin:50% 90%}
.lq-jax-fallback .lq-jax-arm-r{transform-origin:50% 10%}
.lq-jax-fallback .lq-jax-arm-l{transform-origin:50% 10%}
.lq-jax-fallback .lq-jax-eyes,.lq-jax-fallback .lq-jax-head,.lq-jax-fallback .lq-jax-arm-r,
.lq-jax-fallback .lq-jax-arm-l{transition:transform .5s ease}
.lq-jax-fallback[data-mood='thumbsup'] .lq-jax-arm-r,
.lq-jax-fallback[data-mood='checking'] .lq-jax-arm-r,
.lq-jax-fallback[data-mood='fishing'] .lq-jax-arm-r{transform:rotate(-35deg)}
.lq-jax-fallback[data-mood='wave'] .lq-jax-arm-r,
.lq-jax-fallback[data-mood='stuck'] .lq-jax-arm-r{transform:rotate(-150deg)}
.lq-jax-fallback[data-mood='party'] .lq-jax-arm-r{transform:rotate(-140deg)}
.lq-jax-fallback[data-mood='party'] .lq-jax-arm-l{transform:rotate(140deg)}
.lq-jax-fallback[data-mood='tea'] .lq-jax-arm-l{transform:rotate(40deg)}
.lq-jax-fallback[data-mood='writing'] .lq-jax-head,
.lq-jax-fallback[data-mood='printing'] .lq-jax-head{transform:rotate(4deg) translateY(2px)}
.lq-jax-fallback[data-mood='stuck'] .lq-jax-head{transform:rotate(-8deg)}
.lq-jax-fallback[data-mood='thumbsup'] .lq-jax-head{transform:rotate(6deg)}
@media (prefers-reduced-motion: no-preference){
.lq-jax-fallback .lq-jax-body{animation:lq-jax-bob 3.2s ease-in-out infinite}
.lq-jax-fallback .lq-jax-eyes{animation:lq-jax-blink 5s ease-in-out infinite}
.lq-jax-fallback[data-mood='nap'] .lq-jax-eyes{animation:none}
.lq-jax-fallback[data-mood='wave'] .lq-jax-arm-r{animation:lq-jax-wave .5s ease-in-out infinite alternate}
.lq-jax-fallback[data-mood='stuck'] .lq-jax-head{animation:lq-jax-shake .3s ease-in-out infinite alternate}
.lq-jax-fallback[data-mood='writing'] .lq-jax-prop-pencil{animation:lq-jax-scribble .2s ease-in-out infinite alternate}
.lq-jax-fallback[data-mood='checking'] .lq-jax-prop-magnifier{animation:lq-jax-scan 2.4s ease-in-out infinite alternate}
.lq-jax-fallback[data-mood='flipping'] .lq-jax-prop-page{animation:lq-jax-flip 2.4s ease-in-out infinite}
.lq-jax-fallback[data-mood='fishing'] .lq-jax-prop-rod{animation:lq-jax-bob 2.4s ease-in-out infinite}
.lq-jax-fallback[data-mood='party'] .lq-jax-body{animation:lq-jax-hop .6s ease-in-out infinite}
.lq-jax-fallback[data-mood='party'] .lq-jax-prop-confetti{animation:lq-jax-fall 1.6s linear infinite}
.lq-jax-fallback[data-mood='nap'] .lq-jax-prop-zzz{animation:lq-jax-float 2.4s ease-in-out infinite}
.lq-jax-fallback[data-mood='printing'] .lq-jax-prop-printer{animation:lq-jax-shake .1s linear infinite alternate}
}
.lq-jax-fallback.lq-jax-still *{animation:none !important}
@keyframes lq-jax-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes lq-jax-hop{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes lq-jax-blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
@keyframes lq-jax-wave{from{transform:rotate(-135deg)}to{transform:rotate(-165deg)}}
@keyframes lq-jax-shake{from{transform:rotate(-2deg)}to{transform:rotate(2deg)}}
@keyframes lq-jax-scribble{from{transform:translateX(-2px)}to{transform:translateX(2px)}}
@keyframes lq-jax-scan{from{transform:translateX(-4px)}to{transform:translateX(4px)}}
@keyframes lq-jax-flip{0%,30%{transform:scaleX(1)}60%{transform:scaleX(-1)}100%{transform:scaleX(-1)}}
@keyframes lq-jax-fall{from{transform:translateY(-14px)}to{transform:translateY(18px)}}
@keyframes lq-jax-float{from{transform:translateY(0)}to{transform:translateY(-8px)}}
`;

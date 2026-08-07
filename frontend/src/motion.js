/* DOCKET motion + audio vocabulary.

   The house style is physical, not arcade: things press, settle, unfold and
   stamp. Four durations and three easings: anything that needs a fifth is
   probably the wrong idea. Every animation here is skippable, interruptible and
   silent under `prefers-reduced-motion`; sound is opt-in and off until switched
   on from the top bar. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { BP } from "./breakpoints";

export const DUR = { quick: 120, base: 200, settle: 320, ceremony: 620 };
export const EASE = {
  standard: "cubic-bezier(.4,0,.2,1)",   // ordinary state changes
  out: "cubic-bezier(.16,1,.3,1)",       // things arriving / settling
  press: "cubic-bezier(.34,1.56,.64,1)", // slight overshoot: stamps, rolls
};

export const reducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {
    return false;
  }
};

/* ---------------- hooks ---------------- */

/** Re-render on a clock. `ms=0` stops the timer (closed auctions, unmounted rooms). */
export function useTicker(ms) {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!ms) return;
    const h = setInterval(() => bump((n) => n + 1), ms);
    return () => clearInterval(h);
  }, [ms]);
  return Date.now();
}

/** Previous value of anything: the basis for "did my rank just get worse?". */
export function usePrev(value) {
  const ref = useRef(undefined);
  useEffect(() => { ref.current = value; }, [value]);
  return ref.current;
}

/** Count a number up to its target. Returns the target immediately when the
    viewer prefers reduced motion, or when the jump is trivial.

    `mountFrom` is where the first render starts: pass 0 and the figure counts
    up on arrival, which is what a stat tile wants. Omit it and the value only
    animates when it later changes, which is what a live total wants. */
export function useCountUp(target, ms = DUR.ceremony, mountFrom) {
  const start0 = mountFrom == null ? target : mountFrom;
  const [v, setV] = useState(start0);
  const from = useRef(start0);
  useEffect(() => {
    const start = from.current;
    if (start === target || reducedMotion()) { from.current = target; setV(target); return; }
    const t0 = performance.now();
    let raf;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);            // ease-out cubic
      setV(Math.round(start + (target - start) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

// Layout effects don't exist on the server; fall back so SSR/test renders stay quiet.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** FLIP: animate rows to their new positions after a reorder. Mark each row
    with `data-flip="<stable key>"`; pass a signature that changes with order. */
export function useFlip(ref, signature) {
  const prev = useRef(new Map());
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rows = el.querySelectorAll("[data-flip]");
    const next = new Map();
    rows.forEach((r) => next.set(r.dataset.flip, r.getBoundingClientRect().top));
    if (!reducedMotion() && prev.current.size) {
      rows.forEach((r) => {
        const before = prev.current.get(r.dataset.flip);
        const after = next.get(r.dataset.flip);
        if (before != null && Math.abs(before - after) > 1) {
          r.animate([{ transform: `translateY(${before - after}px)` }, { transform: "none" }],
                    { duration: DUR.settle, easing: EASE.out });
        }
      });
    }
    prev.current = next;
  }, [ref, signature]);
}


/* ---------------- view transitions ----------------
   Where the browser has the View Transitions API, a route change cross-fades
   the whole document in one call and no library. React has to commit
   synchronously inside the callback for the browser to capture the "after"
   state, which is what flushSync is for. Everywhere else this is a plain
   state update, and the page gets a keyed enter animation instead. */

export const hasViewTransitions = () => {
  try {
    return typeof document !== "undefined" && typeof document.startViewTransition === "function";
  } catch (e) {
    return false;
  }
};

/** Runs `commit` inside a view transition when one is available and wanted. */
export function withViewTransition(commit) {
  if (!hasViewTransitions() || reducedMotion()) { commit(); return; }
  try {
    document.startViewTransition(commit);
  } catch (e) {
    commit();
  }
}

/* ---------------- reveal on scroll ----------------
   Anything below the fold arrives as you reach it, once. Elements opt in with
   data-reveal; the observer disconnects after the last one has been seen, so a
   long page does not keep an observer alive for the session. */
export function useReveal(deps) {
  useEffect(() => {
    if (reducedMotion() || typeof IntersectionObserver === "undefined") {
      document.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("seen"));
      return undefined;
    }
    const targets = [...document.querySelectorAll("[data-reveal]:not(.seen)")];
    if (!targets.length) return undefined;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("seen");
          io.unobserve(e.target);
        }
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* ---------------- clock formatting ---------------- */

/** Human time remaining. Coarse far out, exact when it matters:
    "4d 6h" · "6h 12m" · "12:04" · "0:41". */
export function fmtRemaining(ms) {
  if (ms == null || Number.isNaN(ms)) return "-";
  if (ms <= 0) return "closed";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d >= 1) return `${d}d ${h}h`;
  if (h >= 1) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** How often a countdown needs to re-render to look honest. */
export const tickRateFor = (ms) => (ms == null || ms <= 0 ? 0 : ms < 2 * 3600_000 ? 1000 : 60_000);

/* ---------------- audio cues ----------------
   Synthesised with WebAudio: four short cues, zero asset weight, no CDN.
   Off by default; the AudioContext is only created after a real click. */

const SOUND_KEY = "docket.sound";
let ctx = null;

export const soundEnabled = () => {
  try { return localStorage.getItem(SOUND_KEY) === "1"; } catch (e) { return false; }
};
export const setSoundEnabled = (on) => {
  try { localStorage.setItem(SOUND_KEY, on ? "1" : "0"); } catch (e) { /* private mode */ }
};

function audio() {
  if (!soundEnabled()) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch (e) {
    return null;
  }
}

/** One shaped tone. Gains stay low: these are cues, not notifications. */
function tone(freq, { to, dur = 0.14, type = "sine", gain = 0.14, delay = 0 } = {}) {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Filtered noise: the paper/wax half of the vocabulary. */
function noise({ dur = 0.16, gain = 0.06, from = 1800, to = 400, q = 0.7, delay = 0 } = {}) {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const frames = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = "lowpass";
  filt.Q.value = q;
  filt.frequency.setValueAtTime(from, t0);
  filt.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const amp = c.createGain();
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt).connect(amp).connect(c.destination);
  src.start(t0);
}

export const cue = {
  /** Wax seal pressing into paper. */
  stamp() { tone(150, { to: 60, dur: 0.13, type: "sine", gain: 0.2 }); noise({ dur: 0.14, gain: 0.05, from: 900, to: 200 }); },
  /** A price movement / rank digit turning over. */
  tick() { tone(1180, { dur: 0.045, type: "square", gain: 0.05 }); },
  /** You took the lead. */
  lead() { tone(660, { dur: 0.1, gain: 0.11 }); tone(990, { dur: 0.16, gain: 0.1, delay: 0.09 }); },
  /** You were overtaken. */
  outbid() { tone(500, { dur: 0.11, gain: 0.11 }); tone(340, { dur: 0.2, gain: 0.1, delay: 0.1 }); },
  /** Envelope opening. */
  tear() { noise({ dur: 0.34, gain: 0.07, from: 2600, to: 500, q: 1.2 }); },
  /** Award: a brass-ish triad, the only cue allowed to feel like a reward. */
  chime() { [523, 659, 784].forEach((f, i) => tone(f, { dur: 0.5, gain: 0.09, type: "triangle", delay: i * 0.075 })); },
};

/* ---------------- CSS ----------------
   Injected alongside CSS + EXTRA_CSS. Keyframes here, not scattered. */

export const MOTION_CSS = `
.brassfg{color:var(--brass)}

/* ---- keyframes ---- */
@keyframes dk-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes dk-in{from{opacity:0}to{opacity:1}}
@keyframes dk-pop{0%{opacity:0;transform:scale(.96) translateY(6px)}100%{opacity:1;transform:none}}
@keyframes dk-press{0%{transform:scale(1.35);opacity:.35}62%{transform:scale(.94);opacity:1}100%{transform:scale(1)}}
@keyframes dk-flash{0%{background:var(--green-tint)}100%{background:transparent}}
@keyframes dk-flash-wax{0%{background:var(--wax-tint)}100%{background:transparent}}
@keyframes dk-urgent{0%,100%{opacity:1}50%{opacity:.45}}
@keyframes dk-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-3px)}40%{transform:translateX(3px)}60%{transform:translateX(-2px)}80%{transform:translateX(2px)}}
@keyframes dk-sheen{0%{transform:translateX(-120%)}100%{transform:translateX(220%)}}
@keyframes dk-shimmer{0%{background-position:-420px 0}100%{background-position:420px 0}}
@keyframes dk-unfold{0%{opacity:0;transform:scaleY(.82) translateY(-6px);transform-origin:top}
  100%{opacity:1;transform:none;transform-origin:top}}
@keyframes dk-crack{0%{transform:scale(1) rotate(0)}
  38%{transform:scale(1.16) rotate(-4deg)}
  100%{transform:scale(1) rotate(2deg)}}
@keyframes dk-page{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes dk-draw{from{stroke-dashoffset:var(--dash,1400)}to{stroke-dashoffset:0}}
@keyframes dk-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes dk-out{to{opacity:0;transform:translateX(14px) scale(.97)}}
@keyframes dk-bar{0%{transform:translateX(-100%) scaleX(.35)}
  50%{transform:translateX(20%) scaleX(.55)}100%{transform:translateX(110%) scaleX(.4)}}
@keyframes dk-shard{0%{opacity:.9;transform:translate(0,0) rotate(0);}
  100%{opacity:0;transform:translate(var(--sx),var(--sy)) rotate(var(--sr));}}
/* a sheet rises from the edge it is docked to */
@keyframes dk-sheet{from{transform:translateY(16px);opacity:.4}to{transform:none;opacity:1}}

/* ---- toasts ----
   Full width above the home bar on a phone (a 352px card pinned bottom-right
   lands under the thumb that is scrolling), a stack in the corner on a desktop. */
.toasts{position:fixed;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));
  z-index:200;display:flex;flex-direction:column;gap:9px;pointer-events:none}
/* Toasts sit above everything, which means above the action row of an open
   dialog or panel — both are anchored to the same bottom edge, and a phone has
   no room for two. While an overlay is up, the stack moves to the top of the
   screen: the sheet is a dialog, so the space above it is empty. A browser
   without :has() drops this rule and keeps the old behaviour. */
body:has(.scrim,.panelwrap) .toasts{top:calc(10px + env(safe-area-inset-top,0px));bottom:auto}
.toast{pointer-events:auto;background:var(--card);border:1px solid var(--line);border-left:3px solid var(--green);
  border-radius:var(--r-sm);box-shadow:var(--sh-3);padding:11px 13px;display:flex;gap:10px;align-items:flex-start;
  animation:dk-pop ${DUR.settle}ms ${EASE.out} both}
.toast.warn{border-left-color:var(--wax)}
.toast.info{border-left-color:var(--brass)}
.toast .tt{font-weight:600;font-size:13px;letter-spacing:-.004em}
.toast .tb{color:var(--muted);font-size:12.5px;line-height:1.5;margin-top:2px}
/* the dismiss target is finger-sized on a phone, small on a desktop */
.toast .tundo{display:inline-flex;align-items:center;gap:6px;margin-top:7px;padding:4px 10px;
  border:1px solid var(--line2);border-radius:var(--r-btn);background:var(--card);color:var(--green);
  font-size:12px;font-weight:600;cursor:pointer}
.toast .tundo:hover{background:var(--green-tint);border-color:var(--green)}
.toast .tundo .ic{margin:0}
.toast .tx{background:none;border:0;color:var(--faint);font-size:14px;line-height:1;cursor:pointer;
  display:inline-flex;align-items:center;justify-content:center;min-width:32px;min-height:32px;flex-shrink:0}
.toast .tglyph{font-family:var(--font-mono);font-size:12px;font-weight:600;line-height:1.35;flex-shrink:0}

/* ---- dialogs ----
   A phone gets a bottom sheet: docked to the edge the thumb reaches, its body
   scrolling under a head and foot that stay put, and its actions full-width in
   reading order. A desktop gets the centred card it always had. */
.scrim{position:fixed;inset:0;z-index:150;background:var(--scrim);backdrop-filter:blur(2px);
  display:flex;align-items:flex-end;justify-content:center;padding:0;
  animation:dk-in ${DUR.base}ms ${EASE.standard} both}
.dlg{background:var(--card);border:1px solid var(--line2);border-bottom:0;
  border-radius:var(--r-lg) var(--r-lg) 0 0;box-shadow:var(--sh-3);
  width:100%;max-width:none;max-height:92dvh;display:flex;flex-direction:column;
  animation:dk-sheet ${DUR.settle}ms ${EASE.out} both}
.dlg h3{font-family:var(--font-serif);font-size:19px;font-weight:600;letter-spacing:-.016em;margin:0}
.dlg .dhead{flex-shrink:0;padding:16px var(--gutter) 0}
.dlg .dbody{flex:1;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;
  padding:10px var(--gutter) 4px;font-size:13.5px;line-height:1.6;color:var(--muted)}
.dlg .dbody b,.dlg .dbody strong{color:var(--ink)}
.dlg .dfoot{flex-shrink:0;display:flex;gap:9px;justify-content:flex-end;align-items:center;flex-wrap:wrap;
  padding:12px var(--gutter) calc(14px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--hair)}
.dlg .dfoot .btn{flex:1 1 auto}
.dlg .dfoot .holdhint{flex:1 1 100%;text-align:center}

/* ---- hold-to-confirm ---- */
.hold{position:relative;overflow:hidden;touch-action:none;user-select:none}
.hold .fill{position:absolute;left:0;top:0;bottom:0;width:0;background:rgba(255,255,255,.26);pointer-events:none}
.hold.plain .fill{background:var(--green-ring)}
.hold .lbl2{position:relative}
.hold[data-armed="1"]{animation:dk-shake ${DUR.settle}ms ${EASE.standard} both}
.holdhint{font-size:11.5px;color:var(--faint);letter-spacing:0}

/* ---- live clock ---- */
.clock{font-family:var(--font-mono);font-variant-numeric:tabular-nums;font-weight:550;letter-spacing:.02em}
.clock.soon{color:var(--wax)}
.clock.critical{color:var(--wax);animation:dk-urgent 1s ${EASE.standard} infinite}
.extbadge{display:inline-flex;align-items:center;gap:5px;font-family:var(--font-mono);font-size:10.5px;font-weight:600;
  letter-spacing:.08em;text-transform:uppercase;color:var(--wax);background:var(--wax-tint);border:1px solid var(--chip-warn-line);
  border-radius:99px;padding:2.5px 9px;animation:dk-pop ${DUR.settle}ms ${EASE.press} both}

/* ---- rolling digits (rank) ---- */
.roll{display:inline-flex;overflow:hidden;vertical-align:baseline}
.roll .col{overflow:hidden;height:1em;line-height:1}
.roll .strip{display:flex;flex-direction:column;transition:transform ${DUR.ceremony}ms ${EASE.press}}
.roll .strip span{height:1em;line-height:1;display:block}
.norm .roll .strip{transition:none}

/* ---- sparkline ---- */
.spark{display:block;overflow:visible}
.spark .ln{fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.spark .dot{stroke:var(--card);stroke-width:2}
.spark .hit{fill:transparent;cursor:crosshair}
.sparkwrap{position:relative}
.sparktip{position:absolute;transform:translate(-50%,-118%);background:var(--tip-bg);color:var(--tip-ink);border-radius:var(--r-xs);
  padding:5px 8px;font-family:var(--font-mono);font-size:10.5px;white-space:nowrap;pointer-events:none;
  box-shadow:var(--sh-2);z-index:5}

/* ---- misc motion ---- */
/* one entrance, in order, for a list that has just arrived. Deliberately not
   applied to every table: a row you are scanning for a number should not move. */
.stagger>*{animation:dk-rise 320ms var(--ease) both}
.stagger>*:nth-child(1){animation-delay:0ms}
.stagger>*:nth-child(2){animation-delay:45ms}
.stagger>*:nth-child(3){animation-delay:90ms}
.stagger>*:nth-child(4){animation-delay:135ms}
.stagger>*:nth-child(5){animation-delay:180ms}
.stagger>*:nth-child(6){animation-delay:225ms}
.stagger>*:nth-child(7){animation-delay:270ms}
.stagger>*:nth-child(8){animation-delay:315ms}
.stagger>*:nth-child(n+9){animation-delay:360ms}

/* a route change, where the browser has no view transition of its own */
.pageenter{animation:dk-page 300ms var(--ease) both}

/* view transitions: the old page leaves as the new one arrives, both lifted
   slightly so the change reads as forward motion rather than a flicker */
::view-transition-old(root){animation:dk-out 180ms var(--ease) both}
::view-transition-new(root){animation:dk-page 280ms var(--ease) both}

/* charts draw themselves rather than appearing complete */
.drawin{stroke-dasharray:var(--dash,1400);animation:dk-draw 720ms var(--ease) both}
.growin{transform-origin:left center;animation:dk-grow 560ms var(--ease) both}

/* arrives when you reach it */
[data-reveal]{opacity:0;transform:translateY(10px)}
[data-reveal].seen{opacity:1;transform:none;
  transition:opacity 420ms var(--ease),transform 420ms var(--ease)}

/* the indeterminate bar under the top bar while something is in flight */
.topprog{position:absolute;left:0;right:0;bottom:-1px;height:2px;overflow:hidden;pointer-events:none}
.topprog>i{display:block;height:100%;width:100%;transform-origin:left center;
  background:linear-gradient(90deg,transparent,var(--green),transparent);
  animation:dk-bar 1.15s var(--ease) infinite}

/* a toast that is going away */
.toast.leaving{animation:dk-out 200ms var(--ease) both}

/* the sliding navigation indicator */
.navind{position:absolute;left:0;pointer-events:none;z-index:0;
  transition:transform 320ms var(--ease),height 320ms var(--ease),opacity var(--t) var(--ease)}
.navi{position:relative;z-index:1}

/* the award letter unfolds; the wax cracks and throws two shards */
.unfold{animation:dk-unfold 420ms var(--ease) both}
.cracked{animation:dk-crack 520ms cubic-bezier(.34,1.56,.64,1) both}
.shard{position:absolute;width:5px;height:5px;border-radius:1px;background:var(--seal-core);pointer-events:none;
  animation:dk-shard 620ms var(--ease) both}
.sealstage{position:relative;display:inline-flex}
.scramble{font-variant-numeric:tabular-nums;color:var(--faint)}

/* the scoring dial */
.scorerow{display:flex;align-items:center;gap:14px;padding:11px 0;border-bottom:1px solid var(--hair);flex-wrap:wrap}
.scorerow:last-of-type{border-bottom:0}
.scorerow .scname{flex:1;min-width:150px;font-size:13px}
.dial{display:inline-flex;align-items:center;gap:3px;border-radius:var(--r-btn);outline:0}
.dial:focus-visible{box-shadow:0 0 0 3px var(--green-ring)}
.dpip{width:30px;height:32px;border:1px solid var(--line);background:var(--card);color:var(--muted);
  font-family:var(--font-mono);font-size:11.5px;font-weight:550;cursor:pointer;padding:0;
  transition:background var(--t) var(--ease),color var(--t) var(--ease),transform var(--t) var(--ease)}
.dpip:first-of-type{border-radius:var(--r-sm) 0 0 var(--r-sm)}
.dpip:nth-of-type(10){border-radius:0 var(--r-sm) var(--r-sm) 0}
.dpip+.dpip{border-left:0}
.dpip:hover{background:var(--paper-2);color:var(--ink);transform:translateY(-1px)}
.dpip.under{background:var(--green-tint);color:var(--green-deep)}
.dpip.on{background:var(--green);border-color:var(--green);color:var(--on-brand);font-weight:700}
.dval{width:74px;font-size:11.5px;color:var(--faint);text-align:right}

.flash{animation:dk-flash ${DUR.ceremony}ms ${EASE.out} both}
.flash-wax{animation:dk-flash-wax ${DUR.ceremony}ms ${EASE.out} both}
.rise{animation:dk-rise ${DUR.settle}ms ${EASE.out} both}
.stamped{animation:dk-press ${DUR.ceremony}ms ${EASE.press} both}
.tickbump{display:inline-block;animation:dk-rise ${DUR.base}ms ${EASE.out} both}
.sheen{position:relative;overflow:hidden}
.sheen::after{content:"";position:absolute;top:0;bottom:0;width:38%;pointer-events:none;
  background:linear-gradient(100deg,transparent,color-mix(in srgb,var(--card) 55%,transparent) 46%,color-mix(in srgb,var(--brass-tint) 85%,transparent) 54%,transparent);
  animation:dk-sheen 1.35s ${EASE.standard} .12s both}
.skel{background:linear-gradient(90deg,var(--paper-2) 8%,var(--skel-hi) 18%,var(--paper-2) 33%);
  background-size:840px 100%;border-radius:var(--r-xs);animation:dk-shimmer 1.25s linear infinite}

/* ---- the ladder ---- */
@media(min-width:${BP.sm}px){
  /* the sheet undocks and becomes a card */
  .scrim{align-items:center;padding:22px}
  .dlg{max-width:472px;max-height:88dvh;border:1px solid var(--line2);border-radius:var(--r-lg);
    animation:dk-pop ${DUR.settle}ms ${EASE.out} both}
  .dlg.wide{max-width:620px}
  .dlg .dhead{padding:16px 18px 0}
  .dlg .dbody{padding:10px 18px 4px}
  .dlg .dfoot{padding:16px 18px 18px;border-top:0}
  .dlg .dfoot .btn{flex:0 0 auto}
  .dlg .dfoot .holdhint{flex:1 1 auto;text-align:left}
}
@media(min-width:${BP.tab}px){
  .toasts{left:auto;right:18px;bottom:18px;width:352px;max-width:calc(100vw - 36px)}
  .toast .tx{min-width:0;min-height:0;padding:2px 4px}
}
@media(hover:hover) and (pointer:fine){
  .toast .tx:hover{color:var(--ink)}
}

@media(prefers-reduced-motion:reduce){
  .toast,.dlg,.scrim,.panel,.panelwrap,.navscrim,.rise,.stamped,.tickbump,.flash,.flash-wax,.extbadge{animation:none!important}
  .roll .strip{transition:none!important}
  .clock.critical{animation:none!important}
  .sheen::after{display:none}
  .skel{animation:none}
}
`;

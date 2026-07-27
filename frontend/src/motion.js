/* DOCKET motion + audio vocabulary.

   The house style is physical, not arcade: things press, settle, unfold and
   stamp. Four durations and three easings — anything that needs a fifth is
   probably the wrong idea. Every animation here is skippable, interruptible and
   silent under `prefers-reduced-motion`; sound is opt-in and off until switched
   on from the top bar. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";

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

/** Previous value of anything — the basis for "did my rank just get worse?". */
export function usePrev(value) {
  const ref = useRef(undefined);
  useEffect(() => { ref.current = value; }, [value]);
  return ref.current;
}

/** Count a number up to its target. Returns the target immediately when the
    viewer prefers reduced motion, or when the jump is trivial. */
export function useCountUp(target, ms = DUR.ceremony) {
  const [v, setV] = useState(target);
  const from = useRef(target);
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

/* ---------------- clock formatting ---------------- */

/** Human time remaining. Coarse far out, exact when it matters:
    "4d 6h" · "6h 12m" · "12:04" · "0:41". */
export function fmtRemaining(ms) {
  if (ms == null || Number.isNaN(ms)) return "—";
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

/** One shaped tone. Gains stay low — these are cues, not notifications. */
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

/** Filtered noise — the paper/wax half of the vocabulary. */
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

/* ---- toasts ---- */
.toasts{position:fixed;right:18px;bottom:18px;z-index:200;display:flex;flex-direction:column;gap:9px;
  width:352px;max-width:calc(100vw - 36px);pointer-events:none}
.toast{pointer-events:auto;background:var(--card);border:1px solid var(--line);border-left:3px solid var(--green);
  border-radius:var(--r-sm);box-shadow:var(--sh-3);padding:11px 13px;display:flex;gap:10px;align-items:flex-start;
  animation:dk-pop ${DUR.settle}ms ${EASE.out} both}
.toast.warn{border-left-color:var(--wax)}
.toast.info{border-left-color:var(--brass)}
.toast .tt{font-weight:600;font-size:13px;letter-spacing:-.004em}
.toast .tb{color:var(--muted);font-size:12.5px;line-height:1.5;margin-top:2px}
.toast .tx{background:none;border:0;color:var(--faint);font-size:14px;line-height:1;padding:2px 4px;cursor:pointer}
.toast .tx:hover{color:var(--ink)}
.toast .tglyph{font-family:var(--font-mono);font-size:12px;font-weight:600;line-height:1.35;flex-shrink:0}

/* ---- dialogs ---- */
.scrim{position:fixed;inset:0;z-index:150;background:rgba(20,31,27,.42);backdrop-filter:blur(2px);
  display:flex;align-items:center;justify-content:center;padding:22px;animation:dk-in ${DUR.base}ms ${EASE.standard} both}
.dlg{background:var(--card);border:1px solid var(--line2);border-radius:var(--r-lg);box-shadow:var(--sh-3);
  width:100%;max-width:472px;animation:dk-pop ${DUR.settle}ms ${EASE.out} both}
.dlg.wide{max-width:620px}
.dlg h3{font-family:var(--font-serif);font-size:19px;font-weight:600;letter-spacing:-.016em;margin:0}
.dlg .dhead{padding:16px 18px 0}
.dlg .dbody{padding:10px 18px 4px;font-size:13.5px;line-height:1.6;color:var(--muted)}
.dlg .dbody b,.dlg .dbody strong{color:var(--ink)}
.dlg .dfoot{display:flex;gap:9px;justify-content:flex-end;align-items:center;padding:16px 18px 18px;flex-wrap:wrap}

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
  letter-spacing:.08em;text-transform:uppercase;color:var(--wax);background:var(--wax-tint);border:1px solid #E4B7AC;
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
.sparktip{position:absolute;transform:translate(-50%,-118%);background:var(--side);color:#fff;border-radius:var(--r-xs);
  padding:5px 8px;font-family:var(--font-mono);font-size:10.5px;white-space:nowrap;pointer-events:none;
  box-shadow:var(--sh-2);z-index:5}

/* ---- misc motion ---- */
.flash{animation:dk-flash ${DUR.ceremony}ms ${EASE.out} both}
.flash-wax{animation:dk-flash-wax ${DUR.ceremony}ms ${EASE.out} both}
.rise{animation:dk-rise ${DUR.settle}ms ${EASE.out} both}
.stamped{animation:dk-press ${DUR.ceremony}ms ${EASE.press} both}
.tickbump{display:inline-block;animation:dk-rise ${DUR.base}ms ${EASE.out} both}
.sheen{position:relative;overflow:hidden}
.sheen::after{content:"";position:absolute;top:0;bottom:0;width:38%;pointer-events:none;
  background:linear-gradient(100deg,transparent,rgba(255,255,255,.55) 46%,rgba(242,235,214,.85) 54%,transparent);
  animation:dk-sheen 1.35s ${EASE.standard} .12s both}
.skel{background:linear-gradient(90deg,var(--paper-2) 8%,#F7F6F0 18%,var(--paper-2) 33%);
  background-size:840px 100%;border-radius:var(--r-xs);animation:dk-shimmer 1.25s linear infinite}

@media(prefers-reduced-motion:reduce){
  .toast,.dlg,.scrim,.rise,.stamped,.tickbump,.flash,.flash-wax,.extbadge{animation:none!important}
  .roll .strip{transition:none!important}
  .clock.critical{animation:none!important}
  .sheen::after{display:none}
  .skel{animation:none}
}
`;

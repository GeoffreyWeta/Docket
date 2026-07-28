/* Interaction kit: the pieces that make DOCKET respond rather than just render.

   House rules encoded here:
   * No browser dialogs. Consequential actions get a designed dialog, and the
     irreversible ones get press-and-hold: the confirmation *is* the ceremony.
   * State is never carried by colour alone. --green and --wax sit only ΔE 5.7
     apart under protanopia (measured), and they are exactly the pair that says
     "you are leading" vs "you are being outbid", so every state ships a glyph
     and words too. Do not "simplify" those away.
   * Everything is interruptible and silent under prefers-reduced-motion. */
import React, { useCallback, useEffect, useRef, useState } from "react";

import { DESKTOP_Q } from "./breakpoints";
import { DUR, EASE, cue, fmtRemaining, reducedMotion, setSoundEnabled, soundEnabled, tickRateFor, useCountUp, useTicker } from "./motion";
import { fmtDateTime, fmtMoney } from "./helpers";
import { Icon } from "./icons";
import { THEMES, getTheme, setTheme } from "./theme";

/* ---------------- viewport ----------------
   The stylesheet handles every *appearance* difference between a phone and a
   desktop on its own. These hooks exist for the one thing CSS cannot do:
   decide what to render. The drawer's secondary chrome lives in one place at a
   time (the top bar or the drawer foot) rather than being duplicated into
   the DOM twice and hidden with display:none, so there is only ever one
   tabbable copy of "Sign out". The query comes from breakpoints.js, the same
   number the CSS shell switches on. */

/** Subscribes to a media query and re-renders when it changes. */
export function useMedia(query) {
  const [matches, setMatches] = useState(() => {
    try { return window.matchMedia(query).matches; } catch (e) { return false; }
  });
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia(query); } catch (e) { return undefined; }
    const sync = () => setMatches(mq.matches);
    sync();
    // addListener is the Safari < 14 spelling; it is still the only one there
    if (mq.addEventListener) mq.addEventListener("change", sync);
    else mq.addListener(sync);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", sync);
      else mq.removeListener(sync);
    };
  }, [query]);
  return matches;
}

/** True once the sidebar is permanent furniture rather than a drawer. */
export const useIsDesktop = () => useMedia(DESKTOP_Q);

/* ---------------- toasts ---------------- */

const GLYPH = { ok: "check", warn: "alert", info: "info" };
const LIFE = { ok: 4200, info: 5200, warn: 7000 };

/** Toast stack. `toast.ok(title, body)` / `.warn()` / `.info()`. */
export function useToasts() {
  const [items, setItems] = useState([]);
  const seq = useRef(0);
  const drop = useCallback((id) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((kind, title, body, action) => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-3), { id, kind, title, body, action }]);
    /* an offer to undo needs longer on screen than a confirmation does */
    setTimeout(() => drop(id), action ? LIFE.warn + 3000 : LIFE[kind]);
    return id;
  }, [drop]);
  const toast = useRef(null);
  if (!toast.current) {
    toast.current = {
      ok: (t, b, action) => push("ok", t, b, action),
      warn: (t, b, action) => push("warn", t, b, action),
      info: (t, b, action) => push("info", t, b, action),
      /** A step the server can reverse. `undo` runs on click and the toast closes. */
      undo: (title, body, undo) => push("info", title, body, { label: "Undo", run: undo }),
    };
  }
  return [toast.current, items, drop];
}

export function Toasts({ items, onDismiss }) {
  if (!items.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={"toast " + t.kind}>
          <span className={"tglyph " + (t.kind === "warn" ? "waxfg" : t.kind === "ok" ? "greenfg" : "brassfg")}>
            <Icon n={GLYPH[t.kind]} s={15} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="tt">{t.title}</div>
            {t.body ? <div className="tb">{t.body}</div> : null}
            {t.action && (
              <button className="tundo" onClick={() => { onDismiss(t.id); t.action.run(); }}>
                <Icon n="refresh" s={13} />{t.action.label}
              </button>
            )}
          </div>
          <button className="tx" aria-label="Dismiss" onClick={() => onDismiss(t.id)}><Icon n="close" s={12} /></button>
        </div>
      ))}
    </div>
  );
}

/* ---------------- dialogs ---------------- */

export function Dialog({ title, children, footer, onClose, wide }) {
  const card = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const first = card.current?.querySelector("button,input,select,textarea");
    (first || card.current)?.focus?.();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"dlg" + (wide ? " wide" : "")} ref={card} role="dialog" aria-modal="true"
           aria-label={title} tabIndex={-1}>
        <div className="dhead"><h3>{title}</h3></div>
        <div className="dbody">{children}</div>
        <div className="dfoot">{footer}</div>
      </div>
    </div>
  );
}

/** One-call confirmation. `hold` turns the confirm button into press-and-hold:
    use it for anything the server cannot undo. */
export function ConfirmDialog({ title, children, confirmLabel = "Confirm", tone = "pri",
                               hold = false, holdHint, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); onClose(); }
  };
  return (
    <Dialog title={title} onClose={onClose} footer={
      <>
        {hold && <span className="holdhint" style={{ marginRight: "auto" }}>{holdHint || "Press and hold to confirm"}</span>}
        <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        {hold
          ? <HoldButton tone={tone} label={confirmLabel} busyLabel="Working…" busy={busy} onDone={run} />
          : <button className={"btn " + tone} onClick={run} disabled={busy}>{busy ? "Working…" : confirmLabel}</button>}
      </>
    }>
      {children}
    </Dialog>
  );
}

/* ---------------- press and hold ---------------- */

/** Fills over `holdMs`, fires on completion, cancels on early release.
    Keyboard: hold Enter or Space. Reduced motion still requires the hold:
    it is a safety gesture, not decoration, but skips the shake. */
export function HoldButton({ label, busyLabel = "Working…", holdMs = 1150, tone = "wax",
                            onDone, disabled, busy, className = "" }) {
  const [p, setP] = useState(0);
  const raf = useRef(0);
  const t0 = useRef(0);
  const done = useRef(false);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    if (!done.current) setP(0);
  }, []);

  const start = useCallback(() => {
    if (disabled || busy || raf.current) return;
    done.current = false;
    t0.current = performance.now();
    const step = (now) => {
      const pct = Math.min(1, (now - t0.current) / holdMs);
      setP(pct);
      if (pct >= 1) {
        done.current = true;
        raf.current = 0;
        cue.stamp();
        setP(0);
        onDone();
      } else {
        raf.current = requestAnimationFrame(step);
      }
    };
    raf.current = requestAnimationFrame(step);
  }, [disabled, busy, holdMs, onDone]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <button className={`btn ${tone} hold ${className}`} disabled={disabled || busy}
            onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
            onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); start(); } }}
            onKeyUp={(e) => { if (e.key === "Enter" || e.key === " ") stop(); }}
            aria-label={label}>
      <span className="fill" style={{ width: p * 100 + "%", transition: p ? "none" : `width ${DUR.base}ms ${EASE.standard}` }} />
      <span className="lbl2">{busy ? busyLabel : label}{p > 0 && p < 1 ? " …" : ""}</span>
    </button>
  );
}

/* ---------------- live countdown ---------------- */

/** A clock that actually ticks. Coarse when the deadline is days away, second
    by second inside the last two hours, urgent under two minutes, which is
    exactly the anti-sniping window. */
export function LiveCountdown({ deadline, prefix, className = "" }) {
  const left = deadline - Date.now();
  useTicker(tickRateFor(left));
  const ms = deadline - Date.now();
  if (ms <= 0) return <span className={"clock faint " + className}>closed</span>;
  const critical = ms < 120_000;
  const soon = ms < 3600_000;
  return (
    <span className={`clock ${critical ? "critical" : soon ? "soon" : ""} ${className}`}
          title={"Closes " + fmtDateTime(deadline)}>
      {prefix ? prefix + " " : ""}{fmtRemaining(ms)}{critical ? " left" : ms < 3600_000 ? " left" : " to close"}
    </span>
  );
}

/* ---------------- rolling number ---------------- */

/** Digits roll like a counter wheel. Used for auction rank, where the change
    matters more than the value, never as the only signal of state. */
export function RollNumber({ value, size = 54, color }) {
  const digits = String(value ?? "-").split("");
  return (
    <span className={"roll" + (reducedMotion() ? " norm" : "")}
          style={{ fontFamily: "var(--font-serif)", fontSize: size, lineHeight: 1, color }}
          aria-label={String(value)}>
      {digits.map((d, i) => (
        /\d/.test(d)
          ? <span className="col" key={i} aria-hidden="true">
              <span className="strip" style={{ transform: `translateY(-${Number(d)}em)` }}>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <span key={n}>{n}</span>)}
              </span>
            </span>
          : <span key={i} aria-hidden="true">{d}</span>
      ))}
    </span>
  );
}

/* ---------------- sparkline ----------------
   Single series, so no legend (the caption names it) and colour is reinforcement
   only: 2px line, one 8px terminal marker ringed in the surface colour, the last
   value direct-labelled, no axes, hover tooltip per point. The adjacent bid
   history list is the table view. */
export function Sparkline({ points, w = 220, h = 46, color = "var(--green)", label }) {
  const [hi, setHi] = useState(null);
  if (!points || points.length === 0) return null;
  const pad = 6;
  const xs = points.map((p, i) => (points.length === 1 ? w / 2 : pad + (i * (w - pad * 2)) / (points.length - 1)));
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals), top = Math.max(...vals);
  const span = top - lo || 1;
  const ys = vals.map((v) => h - pad - ((v - lo) / span) * (h - pad * 2));
  const path = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const last = points.length - 1;
  const shown = hi == null ? last : hi;

  return (
    <div className="sparkwrap" style={{ width: w }}>
      <svg className="spark" width={w} height={h} role="img"
           aria-label={label || `${points.length} price movements, latest ${fmtMoney(points[last].value)}`}>
        {points.length > 1 && <path className="ln" d={path} stroke={color} />}
        {xs.map((x, i) => (
          <rect key={"h" + i} className="hit" x={x - (w / points.length) / 2} y={0}
                width={w / points.length} height={h}
                onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} />
        ))}
        {hi != null && hi !== last && <circle cx={xs[hi]} cy={ys[hi]} r={4} fill={color} className="dot" />}
        <circle cx={xs[last]} cy={ys[last]} r={4} fill={color} className="dot" />
      </svg>
      {points.length > 1 && (
        <div className="sparktip" style={{ left: xs[shown], top: ys[shown] }}>
          {fmtMoney(points[shown].value)}{points[shown].at ? " · " + fmtDateTime(points[shown].at) : ""}
        </div>
      )}
    </div>
  );
}

/* ---------------- figures that arrive ---------------- */

/** A number that counts up on arrival. `format` receives the running value, so
    money stays money the whole way rather than switching format at the end. */
export function CountUp({ n, format = (x) => Math.round(x).toLocaleString(), ms, from = 0 }) {
  const v = useCountUp(Number(n) || 0, ms, from);
  return <>{format(v)}</>;
}

/** Types a string out, one character at a time. Used for the receipt id on a
    sealed bid: the number is issued by the server, and watching it print is the
    difference between "a value appeared" and "a receipt was written". */
export function TypeOut({ text, ms = 460, className }) {
  const full = String(text ?? "");
  const [n, setN] = useState(() => (reducedMotion() ? full.length : 0));
  useEffect(() => {
    if (reducedMotion()) { setN(full.length); return undefined; }
    setN(0);
    const step = Math.max(12, ms / Math.max(1, full.length));
    const h = setInterval(() => setN((k) => {
      if (k >= full.length) { clearInterval(h); return k; }
      return k + 1;
    }), step);
    return () => clearInterval(h);
  }, [full, ms]);
  return <span className={className}>{full.slice(0, n)}</span>;
}

/** A figure emerging from ciphertext: random digits of the same width, then the
    real number counts up. This is the only honest way to animate an opening,
    because until the seal breaks the client genuinely does not have the value. */
export function Decrypting({ n, format, ms = 620 }) {
  const target = Number(n) || 0;
  const width = String(Math.round(target)).length;
  const [scrambling, setScrambling] = useState(() => !reducedMotion());
  const [noise, setNoise] = useState("");
  useEffect(() => {
    if (reducedMotion()) { setScrambling(false); return undefined; }
    setScrambling(true);
    const h = setInterval(() => {
      let out = "";
      for (let i = 0; i < width; i++) out += Math.floor(Math.random() * 10);
      setNoise(out);
    }, 55);
    const done = setTimeout(() => { clearInterval(h); setScrambling(false); }, ms);
    return () => { clearInterval(h); clearTimeout(done); };
  }, [target, width, ms]);
  if (scrambling) return <span className="scramble">{format ? format(Number(noise) || 0) : noise}</span>;
  return <CountUp n={target} format={format} ms={DUR.ceremony} />;
}

/* ---------------- boot ----------------
   The shape of the app, drawn before the data lands, so the first paint is the
   layout you are about to get rather than a spinner and a promise. */
export function BootSkeleton() {
  return (
    <div className="bootsk" aria-busy="true" aria-label="Opening the docket">
      <div className="bsside">
        <div className="skel" style={{ height: 18, width: 108, margin: "2px 18px 20px" }} />
        {[72, 60, 84, 66, 78, 54].map((w, i) => (
          <div key={i} className="skel" style={{ height: 11, width: w + "%", margin: "0 18px 15px" }} />
        ))}
      </div>
      <div className="bsmain">
        <div className="bsbar"><div className="skel" style={{ height: 11, width: 148 }} />
          <span style={{ flex: 1 }} />
          <div className="skel" style={{ height: 26, width: 148, borderRadius: 999 }} />
        </div>
        <div className="bsbody">
          <div className="skel" style={{ height: 26, width: 230, marginBottom: 20 }} />
          <div className="bsgrid">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skel bstile" />)}
          </div>
          <div className="skel bscard" />
        </div>
      </div>
    </div>
  );
}

export const BOOT_CSS = `
.bootsk{display:flex;height:100vh;background:var(--paper)}
.bootsk .bsside{width:224px;flex-shrink:0;background:var(--side);padding:20px 0}
.bootsk .bsside .skel{background:linear-gradient(90deg,rgba(255,255,255,.06) 8%,rgba(255,255,255,.13) 18%,rgba(255,255,255,.06) 33%);
  background-size:840px 100%}
.bootsk .bsmain{flex:1;display:flex;flex-direction:column;min-width:0}
.bootsk .bsbar{display:flex;align-items:center;gap:14px;padding:14px 26px;background:var(--card);
  border-bottom:1px solid var(--line)}
.bootsk .bsbody{padding:28px 26px}
.bootsk .bsgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}
.bootsk .bstile{height:96px;border-radius:var(--r)}
.bootsk .bscard{height:260px;border-radius:var(--r)}
@media(max-width:1023px){
  .bootsk .bsside{display:none}
  .bootsk .bsgrid{grid-template-columns:repeat(2,1fr)}
}
`;

/* ---------------- radar ----------------
   Two series on five axes: the subject filled, the peer average as a dashed
   outline. Two series means a legend is always present, and the dash pattern
   carries the difference on its own, so neither series depends on colour to be
   told apart. Rings and spokes stay recessive, every vertex has a hover
   tooltip, and the caller pairs this with a table view of the same numbers. */
export function Radar({ axes, series, size = 300, max = 100 }) {
  const [hot, setHot] = useState(null);
  const cx = size / 2, cy = size / 2;
  const r = size / 2 - 42;                       // room for the axis labels
  const n = axes.length;
  const at = (i, v) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    const rad = (Math.max(0, Math.min(max, v ?? 0)) / max) * r;
    return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
  };
  const poly = (vals) => vals.map((v, i) => at(i, v).map((x) => x.toFixed(1)).join(",")).join(" ");

  return (
    <div className="radarwrap">
      <svg className="radar" viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size }}
           role="img" aria-label={`${axes.length} dimension scorecard, ${series.map((s) => s.label).join(" against ")}`}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon key={f} className="ring" points={poly(axes.map(() => max * f))} />
        ))}
        {axes.map((a, i) => {
          const [x, y] = at(i, max);
          return <line key={a.key} className="spoke" x1={cx} y1={cy} x2={x} y2={y} />;
        })}
        {series.map((s) => (
          <polygon key={s.key} points={poly(axes.map((a) => s.values[a.key] ?? 0))}
                   className={"plot " + (s.dashed ? "peer" : "subject")}
                   style={{ stroke: s.color, fill: s.dashed ? "none" : s.color }} />
        ))}
        {axes.map((a, i) => {
          const [x, y] = at(i, max * 1.185);
          const v = series[0].values[a.key];
          const imputed = (series[0].missing || []).includes(a.key);
          return (
            <g key={a.key} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)}>
              <text className="axlbl" x={x} y={y - 4} textAnchor={Math.abs(x - cx) < 8 ? "middle" : x > cx ? "start" : "end"}>
                {a.label}
              </text>
              <text className={"axval" + (hot === i ? " hot" : "")} x={x} y={y + 9}
                    textAnchor={Math.abs(x - cx) < 8 ? "middle" : x > cx ? "start" : "end"}>
                {v == null ? "no data" : imputed ? "peer" : Math.round(v)}
              </text>
              {series.map((s) => {
                const p = at(i, s.values[a.key] ?? 0);
                return s.values[a.key] == null || ((s.missing || []).includes(a.key)) ? null : (
                  <circle key={s.key} cx={p[0]} cy={p[1]} r={hot === i ? 5 : 3.2}
                          className="vtx" style={{ fill: s.color }} />
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="radarkey">
        {series.map((s) => (
          <span className="rk" key={s.key}>
            <span className={"sw " + (s.dashed ? "peer" : "subject")} style={{ borderColor: s.color, background: s.dashed ? "transparent" : s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export const RADAR_CSS = `
.radarwrap{display:flex;flex-direction:column;align-items:center;gap:10px}
.radar .ring{fill:none;stroke:var(--line);stroke-width:1}
.radar .spoke{stroke:var(--line);stroke-width:1}
.radar .plot{stroke-width:2;stroke-linejoin:round}
.radar .plot.subject{fill-opacity:.16}
.radar .plot.peer{stroke-dasharray:5 4}
.radar .vtx{stroke:var(--card);stroke-width:2;transition:r var(--t) var(--ease)}
.radar .axlbl{font-family:var(--k-font);font-size:11px;font-weight:var(--k-weight);
  letter-spacing:var(--k-ls);text-transform:var(--k-tt);fill:var(--muted)}
.radar .axval{font-family:var(--font-mono);font-size:12px;font-weight:600;fill:var(--ink);
  font-variant-numeric:tabular-nums}
.radar .axval.hot{fill:var(--green)}
.radarkey{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;font-size:12px;color:var(--muted)}
.radarkey .rk{display:inline-flex;align-items:center;gap:7px}
.radarkey .sw{width:13px;height:13px;border-radius:3px;border:2px solid}
.radarkey .sw.peer{border-style:dashed}
`;

/* ---------------- sound toggle ---------------- */

/* ---------------- theme switch ---------------- */

/** Cycles paper → material → night. One click, no menu: three themes is few
    enough that a cycle beats a dropdown, and the label always says what you
    get next. */
export function ThemeSwitch() {
  const [cur, setCur] = useState(getTheme);
  const next = THEMES[(THEMES.findIndex((t) => t.id === cur) + 1) % THEMES.length];
  const now = THEMES.find((t) => t.id === cur) || THEMES[0];
  return (
    <button className="btn sm" onClick={() => setCur(setTheme(next.id))}
            title={`${now.hint}. Click for ${next.label}`}>
      <Icon n={now.icon} s={14} />{now.label}
    </button>
  );
}

export function SoundToggle() {
  const [on, setOn] = useState(soundEnabled());
  const flip = () => {
    const next = !on;
    setSoundEnabled(next);
    setOn(next);
    if (next) cue.tick();      // confirm audibly, right after the click gesture
  };
  return (
    <button className="btn sm" onClick={flip} aria-pressed={on}
            title={on ? "Sound cues on: seal, rank and award cues" : "Sound cues off"}>
      {on ? "♪ On" : "♪ Off"}
    </button>
  );
}

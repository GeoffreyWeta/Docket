/* Interaction kit: the pieces that make DOCKET respond rather than just render.

   House rules encoded here:
   * No browser dialogs. Consequential actions get a designed dialog, and the
     irreversible ones get press-and-hold — the confirmation *is* the ceremony.
   * State is never carried by colour alone. --green and --wax sit only ΔE 5.7
     apart under protanopia (measured), and they are exactly the pair that says
     "you are leading" vs "you are being outbid" — so every state ships a glyph
     and words too. Do not "simplify" those away.
   * Everything is interruptible and silent under prefers-reduced-motion. */
import React, { useCallback, useEffect, useRef, useState } from "react";

import { DUR, EASE, cue, fmtRemaining, reducedMotion, setSoundEnabled, soundEnabled, tickRateFor, useTicker } from "./motion";
import { fmtDateTime, fmtMoney } from "./helpers";
import { Icon } from "./icons";
import { THEMES, getTheme, setTheme } from "./theme";

/* ---------------- toasts ---------------- */

const GLYPH = { ok: "check", warn: "alert", info: "info" };
const LIFE = { ok: 4200, info: 5200, warn: 7000 };

/** Toast stack. `toast.ok(title, body)` / `.warn()` / `.info()`. */
export function useToasts() {
  const [items, setItems] = useState([]);
  const seq = useRef(0);
  const drop = useCallback((id) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((kind, title, body) => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-3), { id, kind, title, body }]);
    setTimeout(() => drop(id), LIFE[kind]);
    return id;
  }, [drop]);
  const toast = useRef(null);
  if (!toast.current) {
    toast.current = {
      ok: (t, b) => push("ok", t, b),
      warn: (t, b) => push("warn", t, b),
      info: (t, b) => push("info", t, b),
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

/** One-call confirmation. `hold` turns the confirm button into press-and-hold —
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
    Keyboard: hold Enter or Space. Reduced motion still requires the hold —
    it is a safety gesture, not decoration — but skips the shake. */
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
    by second inside the last two hours, urgent under two minutes — which is
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
    matters more than the value — never as the only signal of state. */
export function RollNumber({ value, size = 54, color }) {
  const digits = String(value ?? "—").split("");
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
            title={`${now.hint} — click for ${next.label}`}>
      <Icon n={cur === "night" ? "seal" : cur === "material" ? "dashboard" : "tender"} s={14} />
      {now.label}
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
            title={on ? "Sound cues on — seal, rank and award cues" : "Sound cues off"}>
      {on ? "♪ On" : "♪ Off"}
    </button>
  );
}

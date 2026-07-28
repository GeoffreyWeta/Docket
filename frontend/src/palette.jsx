/* Command palette and keyboard shortcuts.

   The palette is built from the state the client already holds, so it needs no
   endpoint of its own and can never offer something the role is not allowed to
   do: pages come from the same ALLOWED table the router uses, and actions are
   filtered by role before they are ever listed. A supplier's palette contains
   their own tenders and nothing about the register.

   Keys: cmd-K or ctrl-K opens it, "g" then a letter jumps, "?" shows the sheet.
   Everything is reachable by mouse as well: this is a shortcut, never the only
   way to do something. */
import React, { useEffect, useMemo, useRef, useState } from "react";

import { fmtCompact } from "./helpers";
import { Icon } from "./icons";
import { THEMES, getTheme, setTheme } from "./theme";

/** Pages a role may reach, in the order the sidebar lists them. */
const PAGE_LABELS = {
  dashboard: "Dashboard", tenders: "Tenders", suppliers: "Suppliers", scorecards: "Scorecards",
  team: "Team", analytics: "Analytics", audit: "Audit trail", approvals: "Approvals",
  evals: "My evaluations", portal: "My invitations", new: "New tender",
};
const PAGE_ICONS = {
  dashboard: "dashboard", tenders: "tender", suppliers: "suppliers", scorecards: "trophy",
  team: "team", analytics: "analytics", audit: "audit", approvals: "stamp",
  evals: "scales", portal: "portal", new: "plus",
};

/** "g" then this letter jumps to the page, when the role has it. */
export const GOTO = {
  d: "dashboard", t: "tenders", s: "suppliers", c: "scorecards", m: "team",
  a: "analytics", u: "audit", p: "approvals", e: "evals", i: "portal", n: "new",
};

/* Matches loosely: every character of the query must appear in order. Types the
   ref, the title or a word of either and it lands. */
function fuzzy(hay, needle) {
  const h = hay.toLowerCase();
  const n = needle.toLowerCase().trim();
  if (!n) return 0;
  if (h.includes(n)) return 100 - h.indexOf(n);
  let i = 0, score = 0;
  for (const ch of n) {
    const at = h.indexOf(ch, i);
    if (at < 0) return -1;
    score += at === i ? 2 : 1;
    i = at + 1;
  }
  return score / 4;
}

export function buildCommands({ api, allowed, chrome }) {
  const { state, user, go } = api;
  const out = [];

  for (const page of allowed) {
    if (page === "tender") continue;                 // reached through a tender, not by name
    out.push({
      id: "page:" + page, group: "Go to", icon: PAGE_ICONS[page] || "tender",
      label: PAGE_LABELS[page] || page,
      hint: Object.entries(GOTO).find(([, p]) => p === page)?.[0],
      run: () => go({ page }),
    });
  }

  for (const t of state.tenders || []) {
    out.push({
      id: "tender:" + t.id, group: "Tenders", icon: t.type === "AUC" ? "gavel" : "tender",
      label: `${t.ref} ${t.title}`,
      meta: `${t.status} · ${fmtCompact(t.budget)}`,
      run: () => go(user.role === "supplier"
        ? { page: "bidroom", id: t.id }
        : { page: "tender", id: t.id }),
    });
  }

  if (user.role !== "supplier") {
    for (const s of state.suppliers || []) {
      out.push({
        id: "supplier:" + s.id, group: "Suppliers", icon: "suppliers",
        label: s.name, meta: s.category + (s.prequalified ? "" : " · pending review"),
        run: () => go(allowed.includes("scorecards") ? { page: "scorecards" } : { page: "suppliers" }),
      });
    }
  }

  const acts = [
    ["guide", "question", "Open the guide for your role", chrome.onGuide],
    ["security", "shield", "Security and sessions", chrome.onSecurity],
    ["reset", "refresh", "Reset demo data", chrome.onReset],
    ["signout", "exit", "Sign out", chrome.onLogout],
  ];
  for (const [id, icon, label, run] of acts) {
    if (run) out.push({ id: "act:" + id, group: "Actions", icon, label, run });
  }
  for (const th of THEMES) {
    if (th.id === getTheme()) continue;
    out.push({
      id: "theme:" + th.id, group: "Appearance", icon: th.icon,
      label: "Switch to " + th.label, meta: th.hint, run: () => setTheme(th.id),
    });
  }
  if (state.demoLogin && (chrome.accounts || []).length > 0) {
    for (const a of chrome.accounts) {
      if (a.username === chrome.username) continue;
      out.push({
        id: "who:" + a.username, group: "Switch account",
        icon: a.role === "supplier" ? "portal" : "team",
        label: a.label, run: () => chrome.onSwitch(a.username),
      });
    }
  }
  return out;
}

/* The keyboard layer. Mounted once, renders nothing.

   Two rules keep it out of the way: a shortcut never fires while the caret is
   in a field or a dialog is open, and "g" is a prefix rather than a chord, so it
   waits for the next key and forgets after a second. */
export function Keys({ allowed, go, onPalette, onSheet }) {
  const pending = useRef(0);
  useEffect(() => {
    const typing = () => {
      const el = document.activeElement;
      if (!el) return false;
      if (el.isContentEditable) return true;
      return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
    };
    const onKey = (e) => {
      const cmdK = (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K");
      if (cmdK) { e.preventDefault(); onPalette(); return; }
      if (typing() || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector(".scrim")) return;          // a dialog owns the keyboard
      if (e.key === "?") { e.preventDefault(); onSheet(); return; }
      if (e.key === "g" || e.key === "G") {
        clearTimeout(pending.current);
        pending.current = setTimeout(() => { pending.current = 0; }, 1100);
        window.__dkGoto = true;
        return;
      }
      if (window.__dkGoto) {
        window.__dkGoto = false;
        clearTimeout(pending.current);
        const page = GOTO[e.key.toLowerCase()];
        if (page && allowed.includes(page)) { e.preventDefault(); go({ page }); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(pending.current); };
  }, [allowed, go, onPalette, onSheet]);
  return null;
}

export function Palette({ api, allowed, chrome, onClose }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listRef = useRef(null);
  const commands = useMemo(() => buildCommands({ api, allowed, chrome }), [api, allowed, chrome]);

  const hits = useMemo(() => {
    if (!q.trim()) {
      const first = commands.filter((c) => c.group === "Go to");
      return [...first, ...commands.filter((c) => c.group !== "Go to")].slice(0, 40);
    }
    return commands
      .map((c) => ({ c, score: Math.max(fuzzy(c.label, q), fuzzy(c.group, q) / 3) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map((x) => x.c);
  }, [commands, q]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    const row = listRef.current?.querySelector('[data-sel="1"]');
    row?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const runAt = (i) => {
    const hit = hits[i];
    if (!hit) return;
    onClose();
    hit.run();
  };

  const key = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(hits.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); runAt(sel); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  let lastGroup = null;
  return (
    <div className="scrim palscrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pal" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palq">
          <Icon n="search" s={17} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key}
                 placeholder="Jump to a tender, a supplier, or run something" aria-label="Command palette" />
          <span className="kbd">esc</span>
        </div>
        <div className="pallist" ref={listRef} role="listbox">
          {hits.map((h, i) => {
            const head = h.group !== lastGroup ? h.group : null;
            lastGroup = h.group;
            return (
              <React.Fragment key={h.id}>
                {head && <div className="msec">{head}</div>}
                <button className={"palitem" + (i === sel ? " sel" : "")} data-sel={i === sel ? 1 : 0}
                        role="option" aria-selected={i === sel}
                        onMouseEnter={() => setSel(i)} onClick={() => runAt(i)}>
                  <Icon n={h.icon} s={15} />
                  <span className="mlabel">{h.label}</span>
                  {h.meta && <span className="palmeta">{h.meta}</span>}
                  {h.hint && <span className="kbd">g {h.hint}</span>}
                </button>
              </React.Fragment>
            );
          })}
          {!hits.length && <div className="empty" style={{ padding: 26 }}>Nothing matches that.</div>}
        </div>
      </div>
    </div>
  );
}

export function ShortcutSheet({ onClose, allowed }) {
  const jumps = Object.entries(GOTO).filter(([, p]) => allowed.includes(p));
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dlg" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div className="dhead"><h3>Keyboard</h3></div>
        <div className="dbody">
          <div className="kgrid">
            <span className="kbd">⌘K</span><span>Command palette (ctrl-K on Windows)</span>
            <span className="kbd">?</span><span>This sheet</span>
            <span className="kbd">esc</span><span>Close whatever is open</span>
          </div>
          <div className="msec" style={{ padding: "14px 0 6px" }}>Jump</div>
          <div className="kgrid">
            {jumps.map(([k, page]) => (
              <React.Fragment key={k}>
                <span className="kbd">g {k}</span><span>{PAGE_LABELS[page]}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
        <div className="dfoot"><button className="btn pri" onClick={onClose}>Got it</button></div>
      </div>
    </div>
  );
}

export const PALETTE_CSS = `
.palscrim{align-items:flex-start;padding-top:12vh}
.pal{width:600px;max-width:calc(100vw - 32px);background:var(--card);border:1px solid var(--line2);
  border-radius:var(--r-lg);box-shadow:var(--sh-3);overflow:hidden;
  animation:dk-pop 200ms var(--ease) both}
.palq{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)}
.palq .ic{color:var(--faint);margin:0}
.palq input{flex:1;min-width:0;border:0;background:none;font-size:15px;outline:0;color:var(--ink)}
.palq input::placeholder{color:var(--faint)}
.pallist{max-height:min(56vh,440px);overflow-y:auto;padding:6px}
.palitem{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:9px 10px;border:0;
  border-radius:var(--r-sm);background:none;color:var(--ink);font-size:13.5px}
.palitem .ic{color:var(--faint);margin:0}
.palitem.sel{background:var(--p-container);color:var(--on-p-container)}
.palitem.sel .ic{color:inherit}
.palitem .palmeta{font-family:var(--font-mono);font-size:11px;color:var(--faint);white-space:nowrap}
.palitem.sel .palmeta{color:inherit;opacity:.75}
.kbd{font-family:var(--font-mono);font-size:10.5px;font-weight:550;color:var(--muted);background:var(--paper-2);
  border:1px solid var(--line);border-radius:var(--r-xs);padding:2px 6px;white-space:nowrap}
.palitem.sel .kbd{background:transparent;border-color:currentColor;color:inherit}
.kgrid{display:grid;grid-template-columns:auto 1fr;gap:9px 12px;align-items:center;font-size:13px}
`;

import React, { useEffect, useRef, useState } from "react";

import { downloadDoc, downloadUrl, raw } from "./api";
import { Countdown, Empty, MiniBars, Money, Stamp, Stat, StageTracker } from "./atoms";
import {
  DAY, abnormallyLow, commScore, daysLeft, effStatus, fmtCompact, fmtDate, fmtDateTime,
  fmtMoney, mean, median, stdev, techScore, totalScore, uid, varianceFlags,
} from "./helpers";
import { Icon, SealMark } from "./icons";
import { DUR, cue, useFlip } from "./motion";
import { ConfirmDialog, CountUp, Decrypting, Dialog, HoldButton, LiveCountdown, SoundToggle, ThemeSwitch } from "./ui";

/* ---------------- chrome ---------------- */

export const NAV = {
  procurement: [["dashboard", "Dashboard"], ["tenders", "Tenders"], ["suppliers", "Suppliers"], ["scorecards", "Scorecards"], ["team", "Team"], ["analytics", "Analytics"], ["audit", "Audit trail"]],
  evaluator: [["evals", "My evaluations"], ["audit", "Audit trail"]],
  approver: [["approvals", "Approvals"], ["tenders", "All tenders"], ["scorecards", "Scorecards"], ["audit", "Audit trail"]],
  auditor: [["audit", "Audit trail"], ["tenders", "All tenders"], ["scorecards", "Scorecards"]],
  supplier: [["portal", "My invitations"]],
};

/* One icon per destination: the sidebar is scanned by shape before it is read. */
const NAV_ICON = {
  dashboard: "dashboard", tenders: "tender", suppliers: "suppliers", team: "team",
  analytics: "analytics", audit: "audit", evals: "scales", approvals: "stamp", portal: "portal",
  scorecards: "trophy",
};

/** The workspace navigation: a permanent column on a desktop, an off-canvas
    drawer below that, which is also where the secondary chrome lives, since
    the top bar has no room for it on a phone. `go()` in App.jsx closes the
    drawer on every route change, so tapping a destination never leaves it
    sitting over the answer. */
export function Sidebar({ api, chrome, open, desktop, onClose }) {
  const { user, route, go } = api;
  const items = NAV[user.role] || [];
  const isOn = (key) =>
    route.page === key ||
    (route.page === "tender" && key === "tenders") ||
    (route.page === "bidroom" && key === "portal") ||
    (route.page === "new" && key === "tenders");
  return (
    <nav id="dk-nav" className={"side" + (open ? " open" : "")} aria-label="Main"
         aria-hidden={desktop ? undefined : !open}>
      <div className="wordmark">
        <span className="seal" aria-hidden="true" /><b>DOCKET</b>
        <button className="drawerx" aria-label="Close navigation" onClick={onClose}>
          <Icon n="close" s={17} />
        </button>
      </div>
      <div className="orgline">{api.state.org.name}<br />{api.state.org.note}</div>
      <div className="navsec">Workspace</div>
      {items.map(([key, label]) => (
        <button key={key} className={"navi" + (isOn(key) ? " on" : "")} onClick={() => go({ page: key })}>
          <Icon n={NAV_ICON[key] || "tender"} s={16} />{label}
        </button>
      ))}
      {user.role === "procurement" && (
        <button className="newbtn" onClick={() => go({ page: "new" })}><Icon n="plus" s={15} />New tender</button>
      )}
      <div className="spacer" />
      {!desktop && chrome && <ChromeActions api={api} {...chrome} stacked />}
      <div className="sidefoot">Data stays on this device.<br />Sealed bids stay sealed.</div>
    </nav>
  );
}

function Bell({ api }) {
  const { state, act } = api;
  const [open, setOpen] = useState(false);
  const items = state.notifications || [];
  const unread = items.filter((n) => !n.read).length;
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread) act.markRead();
  };
  return (
    <div className="bellwrap">
      <button className={"btn sm" + (unread ? " hasnew" : "")} aria-label="Notifications" onClick={toggle}>
        <Icon n="bell" s={14} />Alerts{unread ? ` · ${unread}` : ""}
      </button>
      {open && (
        <div className="ndrop" role="dialog" aria-label="Notifications">
          {items.map((n) => (
            <div key={n.id} className={"nitem" + (n.read ? "" : " unread")}>
              <div className="mono faint" style={{ fontSize: 10.5 }}>{fmtDateTime(n.at)}</div>
              <div className="ns">{n.subject}</div>
              <div className="nb">{n.body}</div>
            </div>
          ))}
          {!items.length && <div className="nitem nb">Nothing yet. Invitations, sealed bids, deadlines and awards will land here (and by email when SMTP is configured).</div>}
        </div>
      )}
    </div>
  );
}

/** Guide, security, theme, sound, demo reset, who you are and the way out.
    Seven controls plus an account switcher do not fit a phone's top bar, and
    wrapping them there cost three rows of the viewport before any content. So
    they render inline in the bar on a desktop and stacked in the drawer foot on
    a phone: one component either way, so there is never a second tabbable
    "Sign out" hidden off-screen. */
const initialsOf = (name) => name.split(" ").map((w) => w[0]).slice(0, 2).join("");

/* The account menu.

   Everything that is not a decision about a tender lives behind the avatar:
   who you are, which account you are in, the guide, security, appearance and
   the demo reset. The demo account switcher in particular is never furniture in
   the bar. It is the widest control in the app (eight accounts, each with a
   name and a role) and parking it in the top bar made the chrome read as busier
   than the work. Here it is one click away and invisible until asked for. */
function AccountMenu({ api, accounts, username, onSwitch, onLogout, onReset, onGuide, onSecurity }) {
  const { state, user } = api;
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const switchable = state.demoLogin && accounts.length > 0;

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  const run = (fn) => () => { setOpen(false); fn(); };

  return (
    <div className="acctwrap" ref={wrap}>
      <button className={"acctbtn" + (open ? " on" : "")} onClick={() => setOpen(!open)}
              aria-haspopup="menu" aria-expanded={open} aria-label={`Account: ${user.name}`}>
        <span className="avatar" aria-hidden="true">{initialsOf(user.name)}</span>
        <span className="acctname">{user.name}</span>
        <Icon n="chev" s={14} className="acctchev" />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="mhead">
            <span className="avatar lg" aria-hidden="true">{initialsOf(user.name)}</span>
            <span style={{ minWidth: 0 }}>
              <b>{user.name}</b>
              <div className="muted" style={{ fontSize: 12 }}>{user.title} · {state.org.short}</div>
            </span>
          </div>

          {switchable && (
            <>
              <div className="msec">Switch account</div>
              <div className="mscroll">
                {accounts.map((a) => {
                  const here = a.username === username;
                  return (
                    <button key={a.username} className={"mitem" + (here ? " on" : "")} role="menuitemradio"
                            aria-checked={here} onClick={run(() => onSwitch(a.username))}>
                      <Icon n={a.role === "supplier" ? "portal" : a.role === "approver" ? "stamp" : a.role === "auditor" ? "audit" : a.role === "evaluator" ? "scales" : "team"} s={15} />
                      <span className="mlabel">{a.label}</span>
                      {here && <Icon n="check" s={14} />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="msec">Workspace</div>
          <button className="mitem" role="menuitem" onClick={run(onGuide)}>
            <Icon n="question" s={15} /><span className="mlabel">Guide for your role</span>
          </button>
          <button className="mitem" role="menuitem" onClick={run(onSecurity)}>
            <Icon n="shield" s={15} /><span className="mlabel">Security and sessions</span>
          </button>
          <div className="mrow"><ThemeSwitch /><SoundToggle /></div>
          <button className="mitem" role="menuitem" onClick={run(onReset)}>
            <Icon n="refresh" s={15} /><span className="mlabel">Reset demo data</span>
          </button>
          <div className="msep" />
          <button className="mitem danger" role="menuitem" onClick={run(onLogout)}>
            <Icon n="exit" s={15} /><span className="mlabel">Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}

/* The phone drawer's foot. Same contents, laid out as rows rather than a
   popover inside a drawer, and the account list is a list of buttons: a native
   select of eight accounts is the messiest control on a small screen. */
function ChromeActions({ api, accounts, username, onSwitch, onLogout, onReset, onGuide, onSecurity }) {
  const { state, user } = api;
  const switchable = state.demoLogin && accounts.length > 0;
  return (
    <div className="chromeacts">
      <div className="me"><span className="avatar" aria-hidden="true">{initialsOf(user.name)}</span>{user.name}</div>
      {switchable && (
        <>
          <div className="msec">Switch account</div>
          <div className="mscroll">
            {accounts.map((a) => {
              const here = a.username === username;
              return (
                <button key={a.username} className={"mitem" + (here ? " on" : "")}
                        aria-pressed={here} onClick={() => onSwitch(a.username)}>
                  <span className="mlabel">{a.label}</span>
                  {here && <Icon n="check" s={14} />}
                </button>
              );
            })}
          </div>
        </>
      )}
      <button className="btn sm" onClick={onGuide}><Icon n="question" s={14} />Guide</button>
      <button className="btn sm" onClick={onSecurity}><Icon n="shield" s={14} />Security</button>
      <div className="mrow"><ThemeSwitch /><SoundToggle /></div>
      <button className="btn sm" onClick={onReset}><Icon n="refresh" s={14} />Reset demo</button>
      <button className="btn sm" onClick={onLogout}><Icon n="exit" s={14} />Sign out</button>
    </div>
  );
}

export const MENU_CSS = `
.acctwrap{position:relative;display:flex}
.acctbtn{display:inline-flex;align-items:center;gap:9px;padding:5px 9px 5px 5px;border-radius:var(--r-btn);
  border:1px solid transparent;background:transparent;color:var(--ink);font-weight:550;font-size:13px;
  transition:background var(--t) var(--ease),border-color var(--t) var(--ease)}
.acctbtn:hover{background:var(--paper-2)}
.acctbtn.on{background:var(--paper-2);border-color:var(--line)}
.acctbtn .acctname{max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acctbtn .acctchev{color:var(--faint);margin:0;transition:transform var(--t) var(--ease)}
.acctbtn.on .acctchev{transform:rotate(180deg)}
.avatar.lg{width:38px;height:38px;font-size:13px}

.menu{position:absolute;right:0;top:calc(100% + 8px);z-index:60;width:288px;max-width:calc(100vw - 24px);
  background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--sh-3);
  padding:7px;animation:dk-pop 200ms var(--ease) both}
.menu .mhead{display:flex;gap:11px;align-items:center;padding:9px 9px 11px;border-bottom:1px solid var(--hair);
  margin-bottom:5px}
.menu .mhead b{font-size:13.5px;display:block;letter-spacing:-.004em}
.msec{font-family:var(--k-font);font-size:var(--k-size);font-weight:var(--k-weight);letter-spacing:var(--k-ls);
  text-transform:var(--k-tt);color:var(--faint);padding:8px 9px 5px}
.mscroll{max-height:210px;overflow-y:auto;margin-bottom:4px}
.mitem{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:8px 9px;border:0;
  border-radius:var(--r-sm);background:none;color:var(--ink);font-size:13px;font-weight:450;
  transition:background var(--t) var(--ease)}
.mitem:hover{background:var(--paper-2)}
.mitem.on{background:var(--p-container);color:var(--on-p-container);font-weight:600}
.mitem .mlabel{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mitem .ic{color:var(--faint);margin:0}
.mitem.on .ic,.mitem:hover .ic{color:inherit}
.mitem.danger{color:var(--wax);font-weight:550}
.mitem.danger .ic{color:var(--wax)}
.msep{height:1px;background:var(--hair);margin:5px 0}
.mrow{display:flex;gap:6px;padding:5px 9px 8px}
.mrow .btn{flex:1;justify-content:center}
.chromeacts .mscroll{max-height:none}
.chromeacts .mitem{background:var(--card);border:1px solid var(--line);margin-bottom:5px}
.chromeacts .mitem.on{background:var(--p-container);border-color:transparent}
`;

export function Topbar({ api, chrome, desktop, onMenu, navOpen }) {
  const { state } = api;
  return (
    <header className="topbar">
      {!desktop && (
        <button className="iconbtn" onClick={onMenu} aria-label="Open navigation"
                aria-controls="dk-nav" aria-expanded={!!navOpen}>
          <Icon n="menu" s={20} />
        </button>
      )}
      <span className="crumb">{state.org.short.toUpperCase()} / PROCUREMENT</span>
      <div className="grow" />
      {/* The bar carries two things: what needs your attention, and who you are.
          Everything else is behind the avatar. */}
      <Bell api={api} />
      {desktop && <AccountMenu api={api} {...chrome} />}
    </header>
  );
}

/* ---------------- buyer: dashboard ---------------- */

export function Dashboard({ api }) {
  const { state, go } = api;
  const tenders = state.tenders;
  const open = tenders.filter((t) => effStatus(t) === "published");
  const sealed = tenders.filter((t) => effStatus(t) === "closed");
  const evaluating = tenders.filter((t) => t.status === "evaluation");
  const approvals = tenders.filter((t) => t.status === "approval");
  const awardRecs = tenders.filter((t) => t.status === "evaluation" && t.awardRec);
  const savings = tenders.filter((t) => t.status === "awarded").reduce((s, t) => s + (t.budget - t.awardedAmount), 0);
  const unanswered = state.clarifications.filter((c) => !c.a);
  const expiring = [];
  state.suppliers.forEach((s) => s.docs.forEach((d) => { const dl = daysLeft(d.expiry); if (dl <= 60) expiring.push({ s, d, dl }); }));
  expiring.sort((a, b) => a.dl - b.dl);

  return (
    <div>
      <div className="pagehead"><h1>Dashboard</h1><span className="sub">Everything that needs a decision, in one place.</span></div>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat k="Open for bids" v={<CountUp n={open.length} />} d="live tenders with suppliers bidding" />
        <Stat k="Sealed, awaiting opening" v={<CountUp n={sealed.length} />} d="deadline passed, seals unbroken" tone={sealed.length ? "var(--wax)" : null} />
        <Stat k="In evaluation" v={<CountUp n={evaluating.length} />} d="panels scoring" />
        <Stat k="Savings this year" v={<CountUp n={savings} format={fmtCompact} />} d="awarded vs. budget" tone="var(--green)" />
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="chead"><h3>Action queue</h3></div>
          <div className="cbody stagger" style={{ paddingTop: 6 }}>
            {sealed.map((t) => (
              <div className="rowline" key={t.id}>
                <span className="sealdot" style={{ width: 11, height: 11 }} />
                <div style={{ flex: 1 }}><b>{t.title}</b><div className="muted" style={{ fontSize: 12 }}>Deadline passed: sealed bids ready to open</div></div>
                <button className="btn sm wax" onClick={() => go({ page: "tender", id: t.id, tab: "bids" })}>Open bids</button>
              </div>
            ))}
            {awardRecs.map((t) => (
              <div className="rowline" key={"ar" + t.id}>
                <div style={{ flex: 1 }}><b>{t.title}</b><div className="muted" style={{ fontSize: 12 }}>Award recommendation with the approver</div></div>
                <span className="stamp gold">Awaiting award approval</span>
              </div>
            ))}
            {approvals.map((t) => (
              <div className="rowline" key={t.id}>
                <div style={{ flex: 1 }}><b>{t.title}</b><div className="muted" style={{ fontSize: 12 }}>With {state.users.find((u) => u.role === "approver").name} for approval</div></div>
                <Stamp s="approval" />
              </div>
            ))}
            {unanswered.map((c) => {
              const t = tenders.find((x) => x.id === c.tenderId);
              return (
                <div className="rowline" key={c.id}>
                  <div style={{ flex: 1 }}><b>Unanswered clarification</b><div className="muted" style={{ fontSize: 12 }}>{t.title}</div></div>
                  <button className="btn sm" onClick={() => go({ page: "tender", id: t.id, tab: "clar" })}>Answer</button>
                </div>
              );
            })}
            {!sealed.length && !approvals.length && !unanswered.length && !awardRecs.length && <Empty>Nothing waiting on you.</Empty>}
          </div>
        </div>

        <div className="card">
          <div className="chead"><h3>Deadline radar</h3></div>
          <div className="cbody" style={{ paddingTop: 6 }}>
            {open.sort((a, b) => a.deadline - b.deadline).map((t) => {
              const nBids = state.bids.filter((b) => b.tenderId === t.id).length;
              return (
                <div className="rowline" key={t.id}>
                  <div style={{ flex: 1 }}>
                    <b style={{ cursor: "pointer" }} onClick={() => go({ page: "tender", id: t.id })}>{t.title}</b>
                    <div className="muted" style={{ fontSize: 12 }}>{nBids} sealed {nBids === 1 ? "bid" : "bids"} received · {t.invited.length} invited</div>
                  </div>
                  <Countdown t={t.deadline} />
                </div>
              );
            })}
            {!open.length && <Empty>No live tenders.</Empty>}
          </div>
        </div>

        <div className="card">
          <div className="chead"><h3>Compliance radar</h3><span className="mono faint" style={{ marginLeft: "auto" }}>next 60 days</span></div>
          <div className="cbody" style={{ paddingTop: 6 }}>
            {expiring.map((x, i) => (
              <div className="rowline" key={i}>
                <div style={{ flex: 1 }}><b>{x.s.name}</b><div className="muted" style={{ fontSize: 12 }}>{x.d.name}</div></div>
                <span className={"chip " + (x.dl <= 30 ? "warn" : "")}>{x.dl} days to expiry</span>
              </div>
            ))}
            {!expiring.length && <Empty>All supplier documents current.</Empty>}
          </div>
        </div>

        <div className="card">
          <div className="chead"><h3>Recent activity</h3></div>
          <div className="cbody">
            <ul className="tline">
              {state.events.slice(0, 6).map((e) => (
                <li key={e.id} className={/seal/i.test(e.action) ? "waxdot" : ""}>
                  <div className="when">{fmtDateTime(e.at)}</div>
                  <div className="what">{e.action}</div>
                  <div className="who">{e.actor} · {e.detail}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- buyer: tender list ---------------- */

export function TendersPage({ api }) {
  const { state, go, user, act } = api;
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const match = (t) => {
    const st = effStatus(t);
    if (statusF === "live" && !["published", "closed"].includes(st)) return false;
    if (statusF === "evaluation" && st !== "evaluation") return false;
    if (statusF === "awarded" && st !== "awarded") return false;
    if (statusF === "active" && st === "awarded") return false;
    if (!q.trim()) return true;
    const n = q.trim().toLowerCase();
    return [t.ref, t.title, t.category].some((x) => (x || "").toLowerCase().includes(n));
  };
  const rows = [...state.tenders].filter(match).sort((a, b) => (b.publishedAt || b.deadline) - (a.publishedAt || a.deadline));
  return (
    <div>
      <div className="pagehead">
        <h1>Tenders</h1><span className="sub">{rows.length} shown</span>
        <div className="grow" />
        <div className="pagetools">
          <input className="in" placeholder="Search ref, title, category…"
                 aria-label="Search tenders" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="in" aria-label="Filter by status"
                  value={statusF} onChange={(e) => setStatusF(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Hide awarded</option>
            <option value="live">Live (open for bids)</option>
            <option value="evaluation">In evaluation</option>
            <option value="awarded">Awarded</option>
          </select>
          {user.role === "procurement" && <button className="btn pri" onClick={() => go({ page: "new" })}>New tender</button>}
        </div>
      </div>
      <div className="card">
        {/* data-l names each cell for the phone layout, where the table becomes
            a list of records. The title and the status stamp carry the record
            rather than a field, so they stay unlabelled. */}
        <table className="tbl">
          <thead><tr><th>Ref</th><th>Title</th><th>Category</th><th className="num">Budget</th><th>Deadline</th><th>Bids</th><th>Status</th>{user.role === "procurement" && <th />}</tr></thead>
          <tbody>
            {rows.map((t) => {
              const st = effStatus(t);
              const nBids = state.bids.filter((b) => b.tenderId === t.id).length;
              return (
                <tr key={t.id} className="click" onClick={() => go({ page: "tender", id: t.id })}>
                  <td className="mono muted">{t.ref}</td>
                  <td><b>{t.title}</b>{t.awardRec && t.status === "evaluation" && <span className="chip gold" style={{ marginLeft: 8 }}>With approver</span>}</td>
                  <td className="muted" data-l="Category">{t.category}</td>
                  <td className="num" data-l="Budget"><Money n={t.budget} /></td>
                  <td data-l="Deadline">{t.status === "approval" || t.status === "draft" ? <span className="faint">-</span> : <Countdown t={t.deadline} />}</td>
                  <td className="mono" data-l="Bids">{st === "published" || st === "closed" ? nBids + " sealed" : nBids || "-"}</td>
                  <td><Stamp s={st} /></td>
                  {user.role === "procurement" && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="btn sm" title="Create a draft copy: dates cleared, structure carried over"
                              onClick={async () => { if (await act.duplicate(t.id)) go({ page: "tenders" }); }}>Duplicate</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- buyer: tender detail ---------------- */

export function TenderDetail({ api, id, initialTab }) {
  const { state, user, go } = api;
  const tabsByRole = {
    procurement: ["overview", "clar", "bids", "eval", "audit"],
    evaluator: ["overview", "eval"],
    approver: ["overview", "audit"],
    auditor: ["overview", "audit"],
  };
  const labels = { overview: "Overview", clar: "Clarifications", bids: "Bids", eval: "Evaluation", audit: "Audit" };
  const t = state.tenders.find((x) => x.id === id);
  let tabs = tabsByRole[user.role] || ["overview"];
  if (t && t.type === "AUC") tabs = tabs.filter((x) => x !== "eval");  // price-only: nothing to score
  const [tab, setTab] = useState(initialTab && tabs.includes(initialTab) ? initialTab : tabs[0]);
  if (!t) return <Empty>Tender not found.</Empty>;
  const oversight = ["auditor", "approver", "procurement"].includes(user.role);
  const st = effStatus(t);
  const unansweredN = state.clarifications.filter((c) => c.tenderId === id && !c.a).length;

  return (
    <div>
      <button className="btn sm" style={{ marginBottom: 14 }} onClick={() => go({ page: user.role === "evaluator" ? "evals" : "tenders" })}>← Back</button>
      <div className="pagehead" style={{ marginBottom: 12 }}>
        <div>
          <div className="mono muted" style={{ marginBottom: 3 }}>{t.ref} · {t.type} · {t.category}</div>
          <h1>{t.title}</h1>
        </div>
        <div className="grow" />
        <Stamp s={st} />
      </div>
      <StageTracker t={t} />
      <div className="tabs" role="tablist">
        {tabs.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>
            {labels[k]}{k === "clar" && unansweredN ? ` (${unansweredN})` : ""}
          </button>
        ))}
        {oversight && (
          <button className="btn sm" style={{ marginLeft: "auto", alignSelf: "center" }}
                  title="One PDF proving this tender followed procedure: invitations, sealing, COI, scores, award, trail"
                  onClick={() => downloadUrl(`/tenders/${t.id}/export/compliance.pdf`, `${t.ref}-compliance.pdf`)}>
            Compliance report
          </button>
        )}
      </div>
      {tab === "overview" && <OverviewTab api={api} t={t} />}
      {tab === "clar" && <ClarTab api={api} t={t} />}
      {tab === "bids" && <BidsTab api={api} t={t} />}
      {tab === "eval" && <EvalTab api={api} t={t} />}
      {tab === "audit" && <AuditTab api={api} t={t} />}
    </div>
  );
}

export function OverviewTab({ api, t }) {
  const { state, user, act, go } = api;
  const st = effStatus(t);
  const [ad, setAd] = useState({ title: "", note: "" });
  const canManage = user.role === "procurement";

  const submitForApproval = () => act.submitTender(t.id);
  const issueAddendum = async () => {
    if (!ad.title.trim()) return;
    const ok = await act.addAddendum(t.id, { title: ad.title.trim(), note: ad.note.trim() });
    if (ok) setAd({ title: "", note: "" });
  };

  return (
    <div className="grid g2">
      {t.status === "draft" && canManage && (
        <div className="notice" style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: 1 }}>This tender is a draft. Suppliers can't see it until it's approved and published.</span>
          <button className="btn sm" onClick={() => go({ page: "new", editId: t.id })}>Edit draft</button>
          <button className="btn sm pri" onClick={submitForApproval}>Submit for approval</button>
        </div>
      )}
      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="chead"><h3>Scope of work</h3></div>
        <div className="cbody" style={{ fontSize: 13.5, lineHeight: 1.6 }}>{t.scope}</div>
      </div>
      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="chead"><h3>Tender documents</h3>
          {canManage && t.status !== "awarded" && (
            <label className="btn sm" style={{ marginLeft: "auto" }}>
              Upload document
              <input type="file" hidden onChange={(e) => { const f = e.target.files[0]; if (f) act.upload(`/tenders/${t.id}/docs/`, f); e.target.value = ""; }} />
            </label>
          )}
        </div>
        <div className="cbody">
          {(state.documents || []).filter((x) => x.kind === "tender" && x.tenderId === t.id).map((x) => (
            <div className="docrow" key={x.id}>
              <button className="doclink" onClick={() => downloadDoc(x.id, x.name)}><Icon n="file" s={13} />{x.name}</button>
              <span className="mono faint">{Math.max(1, Math.round(x.size / 1024))} KB · {fmtDate(x.uploadedAt)}</span>
              <span style={{ flex: 1 }} />
              {canManage && t.status !== "awarded" && <button className="btn sm" aria-label="Remove document" onClick={() => act.deleteDoc(x.id)}>✕</button>}
            </div>
          ))}
          {!(state.documents || []).some((x) => x.kind === "tender" && x.tenderId === t.id) && (
            <span className="muted" style={{ fontSize: 13 }}>No documents attached. Invited suppliers see everything published here.</span>
          )}
        </div>
      </div>
      {t.lines && t.lines.length > 0 && (
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="chead"><h3>Priced line items</h3><span className="mono faint" style={{ marginLeft: "auto" }}>suppliers quote a unit rate per line</span></div>
          <table className="tbl">
            <thead><tr><th>#</th><th>Line</th><th className="num">Qty</th><th>Unit</th></tr></thead>
            <tbody>
              {t.lines.map((l, i) => (
                <tr key={l.id}><td className="mono muted">{i + 1}</td><td>{l.desc}</td><td className="num mono" data-l="Qty">{l.qty.toLocaleString()}</td><td className="muted" data-l="Unit">{l.unit}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="card">
        <div className="chead"><h3>Key terms</h3></div>
        <div className="cbody" style={{ paddingTop: 6 }}>
          <div className="rowline"><span className="muted" style={{ flex: 1 }}>Budget ceiling</span><Money n={t.budget} strong /></div>
          <div className="rowline"><span className="muted" style={{ flex: 1 }}>Submission deadline</span><span className="mono">{fmtDate(t.deadline)}</span></div>
          {t.publishedAt && <div className="rowline"><span className="muted" style={{ flex: 1 }}>Published</span><span className="mono">{fmtDate(t.publishedAt)}</span></div>}
          <div className="rowline"><span className="muted" style={{ flex: 1 }}>Evaluation split</span><span className="mono">{t.techWeight}% technical / {t.commWeight}% commercial</span></div>
          {t.status === "awarded" && (
            <div className="rowline"><span className="muted" style={{ flex: 1 }}>Awarded to</span><b>{state.suppliers.find((s) => s.id === t.awardedTo)?.name}</b></div>
          )}
        </div>
      </div>
      <div className="card">
        <div className="chead"><h3>Evaluation criteria</h3><span className="mono faint" style={{ marginLeft: "auto" }}>technical envelope</span></div>
        <div className="cbody" style={{ paddingTop: 6 }}>
          {t.criteria.map((c) => (
            <div className="rowline" key={c.id}>
              <span style={{ flex: 1 }}>{c.name}</span>
              <span className="mono muted">{c.weight}%</span>
            </div>
          ))}
        </div>
      </div>
      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="chead"><h3>Addenda</h3><span className="mono faint" style={{ marginLeft: "auto" }}>{(t.addenda || []).length} issued</span></div>
        <div className="cbody">
          {(t.addenda || []).map((a) => (
            <div className="addm" key={a.id}>
              <b>{a.title}</b> <span className="mono faint">· {fmtDateTime(a.at)}</span>
              {a.note && <div className="muted" style={{ marginTop: 4, fontSize: 12.5 }}>{a.note}</div>}
            </div>
          ))}
          {!(t.addenda || []).length && <div className="muted" style={{ fontSize: 13, marginBottom: (canManage && st === "published") ? 12 : 0 }}>No addenda issued.</div>}
          {canManage && st === "published" && (
            <div style={{ borderTop: (t.addenda || []).length ? "1px solid var(--line)" : "none", paddingTop: (t.addenda || []).length ? 12 : 0 }}>
              <div className="grid g2" style={{ marginBottom: 8 }}>
                <input className="in" placeholder="Addendum title, e.g. Delivery window revised" aria-label="Addendum title" value={ad.title} onChange={(e) => setAd({ ...ad, title: e.target.value })} />
                <input className="in" placeholder="What changed (visible to all invited suppliers)" aria-label="Addendum note" value={ad.note} onChange={(e) => setAd({ ...ad, note: e.target.value })} />
              </div>
              <button className="btn sm" onClick={issueAddendum} disabled={!ad.title.trim()}>Issue addendum</button>
              <span className="muted" style={{ fontSize: 12, marginLeft: 10 }}>Bids already sealed stay valid; new submissions must acknowledge every addendum.</span>
            </div>
          )}
        </div>
      </div>
      {t.status === "awarded" && t.awardMemo && (
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="chead"><h3>Award memo</h3><span className="mono faint" style={{ marginLeft: "auto" }}>approved {fmtDate(t.awardedAt)}</span>
            <button className="btn sm" style={{ marginLeft: 10 }} onClick={() => downloadUrl(`/tenders/${t.id}/export/memo.pdf`, `${t.ref}-award-memo.pdf`)}>Download PDF</button></div>
          <div className="cbody"><div className="aihint">{t.awardMemo}</div></div>
        </div>
      )}
      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="chead"><h3>Invited suppliers</h3><span className="mono faint" style={{ marginLeft: "auto" }}>{t.invited.length} invited</span></div>
        <div className="cbody" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {t.invited.map((sid) => {
            const s = state.suppliers.find((x) => x.id === sid);
            const hasBid = state.bids.some((b) => b.tenderId === t.id && b.supplierId === sid);
            return (
              <span key={sid} className={"chip " + (hasBid ? "ok" : "")}>
                {s.name}{hasBid ? " · bid received" : st === "published" ? " · awaiting bid" : ""}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ClarTab({ api, t }) {
  const { state, user, act, ai } = api;
  const items = state.clarifications.filter((c) => c.tenderId === t.id).sort((a, b) => b.askedAt - a.askedAt);
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState(null);
  const answer = async (cid) => {
    const text = (drafts[cid] || "").trim();
    if (!text) return;
    const ok = await act.answerClar(cid, text);
    if (ok) setDrafts((d) => ({ ...d, [cid]: "" }));
  };
  const draftAI = async (c) => {
    setBusyId(c.id);
    try {
      const out = await ai.clarAnswer(c.id);
      if (out) setDrafts((d) => ({ ...d, [c.id]: out }));
    } catch (e) {
      setDrafts((d) => ({ ...d, [c.id]: (d[c.id] || "") || e.message }));
    }
    setBusyId(null);
  };
  return (
    <div className="card">
      <div className="chead"><h3>Clarifications</h3><span className="mono faint" style={{ marginLeft: "auto" }}>answers are visible to every invited supplier</span></div>
      <div className="cbody">
        {items.map((c) => {
          const s = state.suppliers.find((x) => x.id === c.supplierId);
          return (
            <div className="qa" key={c.id}>
              <div className="mono faint" style={{ marginBottom: 4 }}>{s.name} · {fmtDateTime(c.askedAt)}</div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{c.q}</div>
              {c.a ? (
                <div style={{ borderLeft: "3px solid var(--green)", paddingLeft: 10, fontSize: 13 }}>
                  <span className="mono faint">Answered {fmtDateTime(c.answeredAt)}</span><br />{c.a}
                </div>
              ) : user.role === "procurement" ? (
                <div>
                  <textarea className="in" placeholder="Write the answer that all invited suppliers will see…" value={drafts[c.id] || ""} onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))} />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button className="btn pri sm" onClick={() => answer(c.id)} disabled={!(drafts[c.id] || "").trim()}>Publish answer</button>
                    <button className="btn sm" onClick={() => draftAI(c)} disabled={busyId === c.id}>{busyId === c.id ? "Drafting…" : "Draft with AI"}</button>
                  </div>
                </div>
              ) : (
                <span className="chip warn">Awaiting answer</span>
              )}
            </div>
          );
        })}
        {!items.length && <Empty>No questions yet.</Empty>}
      </div>
    </div>
  );
}

/* ---------------- bids & opening ---------------- */

export function BidsTab({ api, t }) {
  const { state, user, act, toast } = api;
  const st = effStatus(t);
  const bids = state.bids.filter((b) => b.tenderId === t.id);
  /* True only for the render that follows the opening, so the ceremony plays
     once for the person who broke the seals and never again on a revisit. */
  const [justOpened, setJustOpened] = useState(false);

  /* The recorded opening. Held rather than clicked: it is irreversible, it is
     logged under the caller's name, and the hold is the ceremony. */
  const openBids = async () => {
    const ok = await act.openBids(t.id);
    if (ok) {
      setJustOpened(true);
      cue.tear();
      toast.ok(t.twoStage && !t.techOpenedAt ? "Technical envelopes opened"
                                            : t.twoStage ? "Commercial envelopes opened"
                                            : `${bids.length} seal(s) broken`,
               t.twoStage && !t.techOpenedAt
                 ? "Prices stay sealed until technical scoring concludes."
                 : "Amounts and documents are now on the record. The panel can score.");
    }
  };

  if (t.type === "AUC" && !t.openedAt) {
    return <AuctionBoard api={api} t={t} />;
  }

  if (!t.openedAt && t.techOpenedAt) {
    // two-stage, technical phase: commercial envelopes still sealed
    const threshold = t.techThreshold ?? 70;
    return (
      <div>
        <div className="notice" style={{ marginBottom: 14 }}>
          <b>Stage 1 of 2.</b> Technical envelopes are open and being scored blind. Prices and commercial
          documents remain cryptographically sealed. Bidders scoring below <b>{threshold}/100</b> will have
          their commercial envelopes returned unopened.
        </div>
        <div className="grid" style={{ gridTemplateColumns: "1fr", gap: 10, marginBottom: 16 }}>
          {bids.map((b) => {
            const s = state.suppliers.find((x) => x.id === b.supplierId);
            const scored = Object.keys(b.scores || {}).length;
            return (
              <div className="sealrow" key={b.id}>
                <SealMark s={15} cracked={justOpened} className={justOpened ? "cracked" : ""}
                          style={justOpened ? { animationDelay: i * 90 + "ms" } : null} />
                <div style={{ flex: 1 }}>
                  <b>{s.name}</b>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Technical proposal open · {scored ? `${scored} evaluator(s) scored` : "awaiting scores"}
                    {" · "}
                    {(state.documents || []).filter((x) => x.kind === "bid" && x.tenderId === t.id && x.supplierId === b.supplierId).map((x) => (
                      <button key={x.id} className="doclink" style={{ fontSize: 11.5, marginRight: 8 }} onClick={() => downloadDoc(x.id, x.name)}>{x.name}</button>
                    ))}
                  </div>
                </div>
                <span className="mono waxfg" style={{ fontSize: 11, letterSpacing: ".1em" }}>COMMERCIAL SEALED</span>
              </div>
            );
          })}
        </div>
        {user.role === "procurement" && (
          <div className="ceremony">
            <SealMark s={26} className="stamped" />
            <h3>Open commercial envelopes</h3>
            <p className="muted" style={{ maxWidth: 500, margin: "0 auto 16px", fontSize: 13 }}>
              Requires technical scores on every bid. Bidders at or above {threshold}/100 have their prices
              revealed; the rest are disqualified and their commercial envelopes are never decrypted.
            </p>
            <HoldButton label={`Hold to open commercial envelopes (threshold ${threshold}/100)`} onDone={openBids} />
            <div className="holdhint" style={{ marginTop: 8 }}>Disqualified bidders' pricing is never decrypted: not now, not ever.</div>
          </div>
        )}
      </div>
    );
  }

  if (!t.openedAt) {
    return (
      <div>
        <div className="grid" style={{ gridTemplateColumns: "1fr", gap: 10, marginBottom: 16 }}>
          {bids.map((b, i) => {
            const s = state.suppliers.find((x) => x.id === b.supplierId);
            return (
              <div className="sealrow" key={b.id}>
                <SealMark s={15} cracked={justOpened} className={justOpened ? "cracked" : ""}
                          style={justOpened ? { animationDelay: i * 90 + "ms" } : null} />
                <div style={{ flex: 1 }}><b>{s.name}</b><div className="muted" style={{ fontSize: 12 }}>Sealed bid received {fmtDateTime(b.submittedAt)}</div></div>
                <span className="mono waxfg" style={{ fontSize: 11, letterSpacing: ".1em" }}>SEALED</span>
              </div>
            );
          })}
          {!bids.length && <Empty>No bids received yet.</Empty>}
        </div>
        {st === "closed" && user.role === "procurement" && bids.length > 0 && (
          <div className="ceremony">
            <SealMark s={26} className="stamped" />
            <h3>Bid opening</h3>
            <p className="muted" style={{ maxWidth: 480, margin: "0 auto 16px", fontSize: 13 }}>
              The deadline has passed. Breaking the seals reveals all {bids.length} bids at once, is recorded permanently in the
              audit trail under your name, and moves this tender into evaluation.
            </p>
            <HoldButton onDone={openBids}
                        label={t.twoStage
                          ? `Hold to open ${bids.length} technical envelope(s), stage 1 of 2`
                          : `Hold to break ${bids.length} seal(s)`} />
            <div className="holdhint" style={{ marginTop: 8 }}>Press and hold: the opening is permanent and carries your name.</div>
          </div>
        )}
        {st === "published" && (
          <div className="notice">Bids stay sealed until the deadline passes on {fmtDate(t.deadline)}. Nobody, including this team, can view their contents before the opening is logged.</div>
        )}
      </div>
    );
  }

  const hasLines = t.lines && t.lines.length > 0 && bids.some((b) => b.lines && Object.keys(b.lines).length);
  const lineMin = {};
  if (hasLines) {
    t.lines.forEach((l) => {
      const ps = bids.map((b) => b.lines?.[l.id]).filter((p) => p != null);
      lineMin[l.id] = ps.length ? Math.min(...ps) : null;
    });
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: hasLines ? 14 : 0 }}>
        <div className="chead"><h3>Opened bids</h3><span className="mono faint" style={{ marginLeft: "auto" }}>seals broken {fmtDateTime(t.openedAt)}</span>
          {["procurement", "approver", "auditor"].includes(user.role) &&
            <button className="btn sm" style={{ marginLeft: 10 }} onClick={() => downloadUrl(`/tenders/${t.id}/export/comparison.xlsx`, `${t.ref}-comparison.xlsx`)}>Export to Excel</button>}
        </div>
        <table className="tbl">
          <thead><tr><th>Supplier</th><th>Submitted</th><th className="num">Amount</th><th className="num">vs budget</th><th>Flags</th></tr></thead>
          <tbody className={justOpened ? "stagger" : undefined}>
            {bids.map((b) => {
              const s = state.suppliers.find((x) => x.id === b.supplierId);
              const delta = ((b.amount - t.budget) / t.budget) * 100;
              const low = abnormallyLow(b, bids);
              return (
                <tr key={b.id}>
                  <td>
                    <b>{s.name}</b>{t.awardedTo === b.supplierId && <span className="chip gold" style={{ marginLeft: 8 }}>Awarded</span>}
                    <div style={{ marginTop: 3 }}>
                      {(state.documents || []).filter((x) => x.kind === "bid" && x.tenderId === t.id && x.supplierId === b.supplierId).map((x) => (
                        <button key={x.id} className="doclink" style={{ fontSize: 11.5, marginRight: 10 }} onClick={() => downloadDoc(x.id, x.name)}>{x.name}</button>
                      ))}
                    </div>
                  </td>
                  <td className="mono muted" data-l="Submitted">{fmtDateTime(b.submittedAt)}</td>
                  {b.disqualified ? (
                    <>
                      <td className="num mono waxfg" data-l="Amount" style={{ fontSize: 11, letterSpacing: ".08em" }}>RETURNED UNOPENED</td>
                      <td className="num faint" data-l="vs budget">-</td>
                      <td data-l="Flags"><span className="chip warn">Disqualified at technical stage</span></td>
                    </>
                  ) : (
                    <>
                      <td className="num" data-l="Amount">
                        {justOpened
                          ? <span className="money" style={{ fontWeight: 600 }}><Decrypting n={b.amount} format={fmtMoney} /></span>
                          : <Money n={b.amount} strong />}
                      </td>
                      <td className="num mono" data-l="vs budget" style={{ color: delta < 0 ? "var(--green)" : "var(--wax)" }}>{delta > 0 ? "+" : ""}{delta.toFixed(1)}%</td>
                      <td data-l="Flags">{low ? <span className="chip warn">Abnormally low: verify viability</span> : <span className="faint">-</span>}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasLines && (
        <div className="card">
          <div className="chead"><h3>Line-item comparison</h3><span className="mono faint" style={{ marginLeft: "auto" }}>unit rates · lowest per line in green</span></div>
          <div className="tscroll">
            <table className="tbl wide">
              <thead>
                <tr><th>Line</th><th className="num">Qty</th>{bids.map((b) => <th key={b.id} className="num">{state.suppliers.find((x) => x.id === b.supplierId).name}</th>)}</tr>
              </thead>
              <tbody>
                {t.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.desc}</td>
                    <td className="num mono muted">{l.qty.toLocaleString()}</td>
                    {bids.map((b) => {
                      const p = b.lines?.[l.id];
                      return <td key={b.id} className={"num money" + (p != null && p === lineMin[l.id] ? " best" : "")}>{p != null ? fmtMoney(p) : "-"}</td>;
                    })}
                  </tr>
                ))}
                <tr>
                  <td style={{ fontWeight: 600 }}>Evaluated total</td><td />
                  {bids.map((b) => <td key={b.id} className="num money" style={{ fontWeight: 600 }}>{fmtMoney(b.amount)}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


/* A 0 to 10 dial rather than a number field.

   Scoring a panel is the longest sitting an evaluator does in this app, and a
   number input asks for a keystroke, a tab and a glance to confirm. Ten targets
   mean one click, and the keyboard still works: 1 to 9 and 0 for ten, arrows to
   nudge, backspace to clear. The value is written on every change exactly as
   before, so the audit trail sees no difference. */
function Dial({ value, label, onPick }) {
  const v = value === "" || value == null ? null : Number(value);
  const key = (e) => {
    if (e.key >= "1" && e.key <= "9") { onPick(Number(e.key)); }
    else if (e.key === "0") { onPick(10); }
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") { onPick(Math.min(10, (v ?? 0) + 1)); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { onPick(Math.max(0, (v ?? 1) - 1)); }
    else if (e.key === "Backspace" || e.key === "Delete") { onPick(""); }
    else return;
    e.preventDefault();
  };
  return (
    <span className="dial" role="radiogroup" aria-label={`Score for ${label}`} tabIndex={0} onKeyDown={key}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={v === n}
                className={"dpip" + (v === n ? " on" : "") + (v != null && n < v ? " under" : "")}
                title={`${n} of 10`} onClick={() => onPick(v === n ? "" : n)}>{n}</button>
      ))}
      <span className="dval mono">{v == null ? "not scored" : v + "/10"}</span>
    </span>
  );
}

/* ---------------- evaluation ---------------- */

export function EvalTab({ api, t }) {
  const { state, user, act, ai } = api;
  const bids = state.bids.filter((b) => b.tenderId === t.id);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [recBid, setRecBid] = useState(null);   // bid queued for the recommendation dialog
  const [openRows, setOpenRows] = useState({});
  const [myScores, setMyScores] = useState(() => {
    const m = {};
    bids.forEach((b) => { m[b.id] = { ...((b.scores || {})[user.id] || {}) }; });
    return m;
  });
  const [myNotes, setMyNotes] = useState(() => {
    const m = {};
    bids.forEach((b) => { m[b.id] = ((b.notes || {})[user.id]) || ""; });
    return m;
  });
  const evaluators = state.users.filter((u) => u.role === "evaluator");

  if (!t.openedAt) {
    return <div className="notice">Evaluation opens once the deadline passes and the seals are formally broken. Until then there is nothing to score, by design.</div>;
  }

  const setScore = (bidId, cid, v) => {
    const num = v === "" ? "" : Math.max(0, Math.min(10, Number(v)));
    setMyScores((s) => ({ ...s, [bidId]: { ...s[bidId], [cid]: num } }));
    act.saveScores(bidId, { [cid]: num });
  };

  const withdrawRec = async () => {
    const bidId = t.awardRec?.bidId;
    const ok = await act.withdrawRec(t.id);
    if (ok) {
      /* The server takes a recommendation back and accepts the same one again,
         so this one is genuinely reversible. */
      api.toast.undo("Recommendation withdrawn", "It is back with the panel; the approver's queue is clear.",
                     async () => {
                       if (bidId && await act.recommend(t.id, bidId)) {
                         api.toast.ok("Recommendation restored", "It is with the approver again.");
                       }
                     });
    }
  };

  const genBrief = async () => {
    setBusy(true); setBrief("");
    try {
      const out = await ai.brief(t.id);
      setBrief(out || "No response, try again.");
    } catch (e) {
      setBrief(e.message || "The drafting service is unreachable right now. Try again in a moment.");
    }
    setBusy(false);
  };

  /* ---- evaluator: blind scoring ---- */
  if (user.role === "evaluator") {
    if (!((t.coi || {})[user.id]) && t.status !== "awarded") {
      return (
        <div className="card" style={{ maxWidth: 620 }}>
          <div className="chead"><h3>Conflict-of-interest declaration</h3></div>
          <div className="cbody">
            <p style={{ margin: "0 0 12px", fontSize: 13.5, lineHeight: 1.6 }}>
              Before any scores can be entered, confirm that you have no financial or personal interest in any
              bidder on this tender. The declaration is signed in your name and recorded permanently in the
              audit trail. If a conflict exists, stop here and inform the panel chair instead.
            </p>
            <button className="btn pri" onClick={() => act.declareCoi(t.id)}>I declare no conflict of interest</button>
          </div>
        </div>
      );
    }
    return (
      <div>
        <div className="notice" style={{ marginBottom: 14 }}>
          Blind scoring: you can only see your own scores. The consensus matrix is revealed to the panel chair, never to individual scorers, so nobody anchors on a colleague's numbers.
        </div>
        {bids.map((b) => {
          const s = state.suppliers.find((x) => x.id === b.supplierId);
          const mine = myScores[b.id] || {};
          let tot = 0, w = 0;
          t.criteria.forEach((c) => { if (mine[c.id] !== undefined && mine[c.id] !== "") { tot += Number(mine[c.id]) * 10 * c.weight; w += c.weight; } });
          const bidDocs = (state.documents || []).filter((x) => x.kind === "bid" && x.tenderId === t.id && x.supplierId === b.supplierId);
          return (
            <div className="card" key={b.id} style={{ marginBottom: 14 }}>
              {bidDocs.length > 0 && (
                <div style={{ padding: "8px 18px 0" }}>
                  <span className="mono faint" style={{ fontSize: 10.5, marginRight: 8 }}>READ FIRST:</span>
                  {bidDocs.map((x) => (
                    <button key={x.id} className="doclink" style={{ fontSize: 12, marginRight: 12 }} onClick={() => downloadDoc(x.id, x.name)}>{x.name}</button>
                  ))}
                </div>
              )}
              <div className="chead"><h3>{s.name}</h3><span className="mono faint">{b.amount != null ? <>bid <Money n={b.amount} /></> : b.disqualified ? "commercial returned unopened" : "commercial sealed"}</span>
                <span className="mono" style={{ marginLeft: "auto" }}>
                  {w ? <>your technical score: <b><CountUp n={tot / w} format={(x) => Math.round(x)} ms={260} from={null} /></b>/100</>
                     : "not scored yet"}
                </span>
              </div>
              <div className="cbody" style={{ paddingTop: 6 }}>
                {t.criteria.map((c) => (
                  <div className="scorerow" key={c.id}>
                    <span className="scname">{c.name} <span className="mono faint">({c.weight}%)</span></span>
                    <Dial value={mine[c.id]} label={c.name} onPick={(v) => setScore(b.id, c.id, v)} />
                  </div>
                ))}
                <div style={{ marginTop: 12 }}>
                  <label className="lbl" htmlFor={"note-" + b.id}>Justification (visible to the panel chair and auditors)</label>
                  <textarea id={"note-" + b.id} className="in" style={{ minHeight: 60 }}
                    placeholder="Why these scores? Auditors will ask."
                    value={myNotes[b.id] ?? ""}
                    onChange={(e) => setMyNotes((m) => ({ ...m, [b.id]: e.target.value }))}
                    onBlur={() => act.saveScores(b.id, {}, myNotes[b.id] ?? "")} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  /* ---- chair view: consensus matrix ---- */
  const rec = t.awardRec;
  const recSupplier = recBid && state.suppliers.find((x) => x.id === recBid.supplierId);
  return (
    <div>
      {recBid && (
        <ConfirmDialog title="Recommend this bid for award?" confirmLabel="Send to the approver"
                       onClose={() => setRecBid(null)}
                       onConfirm={async () => {
                         const ok = await act.recommend(t.id, recBid.id);  // memo composed server-side
                         if (ok) api.toast.ok("Recommendation sent", `${recSupplier.name} at ${fmtCompact(recBid.amount)} is now in the approver's queue.`);
                       }}>
          <b>{recSupplier?.name}</b> at <b>{fmtMoney(recBid.amount)}</b> for “{t.title}”.
          <div style={{ marginTop: 8 }}>
            The panel memo is composed from the scores and pricing and goes to the approver with your name on it.
            Nothing reaches any supplier until the approver signs off, and you can withdraw it until they do.
          </div>
        </ConfirmDialog>
      )}
      {rec && t.status !== "awarded" && (
        <div className="notice" style={{ marginBottom: 14, borderLeft: "3px solid var(--brass)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ flex: 1 }}>
            <b>Recommended for award:</b> {state.suppliers.find((s) => s.id === rec.supplierId).name} at <Money n={rec.amount} />, with the approver since {fmtDateTime(rec.at)}.
          </span>
          {user.role === "procurement" && <button className="btn sm" onClick={withdrawRec}>Withdraw recommendation</button>}
        </div>
      )}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="chead"><h3>Consensus matrix</h3><span className="mono faint" style={{ marginLeft: "auto" }}>{t.techWeight}% technical · {t.commWeight}% commercial</span></div>
        <div className="tscroll">
          <table className="tbl wide">
            <thead><tr><th>Supplier</th><th className="num">Amount</th><th className="num">Technical</th><th className="num">Commercial</th><th className="num">Total</th><th>Flags</th><th></th></tr></thead>
            <tbody>
              {bids
                .map((b) => ({ b, total: totalScore(t, b, bids) }))
                .sort((x, y) => (y.total ?? -1) - (x.total ?? -1))
                .map(({ b, total }, idx) => {
                  const s = state.suppliers.find((x) => x.id === b.supplierId);
                  const ts = techScore(t, b);
                  const flags = varianceFlags(t, b);
                  const low = abnormallyLow(b, bids);
                  const isOpen = openRows[b.id];
                  return (
                    <React.Fragment key={b.id}>
                      <tr>
                        <td>
                          <b>{s.name}</b>
                          {idx === 0 && total != null && t.status !== "awarded" && !rec && <span className="chip ok" style={{ marginLeft: 8 }}>Leading</span>}
                          {rec && rec.supplierId === b.supplierId && t.status !== "awarded" && <span className="chip gold" style={{ marginLeft: 8 }}>Recommended</span>}
                          {t.awardedTo === b.supplierId && <span className="chip gold" style={{ marginLeft: 8 }}>Awarded</span>}
                        </td>
                        <td className="num">{b.amount != null ? <Money n={b.amount} /> : <span className="mono waxfg" style={{ fontSize: 10.5 }}>{b.disqualified ? "UNOPENED" : "SEALED"}</span>}</td>
                        <td className="num mono">{ts != null ? ts.toFixed(0) : "-"}</td>
                        <td className="num mono">{commScore(t, b, bids).toFixed(0)}</td>
                        <td className="num mono" style={{ fontWeight: 600 }}>{total != null ? total.toFixed(1) : "-"}</td>
                        <td>
                          {low && <span className="chip warn" style={{ marginRight: 4 }}>Abnormally low</span>}
                          {flags.map((c) => <span key={c.id} className="chip warn" title="Evaluators disagree strongly on this criterion" style={{ marginRight: 4 }}>Panel split: {c.name}</span>)}
                          {!low && !flags.length && <span className="faint">-</span>}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button className="btn sm" onClick={() => setOpenRows((o) => ({ ...o, [b.id]: !o[b.id] }))}>{isOpen ? "Hide scores" : "Scores"}</button>
                          {user.role === "procurement" && t.status !== "awarded" && !rec && <button className="btn sm" style={{ marginLeft: 6 }} onClick={() => setRecBid(b)}>Recommend award…</button>}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="breakrow">
                          <td colSpan={7}>
                            <table className="subtbl" style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead><tr><th style={{ textAlign: "left", fontFamily: "'Courier New',Courier,monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--faint)", padding: "6px 12px" }}>Criterion</th>{evaluators.map((u) => <th key={u.id} style={{ textAlign: "right", fontFamily: "'Courier New',Courier,monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--faint)", padding: "6px 12px" }}>{u.name.split(" ")[0]}</th>)}<th style={{ textAlign: "right", fontFamily: "'Courier New',Courier,monospace", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--faint)", padding: "6px 12px" }}>Spread</th></tr></thead>
                              <tbody>
                                {t.criteria.map((c) => {
                                  const vals = evaluators.map((u) => b.scores?.[u.id]?.[c.id]);
                                  const nums = vals.filter((v) => v != null && v !== "").map(Number);
                                  const split = nums.length > 1 && stdev(nums) >= 2;
                                  return (
                                    <tr key={c.id}>
                                      <td>{c.name} <span className="mono faint">({c.weight}%)</span></td>
                                      {vals.map((v, i) => <td key={i} className="num mono" style={{ textAlign: "right" }}>{v != null && v !== "" ? v : "-"}</td>)}
                                      <td className="num mono" style={{ textAlign: "right", color: split ? "var(--wax)" : "var(--faint)" }}>{nums.length > 1 ? "±" + stdev(nums).toFixed(1) : "-"}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            {evaluators.some((u) => (b.notes || {})[u.id]) && (
                              <div style={{ padding: "8px 12px 2px" }}>
                                {evaluators.map((u) => (b.notes || {})[u.id] ? (
                                  <div key={u.id} style={{ fontSize: 12.5, marginBottom: 6 }}>
                                    <b>{u.name.split(" ")[0]}:</b> <span className="muted">{b.notes[u.id]}</span>
                                  </div>
                                ) : null)}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
      {user.role === "procurement" && (
        <div className="card">
          <div className="chead"><h3>Comparison brief</h3>
            <button className="btn sm" style={{ marginLeft: "auto" }} onClick={genBrief} disabled={busy}>{busy ? "Drafting…" : "Draft with AI"}</button>
          </div>
          <div className="cbody">
            {brief ? <div className="aihint">{brief}</div> : <span className="muted" style={{ fontSize: 13 }}>Generate a neutral summary of strengths, risks and verification points across all bids. Advisory only: the decision stays with the panel.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export function AuditTab({ api, t }) {
  const events = api.state.events.filter((e) => e.tenderId === t.id);
  return (
    <div className="card"><div className="chead"><h3>Audit trail</h3><span className="mono faint" style={{ marginLeft: "auto" }}>immutable · every action, named and timestamped</span></div>
      <div className="cbody">
        {events.length ? (
          <ul className="tline">
            {events.map((e) => (
              <li key={e.id} className={/seal/i.test(e.action) ? "waxdot" : ""}>
                <div className="when">{fmtDateTime(e.at)}</div>
                <div className="what">{e.action}</div>
                <div className="who">{e.actor} · {e.detail}</div>
              </li>
            ))}
          </ul>
        ) : <Empty>No events recorded yet.</Empty>}
      </div>
    </div>
  );
}

/* ---------------- evaluator home ---------------- */

export function EvalsPage({ api }) {
  const { state, go, user } = api;
  const rows = state.tenders.filter((t) => t.status === "evaluation");
  const progress = (t) => {
    const bids = state.bids.filter((b) => b.tenderId === t.id);
    const done = bids.filter((b) => {
      const mine = b.scores?.[user.id] || {};
      return t.criteria.every((c) => mine[c.id] != null && mine[c.id] !== "");
    }).length;
    return `${done}/${bids.length} bids fully scored`;
  };
  return (
    <div>
      <div className="pagehead"><h1>My evaluations</h1><span className="sub">score independently, the panel never sees each other's numbers</span></div>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>Ref</th><th>Title</th><th>Your progress</th><th></th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="click" onClick={() => go({ page: "tender", id: t.id, tab: "eval" })}>
                <td className="mono muted">{t.ref}</td>
                <td><b>{t.title}</b></td>
                <td className="mono muted" data-l="Progress">{progress(t)}</td>
                <td><button className="btn sm">Score →</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="4"><Empty>Nothing in evaluation right now.</Empty></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- approvals (publication + awards) ---------------- */

export function ApprovalsPage({ api }) {
  const { state, act } = api;
  const pubs = state.tenders.filter((t) => t.status === "approval");
  const awards = state.tenders.filter((t) => t.status === "evaluation" && t.awardRec);
  const [thr, setThr] = useState(String(state.org.approvalThreshold || ""));
  const [thrMsg, setThrMsg] = useState("");
  const [awardT, setAwardT] = useState(null);   // tender queued for award sign-off

  const awarded = state.tenders.filter((t) => t.status === "awarded");
  const committed = awarded.reduce((s, t) => s + (t.awardedAmount || 0), 0);
  const pending = awards.reduce((s, t) => s + (t.awardRec?.amount || 0), 0);
  const ceilings = state.tenders.filter((t) => !["draft"].includes(t.status)).reduce((s, t) => s + (t.budget || 0), 0);

  const saveThr = async () => {
    setThrMsg("");
    try {
      const r = await raw("/settings/", { method: "POST", body: { approvalThreshold: Number(thr) } });
      setThrMsg(`Saved. Publication at or above ${fmtCompact(r.approvalThreshold)} now needs your sign-off.`);
    } catch (e) { setThrMsg(e.message); }
  };

  const decidePub = async (t, ok) => {
    const done = await act.publishDecision(t.id, ok);
    if (done) {
      api.toast.ok(ok ? "Published" : "Returned to the panel",
                   ok ? `Invitations are out to ${t.invited.length} supplier(s) on ${t.ref}.`
                      : `${t.ref} is back with procurement as a draft.`);
    }
  };

  /** Approving an award issues letters to every bidder and cannot be undone,
      so it is press-and-hold rather than a click. */
  const approveAward = async (t) => {
    const rec = t.awardRec;
    const done = await act.awardDecision(t.id, true);   // letters generated server-side
    setAwardT(null);
    if (done) {
      cue.chime();
      const winner = state.suppliers.find((s) => s.id === rec.supplierId);
      api.toast.ok("Award approved, letters issued", `${winner.name} at ${fmtCompact(rec.amount)}. Every bidder has been notified.`);
    }
  };
  const returnAward = async (t) => {
    const done = await act.awardDecision(t.id, false);
    if (done) api.toast.info("Returned to the panel", "Procurement has been asked to revisit the recommendation.");
  };

  return (
    <div>
      {awardT && (() => {
        const rec = awardT.awardRec;
        const winner = state.suppliers.find((s) => s.id === rec.supplierId);
        const losers = state.bids.filter((b) => b.tenderId === awardT.id && b.supplierId !== rec.supplierId).length;
        return (
          <ConfirmDialog title="Approve this award?" confirmLabel="Hold to approve & issue letters"
                         tone="pri" hold holdHint="Irreversible: hold to sign off"
                         onClose={() => setAwardT(null)} onConfirm={() => approveAward(awardT)}>
            <b>{winner.name}</b> wins “{awardT.title}” at <b>{fmtMoney(rec.amount)}</b>, {fmtCompact(awardT.budget - rec.amount)} under
            the {fmtCompact(awardT.budget)} ceiling.
            <div style={{ marginTop: 8 }}>
              Signing off issues the award letter immediately, plus {losers} regret letter{losers === 1 ? "" : "s"},
              and notifies every bidder. It is recorded in the audit trail under your name and <b>cannot be undone.</b>
            </div>
          </ConfirmDialog>
        );
      })()}
      <div className="pagehead"><h1>Approvals</h1><span className="sub">nothing reaches suppliers without a named sign-off</span></div>
      <div className="grid2" style={{ alignItems: "stretch", marginBottom: 14 }}>
        <div className="card">
          <div className="chead"><h3>Committed spend</h3></div>
          <div className="cbody">
            <div className="rowline"><span className="muted" style={{ flex: 1 }}>Awarded to date</span><Money n={committed} strong /></div>
            <div className="rowline"><span className="muted" style={{ flex: 1 }}>Pending your approval</span><Money n={pending} /></div>
            <div className="rowline"><span className="muted" style={{ flex: 1 }}>Total budget ceilings in play</span><Money n={ceilings} /></div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Approve everything pending and committed spend becomes <b>{fmtCompact(committed + pending)}</b>.</div>
          </div>
        </div>
        <div className="card">
          <div className="chead"><h3>Approval matrix</h3><span className="mono faint" style={{ marginLeft: "auto" }}>only you can change this</span></div>
          <div className="cbody">
            <div className="frow">
              <label className="lbl">Publication threshold (NGN): tenders at or above this need your sign-off; below publishes directly</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="in" type="number" value={thr} onChange={(e) => setThr(e.target.value)} />
                <button className="btn pri" onClick={saveThr} disabled={!Number(thr)}>Save</button>
              </div>
            </div>
            {thrMsg && <div className="notice" style={{ marginBottom: 0 }}>{thrMsg}</div>}
          </div>
        </div>
      </div>

      {awards.length > 0 && <div className="navsec" style={{ color: "var(--faint)", padding: "0 0 8px" }}>AWARD APPROVALS</div>}
      {awards.map((t) => {
        const rec = t.awardRec;
        const winner = state.suppliers.find((s) => s.id === rec.supplierId);
        const bids = state.bids.filter((b) => b.tenderId === t.id);
        return (
          <div className="card" key={"a" + t.id} style={{ marginBottom: 14, borderLeft: "3px solid var(--brass)" }}>
            <div className="chead">
              <h3>{t.title}</h3><span className="mono faint">{t.ref}</span>
              <span className="chip gold" style={{ marginLeft: "auto" }}>Award · {winner.name} · {fmtCompact(rec.amount)}</span>
            </div>
            <div className="cbody">
              <div className="aihint" style={{ marginBottom: 12 }}>{rec.memo}</div>
              <button className="btn sm" style={{ marginBottom: 12 }} onClick={() => downloadUrl(`/tenders/${t.id}/export/memo.pdf`, `${t.ref}-award-memo.pdf`)}>Download memo as PDF</button>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {bids
                  .map((b) => ({ b, tot: totalScore(t, b, bids) }))
                  .sort((x, y) => (y.tot ?? -1) - (x.tot ?? -1))
                  .map(({ b, tot }) => {
                    const s = state.suppliers.find((x) => x.id === b.supplierId);
                    return <span key={b.id} className={"chip" + (b.supplierId === rec.supplierId ? " gold" : "")}>{s.name} · {fmtCompact(b.amount)} · total {tot != null ? tot.toFixed(1) : "-"}</span>;
                  })}
              </div>
              <div className="mono faint" style={{ marginBottom: 12 }}>Recommended by {rec.by} · {fmtDateTime(rec.at)}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn pri" onClick={() => setAwardT(t)}>Approve award & issue letters…</button>
                <button className="btn" onClick={() => returnAward(t)}>Return to panel</button>
              </div>
            </div>
          </div>
        );
      })}

      {pubs.length > 0 && <div className="navsec" style={{ color: "var(--faint)", padding: "8px 0" }}>TENDERS TO PUBLISH</div>}
      {pubs.map((t) => (
        <div className="card" key={t.id} style={{ marginBottom: 14 }}>
          <div className="chead">
            <h3>{t.title}</h3><span className="mono faint">{t.ref}</span>
            <span className="mono" style={{ marginLeft: "auto" }}><Money n={t.budget} strong /></span>
          </div>
          <div className="cbody">
            <p style={{ margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.6 }}>{t.scope}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {t.criteria.map((c) => <span key={c.id} className="chip">{c.name} · {c.weight}%</span>)}
              <span className="chip">{t.techWeight}/{t.commWeight} tech–commercial split</span>
              <span className="chip">Deadline {fmtDate(t.deadline)}</span>
              {t.lines && t.lines.length > 0 && <span className="chip">{t.lines.length} priced lines</span>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn pri" onClick={() => decidePub(t, true)}>Approve & publish</button>
              <button className="btn" onClick={() => decidePub(t, false)}>Return to draft</button>
            </div>
          </div>
        </div>
      ))}
      {!pubs.length && !awards.length && <div className="card"><Empty>The approval queue is clear.</Empty></div>}
    </div>
  );
}

/* ---------------- new / edit tender ---------------- */

export function NewTender({ api, editId }) {
  const { state, act, ai, go } = api;
  const editing = editId ? state.tenders.find((t) => t.id === editId) : null;
  const [f, setF] = useState(() => editing ? {
    title: editing.title, type: editing.type, category: editing.category, budget: String(editing.budget),
    deadline: new Date(editing.deadline).toISOString().slice(0, 10), techWeight: editing.techWeight, scope: editing.scope,
    criteria: editing.criteria.map((c) => ({ ...c })), invited: [...editing.invited],
    lines: (editing.lines || []).map((l) => ({ ...l, qty: String(l.qty) })),
    twoStage: !!editing.twoStage, techThreshold: editing.techThreshold ?? 70,
    minDecrement: String(editing.minDecrement || ""),
  } : {
    title: "", type: "RFQ", category: "Food & Produce", budget: "", deadline: "",
    techWeight: 70, scope: "",
    criteria: [{ id: uid(), name: "Quality & compliance", weight: 40 }, { id: uid(), name: "Capacity & reliability", weight: 35 }, { id: uid(), name: "Commercial terms", weight: 25 }],
    invited: [], lines: [],
    twoStage: false, techThreshold: 70, minDecrement: "",
  });
  const [busy, setBusy] = useState(false);
  const [busyC, setBusyC] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const weightSum = f.criteria.reduce((s, c) => s + Number(c.weight || 0), 0);
  const linesOk = f.lines.length === 0 || f.lines.every((l) => l.desc.trim() && Number(l.qty) > 0);
  const isAuction = f.type === "AUC";
  const ready = f.title.trim() && Number(f.budget) > 0 && f.deadline && f.invited.length > 0 && linesOk
    && (isAuction ? Number(f.minDecrement) > 0 && f.lines.length === 0 : weightSum === 100);

  const draftScope = async () => {
    setBusy(true);
    try {
      const out = await ai.scope({ title: f.title, category: f.category, lines: f.lines.map((l) => l.desc) });
      if (out) set("scope", out);
    } catch (e) { if (!f.scope) set("scope", e.message); }
    setBusy(false);
  };

  const suggestCriteria = async () => {
    setBusyC(true);
    try {
      const arr = await ai.criteria({ title: f.title, category: f.category, scope: f.scope });
      if (Array.isArray(arr) && arr.length) {
        set("criteria", arr.map((c) => ({ id: uid(), name: String(c.name), weight: Number(c.weight) })));
      }
    } catch (e) { /* server validates; keep existing criteria */ }
    setBusyC(false);
  };

  const save = async (submit) => {
    const payload = {
      title: f.title.trim(), type: f.type, category: f.category,
      budget: Number(f.budget), deadline: f.deadline ? new Date(f.deadline + "T17:00:00").getTime() : 0,
      invited: f.invited, techWeight: Number(f.techWeight),
      criteria: f.criteria.map((c) => ({ id: c.id, name: c.name, weight: Number(c.weight) })),
      scope: f.scope.trim(),
      lines: isAuction ? [] : f.lines.filter((l) => l.desc.trim()).map((l) => ({ id: l.id, desc: l.desc.trim(), qty: Number(l.qty), unit: l.unit.trim() || "unit" })),
      twoStage: f.twoStage, techThreshold: Number(f.techThreshold) || 70,
      minDecrement: Number(f.minDecrement) || 0,
      submit,
    };
    const ok = editing ? await act.updateTender(editId, payload) : await act.createTender(payload);
    if (ok) go({ page: "tenders" });
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <button className="btn sm" style={{ marginBottom: 14 }} onClick={() => go({ page: "tenders" })}>← Back</button>
      <div className="pagehead"><h1>{editing ? "Edit draft" : "New tender"}</h1><span className="sub">draft → approval → published, sealed from day one</span></div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="chead"><h3>Basics</h3></div>
        <div className="cbody">
          <div className="frow"><label className="lbl" htmlFor="nt-title">Title</label>
            <input id="nt-title" className="in" placeholder="e.g. Annual supply of beverage syrups" value={f.title} onChange={(e) => set("title", e.target.value)} /></div>
          <div className="grid g3">
            <div className="frow"><label className="lbl">Type</label>
              <select className="in" value={f.type} onChange={(e) => set("type", e.target.value)}>
                <option value="RFQ">RFQ: sealed quotation</option>
                <option value="RFP">RFP: sealed proposal</option>
                <option value="RFI">RFI: information</option>
                <option value="AUC">Reverse auction: live price competition</option>
              </select></div>
            {isAuction ? (
              <div className="frow">
                <label className="lbl">Minimum decrement (NGN): each new bid must undercut the bidder's previous price by at least this</label>
                <input className="in" type="number" value={f.minDecrement} onChange={(e) => set("minDecrement", e.target.value)} placeholder="e.g. 500000" />
                <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>
                  Price-only competition: the budget acts as the opening ceiling, bidders see live rank (never
                  competitor prices), and bids in the final two minutes extend the close. No criteria, no line items.
                </div>
              </div>
            ) : (
              <div className="frow">
                <label style={{ display: "flex", gap: 9, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={f.twoStage} onChange={(e) => set("twoStage", e.target.checked)} />
                  Two-stage opening: technical envelopes first; commercial envelopes only for bidders scoring ≥
                  <input className="in numin" type="number" min="0" max="100" style={{ margin: "0 4px" }}
                         value={f.techThreshold} onChange={(e) => set("techThreshold", e.target.value)}
                         onClick={(e) => e.stopPropagation()} /> /100
                </label>
                <div className="muted" style={{ fontSize: 12, marginTop: 5 }}>Failed bidders' pricing is never decrypted: their commercial envelope is returned unopened. Standard in public-sector procurement.</div>
              </div>
            )}
            <div className="frow"><label className="lbl">Category</label>
              <select className="in" value={f.category} onChange={(e) => set("category", e.target.value)}>
                {["Food & Produce", "Dairy", "Packaging", "Logistics", "Equipment", "IT hardware", "Facilities"].map((c) => <option key={c}>{c}</option>)}
              </select></div>
            <div className="frow"><label className="lbl">Budget ceiling (₦)</label>
              <input className="in" type="number" min="0" placeholder="120000000" value={f.budget} onChange={(e) => set("budget", e.target.value)} /></div>
          </div>
          <div className="grid g2">
            <div className="frow"><label className="lbl">Submission deadline</label>
              <input className="in" type="date" min={new Date().toISOString().slice(0, 10)} value={f.deadline} onChange={(e) => set("deadline", e.target.value)} /></div>
            <div className="frow"><label className="lbl">Technical weight: {f.techWeight}% technical / {100 - f.techWeight}% commercial</label>
              <input className="in" type="range" min="30" max="90" step="5" value={f.techWeight} onChange={(e) => set("techWeight", e.target.value)} /></div>
          </div>
          <div className="frow" style={{ marginBottom: 0 }}>
            <label className="lbl" htmlFor="nt-scope">Scope of work</label>
            <textarea id="nt-scope" className="in" placeholder="What is being bought, at what service level, under which compliance rules…" value={f.scope} onChange={(e) => set("scope", e.target.value)} />
            <button className="btn sm" style={{ marginTop: 8 }} onClick={draftScope} disabled={busy}>{busy ? "Drafting…" : "Draft scope with AI"}</button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="chead"><h3>Priced line items</h3><span className="mono faint" style={{ marginLeft: "auto" }}>optional, leave empty for a lump-sum bid</span></div>
        <div className="cbody">
          {f.lines.map((l, i) => (
            <div key={l.id} className="lineedit">
              <input className="in desc" placeholder="Line description" aria-label={"Line " + (i + 1)} value={l.desc} onChange={(e) => set("lines", f.lines.map((x) => x.id === l.id ? { ...x, desc: e.target.value } : x))} />
              <input className="in" type="number" min="1" placeholder="Qty" aria-label="Quantity" value={l.qty} onChange={(e) => set("lines", f.lines.map((x) => x.id === l.id ? { ...x, qty: e.target.value } : x))} />
              <input className="in" placeholder="Unit" aria-label="Unit" value={l.unit} onChange={(e) => set("lines", f.lines.map((x) => x.id === l.id ? { ...x, unit: e.target.value } : x))} />
              <button className="btn sm" aria-label="Remove line" onClick={() => set("lines", f.lines.filter((x) => x.id !== l.id))}>✕</button>
            </div>
          ))}
          <button className="btn sm" onClick={() => set("lines", [...f.lines, { id: uid(), desc: "", qty: "", unit: "unit" }])}>+ Add line item</button>
          {!linesOk && <div className="notice" style={{ marginTop: 10 }}>Every line needs a description and a quantity above zero, or remove the empty lines.</div>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="chead"><h3>Evaluation criteria</h3>
          <button className="btn sm" onClick={suggestCriteria} disabled={busyC}>{busyC ? "Suggesting…" : "Suggest with AI"}</button>
          <span className="mono" style={{ marginLeft: "auto", color: weightSum === 100 ? "var(--green)" : "var(--wax)" }}>{weightSum}/100%</span></div>
        <div className="cbody">
          {f.criteria.map((c, i) => (
            <div key={c.id} className="critedit">
              <input className="in cname" aria-label={"Criterion " + (i + 1)} value={c.name} onChange={(e) => set("criteria", f.criteria.map((x) => x.id === c.id ? { ...x, name: e.target.value } : x))} />
              <input className="in" type="number" min="0" max="100" aria-label="Weight %" value={c.weight} onChange={(e) => set("criteria", f.criteria.map((x) => x.id === c.id ? { ...x, weight: e.target.value } : x))} />
              <button className="btn sm" aria-label="Remove criterion" onClick={() => set("criteria", f.criteria.filter((x) => x.id !== c.id))}>✕</button>
            </div>
          ))}
          <button className="btn sm" onClick={() => set("criteria", [...f.criteria, { id: uid(), name: "", weight: 0 }])}>+ Add criterion</button>
          {weightSum !== 100 && <div className="notice" style={{ marginTop: 10 }}>Weights must total exactly 100% before this can be submitted.</div>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="chead"><h3>Invite suppliers</h3><span className="mono faint" style={{ marginLeft: "auto" }}>{f.invited.length} selected</span></div>
        <div className="cbody" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {state.suppliers.map((s) => {
            const on = f.invited.includes(s.id);
            return (
              <button key={s.id} className="chip" aria-pressed={on}
                style={on ? { borderColor: "var(--green)", color: "var(--green)", background: "var(--green-tint)" } : null}
                onClick={() => set("invited", on ? f.invited.filter((x) => x !== s.id) : [...f.invited, s.id])}>
                {s.name} · {s.category}{!s.prequalified ? " · not prequalified" : ""}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn pri" disabled={!ready} onClick={() => save(true)}>Submit for approval</button>
        <button className="btn" disabled={!f.title.trim()} onClick={() => save(false)}>{editing ? "Save draft" : "Save as draft"}</button>
      </div>
    </div>
  );
}

/* ---------------- suppliers ---------------- */

export function SuppliersPage({ api }) {
  const { state, user, act, toast } = api;
  const canManage = user.role === "procurement";
  const [preS, setPreS] = useState(null);        // vendor queued for approval
  const [declineS, setDeclineS] = useState(null); // vendor queued for decline
  const [reason, setReason] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");

  const prequalify = (s) => setPreS(s);
  const decline = (s) => { setReason(""); setDeclineS(s); };
  const inviteVendor = () => { setEmail(""); setInviteOpen(true); };
  const queue = state.suppliers.filter((s) => !s.prequalified && s.registeredAt);
  const complianceDocs = (sid) => (state.documents || []).filter((x) => x.kind === "supplier" && x.supplierId === sid);
  const [sq, setSq] = useState("");
  const [preOnly, setPreOnly] = useState(false);
  const visible = state.suppliers.filter((s) => {
    if (preOnly && !s.prequalified) return false;
    if (!sq.trim()) return true;
    const n = sq.trim().toLowerCase();
    return [s.name, s.category, s.location].some((x) => (x || "").toLowerCase().includes(n));
  });
  return (
    <div>
      {preS && (
        <ConfirmDialog title={`Prequalify ${preS.name}?`} confirmLabel="Prequalify" onClose={() => setPreS(null)}
                       onConfirm={async () => {
                         if (await act.prequalDecision(preS.id, true)) toast.ok(`${preS.name} prequalified`, "They are now eligible for invitations, and they have been notified.");
                       }}>
          They become eligible for tender invitations without a waiver, and the decision is recorded in the
          audit trail under your name. Check their compliance documents first if you haven't.
        </ConfirmDialog>
      )}
      {declineS && (
        <Dialog title={`Decline ${declineS.name}`} onClose={() => setDeclineS(null)} footer={
          <>
            <button className="btn" onClick={() => setDeclineS(null)}>Cancel</button>
            <button className="btn wax" disabled={!reason.trim()}
                    onClick={async () => {
                      const s = declineS;
                      setDeclineS(null);
                      if (await act.prequalDecision(s.id, false, reason.trim())) {
                        toast.ok(`${s.name} declined`, "The reason has been sent to the vendor and recorded in the audit trail.");
                      }
                    }}>Decline & send the reason</button>
          </>
        }>
          The vendor sees this reason verbatim and can fix it and come back, so make it specific and actionable.
          It is recorded permanently in the audit trail.
          <textarea className="in" style={{ marginTop: 10 }} autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Public liability insurance expires inside the contract term. Upload a renewal covering to Dec 2027." />
        </Dialog>
      )}
      {inviteOpen && (
        <Dialog title="Invite a vendor to register" onClose={() => setInviteOpen(false)} footer={
          <>
            <button className="btn" onClick={() => setInviteOpen(false)}>Cancel</button>
            <button className="btn pri" disabled={!email.includes("@")}
                    onClick={async () => {
                      const to = email.trim();
                      setInviteOpen(false);
                      if (await act.inviteVendor(to)) toast.ok("Invitation sent", `${to} has a registration link. They appear in the review queue once they complete it.`);
                    }}>Send invitation</button>
          </>
        }>
          They receive a link to register their company. Once registered they land in your prequalification
          queue with their compliance documents attached.
          <input className="in" style={{ marginTop: 10 }} autoFocus type="email" placeholder="vendor@company.com"
                 value={email} onChange={(e) => setEmail(e.target.value)} />
        </Dialog>
      )}
      <div className="pagehead"><h1>Suppliers</h1><span className="sub">{visible.length} shown</span>
        <div className="grow" />
        <div className="pagetools">
          <input className="in" placeholder="Search suppliers…"
                 aria-label="Search suppliers" value={sq} onChange={(e) => setSq(e.target.value)} />
          <label className="checkline">
            <input type="checkbox" checked={preOnly} onChange={(e) => setPreOnly(e.target.checked)} /> Prequalified only
          </label>
          {canManage && (
            <>
              <label className="btn sm"><Icon n="upload" /> Import CSV
                <input type="file" accept=".csv" hidden onChange={async (e) => {
                  const f = e.target.files[0];
                  if (f && await act.upload("/suppliers/import/", f)) {
                    toast.ok("Supplier book imported", "New vendors are in the register below; duplicates and blank rows were skipped.");
                  }
                  e.target.value = "";
                }} />
              </label>
              <button className="btn sm" onClick={inviteVendor}><Icon n="mail" /> Invite a vendor to register</button>
            </>
          )}
        </div>
      </div>
      {canManage && <div className="muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 12 }}>CSV columns: name, category, location, email, prequalified (yes/no). Duplicates are skipped.</div>}
      {canManage && queue.length > 0 && (
        <div className="card" style={{ marginBottom: 14, borderLeft: "3px solid var(--brass)" }}>
          <div className="chead"><h3>Registration queue</h3><span className="mono faint" style={{ marginLeft: "auto" }}>{queue.length} awaiting review</span></div>
          <div className="cbody">
            {queue.map((s) => (
              <div key={s.id} className="docrow" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <b>{s.name}</b> <span className="muted" style={{ fontSize: 12 }}>· {s.category} · {s.location} · {s.contactEmail}</span>
                  <div style={{ marginTop: 4 }}>
                    {complianceDocs(s.id).map((x) => (
                      <button key={x.id} className="doclink" style={{ fontSize: 12, marginRight: 10 }} onClick={() => downloadDoc(x.id, x.name)}>{x.name}</button>
                    ))}
                    {complianceDocs(s.id).length === 0 && <span className="muted" style={{ fontSize: 12 }}>No compliance documents uploaded yet.</span>}
                  </div>
                  {s.rejectedReason && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Previously declined: {s.rejectedReason}</div>}
                </div>
                <button className="btn sm pri" onClick={() => prequalify(s)}>Prequalify</button>
                <button className="btn sm" onClick={() => decline(s)}>Decline…</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="card">
        <div className="tscroll">
          <table className="tbl">
            <thead><tr><th>Supplier</th><th>Category</th><th>Prequalified</th><th>Compliance documents</th><th className="num">On-time</th><th className="num">Quality</th></tr></thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.name}</b><div className="muted" style={{ fontSize: 11.5 }}>{s.location}</div></td>
                  <td className="muted" data-l="Category">{s.category}</td>
                  <td data-l="Prequalified">
                    {s.prequalified
                      ? <span className="chip ok">Prequalified</span>
                      : <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          <span className="chip warn">Pending review</span>
                          {user.role === "procurement" && <button className="btn sm" onClick={() => prequalify(s)}>Approve</button>}
                        </span>}
                  </td>
                  <td data-l="Documents">
                    {s.docs.map((d, i) => {
                      const dl = d.expiry ? daysLeft(d.expiry) : null;
                      const label = `${d.name}${dl !== null ? (dl <= 60 ? ` · ${dl}d left` : " · valid") : ""}`;
                      return d.docId
                        ? <button key={i} className={"chip " + (dl !== null && dl <= 60 ? "warn" : "")} style={{ marginRight: 5, marginBottom: 3, cursor: "pointer" }} onClick={() => downloadDoc(d.docId, d.name)}>{label}</button>
                        : <span key={i} className={"chip " + (dl !== null && dl <= 60 ? "warn" : "")} style={{ marginRight: 5, marginBottom: 3 }}>{label}</span>;
                    })}
                  </td>
                  <td className="num mono" data-l="On-time">{s.perf.onTime}%</td>
                  <td className="num mono" data-l="Quality">{s.perf.quality}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------------- analytics ---------------- */

export function AnalyticsPage({ api }) {
  const { state, ai } = api;
  const [insight, setInsight] = useState("");
  const [busy, setBusy] = useState(false);
  const awarded = state.tenders.filter((t) => t.status === "awarded");
  const savings = awarded.reduce((s, t) => s + (t.budget - t.awardedAmount), 0);
  const byCat = {};
  awarded.forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + t.awardedAmount; });
  state.tenders.filter((t) => t.status === "evaluation").forEach((t) => {
    const bids = state.bids.filter((b) => b.tenderId === t.id);
    if (bids.length) byCat[t.category] = (byCat[t.category] || 0) + median(bids.map((b) => b.amount));
  });
  const catData = Object.entries(byCat).map(([label, value]) => ({ label, value }));
  const cycle = awarded.map((t) => (t.awardedAt - t.publishedAt) / DAY);
  const outliers = [];
  state.tenders.filter((t) => t.openedAt).forEach((t) => {
    const bids = state.bids.filter((b) => b.tenderId === t.id);
    bids.forEach((b) => { if (abnormallyLow(b, bids)) outliers.push({ t, b }); });
  });
  const splits = [];
  state.tenders.filter((t) => t.openedAt).forEach((t) => {
    state.bids.filter((b) => b.tenderId === t.id).forEach((b) => {
      varianceFlags(t, b).forEach((c) => splits.push({ t, b, c }));
    });
  });
  const expiringN = state.suppliers.reduce((n, s) => n + s.docs.filter((d) => daysLeft(d.expiry) <= 60).length, 0);

  const genInsight = async () => {
    setBusy(true); setInsight("");
    try {
      const out = await ai.insights();
      setInsight(out || "No response, try again.");
    } catch (e) {
      setInsight(e.message || "The insight service is unreachable right now. Try again in a moment.");
    }
    setBusy(false);
  };

  return (
    <div>
      <div className="pagehead"><h1>Analytics</h1><span className="sub">where the money and the risk actually are</span></div>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat k="Savings vs budget" v={fmtCompact(savings)} d={awarded.length + " awarded tenders"} tone="var(--green)" />
        <Stat k="Avg award cycle" v={cycle.length ? Math.round(mean(cycle)) + "d" : "-"} d="publish → award" />
        <Stat k="Price anomalies" v={outliers.length} d="abnormally low bids flagged" tone={outliers.length ? "var(--wax)" : null} />
        <Stat k="Panel splits" v={splits.length} d="criteria where evaluators disagree" tone={splits.length ? "var(--wax)" : null} />
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="chead"><h3>This week's read</h3>
          <button className="btn sm" style={{ marginLeft: "auto" }} onClick={genInsight} disabled={busy}>{busy ? "Analysing…" : "Generate with AI"}</button>
        </div>
        <div className="cbody">
          {insight ? <div className="aihint">{insight}</div> : <span className="muted" style={{ fontSize: 13 }}>A short written read of the live portfolio: what's on track, which risks deserve attention this week, and what to do about each. Advisory only.</span>}
        </div>
      </div>
      <div className="grid g2">
        <div className="card">
          <div className="chead"><h3>Committed spend by category</h3><span className="mono faint" style={{ marginLeft: "auto" }}>awarded + evaluation-stage medians</span></div>
          <div className="cbody">{catData.length ? <MiniBars data={catData} /> : <Empty>No spend committed yet.</Empty>}</div>
        </div>
        <div className="card">
          <div className="chead"><h3>Risk flags</h3></div>
          <div className="cbody" style={{ paddingTop: 6 }}>
            {outliers.map((x, i) => (
              <div className="rowline" key={"o" + i}>
                <div style={{ flex: 1 }}><b>{state.suppliers.find((s) => s.id === x.b.supplierId).name}</b>
                  <div className="muted" style={{ fontSize: 12 }}>{x.t.title}</div></div>
                <span className="chip warn">Bid 35%+ below median</span>
              </div>
            ))}
            {splits.map((x, i) => (
              <div className="rowline" key={"s" + i}>
                <div style={{ flex: 1 }}><b>{x.c.name}</b>
                  <div className="muted" style={{ fontSize: 12 }}>{state.suppliers.find((s) => s.id === x.b.supplierId).name} · {x.t.title}</div></div>
                <span className="chip warn">Evaluators split ≥2 pts</span>
              </div>
            ))}
            {!outliers.length && !splits.length && <Empty>No open risk flags.</Empty>}
          </div>
        </div>
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="chead"><h3>Savings by tender</h3></div>
          <div className="cbody">
            {awarded.length ? (
              <MiniBars data={awarded.map((t) => ({ label: t.category, value: t.budget - t.awardedAmount, color: "var(--brass)" }))} />
            ) : <Empty>No awards yet this year.</Empty>}
          </div>
        </div>
      </div>
    </div>
  );
}


/* ---------------- audit page ---------------- */

export function AuditPage({ api }) {
  const { state } = api;
  const [f, setF] = useState("all");
  const [integrity, setIntegrity] = useState(null);
  const [aq, setAq] = useState("");
  const rows = state.events.filter((e) => {
    if (f !== "all" && e.tenderId !== f) return false;
    if (!aq.trim()) return true;
    const n = aq.trim().toLowerCase();
    return [e.actor, e.action, e.detail].some((x) => (x || "").toLowerCase().includes(n));
  });
  const verify = async () => {
    setIntegrity({ busy: true });
    try { setIntegrity(await raw("/audit/integrity/")); } catch (e) { setIntegrity({ ok: false, error: e.message }); }
  };
  return (
    <div>
      <div className="pagehead">
        <h1>Audit trail</h1><span className="sub">hash-chained · every action, named and timestamped</span>
        <div className="grow" />
        <div className="pagetools">
          <input className="in" placeholder="Search the trail…"
                 aria-label="Search audit trail" value={aq} onChange={(e) => setAq(e.target.value)} />
          <select className="in" aria-label="Filter by tender" value={f} onChange={(e) => setF(e.target.value)}>
            <option value="all">All tenders</option>
            {state.tenders.map((t) => <option key={t.id} value={t.id}>{t.ref}</option>)}
          </select>
          <button className="btn sm" onClick={verify}>Verify integrity</button>
          <button className="btn sm" onClick={() => downloadUrl("/export/audit.csv", "docket-audit-trail.csv")}>Export CSV</button>
        </div>
      </div>
      {(() => {
        const awarded = state.tenders.filter((t) => t.status === "awarded");
        const flags = [];
        state.tenders.filter((t) => t.openedAt).forEach((t) => {
          const n = state.bids.filter((b) => b.tenderId === t.id).length;
          if (n === 1) flags.push(`${t.ref}: single-bidder competition: only one bid was received.`);
        });
        const wins = {};
        awarded.forEach((t) => { wins[t.awardedTo] = (wins[t.awardedTo] || 0) + 1; });
        Object.entries(wins).forEach(([sid, n]) => {
          if (awarded.length >= 2 && n / awarded.length > 0.5) {
            const s = state.suppliers.find((x) => x.id === sid);
            flags.push(`${s ? s.name : sid} holds ${n} of ${awarded.length} awards, concentration worth a look.`);
          }
        });
        awarded.forEach((t) => {
          if (t.budget && t.awardedAmount / t.budget > 0.97) flags.push(`${t.ref}: awarded at ${((t.awardedAmount / t.budget) * 100).toFixed(1)}% of the ceiling, barely competitive.`);
        });
        return flags.length ? (
          <div className="card" style={{ marginBottom: 14, borderLeft: "3px solid var(--brass)" }}>
            <div className="chead"><h3>Anomaly scan</h3><span className="mono faint" style={{ marginLeft: "auto" }}>patterns, not accusations</span></div>
            <div className="cbody">
              {flags.map((f, i) => <div key={i} className="rowline" style={{ fontSize: 13 }}>{f}</div>)}
            </div>
          </div>
        ) : null;
      })()}
      {integrity && !integrity.busy && (
        <div className="notice" style={{ marginBottom: 14, borderLeft: `3px solid ${integrity.ok ? "var(--green)" : "var(--wax)"}` }}>
          {integrity.ok
            ? <>Chain verified: {integrity.count} events, each cryptographically linked to the one before it. Rewriting any historical entry would break every hash after it.</>
            : <>Integrity check FAILED{integrity.brokenAt ? ` at event #${integrity.brokenAt}` : ""}: the recorded history has been altered. {integrity.error || ""}</>}
        </div>
      )}
      <div className="card"><div className="cbody">
        <ul className="tline">
          {rows.map((e) => {
            const t = state.tenders.find((x) => x.id === e.tenderId);
            return (
              <li key={e.id} className={/seal/i.test(e.action) ? "waxdot" : ""}>
                <div className="when">{fmtDateTime(e.at)}{t ? " · " + t.ref : ""}</div>
                <div className="what">{e.action}</div>
                <div className="who">{e.actor} · {e.detail}</div>
              </li>
            );
          })}
          {!rows.length && <Empty>No events for this filter.</Empty>}
        </ul>
      </div></div>
    </div>
  );
}


export function TeamPage({ api }) {
  const { act } = api;
  const [team, setTeam] = useState(null);
  const [f, setF] = useState({ email: "", role: "evaluator", name: "", title: "" });
  const [msg, setMsg] = useState("");
  const [link, setLink] = useState("");
  const load = () => raw("/team/").then(setTeam).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const invite = async () => {
    setMsg(""); setLink("");
    try {
      const r = await raw("/team/invite/", { method: "POST", body: f });
      setF({ email: "", role: "evaluator", name: "", title: "" });
      if (r.inviteLink) setLink(r.inviteLink);
      load();
    } catch (e) { setMsg(e.message); }
  };

  const ROLES = [["procurement", "Procurement: runs tenders"], ["evaluator", "Evaluator: scores blind"],
                 ["approver", "Approver: signs publications & awards"], ["auditor", "Auditor: read-only oversight"]];
  return (
    <div>
      <div className="pagehead"><h1>Team</h1><span className="sub">who can do what in this workspace</span></div>
      <WorkspaceCard api={api} />
      <div className="grid2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="chead"><h3>Members</h3></div>
          <div className="tscroll">
            <table className="tbl">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
              <tbody>
                {(team?.members || []).map((m) => (
                  <tr key={m.username}>
                    <td><b>{m.name}</b><div className="muted" style={{ fontSize: 11.5 }}>{m.title}</div></td>
                    <td className="muted" data-l="Email">{m.email}</td>
                    <td data-l="Role"><span className="chip">{m.role}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(team?.invites || []).length > 0 && (
            <div className="cbody" style={{ borderTop: "1px solid var(--line)" }}>
              <div className="lbl" style={{ marginBottom: 6 }}>Invitations awaiting acceptance</div>
              {team.invites.map((i, k) => (
                <div key={k} className="docrow"><span>{i.email}</span><span className="chip">{i.role}</span><span className="mono faint">{fmtDate(i.at)}</span></div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <div className="chead"><h3>Invite a team member</h3></div>
          <div className="cbody">
            <div className="frow"><label className="lbl">Work email</label>
              <input className="in" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div className="frow"><label className="lbl">Role</label>
              <select className="in" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></div>
            <div className="frow"><label className="lbl">Name (optional, they can set it themselves)</label>
              <input className="in" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div className="frow"><label className="lbl">Title (optional)</label>
              <input className="in" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
            {msg && <div className="notice" style={{ borderLeft: "3px solid var(--wax)", marginBottom: 12 }}>{msg}</div>}
            <button className="btn pri" onClick={invite} disabled={!f.email.trim()}>Send invitation</button>
            {link && (
              <div className="notice" style={{ marginTop: 12 }}>
                Demo mode: the invitation email prints to the server log, so here's the link to try the flow yourself:{" "}
                <span className="mono" style={{ fontSize: 11, wordBreak: "break-all" }}>{link}</span>
              </div>
            )}
            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              Separation of duties is enforced by the server: evaluators can't publish or award, approvers can't score, auditors can't change anything.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuctionBoard({ api, t }) {
  const { state, user, act, toast } = api;
  const [a, setA] = useState(null);
  const [extended, setExtended] = useState(0);
  const body = useRef(null);
  const prevAmounts = useRef(new Map());
  const prevLeader = useRef(null);
  const prevDeadline = useRef(null);
  const [moved, setMoved] = useState(new Set());

  const poll = async () => {
    try {
      const next = await raw(`/tenders/${t.id}/auction/`);
      const board = next.leaderboard || [];
      // flash the rows whose price actually changed since the last poll
      const changed = new Set(board.filter((x) => prevAmounts.current.get(x.supplierId) !== x.amount &&
                                                  prevAmounts.current.size > 0).map((x) => x.supplierId));
      if (changed.size) {
        setMoved(changed);
        setTimeout(() => setMoved(new Set()), DUR.ceremony);
      }
      const leader = board[0]?.supplierId || null;
      if (prevLeader.current && leader && leader !== prevLeader.current) {
        cue.tick();
        toast.info("New leader in the auction", `${board[0].supplier} now holds the best price at ${fmtCompact(board[0].amount)}.`);
      }
      if (prevDeadline.current && next.deadline > prevDeadline.current + 1000 && next.live) {
        setExtended(next.deadline);
        toast.info("Close extended by two minutes", "A bid landed inside the final two minutes (anti-sniping).");
      }
      prevAmounts.current = new Map(board.map((x) => [x.supplierId, x.amount]));
      prevLeader.current = leader;
      prevDeadline.current = next.deadline;
      setA(next);
    } catch (e) { /* keep last */ }
  };
  useEffect(() => {
    poll();
    const h = setInterval(poll, a?.live === false ? 10000 : 2500);
    return () => clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.id, a?.live]);

  const live = a?.live;
  const board = a?.leaderboard || [];
  useFlip(body, board.map((x) => x.supplierId).join("|"));

  return (
    <div>
      <div className="notice" style={{ marginBottom: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 260 }}>
          <b>Reverse auction.</b> Suppliers see only their own rank; this leaderboard is buyer-side only.
          Bids inside the final two minutes extend the close by two minutes.
        </span>
        {extended === a?.deadline && live && <span className="extbadge">+2:00 anti-snipe</span>}
        {live
          ? <LiveCountdown deadline={a.deadline} />
          : <span className="chip">{a?.recorded ? "Results recorded" : "Auction closed"}</span>}
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="chead"><h3>{live ? "Live standings" : "Final standings"}</h3>
          <span className="mono faint" style={{ marginLeft: "auto" }}>
            {a ? <>{a.bidders} bidder(s) · <span className={moved.size ? "tickbump" : ""}>{a.movements} price movements</span> · ceiling {fmtCompact(a.ceiling)}</> : "loading…"}
          </span>
        </div>
        <table className="tbl">
          <thead><tr><th style={{ width: 68 }}>Rank</th><th>Supplier</th><th className="num">Current price</th><th className="num">vs ceiling</th><th>Last movement</th></tr></thead>
          <tbody ref={body}>
            {board.map((x, i) => (
              <tr key={x.supplierId} data-flip={x.supplierId} className={moved.has(x.supplierId) ? "flash" : ""}>
                <td className="mono" style={{ color: i === 0 ? "var(--green)" : undefined, fontWeight: i === 0 ? 700 : 400 }}>
                  {i === 0 ? "▲ " : ""}#{i + 1}
                </td>
                <td><b>{x.supplier}</b>{i === 0 && <span className="chip ok" style={{ marginLeft: 8, fontSize: 10.5 }}>leading</span>}</td>
                <td className="num" data-l="Price"><Money n={x.amount} strong={i === 0} /></td>
                <td className="num mono" data-l="vs ceiling" style={{ color: "var(--green)" }}>{(((x.amount - (a?.ceiling || t.budget)) / (a?.ceiling || t.budget)) * 100).toFixed(1)}%</td>
                <td className="mono muted" data-l="Last bid">{fmtDateTime(x.at)}</td>
              </tr>
            ))}
            {!board.length && <tr><td colSpan={5}><Empty>No bids yet. The room is open and waiting.</Empty></td></tr>}
          </tbody>
        </table>
      </div>
      {!live && a && user.role === "procurement" && board.length > 0 && (
        <div className="ceremony">
          <SealMark s={26} className="stamped" />
          <h3>Auction closed</h3>
          <p className="muted" style={{ maxWidth: 480, margin: "0 auto 16px", fontSize: 13 }}>
            Recording the results locks the final standings as formal bids and moves the tender into the
            standard recommendation → CFO approval → letters flow. It cannot be undone.
          </p>
          <HoldButton label={`Hold to record ${board.length} final standing(s)`}
                      onDone={async () => {
                        const ok = await act.openBids(t.id);
                        if (ok) toast.ok("Results recorded", "The standings are now formal bids, ready for an award recommendation.");
                      }} />
          <div className="holdhint" style={{ marginTop: 8 }}>Press and hold: this is recorded in the audit trail under your name.</div>
        </div>
      )}
      {live && <div className="muted" style={{ fontSize: 12 }}>This board refreshes every 2.5 seconds.</div>}
    </div>
  );
}


function WorkspaceCard({ api }) {
  const { state } = api;
  const [name, setName] = useState(state.org.name);
  const [short, setShort] = useState(state.org.short || "");
  const [msg, setMsg] = useState("");
  const save = async () => {
    setMsg("");
    try {
      const r = await raw("/settings/", { method: "POST", body: { name, short } });
      setMsg(`Saved. This workspace is now "${r.name}". New tender references will start with ${ (r.short || r.name).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) }-; existing references are unchanged.`);
    } catch (e) { setMsg(e.message); }
  };
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="chead"><h3>Workspace</h3><span className="mono faint" style={{ marginLeft: "auto" }}>appears on invitations, letters and memos</span></div>
      <div className="cbody">
        <div className="formrow">
          <div className="frow" style={{ flex: 2, minWidth: 220 }}>
            <label className="lbl">Organisation name</label>
            <input className="in" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="frow" style={{ flex: 1, minWidth: 130 }}>
            <label className="lbl">Short name (top bar, ref prefix)</label>
            <input className="in" value={short} onChange={(e) => setShort(e.target.value)} />
          </div>
          <button className="btn pri" onClick={save} disabled={name.trim().length < 2}>Rename</button>
        </div>
        {msg && <div className="notice" style={{ marginTop: 12, marginBottom: 0 }}>{msg}</div>}
      </div>
    </div>
  );
}

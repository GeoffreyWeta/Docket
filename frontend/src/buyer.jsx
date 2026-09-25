import React, { useEffect, useRef, useState } from "react";

import { clearLogo, downloadDoc, downloadUrl, raw, setApprovalLevel, uploadLogo } from "./api";
import { BP } from "./breakpoints";
import { orgIndex, savingsSplit } from "./analytics-model";
import { Countdown, Empty, MiniBars, Money, Stamp, Stat, StageTracker } from "./atoms";
import { BaselineHint } from "./baselines";
import { Illus } from "./illus";
import { CampaignDialog } from "./campaign";
import { MyDesk } from "./mydesk";
import { Figures, Guide, More, Page, Quiet, Row, Rows } from "./page";
import {
  DAY, REG_STATUS, VERIFY_STATUS, abnormallyLow, commScore, daysLeft, displayStatus,
  effStatus, fmtCompact, fmtDate, fmtDateTime, fmtMoney, mean, median, regStatusOf,
  roundsOf, savingsAgainst, stdev, techScore, totalScore, uid, varianceFlags,
  verifyStatusOf,
} from "./helpers";
import {
  BidBucket, LifecycleBar, RegisterVendorDialog, RoundsTab, SuspendDialog, VendorsTab,
} from "./lifecycle";
import { Icon, SealMark } from "./icons";
import { Mark, OrgMark } from "./logo";
import { can, homePage, navPages } from "./perms";
import { DUR, cue, reducedMotion, useCountUp, useFlip } from "./motion";
import { ConfirmDialog, CountUp, Decrypting, Dialog, HoldButton, LiveCountdown, SoundToggle, ThemeSwitch, TopProgress } from "./ui";

/* How many register rows reach the DOM before the reader asks for more. The
   register runs to about 1,400 vendors and nobody reads that in one scroll. */
const PAGE = 60;

/* ---------------- chrome ---------------- */

/* One label per destination. Which of them a person sees is decided by their
   capabilities (perms.js), so a role invented in the administration console gets
   a working sidebar without a change here. */
export const NAV_LABEL = {
  dashboard: "Dashboard", approvals: "Approvals", evals: "My evaluations",
  tenders: "Tenders", auctions: "Auctions", suppliers: "Suppliers", scorecards: "Scorecards",
  team: "Team", analytics: "Analytics", finance: "Finance", audit: "Audit trail",
  portal: "My invitations",
};

/* One icon per destination: the sidebar is scanned by shape before it is read. */
const NAV_ICON = {
  dashboard: "dashboard", tenders: "tender", suppliers: "suppliers", team: "team",
  analytics: "analytics", finance: "finance", audit: "audit", evals: "scales",
  auctions: "gavel",
  approvals: "stamp", portal: "portal", scorecards: "trophy",
};

/** The workspace navigation: a permanent column on a desktop, an off-canvas
    drawer below that, which is also where the secondary chrome lives, since
    the top bar has no room for it on a phone. `go()` in App.jsx closes the
    drawer on every route change, so tapping a destination never leaves it
    sitting over the answer. */
export function Sidebar({ api, chrome, open, desktop, onClose }) {
  const { user, route, go } = api;
  const items = navPages(user).map((key) => [key, NAV_LABEL[key] || key]);
  const isOn = (key) =>
    route.page === key ||
    (route.page === "tender" && key === "tenders") ||
    (route.page === "auction" && key === "auctions") ||
    (route.page === "bidroom" && key === "portal") ||
    (route.page === "new" && key === "tenders");

  /* Measure the active item and move the indicator to it. Measured rather than
     computed, because the items are text and their height follows the theme. */
  const navRef = useRef(null);
  const [ind, setInd] = useState({ y: 0, h: 0 });
  useEffect(() => {
    const box = navRef.current;
    if (!box) return;
    const on = box.querySelector(".navi.on");
    if (!on) { setInd((i) => ({ ...i, h: 0 })); return; }
    setInd({ y: on.offsetTop, h: on.offsetHeight });
  }, [route.page, items.length, open, desktop]);
  return (
    <nav id="dk-nav" className={"side" + (open ? " open" : "")} aria-label="Main"
         aria-hidden={desktop ? undefined : !open}>
      {/* The company's mark, not ours. Once a workspace has been set up it is
          somebody's company, and putting our seal at the top of every screen of
          it is a small constant claim that the software is the point. Ours goes
          on the front door; theirs goes here. It falls back to their initials,
          and to our seal only while the workspace has no identity yet. */}
      <div className="wordmark">
        <OrgMark org={api.state.org} s={26} withName />
        <button className="drawerx" aria-label="Close navigation" onClick={onClose}>
          <Icon n="close" s={17} />
        </button>
      </div>
      <div className="orgline">
        {api.state.org.profile?.legalName || api.state.org.note || "Sealed-bid tendering"}
      </div>
      <div className="navsec">Workspace</div>
      <div className="navlist" ref={navRef}>
        {/* One indicator that slides between items rather than a marker that
            blinks off one and on to the next. It is the left-edge rail in the
            paper themes and the tonal pill in Material, styled per theme so
            each look keeps its own idea of "current". */}
        <span className="navind" aria-hidden="true"
              style={{ transform: `translateY(${ind.y}px)`, height: ind.h, opacity: ind.h ? 1 : 0 }} />
        {items.map(([key, label]) => (
          <button key={key} className={"navi" + (isOn(key) ? " on" : "")} data-nav={key}
                  onClick={() => go({ page: key })}>
            <Icon n={NAV_ICON[key] || "tender"} s={16} />{label}
          </button>
        ))}
      </div>
      {can(user, "tender.create") && (
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
/* ---------------- item picker ---------------- */
.itempick{position:relative;flex:0 0 auto;display:inline-flex;align-items:center;gap:6px}
.itempick.on{padding:4px 6px 4px 8px;border:1px solid var(--line);border-radius:7px;
  background:var(--sunk);font-size:11.5px;max-width:210px}
.itempick.on>svg{color:var(--muted);flex:0 0 auto}
.itempick.on b{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ihist{color:var(--green);font-family:var(--font-mono);font-size:10.5px;flex:0 0 auto}
.ix{border:0;background:transparent;color:var(--faint);cursor:pointer;font-size:11px;
  padding:0 2px;line-height:1}
.ix:hover{color:var(--wax)}
.itemdrop{position:absolute;top:calc(100% + 5px);left:0;z-index:20;width:340px;
  background:var(--card);border:1px solid var(--line2);border-radius:10px;padding:8px;
  box-shadow:0 10px 28px rgba(0,0,0,.16)}
.itemdrop .in{width:100%;font-size:12.5px;padding:6px 9px}
.itemlist{max-height:230px;overflow-y:auto;margin-top:6px}
.itemrow{display:flex;align-items:baseline;gap:9px;width:100%;padding:6px 7px;border:0;
  background:transparent;font:inherit;text-align:left;cursor:pointer;border-radius:6px;color:var(--ink)}
.itemrow:hover{background:var(--sunk)}
.itemrow:focus-visible{outline:2px solid var(--brand);outline-offset:-2px}
.itemrow b{flex:0 0 auto;font-size:11px;color:var(--muted)}
.ilbl{flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ---------------- radar ---------------- */
/* The band strip: the shape of the next 90 days, before any single row. */
.radarbands{display:flex;gap:2px;padding:0 16px 2px;border-bottom:1px solid var(--hair)}
.rband{flex:1;display:flex;flex-direction:column;gap:1px;padding:8px 10px 10px;
  border-radius:8px 8px 0 0;border-bottom:2px solid transparent}
.rband.on{border-bottom-color:var(--line2);background:var(--sunk)}
.rbn{font-size:19px;font-weight:600;line-height:1.1;color:var(--faint);
  font-variant-numeric:tabular-nums}
.rband.on .rbn{color:var(--ink)}
.rbl{font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--faint)}

.radarrow{display:flex;align-items:center;gap:11px;padding:10px 4px;
  border-bottom:1px solid var(--hair);border-radius:6px}
.radarrow:last-of-type{border-bottom:0}
.radarrow.click{cursor:pointer}
.radarrow.click:hover{background:var(--sunk)}
.radarrow.click:focus-visible{outline:2px solid var(--brand);outline-offset:-2px}
.radarrow>svg{color:var(--faint);flex:0 0 auto}
/* Proximity, drawn. Square at the baseline, 4px at the data end — the same
   rule the charts follow, so a bar means the same thing everywhere. */
.rprox{flex:0 0 54px;height:6px;border-radius:4px;background:var(--sunk);overflow:hidden}
.rprox>span{display:block;height:100%;border-radius:0 4px 4px 0;
  transition:width .5s cubic-bezier(.22,.61,.36,1)}
.rmain{flex:1;min-width:0}
.rtitle{font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rsub{font-size:11.5px;color:var(--faint);margin-top:1px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rwhen{flex:0 0 auto;font-family:var(--font-mono);font-size:12px;color:var(--muted);
  font-variant-numeric:tabular-nums;min-width:52px;text-align:right}
.radarfoot{display:flex;align-items:center;gap:7px;margin-top:10px;padding-top:10px;
  border-top:1px solid var(--hair);font-size:12px;color:var(--wax)}

/* ---------------- waiting on others ---------------- */
.waitgrp{padding:10px 0;border-bottom:1px solid var(--hair)}
.waitgrp:last-child{border-bottom:0}
.waithead{display:flex;align-items:center;gap:10px;margin-bottom:6px}
.avstack{display:flex;flex:0 0 auto}
.avstack .av+.av{margin-left:-7px}
.av{width:26px;height:26px;border-radius:50%;background:var(--sunk);color:var(--muted);
  border:1px solid var(--line);display:flex;align-items:center;justify-content:center;
  font-size:10px;font-weight:600;letter-spacing:.02em;flex:0 0 auto;
  /* a surface ring so overlapping avatars stay separable */
  box-shadow:0 0 0 2px var(--card)}
.av.none{border-style:dashed;color:var(--faint)}
.waitwho{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.35}
.waitwho b{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.waitwho span{font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.waititem{display:flex;align-items:center;gap:9px;width:100%;padding:5px 6px 5px 30px;
  border:0;background:transparent;font:inherit;text-align:left;cursor:pointer;
  border-radius:6px;color:var(--ink)}
.waititem:hover{background:var(--sunk)}
.waititem:focus-visible{outline:2px solid var(--brand);outline-offset:-2px}
.widot{width:5px;height:5px;border-radius:50%;background:var(--line2);flex:0 0 auto}
.witext{flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wiwhy{flex:0 0 auto;font-size:11px;color:var(--faint)}

.dashpair{align-items:start}

/* ---------------- recent activity ---------------- */
/* One line per event: this is the only card on the dashboard that is not work,
   and it is sized to say so. */
.actrow{display:flex;align-items:baseline;gap:10px;padding:6px 2px;font-size:12.5px}
.actdot{width:5px;height:5px;border-radius:50%;background:var(--line2);flex:0 0 auto;
  align-self:center}
.actrow.sealed .actdot{background:var(--wax)}
.actwhen{flex:0 0 46px;font-family:var(--font-mono);font-size:11px;color:var(--faint);
  font-variant-numeric:tabular-nums}
.actwhat{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.actwho{color:var(--faint);font-size:11.5px}

@media(max-width:720px){
  .radarbands{padding:0 12px}
  .rband{padding:7px 6px 8px}
  .rbn{font-size:16px}
  .rbl{font-size:9.5px}
  .rprox{flex-basis:34px}
  .wiwhy{display:none}
}
@media(prefers-reduced-motion:reduce){
  .rprox>span{transition:none}
}

/* a register row opens its record */
.vrow{cursor:pointer}
.vrow:hover{background:var(--paper-2)}
/* The in-flight bar hangs off the bottom edge of the bar it belongs to, so it
   renders INSIDE .topbar (see Topbar below) and takes its containing block from
   it. Nothing is declared here on purpose: .topbar is sticky on a phone and
   relative at the desktop breakpoint, and both of those are positioned
   ancestors. Setting position:relative here would win on the cascade (MENU_CSS
   is concatenated after CSS) and quietly unstick
   the app bar on phones — which also unmoors the notification sheet, since that
   is placed a fixed distance below a bar it assumes is pinned. */
/* the navigation indicator: a bright rail down the left edge of the current
   item, in the accent rather than the seal red, because the rail it rides on
   is the house green and a red marker on it reads as an alert */
.navlist{position:relative}
.navind{width:2.5px;background:var(--side-on-line);border-radius:0 2px 2px 0}
.navi.on{border-left-color:transparent}

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

export function Topbar({ api, chrome, desktop, onMenu, navOpen, busy }) {
  const { state } = api;
  return (
    /* The in-flight bar is a child, not a sibling: it is positioned against
       this header's bottom edge, and .main is not a positioned ancestor. */
    <header className="topbar">
      {!desktop && (
        <button className="iconbtn" onClick={onMenu} aria-label="Open navigation"
                aria-controls="dk-nav" aria-expanded={!!navOpen}>
          <Icon n="menu" s={20} />
        </button>
      )}
      {!desktop && <OrgMark org={state.org} s={22} />}
      <span className="crumb">{state.org.short.toUpperCase()} / PROCUREMENT</span>
      <div className="grow" />
      {/* The bar carries two things: what needs your attention, and who you are.
          Everything else is behind the avatar. */}
      <Bell api={api} />
      {desktop && <AccountMenu api={api} {...chrome} />}
      <TopProgress busy={busy} />
    </header>
  );
}

/* ---------------- buyer: dashboard ---------------- */

/** How long something has been sitting, said the way a person would say it. */
function waitedFor(since) {
  if (!since) return "";
  const mins = Math.max(0, Math.round((Date.now() - since) / 60000));
  if (mins < 60) return mins <= 1 ? "just now" : `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

/* Anything older than this has been waiting long enough to be called out. */
const LATE_MS = 2 * DAY;

/** Everything in the workspace that is mid-flight, as one list.

    The old dashboard had a single "Action queue" holding both the tenders whose
    seals you can break and the ones sitting with the approver — so it showed
    you work that was not yours and offered buttons for decisions you were not
    allowed to make. Each item now names the capability needed to act on it, and
    the dashboard splits the list on exactly that: what is yours to move, and
    what you are waiting on somebody else for. Ordering is by how long the thing
    has been waiting, because that is what makes something urgent — not what
    kind of thing it is. */
function workItems(state, tenders) {
  const items = [];
  const lastMoved = (tid) => {
    const e = state.events.find((x) => x.tenderId === tid);
    return e ? e.at : 0;
  };

  for (const t of tenders) {
    if (effStatus(t) === "closed") {
      /* An auction has no seals to break: what is outstanding is recording the
         standings, and that happens in the auction room. */
      const auc = t.type === "AUC";
      items.push({ key: "seal-" + t.id, cap: "bid.open", since: t.deadline,
                   title: t.title,
                   why: auc ? "The room has closed. The standings are not recorded yet."
                            : "Deadline passed. The seals are unbroken.",
                   verb: auc ? "Record the results" : "Open the bids",
                   to: auc ? { page: "auction", id: t.id } : { page: "tender", id: t.id, tab: "bids" },
                   tone: "wax", waiting: auc ? "results to be recorded" : "an opening" });
    }
    /* Where a chain is running, the work queue names the rung it is on rather
       than saying "waiting for approval" for a fortnight. Which signature it is
       stuck at is the whole of what somebody chasing it needs. */
    const atStep = (chain) => {
      if (!chain || !chain.currentId) return "";
      const cur = chain.steps.find((x) => x.id === chain.currentId);
      if (!cur) return "";
      return ` Signature ${chain.signed + 1} of ${chain.total}, with ${cur.personaName || "the " + cur.level}.`;
    };
    if (t.status === "approval") {
      items.push({ key: "appr-" + t.id, cap: "tender.publish_decision", since: lastMoved(t.id),
                   title: t.title,
                   why: "Waiting to be approved for publication." + atStep(t.publishChain),
                   verb: "Review it", to: { page: "approvals" }, waiting: "approval to publish" });
    }
    if (t.status === "evaluation" && t.awardRec) {
      items.push({ key: "rec-" + t.id, cap: "award.decide", since: t.awardRec.at,
                   title: t.title,
                   why: "An award has been recommended and needs a decision." + atStep(t.awardChain),
                   verb: "Decide", to: { page: "tender", id: t.id, tab: "bids" },
                   waiting: "an award decision" });
    }
  }
  for (const c of state.clarifications) {
    if (c.a) continue;
    const t = tenders.find((x) => x.id === c.tenderId);
    if (!t) continue;
    items.push({ key: "clar-" + c.id, cap: "clarification.answer", since: c.askedAt,
                 title: "Question from a bidder", why: t.title,
                 verb: "Answer it", to: { page: "tender", id: t.id, tab: "clar" },
                 waiting: "an answer" });
  }
  for (const s of state.suppliers) {
    // A suspended vendor is not waiting on a prequalification decision — that
    // decision has been taken, and putting them back in the queue would ask
    // somebody to take it again every week until the suspension lifts.
    if (s.prequalified || s.suspended || !s.registeredAt) continue;
    items.push({ key: "vend-" + s.id, cap: "supplier.prequalify", since: s.registeredAt,
                 title: s.name, why: "Registered and waiting to be prequalified.",
                 verb: "Review", to: { page: "suppliers" }, waiting: "prequalification" });
  }
  return items.sort((a, b) => (a.since || Infinity) - (b.since || Infinity));
}

function WorkRow({ it, mine, go }) {
  const late = it.since && Date.now() - it.since > LATE_MS;
  return (
    <div className={"wq " + (mine ? "mine" : "theirs") + (late ? " late" : "")}>
      <span className="wqmark" />
      <div className="wqmain">
        <div className="wqtitle">{it.title}</div>
        <div className="wqwhy">{mine ? it.why : `With someone else for ${it.waiting}.`}</div>
      </div>
      <span className="wqage" title={it.since ? new Date(it.since).toLocaleString("en-GB") : ""}>
        {waitedFor(it.since)}
      </span>
      {mine && (
        <button className={"btn sm" + (it.tone === "wax" ? " wax" : "")} onClick={() => go(it.to)}>
          {it.verb}
        </button>
      )}
    </div>
  );
}

export function Dashboard({ api }) {
  const { state, go, user } = api;
  const tenders = state.tenders;
  const open = tenders.filter((t) => effStatus(t) === "published");
  const sealed = tenders.filter((t) => effStatus(t) === "closed");
  const evaluating = tenders.filter((t) => t.status === "evaluation");

  /* "This year" has to mean this year. The old figure summed every award ever
     made and called it the year's savings, which flattered the number the
     longer the workspace ran. */
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  const awardedThisYear = tenders.filter(
    (t) => t.status === "awarded" && t.awardedAmount != null && (t.awardedAt || 0) >= yearStart);
  /* Split by what each saving was measured against. The headline is the
     verified figure — awards compared to a recorded prior price — because that
     is the one that survives being asked "compared to what?". The budget-only
     number is real too, but it measures the estimate as much as the buying, so
     it rides underneath rather than being added in. */
  const sav = savingsSplit(awardedThisYear);

  const items = workItems(state, tenders);
  const mine = items.filter((it) => can(user, it.cap));
  const theirs = items.filter((it) => !can(user, it.cap));

  const register = state.suppliers.length;
  const held = state.suppliers.filter((s) => !s.prequalified).length;

  const expiring = [];
  state.suppliers.forEach((s) => s.docs.forEach((d) => { const dl = daysLeft(d.expiry); if (dl <= 60) expiring.push({ s, d, dl }); }));
  expiring.sort((a, b) => a.dl - b.dl);

  /* The guide IS the work queue. What needs you, as a list you can act on, and
     under it the four figures that used to be a row of tiles across the page.
     Everything else the dashboard used to show at once is below, and most of
     it behind a disclosure. */
  const guide = (
    <Guide art={mine.length ? "desk" : "clear"}
           tone={mine.length ? undefined : "good"}
           headline={mine.length
             ? `${mine.length} ${mine.length === 1 ? "thing needs" : "things need"} you`
             : "Nothing needs you"}
           why={mine.length
             ? "Oldest first. Pick one to go straight to it."
             : theirs.length
               ? `${theirs.length} ${theirs.length === 1 ? "item is" : "items are"} with other people.`
               : "The workspace is clear."}
           items={mine.map((it) => ({ key: it.key, label: it.title, note: it.why, onPick: () => go(it.to) }))}>
      <Figures>
        <Quiet n={<CountUp n={open.length} />} label="open for bids"
               onClick={() => go({ page: "tenders", filter: "live" })} />
        <Quiet n={<CountUp n={sealed.length} />} label="sealed, awaiting opening"
               tone={sealed.length ? "var(--wax)" : undefined}
               onClick={() => go({ page: "tenders", filter: "live" })} />
        <Quiet n={<CountUp n={evaluating.length} />} label="in evaluation"
               onClick={() => go({ page: "tenders", filter: "evaluation" })} />
        <Quiet n={<CountUp n={sav.hardTotal} format={fmtCompact} />} label="verified savings this year"
               tone={sav.hardTotal > 0 ? "var(--green)" : undefined}
               onClick={() => go({ page: "analytics" })} />
      </Figures>
    </Guide>
  );

  return (
    <Page guide={guide}>
      <div className="pagehead">
        <h1>Dashboard</h1>
        <span className="sub">What you are carrying, and what is coming up.</span>
      </div>

      {/* Everything you are carrying. "Needs you" is about this minute and
          lives in the guide; this is about the week. */}
      <MyDesk api={api} />

      <More title="Coming up" summary={`deadlines and document expiries in the next ${RADAR_HORIZON} days`}>
        <Radar api={api} open={open} expiring={expiring} register={register} held={held} />
      </More>

      <More title="Waiting on other people, and recent activity"
            summary={theirs.length ? `${theirs.length} ${theirs.length === 1 ? "item" : "items"} with someone else` : "nothing is held up elsewhere"}>

      {/* `dashpair` stops these two stretching to the taller one. The dead space
          under a short "Waiting on others" was half of what made the old
          four-card block look padded, and matching heights buys nothing when the
          two cards hold unrelated things of naturally different length. */}
      <div className="grid g2 dashpair">
        <WaitingOnOthers api={api} items={theirs} />
        <RecentActivity api={api} tenders={tenders} />
      </div>
      </More>
    </Page>
  );
}

/* ---------------- the radar ----------------

   One card, because it answers one question: what has a clock running on it.
   A tender closing and a vendor's licence expiring are the same shape of
   problem — a date approaching that costs something if it passes — and the old
   dashboard split them into two identical lists purely because they come from
   different tables. Merging them is also the only way to see the collision that
   matters: a document lapsing in the same week a tender it qualifies for closes.

   Proximity is drawn, not written. The old version put "5 days left" and "24
   days to expiry" in chips, which meant reading every row to find the urgent
   one; here the bar length and its colour carry that, and the number stays for
   the exact answer. */

const RADAR_HORIZON = 90;   // days; anything further out is counted, not listed

const RADAR_BANDS = [
  { key: "overdue", label: "Overdue", max: 0, tone: "var(--wax)" },
  { key: "week", label: "7 days", max: 7, tone: "var(--wax)" },
  { key: "month", label: "30 days", max: 30, tone: "var(--s4)" },
  { key: "quarter", label: "90 days", max: RADAR_HORIZON, tone: "var(--s1)" },
];

const bandFor = (days) => RADAR_BANDS.find((b) => days <= b.max) || RADAR_BANDS[RADAR_BANDS.length - 1];

/* How full the proximity bar is, 0–100. Logarithmic, not linear.

   Linear over ninety days is useless at the end that matters: five days out and
   nine days out both come back about ninety per cent, so the bar says "soon" for
   everything inside a month and stops distinguishing the thing you have to do
   tomorrow from the thing you have to do in a fortnight. Time pressure is felt
   logarithmically — one day versus three is a crisis, sixty versus sixty-two is
   nothing — so the scale matches. Five days now reads 60%, nine reads 49%. */
function proximity(days) {
  if (days <= 0) return 100;                       // overdue: full, not inverted
  const t = Math.log1p(days) / Math.log1p(RADAR_HORIZON);
  return Math.max(4, Math.min(100, (1 - t) * 100));
}

function Radar({ api, open, expiring, register, held }) {
  const { state, go, user } = api;

  /* Both kinds normalised to the same row shape, then sorted by date. `kind`
     survives so the two are still tellable apart — merging the cards must not
     merge the meanings. */
  const rows = [];
  for (const t of open) {
    rows.push({
      key: "t-" + t.id, kind: "tender", at: t.deadline, days: daysLeft(t.deadline),
      title: t.title,
      sub: `${state.bids.filter((b) => b.tenderId === t.id).length} sealed of ${t.invited.length} invited`,
      what: "closes", icon: "tender",
      onPick: () => go({ page: "tender", id: t.id }),
    });
  }
  for (const x of expiring) {
    rows.push({
      key: "d-" + x.s.id + x.d.name, kind: "doc", at: x.d.expiry, days: x.dl,
      title: x.s.name, sub: x.d.name, what: "expires", icon: "shield",
      onPick: can(user, "page.suppliers") ? () => go({ page: "suppliers" }) : undefined,
    });
  }
  rows.sort((a, b) => (a.at || Infinity) - (b.at || Infinity));

  const near = rows.filter((r) => r.days <= RADAR_HORIZON);
  const far = rows.length - near.length;
  const counts = RADAR_BANDS.map((b, i) => ({
    ...b,
    n: near.filter((r) => bandFor(r.days).key === b.key).length,
  }));
  const soon = near.filter((r) => r.days <= 7).length;

  return (
    <div className="card radar" data-reveal style={{ marginBottom: 16 }}>
      <div className="chead">
        <h3>Radar</h3>
        <span className="mono faint">deadlines and expiries, next {RADAR_HORIZON} days</span>
        <span className="mono faint" style={{ marginLeft: "auto" }}>
          {can(user, "page.suppliers") && register
            ? `${register.toLocaleString()} vendors · ${held.toLocaleString()} held out`
            : `${near.length} tracked`}
        </span>
      </div>

      {/* The bands, as a strip. Counts first so the shape of the next three
          months reads before any individual row does. */}
      <div className="radarbands">
        {counts.map((b) => (
          <div key={b.key} className={"rband" + (b.n ? " on" : "")}>
            <span className="rbn" style={b.n ? { color: b.tone } : null}>{b.n}</span>
            <span className="rbl">{b.label}</span>
          </div>
        ))}
      </div>

      <div className="cbody" style={{ paddingTop: 4 }}>
        {near.map((r) => {
          const band = bandFor(r.days);
          const fill = proximity(r.days);
          return (
            <div className={"radarrow" + (r.onPick ? " click" : "")} key={r.key}
                 onClick={r.onPick}
                 tabIndex={r.onPick ? 0 : undefined}
                 onKeyDown={r.onPick ? (e) => e.key === "Enter" && r.onPick() : undefined}>
              <span className="rprox" aria-hidden="true">
                <span style={{ width: fill + "%", background: band.tone }} />
              </span>
              <Icon n={r.icon} s={14} />
              <div className="rmain">
                <div className="rtitle">{r.title}</div>
                <div className="rsub">{r.what} · {r.sub}</div>
              </div>
              <span className="rwhen" style={{ color: r.days <= 7 ? band.tone : undefined }}>
                {r.days < 0 ? `${Math.abs(r.days)}d ago` : r.days === 0 ? "today" : `${r.days}d`}
              </span>
            </div>
          );
        })}
        {!near.length && (
          <Empty icon="shield">
            Nothing closes or expires in the next {RADAR_HORIZON} days.
            {far ? ` ${far} item${far === 1 ? " sits" : "s sit"} beyond that.` : ""}
          </Empty>
        )}
        {near.length > 0 && far > 0 && (
          <div className="muted" style={{ fontSize: 12, paddingTop: 10 }}>
            and {far} more beyond {RADAR_HORIZON} days.
          </div>
        )}
        {soon > 0 && (
          <div className="radarfoot">
            <Icon n="alert" s={13} />
            {soon} {soon === 1 ? "item needs" : "items need"} attention inside a week.
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- waiting on others ----------------

   Grouped by whoever can actually clear it, because the action this card leads
   to is a conversation with a person, not a list of tickets. An item nobody
   holds is its own group and is the more serious finding: work that is waiting
   on a capability this workspace has not given anybody.

   Grouped by the *set* of holders rather than per person, so an approval two
   people could sign is one row, not two. Counting it twice would overstate the
   queue and make both of them assume the other had it. */
function holderSets(items, state) {
  const byId = new Map((state.users || []).map((u) => [u.id, u]));
  const caps = state.capHolders || {};
  const groups = new Map();

  for (const it of items) {
    const ids = (caps[it.cap] || []).slice().sort();
    const key = ids.join(",") || "__none";
    if (!groups.has(key)) {
      groups.set(key, { key, ids, people: ids.map((id) => byId.get(id)).filter(Boolean), items: [] });
    }
    groups.get(key).items.push(it);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, oldest: Math.min(...g.items.map((i) => i.since || Infinity)) }))
    .sort((a, b) => a.oldest - b.oldest);
}

function initials(name) {
  return (name || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function WaitingOnOthers({ api, items }) {
  const { state, go } = api;
  const groups = holderSets(items, state);

  return (
    <div className="card" data-reveal>
      <div className="chead">
        <h3>Waiting on others</h3>
        {items.length > 0 && (
          <span className="mono faint" style={{ marginLeft: "auto" }}>
            {items.length} across {groups.length} {groups.length === 1 ? "desk" : "desks"}
          </span>
        )}
      </div>
      <div className="cbody" style={{ paddingTop: 4 }}>
        {groups.map((g) => (
          <div className="waitgrp" key={g.key}>
            <div className="waithead">
              {g.people.length ? (
                <span className="avstack">
                  {g.people.slice(0, 3).map((p) => (
                    <span className="av" key={p.id} title={`${p.name} — ${p.title}`}>{initials(p.name)}</span>
                  ))}
                </span>
              ) : <span className="av none" title="nobody holds this capability">—</span>}
              <div className="waitwho">
                <b>{g.people.length
                  ? g.people.length === 1
                    ? g.people[0].name
                    : g.people.length === 2
                      ? `${g.people[0].name} or ${g.people[1].name}`
                      : `Any of ${g.people.length}`
                  : "Nobody can clear this"}</b>
                <span className="muted">
                  {g.people.length === 1 ? g.people[0].title
                    : g.people.length ? g.people.map((p) => p.name.split(" ")[0]).join(", ")
                    : "no account holds the capability it needs"}
                </span>
              </div>
              <span className="wqage" title="oldest item in this group">
                {waitedFor(g.oldest === Infinity ? 0 : g.oldest)}
              </span>
            </div>
            {g.items.slice(0, 4).map((it) => (
              <button className="waititem" key={it.key} onClick={() => go(it.to)}>
                <span className="widot" aria-hidden="true" />
                <span className="witext">{it.title}</span>
                <span className="wiwhy">{it.waiting}</span>
              </button>
            ))}
            {g.items.length > 4 && (
              <div className="muted" style={{ fontSize: 12, padding: "2px 0 0 30px" }}>
                and {g.items.length - 4} more.
              </div>
            )}
          </div>
        ))}
        {!items.length && <Empty icon="seal">Nothing is sitting with anyone else.</Empty>}
      </div>
    </div>
  );
}

/* ---------------- recent activity ----------------

   Ambient, and styled to say so. It is the only card here that is not work, so
   it gets one line per event instead of three and stays out of the way of the
   things that are. */
function RecentActivity({ api, tenders }) {
  const { state, go, user } = api;
  const events = state.events.slice(0, 8);

  return (
    <div className="card" data-reveal>
      <div className="chead">
        <h3>Recent activity</h3>
        {can(user, "page.audit") && (
          <button className="doclink" style={{ marginLeft: "auto", fontSize: 12 }}
                  onClick={() => go({ page: "audit" })}>The full trail</button>
        )}
      </div>
      <div className="cbody" style={{ paddingTop: 4 }}>
        {events.map((e) => {
          const linked = e.tenderId && tenders.some((t) => t.id === e.tenderId);
          return (
            <div className={"actrow" + (/seal/i.test(e.action) ? " sealed" : "")} key={e.id}>
              <span className="actdot" aria-hidden="true" />
              <span className="actwhen" title={fmtDateTime(e.at)}>{fmtTimeShort(e.at)}</span>
              <span className="actwhat">
                {linked
                  ? <button className="doclink" onClick={() => go({ page: "tender", id: e.tenderId })}>{e.action}</button>
                  : e.action}
                <span className="actwho"> · {e.actor}</span>
              </span>
            </div>
          );
        })}
        {!events.length && <Empty>Nothing has happened yet. The first thing anyone does in this workspace shows up here.</Empty>}
      </div>
    </div>
  );
}

/* "11:57" for today, "7 Aug" beyond it — a feed of mostly-today events does not
   need the date on every line, and the full stamp is on the title attribute. */
function fmtTimeShort(at) {
  const d = new Date(at);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/* ---------------- buyer: tender list ---------------- */

export function TendersPage({ api }) {
  const { state, go, user, act, route } = api;
  const [q, setQ] = useState("");
  /* The dashboard's figures are click-throughs, and each arrives carrying the
     filter it counted — landing on an unfiltered list would make the reader
     find the same rows again by hand. */
  const [statusF, setStatusF] = useState((route && route.filter) || "all");
  const routeFilter = route && route.filter;
  useEffect(() => { if (routeFilter) setStatusF(routeFilter); }, [routeFilter]);
  const match = (t) => {
    const st = effStatus(t);
    if (statusF === "live" && !["published", "closed"].includes(st)) return false;
    if (statusF === "evaluation" && st !== "evaluation") return false;
    if (statusF === "awarded" && st !== "awarded") return false;
    if (statusF === "paused" && st !== "paused") return false;
    if (statusF === "cancelled" && st !== "cancelled") return false;
    /* "Hide awarded" has always meant "the work that is still mine". A
       cancelled event is finished too, so it belongs on the other side of that
       line — leaving it in would grow the list of things that look outstanding
       every time somebody closes one down. */
    if (statusF === "active" && ["awarded", "cancelled"].includes(st)) return false;
    if (!q.trim()) return true;
    const n = q.trim().toLowerCase();
    return [t.ref, t.title, t.category].some((x) => (x || "").toLowerCase().includes(n));
  };
  const rows = [...state.tenders].filter(match).sort((a, b) => (b.publishedAt || b.deadline) - (a.publishedAt || a.deadline));
  /* One row per tender, one line of meta, the status on the right, and the
     documents problem only when it IS a problem. The eight-column table put
     the reference, the category, the budget, the deadline, the document count,
     the bid count and the status at the same weight as the title, on every
     row, for a list you scan by title. */
  const live = rows.filter((t) => ["published", "closing"].includes(displayStatus(t))).length;
  const sealedN = rows.filter((t) => displayStatus(t) === "closed").length;
  const guide = (
    <Guide art="draft"
           headline={rows.length
             ? `${rows.length} ${rows.length === 1 ? "tender" : "tenders"}${statusF !== "all" || q.trim() ? " match" : ""}`
             : "No tenders here yet"}
           why={rows.length
             ? `${live} open for bids · ${sealedN} sealed and waiting to be opened`
             : "Anything you draft stays private until you send it on."}
           action={can(user, "tender.create") && (
             <button className="btn pri" onClick={() => go({ page: "new" })}>New tender</button>
           )}>
      <input className="in" placeholder="Search by title, reference or category"
             aria-label="Search tenders" value={q} onChange={(e) => setQ(e.target.value)} />
      <select className="in" aria-label="Filter by status"
              value={statusF} onChange={(e) => setStatusF(e.target.value)}>
        <option value="all">Everything</option>
        <option value="active">Hide awarded</option>
        <option value="live">Open for bids</option>
        <option value="evaluation">Being evaluated</option>
        <option value="awarded">Awarded</option>
        <option value="paused">Paused</option>
        <option value="cancelled">Cancelled</option>
      </select>
    </Guide>
  );
  return (
    <Page guide={guide}>
      <div className="pagehead">
        <h1>Tenders</h1>
        <span className="sub">Every competition this workspace is running or has run.</span>
      </div>
      <div className="card">
        <Rows empty={<Empty art="search">Nothing matches that. Clear the search or the filter to see everything.</Empty>}>
          {rows.map((t) => {
            const st = displayStatus(t);
            const nBids = state.bids.filter((b) => b.tenderId === t.id).length;
            const nDocs = (state.documents || []).filter((d) => d.kind === "tender" && d.tenderId === t.id).length;
            const inFlight = ["published", "closed", "closing", "paused"].includes(st);
            const bidsWord = inFlight ? `${nBids} sealed` : nBids ? `${nBids} bids` : null;
            return (
              <Row key={t.id} onOpen={() => go({ page: "tender", id: t.id })}
                   title={t.title}
                   meta={<>
                     <span className="mono">{t.ref}</span>
                     <span>{t.category}</span>
                     <span><Money n={t.budget} /></span>
                     {!["approval", "draft"].includes(t.status) && <span><Countdown t={t.deadline} /></span>}
                     {bidsWord && <span>{bidsWord}{(t.rounds || []).length > 1 ? ` · round ${t.currentRound}` : ""}</span>}
                   </>}
                   right={<>
                     {t.awardRec && t.status === "evaluation" && <span className="chip gold">With approver</span>}
                     {/* a published pack with nothing attached is the single
                         most common thing to discover too late, so it is the
                         one column that survives as a chip, and only when wrong */}
                     {inFlight && !nDocs && <span className="chip warn">{t.type} not attached</span>}
                     <Stamp s={st} />
                     {can(user, "tender.edit") && (
                       <button className="btn sm" title="Create a draft copy: dates cleared, structure carried over"
                               onClick={async () => { if (await act.duplicate(t.id)) go({ page: "tenders" }); }}>Duplicate</button>
                     )}
                   </>} />
            );
          })}
        </Rows>
      </div>
    </Page>
  );
}

/* ---------------- buyer: tender detail ---------------- */

export function TenderDetail({ api, id, initialTab }) {
  const { state, user, go } = api;
  /* Which tabs exist follows what this person can actually do here: whoever
     answers clarifications gets the clarifications tab, whoever scores or reads
     the panel gets evaluation, and everyone gets the overview. */
  const labels = { overview: "Overview", vendors: "Vendors", rounds: "Rounds", clar: "Clarifications",
                   bids: "Bids", eval: "Evaluation", audit: "Audit" };
  const t = state.tenders.find((x) => x.id === id);
  let tabs = ["overview"];
  /* The vendor and round tabs follow the capabilities that act on them rather
     than a role: whoever can manage an event's invitation list is the person
     the vendor table is for, and an auditor who can read the register gets the
     read-only version of the same table. */
  /* Seeing who was invited and whether they answered is oversight, so it
     follows being able to see the event at all rather than being able to change
     its invitation list — the endpoint draws the same line. The controls inside
     the tab are what ask for `tender.vendors`. */
  if (can(user, "page.tenders") || can(user, "page.evals") || can(user, "page.approvals")
      || can(user, "tender.vendors")) tabs.push("vendors");
  if (can(user, "page.tenders") || can(user, "tender.rounds") || can(user, "bid.open")) tabs.push("rounds");
  if (can(user, "clarification.answer")) tabs.push("clar");
  if (can(user, "bid.open") || can(user, "award.recommend")) tabs.push("bids");
  if (can(user, "bid.score") || can(user, "bid.see_all_scores")) tabs.push("eval");
  if (can(user, "page.audit")) tabs.push("audit");
  if (t && t.type === "AUC") {
    // Price-only: nothing to score, and a live auction is one continuous
    // competition rather than a sequence of rounds.
    tabs = tabs.filter((x) => x !== "eval" && x !== "rounds");
  }
  const [tab, setTab] = useState(initialTab && tabs.includes(initialTab) ? initialTab : tabs[0]);
  if (!t) return <Empty>Tender not found.</Empty>;
  const oversight = can(user, "bid.see_all_scores");
  const st = displayStatus(t);
  const unansweredN = state.clarifications.filter((c) => c.tenderId === id && !c.a).length;

  return (
    <div>
      <button className="btn sm" style={{ marginBottom: 14 }} onClick={() => go({ page: can(user, "page.tenders") ? "tenders" : homePage(user) })}>← Back</button>
      <div className="pagehead" style={{ marginBottom: 12 }}>
        <div>
          <div className="mono muted" style={{ marginBottom: 3 }}>{t.ref} · {t.type} · {t.category}</div>
          <h1>{t.title}</h1>
        </div>
        <div className="grow" />
        {/* An auction in progress is somewhere to be, not something to read
            about: from the file, the room is one button away. */}
        {t.type === "AUC" && !t.openedAt && (
          <button className="btn pri" onClick={() => go({ page: "auction", id: t.id })}>
            <Icon n="analytics" s={15} />Auction room
          </button>
        )}
        <Stamp s={st} />
      </div>
      <StageTracker t={t} />
      <LifecycleBar api={api} t={t} />
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
      {tab === "vendors" && <VendorsTab api={api} t={t} />}
      {tab === "rounds" && <RoundsTab api={api} t={t} />}
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
  const canEdit = can(user, "tender.edit");
  const canDocs = can(user, "tender.docs");
  const canAddendum = can(user, "tender.addendum");

  const submitForApproval = () => act.submitTender(t.id);
  const issueAddendum = async () => {
    if (!ad.title.trim()) return;
    const ok = await act.addAddendum(t.id, { title: ad.title.trim(), note: ad.note.trim() });
    if (ok) setAd({ title: "", note: "" });
  };

  return (
    <div className="grid g2">
      {t.status === "draft" && canEdit && (
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
          {canDocs && t.status !== "awarded" && (
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
              {canDocs && t.status !== "awarded" && <button className="btn sm" aria-label="Remove document" onClick={() => act.deleteDoc(x.id)}>✕</button>}
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
          {t.projectedCost != null && (
            <div className="rowline"><span className="muted" style={{ flex: 1 }}>Projected cost</span><Money n={t.projectedCost} /></div>
          )}
          {t.baseline != null && (
            <div className="rowline"><span className="muted" style={{ flex: 1 }}>Baseline{t.baselineSource ? ` · ${t.baselineSource}` : ""}</span><Money n={t.baseline} /></div>
          )}
          <div className="rowline"><span className="muted" style={{ flex: 1 }}>Submission deadline</span><span className="mono">{fmtDate(t.deadline)}</span></div>
          {t.publishedAt && <div className="rowline"><span className="muted" style={{ flex: 1 }}>Published</span><span className="mono">{fmtDate(t.publishedAt)}</span></div>}
          <div className="rowline"><span className="muted" style={{ flex: 1 }}>Evaluation split</span><span className="mono">{t.techWeight}% technical / {t.commWeight}% commercial</span></div>
          {(t.rounds || []).length > 1 && (
            <div className="rowline"><span className="muted" style={{ flex: 1 }}>Rounds</span>
              <span className="mono">{t.rounds.length} · currently round {t.currentRound}</span></div>
          )}
          {(t.deadlineChanges || []).length > 0 && (
            <div className="rowline"><span className="muted" style={{ flex: 1 }}>Deadline extended</span>
              <span className="mono">{t.deadlineChanges.length}×, last from {fmtDate(t.deadlineChanges[t.deadlineChanges.length - 1].from)}</span></div>
          )}
          {t.status === "awarded" && (
            <div className="rowline"><span className="muted" style={{ flex: 1 }}>Awarded to</span><b>{state.suppliers.find((s) => s.id === t.awardedTo)?.name}</b></div>
          )}
        </div>
      </div>
      <ProjectCard api={api} t={t} />
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
          {!(t.addenda || []).length && <div className="muted" style={{ fontSize: 13, marginBottom: (canAddendum && st === "published") ? 12 : 0 }}>No addenda issued.</div>}
          {canAddendum && st === "published" && (
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

/* Where this event sits in the wider piece of work.

   A project is a spend dimension rather than a table of its own, and that is
   deliberate: the value recorded is what the project was called when the event
   was raised, and reorganising the list next year must not silently re-badge
   last year's spend. What was missing was the other direction — a project that
   is being bought in four events wants to be readable as four events, and
   until now each one only knew its own name for the thing.

   Single-event procurement renders as a single event, which is the honest
   answer rather than a section saying "1 of 1". */
function ProjectCard({ api, t }) {
  const { state, go } = api;
  const project = (t.dimensions || {}).project;
  if (!project) return null;
  const siblings = state.tenders.filter((x) => (x.dimensions || {}).project === project && x.id !== t.id);
  const dims = Object.entries(t.dimensions || {}).filter(([k, v]) => v && k !== "project");
  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <div className="chead"><h3>Project</h3>
        <span className="mono faint" style={{ marginLeft: "auto" }}>
          {siblings.length ? `${siblings.length + 1} events under this project` : "single-event procurement"}
        </span>
      </div>
      <div className="cbody" style={{ paddingTop: 6 }}>
        <div className="rowline"><span className="muted" style={{ flex: 1 }}>Project</span><b>{project}</b></div>
        {dims.map(([k, v]) => (
          <div className="rowline" key={k}>
            <span className="muted" style={{ flex: 1, textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</span>
            <span className="mono">{v}</span>
          </div>
        ))}
        {siblings.length > 0 && (
          <div style={{ marginTop: 10, borderTop: "1px solid var(--hair)", paddingTop: 10 }}>
            {siblings.map((x) => (
              <div className="rowline" key={x.id}>
                <button className="doclink" style={{ flex: 1, textAlign: "left" }}
                        onClick={() => go({ page: "tender", id: x.id })}>
                  <span className="mono muted">{x.ref}</span> {x.title}
                </button>
                <Money n={x.awardedAmount ?? x.budget} />
                <Stamp s={displayStatus(x)} />
              </div>
            ))}
          </div>
        )}
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
              ) : can(user, "clarification.answer") ? (
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
        {!items.length && <Empty>No questions yet. Anything a vendor asks appears here, and your answer goes to every invited vendor at once.</Empty>}
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

  /* The auction has its own page. A live board inside a tab was a room behind a
     door: you had to know it was there, and the tab strip above it kept
     offering somewhere else to be. */
  if (t.type === "AUC" && !t.openedAt) {
    return (
      <div className="ceremony">
        <Illus n="chart" w={180} />
        <h3>This tender runs as a reverse auction</h3>
        <p className="muted" style={{ maxWidth: 480, margin: "0 auto 16px", fontSize: 13 }}>
          There are no sealed envelopes to break. Prices move live in the auction room, and the standings
          become formal bids once the room closes and the results are recorded.
        </p>
        <button className="btn pri" onClick={() => api.go({ page: "auction", id: t.id })}>Open the auction room</button>
      </div>
    );
  }

  /* Once an event has run more than one round, the flat list of bids stops
     being the useful shape: what a manager needs is which round each
     submission belongs to and whether the later round moved anybody. */
  if ((t.rounds || []).length > 1) {
    return (
      <div>
        <BidBucket api={api} t={t} />
        {st === "closed" && can(user, "bid.open") && (
          <div className="notice" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ flex: 1 }}>The current round is sealed. Break the seals in a recorded opening to score it.</span>
            <HoldButton label="Hold to open the bids" tone="wax" onDone={openBids} />
          </div>
        )}
      </div>
    );
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
        {can(user, "bid.open") && (
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
          {!bids.length && <Empty art="sealed">No bids yet. They arrive sealed, so you will see the count grow here, never a price.</Empty>}
        </div>
        {st === "closed" && can(user, "bid.open") && bids.length > 0 && (
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
        <div className="chead"><h3>What each vendor bid</h3><span className="mono faint" style={{ marginLeft: "auto" }}>seals broken {fmtDateTime(t.openedAt)}</span>
          {can(user, "export.comparison") &&
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
          <div className="chead"><h3>Line by line</h3><span className="mono faint" style={{ marginLeft: "auto" }}>unit rates · lowest per line in green</span></div>
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
  if (can(user, "bid.score") && !can(user, "bid.see_all_scores")) {
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
                  <label className="lbl" htmlFor={"note-" + b.id}>Your reasoning</label>
                  <div className="hint" style={{ marginTop: 0, marginBottom: 6 }}>The panel chair and auditors can read this. Say what you saw, not just the number.</div>
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
          {can(user, "award.recommend") && <button className="btn sm" onClick={withdrawRec}>Withdraw recommendation</button>}
        </div>
      )}
      <EvalMoney t={t} bids={bids} />
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="chead"><h3>Where the panel agrees, and where it does not</h3><span className="mono faint" style={{ marginLeft: "auto" }}>{t.techWeight}% technical · {t.commWeight}% commercial</span></div>
        <div className="tscroll">
          <table className="tbl wide">
            <thead><tr><th>Supplier</th><th className="num">Amount</th><th className="num">Saving</th><th className="num">Technical</th><th className="num">Commercial</th><th className="num">Total</th><th>Flags</th><th></th></tr></thead>
            <tbody>
              {bids
                .map((b) => ({ b, total: totalScore(t, b, bids) }))
                .sort((x, y) => (y.total ?? -1) - (x.total ?? -1))
                .map(({ b, total }, idx) => {
                  const s = state.suppliers.find((x) => x.id === b.supplierId);
                  const ts = techScore(t, b);
                  const flags = varianceFlags(t, b);
                  const low = abnormallyLow(b, bids);
                  const sv = savingsAgainst(t, b.amount);
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
                        <td className="num mono" data-l="Saving">
                          {sv == null ? <span className="faint">-</span> : (
                            <span style={{ color: sv.savings > 0 ? "var(--green)" : sv.savings < 0 ? "var(--wax)" : undefined }}>
                              {sv.savings >= 0 ? "" : "−"}{fmtCompact(Math.abs(sv.savings))}
                              <span className="faint"> ({sv.pct >= 0 ? "" : "−"}{Math.abs(sv.pct).toFixed(1)}%)</span>
                            </span>
                          )}
                        </td>
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
                          {can(user, "award.recommend") && t.status !== "awarded" && !rec && <button className="btn sm" style={{ marginLeft: 6 }} onClick={() => setRecBid(b)}>Recommend award…</button>}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="breakrow">
                          <td colSpan={8}>
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
      {can(user, "ai.use") && (
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

/* Budget, projection, baseline and what the field actually came in at. The
   panel is judged against these three numbers, and until now the evaluation
   screen showed only the first: a bid under the ceiling but over the
   projection reads as a win against a budget and as a miss against the
   business case, and the panel has to be able to see which it is. */
function EvalMoney({ t, bids }) {
  const priced = bids.filter((b) => b.amount != null && !b.disqualified).map((b) => b.amount);
  const best = priced.length ? Math.min(...priced) : null;
  const sv = savingsAgainst(t, best);
  const BASIS = { baseline: "against the baseline", projection: "against the projection", budget: "against the budget" };
  return (
    <div className="evalmoney">
      <div className="em"><div className="k">Budget ceiling</div><div className="v">{fmtCompact(t.budget)}</div></div>
      <div className="em"><div className="k">Projected cost</div>
        <div className="v">{t.projectedCost != null ? fmtCompact(t.projectedCost) : <span className="faint">not set</span>}</div></div>
      <div className="em"><div className="k">Baseline</div>
        <div className="v">{t.baseline != null ? fmtCompact(t.baseline) : <span className="faint">not set</span>}</div></div>
      <div className="em"><div className="k">Best priced bid</div>
        <div className="v">{best != null ? fmtCompact(best) : <span className="faint">sealed</span>}</div></div>
      <div className="em"><div className="k">Saving {sv ? BASIS[sv.basis] : ""}</div>
        <div className="v" style={{ color: sv && sv.savings > 0 ? "var(--green)" : sv && sv.savings < 0 ? "var(--wax)" : undefined }}>
          {sv == null ? <span className="faint">-</span>
            : <>{sv.savings >= 0 ? "" : "−"}{fmtCompact(Math.abs(sv.savings))}</>}
        </div></div>
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
        ) : <Empty>Nothing recorded on this tender yet. Everything from here on is logged, and each entry is chained to the last.</Empty>}
      </div>
    </div>
  );
}

/* ---------------- evaluator home ---------------- */

export function EvalsPage({ api }) {
  const { state, go, user } = api;
  const rows = state.tenders.filter((t) => t.status === "evaluation");
  const progressOf = (t) => {
    const bids = state.bids.filter((b) => b.tenderId === t.id);
    const done = bids.filter((b) => {
      const mine = b.scores?.[user.id] || {};
      return t.criteria.every((c) => mine[c.id] != null && mine[c.id] !== "");
    }).length;
    return { done, total: bids.length };
  };
  const pending = rows.filter((t) => { const p = progressOf(t); return p.done < p.total; });
  const guide = (
    <Guide art={pending.length ? "draft" : "clear"} tone={pending.length ? undefined : "good"}
           headline={pending.length
             ? `${pending.length} ${pending.length === 1 ? "tender is" : "tenders are"} waiting for your scores`
             : rows.length ? "You have scored everything" : "Nothing to score"}
           why={pending.length
             ? "Score on your own. Nobody on the panel sees another member's numbers until consensus."
             : rows.length ? "The panel chair will call consensus when everyone has finished."
                           : "When a tender you sit on is opened, it appears here."}
           items={pending.map((t) => {
             const p = progressOf(t);
             return { key: t.id, label: t.title, note: `${p.done} of ${p.total} bids scored`,
                      onPick: () => go({ page: "tender", id: t.id, tab: "eval" }) };
           })} />
  );
  return (
    <Page guide={guide}>
      <div className="pagehead">
        <h1>My evaluations</h1>
        <span className="sub">The tenders you sit on the panel for.</span>
      </div>
      <div className="card">
        <Rows empty={<Empty art="clear">Nothing to score right now. When a tender you sit on is opened, it appears here.</Empty>}>
          {rows.map((t) => {
            const p = progressOf(t);
            const finished = p.total > 0 && p.done === p.total;
            return (
              <Row key={t.id} onOpen={() => go({ page: "tender", id: t.id, tab: "eval" })}
                   title={t.title}
                   meta={<><span className="mono">{t.ref}</span><span>{p.done} of {p.total} bids fully scored</span></>}
                   right={<>
                     {finished ? <span className="chip ok">Scored</span> : <span className="chip warn">{p.total - p.done} left</span>}
                     <button className="btn sm pri">{finished ? "Review" : "Score"}</button>
                   </>} />
            );
          })}
        </Rows>
      </div>
    </Page>
  );
}

/* ---------------- approvals (publication + awards) ---------------- */

/* ---------------- the signature chain ---------------- */

/** Can this person sign this step?

    A deliberate mirror of `approvals.may_sign` on the server, and the server
    is the one that decides — this only governs whether a button is offered.
    Showing somebody a control that will come back 403 is worse than not
    showing it, and hiding a control they are entitled to is worse still, so
    the two implementations have to agree. Any change here belongs in both.

    Four ways to be the signature, and the order is the control: the person the
    reporting line named, somebody pinned to the level, somebody standing on
    that rung, and - only for a rung nobody stands on - anybody holding the
    level's role. The role is last because most workspaces give every rung the
    same one, and checking it first would make all the rungs interchangeable.
    See the long note on the server. */
export function canSignStep(step, me, users) {
  if (!step || step.decidedAt) return false;
  if (step.personaId) {
    if (step.personaId === me.id) return true;
    /* A named signatory who has left must not strand the chain; one who is
       still here owns the step alone. */
    if ((users || []).some((u) => u.id === step.personaId)) {
      return (step.holders || []).includes(me.id);
    }
  }
  if ((step.holders || []).includes(me.id)) return true;
  if ((step.holders || []).length) return false;
  if (step.levelId) {
    if (me.approvalLevel === step.levelId) return true;
    /* Somebody does stand on this rung, and it is not you. */
    if ((users || []).some((u) => u.approvalLevel === step.levelId)) return false;
  }
  return !!step.role && me.role === step.role;
}

/** Who a pending step is waiting on, in words. */
function stepWho(step, users) {
  if (step.personaName) return step.personaName;
  if (step.personaId) {
    const u = (users || []).find((x) => x.id === step.personaId);
    if (u) return u.name;
  }
  const pinned = (step.holders || [])
    .map((h) => (users || []).find((x) => x.id === h))
    .filter(Boolean).map((x) => x.name);
  if (pinned.length) return pinned.join(" or ");
  const onRung = (users || []).filter((u) => u.approvalLevel === step.levelId);
  if (onRung.length) return onRung.map((u) => u.name).join(" or ");
  return "any " + step.level;
}

/** The chain as a vertical run of signatures: what has been signed, what is
    being waited on, and what comes after it.

    Shown to everybody on the buying side, not only to the signatories. "Who is
    this sitting with" is the single most asked question about a submitted
    tender, and an answer only the approvers can see is an answer to nobody. */
export function ApprovalChain({ chain, users, me, compact = false }) {
  if (!chain || !chain.steps || !chain.steps.length) return null;
  const done = chain.currentId == null;
  return (
    <div className={"sigchain" + (compact ? " compact" : "")}>
      <div className="sigtop">
        <Icon n="stamp" s={14} />
        <b>{done
          ? `Signed by all ${chain.total}`
          : `Signature ${chain.signed + 1} of ${chain.total}`}</b>
        <span className="faint">
          {done ? "the chain is complete"
                : "each level signs before it reaches the next"}
        </span>
      </div>
      <ol className="sigsteps">
        {chain.steps.map((st) => {
          const state = st.decision === "approved" ? "done"
            : st.decision === "rejected" ? "no"
            : st.id === chain.currentId ? "now" : "next";
          const mine = state === "now" && me && canSignStep(st, me, users);
          return (
            <li className={"sigstep " + state + (mine ? " mine" : "")} key={st.id}>
              <span className="sigdot" aria-hidden="true">
                {state === "done" ? <Icon n="check" s={11} />
                  : state === "no" ? <Icon n="close" s={11} />
                  : state === "now" ? <Icon n="clock" s={11} /> : st.seq}
              </span>
              <div className="sigbody">
                <b>{st.level}
                  <i className="siglimit mono">
                    {st.limit ? `up to ${fmtCompact(st.limit)}` : "unlimited"}
                  </i>
                </b>
                <span>
                  {state === "done"
                    ? `${st.decidedBy} signed · ${fmtDateTime(st.decidedAt)}`
                    : state === "no"
                      ? `${st.decidedBy} returned it · ${fmtDateTime(st.decidedAt)}`
                      : state === "now"
                        ? (mine ? "Waiting on you" : `Waiting on ${stepWho(st, users)}`)
                        : `Then ${stepWho(st, users)}`}
                </span>
                {st.note && <em className="signote">&ldquo;{st.note}&rdquo;</em>}
              </div>
              {mine && <span className="chip green sigyou">yours to sign</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export const CHAIN_CSS = `
.sigchain{border:1px solid var(--line);border-radius:12px;background:var(--sunk);
  padding:11px 13px;margin:12px 0}
.sigchain.compact{margin:0 0 10px;padding:9px 11px}
.sigtop{display:flex;align-items:center;gap:7px;font-size:12.5px;margin-bottom:9px;
  flex-wrap:wrap}
.sigtop svg{color:var(--brand);flex-shrink:0}
.sigtop b{letter-spacing:-.01em}
.sigtop .faint{font-size:11.5px}
.sigsteps{list-style:none;margin:0;padding:0;display:grid;gap:0}
.sigstep{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;
  align-items:start;padding:7px 0;position:relative}
.sigstep + .sigstep::before{content:"";position:absolute;left:10px;top:-4px;height:11px;
  width:1.5px;background:var(--line2)}
.sigstep.done + .sigstep::before{background:var(--green-2)}
.sigdot{width:21px;height:21px;border-radius:50%;display:inline-flex;flex-shrink:0;
  align-items:center;justify-content:center;font-size:10.5px;font-weight:700;
  background:var(--card);border:1px solid var(--line2);color:var(--faint)}
.sigstep.done .sigdot{background:var(--green-tint);border-color:var(--green-2);color:var(--green)}
.sigstep.no .sigdot{background:var(--wax-tint);border-color:var(--wax);color:var(--wax)}
.sigstep.now .sigdot{background:var(--brand);border-color:var(--brand);color:var(--on-brand)}
.sigbody{min-width:0}
.sigbody b{display:flex;gap:7px;align-items:baseline;flex-wrap:wrap;font-size:13px;
  letter-spacing:-.012em}
.siglimit{font-style:normal;font-size:11px;color:var(--faint);font-weight:400}
.sigbody > span{display:block;font-size:12px;color:var(--muted);line-height:1.45;
  margin-top:1px}
.sigstep.now .sigbody > span{color:var(--ink)}
.signote{display:block;font-size:11.8px;color:var(--muted);margin-top:3px;line-height:1.45}
.sigyou{flex-shrink:0;align-self:center}
.sigstep.next{opacity:.66}
.elsewhere{padding:10px 0}
.elsewhere + .elsewhere{border-top:1px solid var(--line)}
.elsehead{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-bottom:2px}
.elsehead b{font-size:13.5px;letter-spacing:-.012em}

/* ---- the vendor register: coverage and the ways in ---------------------
   The coverage bar is a count, not a proportion of the page width: a category
   with two verified vendors out of two would otherwise draw a full bar and
   read as healthy, when two is the number that cannot hold a competition. So
   the bar is the verified SHARE and the figure beside it is the count, and the
   thin ones carry a word rather than relying on the reader to compare bars. */
.covwrap{display:grid;gap:2px}
.covrow{display:grid;grid-template-columns:minmax(0,1fr) 34% auto auto;gap:12px;
  align-items:center;width:100%;text-align:left;background:none;border:0;
  font:inherit;color:inherit;padding:9px 6px;border-radius:8px;cursor:pointer;
  transition:background var(--t) var(--ease)}
.covrow:hover{background:var(--sunk)}
.covname{font-size:13.5px;font-weight:600;letter-spacing:-.012em;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.covbar{height:7px;border-radius:4px;background:var(--sunk);overflow:hidden;
  box-shadow:inset 0 0 0 1px var(--line)}
.covbar i{display:block;height:100%;border-radius:4px;background:var(--green-2);
  transition:width 520ms cubic-bezier(.16,1,.3,1)}
.covrow.thin .covbar i{background:var(--brass)}
.covn{font-size:12.5px;font-variant-numeric:tabular-nums;white-space:nowrap}
@media(max-width:700px){
  .covrow{grid-template-columns:minmax(0,1fr) auto auto;gap:8px}
  .covbar{grid-column:1/-1;order:3}
}

.addgrid{display:grid;gap:10px}
.addcard{display:grid;justify-items:start;gap:5px;text-align:left;cursor:pointer;
  background:var(--card);border:1px solid var(--line);border-radius:12px;
  padding:15px 16px;font:inherit;color:inherit;
  transition:border-color var(--t) var(--ease),transform 240ms cubic-bezier(.16,1,.3,1)}
.addcard:hover{border-color:var(--green-2);transform:translateY(-2px)}
.addcard svg{color:var(--brand)}
.addcard b{font-size:13.5px;letter-spacing:-.015em}
.addcard i{font-style:normal;font-size:12.3px;line-height:1.5;color:var(--muted)}
@media(min-width:700px){.addgrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:1100px){.addgrid{grid-template-columns:repeat(3,minmax(0,1fr))}}
.logoedit{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.logoedit .orgmark .orginit,.logoedit .orgmark .orglogo{border-radius:11px}
.ladrow2{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;
  align-items:start;padding:9px 0;border-top:1px solid var(--line)}
.ladrow2 > .sigdot{margin-top:7px}
.ladrow2 > .btn{grid-row:1;grid-column:3}
.ladrow2 > div{grid-column:2}
@media(min-width:700px){
  .ladrow2{grid-template-columns:auto minmax(0,1.5fr) minmax(0,1fr) 36px;align-items:center}
  .ladrow2 > .btn{grid-column:auto}
  .ladrow2 > div{grid-column:auto}
  .ladrow2 > .sigdot{margin-top:0}
}
`;


export function ApprovalsPage({ api }) {
  const { state, act } = api;
  const me = state.me;
  const users = state.users || [];
  const ladder = state.org.approvalLevels || [];

  /* With a ladder configured, "waiting for approval" and "waiting for YOU" stop
     being the same list. Both are shown — a queue that hides what it is waiting
     on is how a tender sits for a fortnight with nobody able to say where — but
     only the ones you can actually sign carry buttons. The alternative, offering
     everyone every control and letting the server return 403, teaches people
     that the buttons are a lie. */
  const step = (t, kind) => {
    const chain = kind === "award" ? t.awardChain : t.publishChain;
    if (!chain || !chain.currentId) return null;
    return chain.steps.find((x) => x.id === chain.currentId) || null;
  };
  const isMine = (t, kind) => {
    const cur = step(t, kind);
    /* No chain means the workspace runs on the single threshold, where the
       capability is the whole authorisation — see approvals.py. */
    if (!cur) return kind === "award" ? can(me, "award.decide") : can(me, "tender.publish_decision");
    return canSignStep(cur, me, users);
  };

  const allPubs = state.tenders.filter((t) => t.status === "approval");
  const allAwards = state.tenders.filter((t) => t.status === "evaluation" && t.awardRec);
  const pubs = allPubs.filter((t) => isMine(t, "publish"));
  const awards = allAwards.filter((t) => isMine(t, "award"));
  const elsewhere = [
    ...allAwards.filter((t) => !isMine(t, "award")).map((t) => ({ t, kind: "award" })),
    ...allPubs.filter((t) => !isMine(t, "publish")).map((t) => ({ t, kind: "publish" })),
  ];
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

  /* The guide is the queue: one line per thing waiting for a signature, each
     one a way to the card below. The spend totals and the threshold setting,
     which the old page put at the top at the same weight as the decisions,
     are behind a disclosure: you change the threshold a few times a year and
     you look at committed spend when someone asks. */
  const queue = [
    ...awards.map((t) => ({ key: "a" + t.id, label: t.title,
      note: `Award · ${state.suppliers.find((s) => s.id === t.awardRec.supplierId)?.name} at ${fmtCompact(t.awardRec.amount)}`,
      onPick: () => document.getElementById("appr-a" + t.id)?.scrollIntoView({ behavior: "smooth", block: "start" }) })),
    ...pubs.map((t) => ({ key: "p" + t.id, label: t.title,
      note: `Publish · ceiling ${fmtCompact(t.budget)}`,
      onPick: () => document.getElementById("appr-p" + t.id)?.scrollIntoView({ behavior: "smooth", block: "start" }) })),
  ];
  const guide = (
    <Guide art={queue.length ? "draft" : "clear"} tone={queue.length ? undefined : "good"}
           headline={queue.length
             ? `${queue.length} ${queue.length === 1 ? "thing needs" : "things need"} your sign-off`
             : "Nothing is waiting for your sign-off"}
           why={queue.length
             ? "Nothing reaches a supplier without a named signature. Pick one to go to it."
             : elsewhere.length
               ? `Nothing is yours to sign. ${elsewhere.length} ${elsewhere.length === 1 ? "request is" : "requests are"} with somebody else in the chain — they are listed below.`
               : "Tenders above your authority come here before they publish. Awards always do."}
           items={queue} />
  );
  return (
    <Page guide={guide}>
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
      <div className="pagehead">
        <h1>Approvals</h1>
        <span className="sub">Awards to sign off, and tenders waiting to be published.</span>
      </div>

      {awards.map((t) => {
        const rec = t.awardRec;
        const winner = state.suppliers.find((s) => s.id === rec.supplierId);
        const bids = state.bids.filter((b) => b.tenderId === t.id);
        const ranked = bids.map((b) => ({ b, tot: totalScore(t, b, bids) })).sort((x, y) => (y.tot ?? -1) - (x.tot ?? -1));
        return (
          <div className="card" key={"a" + t.id} id={"appr-a" + t.id} style={{ marginBottom: 14 }}>
            <div className="chead">
              <h3>{t.title}</h3>
              <span className="chip gold" style={{ marginLeft: "auto" }}>Award · {winner.name} · {fmtCompact(rec.amount)}</span>
            </div>
            <div className="cbody">
              <div className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
                {rec.by} recommends <b>{winner.name}</b> at <b>{fmtMoney(rec.amount)}</b>, {fmtCompact(t.budget - rec.amount)} under
                the ceiling, from {bids.length} sealed {bids.length === 1 ? "bid" : "bids"}. {fmtDateTime(rec.at)}.
              </div>
              <ApprovalChain chain={t.awardChain} users={users} me={me} compact />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn pri" onClick={() => setAwardT(t)}>
                  {t.awardChain && t.awardChain.total > t.awardChain.signed + 1
                    ? "Sign and pass it up" : "Approve award & issue letters"}
                </button>
                <button className="btn" onClick={() => returnAward(t)}>Return to panel</button>
              </div>
              <More title="The recommendation in full" summary="the memo, every bidder's total, and the PDF">
                <div className="aihint" style={{ marginBottom: 12 }}>{rec.memo}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  {ranked.map(({ b, tot }) => {
                    const s = state.suppliers.find((x) => x.id === b.supplierId);
                    return <span key={b.id} className={"chip" + (b.supplierId === rec.supplierId ? " gold" : "")}>{s.name} · {fmtCompact(b.amount)} · total {tot != null ? tot.toFixed(1) : "-"}</span>;
                  })}
                </div>
                <button className="btn sm" onClick={() => downloadUrl(`/tenders/${t.id}/export/memo.pdf`, `${t.ref}-award-memo.pdf`)}>Download memo as PDF</button>
              </More>
            </div>
          </div>
        );
      })}

      {pubs.map((t) => (
        <div className="card" key={t.id} id={"appr-p" + t.id} style={{ marginBottom: 14 }}>
          <div className="chead">
            <h3>{t.title}</h3>
            <span className="chip" style={{ marginLeft: "auto" }}>Publish · ceiling {fmtCompact(t.budget)}</span>
          </div>
          <div className="cbody">
            <div className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
              Closes {fmtDate(t.deadline)} · {t.invited.length} {t.invited.length === 1 ? "vendor" : "vendors"} invited
              · scored {t.techWeight}% technical, {t.commWeight}% commercial
              {t.lines && t.lines.length > 0 ? ` · ${t.lines.length} priced lines` : ""}.
            </div>
            <ApprovalChain chain={t.publishChain} users={users} me={me} compact />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn pri" onClick={() => decidePub(t, true)}>
                {t.publishChain && t.publishChain.total > t.publishChain.signed + 1
                  ? "Sign and pass it up" : "Approve & publish"}
              </button>
              <button className="btn" onClick={() => decidePub(t, false)}>Return to draft</button>
            </div>
            <More title="Scope and criteria" summary="what is being bought, and how bids will be scored">
              <p style={{ margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.6 }}>{t.scope}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {t.criteria.map((c) => <span key={c.id} className="chip">{c.name} · {c.weight}%</span>)}
              </div>
            </More>
          </div>
        </div>
      ))}

      {!pubs.length && !awards.length && (
        <div className="card"><Empty art="clear">Nothing is waiting for your sign-off.</Empty></div>
      )}

      {/* Everything in the building that is waiting on a signature, and whose.
          Read-only, and here rather than hidden because the question this
          answers — "where has it got to" — is asked of procurement, not of the
          approver who happens to be holding it. */}
      {elsewhere.length > 0 && (
        <More title={`${elsewhere.length} more waiting on somebody else`}
              summary="where each one has got to in its chain">
          {elsewhere.map(({ t, kind }) => (
            <div className="elsewhere" key={kind + t.id}>
              <div className="elsehead">
                <b>{t.title}</b>
                <span className="chip">
                  {kind === "award" ? `Award · ${fmtCompact(t.awardRec.amount)}`
                                    : `Publish · ceiling ${fmtCompact(t.budget)}`}
                </span>
              </div>
              <ApprovalChain chain={kind === "award" ? t.awardChain : t.publishChain}
                             users={users} me={me} compact />
            </div>
          ))}
        </More>
      )}

      {/* The rule itself. A workspace on the ladder sees the ladder; one still
          on the single threshold sees the threshold and a word about what it
          could have instead. Editing the ladder is Team's job — it is half org
          chart, and splitting it across two pages would mean neither page
          could show you the consequence of a change. */}
      {ladder.length > 0 ? (
        <More title="Who signs what"
              summary={`${ladder.length} level${ladder.length === 1 ? "" : "s"} of delegated authority`}>
          <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
            A request walks up the reporting line of whoever raised it, collecting a
            signature at every rung it passes, and stops at the first person whose limit
            covers the amount. Nobody signs their own request. Change the rungs, and who
            stands on them, from the Team page.
          </div>
          {ladder.map((l, i) => {
            const on = users.filter((u) => u.approvalLevel === l.id);
            return (
              <div className="rowline" key={l.id}>
                <span className="sigdot" style={{ marginRight: 9 }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{l.name}</b>
                  <span className="hint" style={{ marginTop: 1 }}>
                    {on.length ? on.map((u) => u.name).join(", ")
                               : <em className="faint">nobody stands on this rung</em>}
                  </span>
                </span>
                <span className="mono faint" style={{ fontSize: 12 }}>
                  {l.limit ? `up to ${fmtCompact(l.limit)}` : "unlimited"}
                </span>
              </div>
            );
          })}
        </More>
      ) : (
        <More title="When a tender needs your sign-off" summary={thr ? `at or above ${fmtCompact(Number(thr))}` : "no threshold set"}>
          <div className="frow" style={{ marginBottom: 0 }}>
            <label className="lbl">Sign-off threshold</label>
            <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>In naira. A tender at or above this comes to you before it publishes. Below it, publishing is immediate. Only you can change this.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="in" type="number" value={thr} onChange={(e) => setThr(e.target.value)} />
              <button className="btn pri" onClick={saveThr} disabled={!Number(thr)}>Save</button>
            </div>
            {!Number(thr) && <div className="hint">Enter an amount in naira to save.</div>}
            {thrMsg && <div className="notice" style={{ marginTop: 10, marginBottom: 0 }}>{thrMsg}</div>}
            <div className="hint" style={{ marginTop: 10 }}>
              One threshold and one approver is the simple case. If your delegation of
              authority has several levels, build the ladder on the Team page and this
              threshold stops being used.
            </div>
          </div>
        </More>
      )}

      <More title="Committed spend" summary={`${fmtCompact(committed)} awarded to date · ${fmtCompact(pending)} pending your approval`}>
        <div className="rowline"><span className="muted" style={{ flex: 1 }}>Awarded to date</span><Money n={committed} strong /></div>
        <div className="rowline"><span className="muted" style={{ flex: 1 }}>Pending your approval</span><Money n={pending} /></div>
        <div className="rowline"><span className="muted" style={{ flex: 1 }}>Total budget ceilings in play</span><Money n={ceilings} /></div>
        <div className="hint">Approve everything pending and committed spend becomes <b>{fmtCompact(committed + pending)}</b>.</div>
      </More>
    </Page>
  );
}

/* ---------------- new / edit tender ---------------- */

/* Attach a tender line to the material master.

   Optional on purpose. Plenty of what an organisation buys has no item number,
   and a required field here would produce a master full of "MISC" — the coded
   line is worth having precisely because it means something, so it has to be
   possible to leave off.

   What it buys: the same item on two tenders becomes two points on one price
   series (see pricehistory.item_prices). Free-text lines cannot be compared
   with anything, because the next buyer describes the same oven differently. */
function ItemPick({ line, onPick }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [hist, setHist] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    const id = setTimeout(() => {
      raw(`/items/?q=${encodeURIComponent(q)}`)
        .then((d) => { if (live) setRows(d.items); })
        .catch(() => { if (live) setRows([]); });
    }, 180);   // typing settles before the search runs
    return () => { live = false; clearTimeout(id); };
  }, [q, open]);

  // What this item has actually been awarded at before — the reason to code the
  // line at all, shown where the decision is being made rather than on a report.
  useEffect(() => {
    if (!line.itemCode) { setHist(null); return undefined; }
    let live = true;
    raw(`/items/history/?code=${encodeURIComponent(line.itemCode)}`)
      .then((d) => { if (live && d.n > 0) setHist(d); })
      .catch(() => {});
    return () => { live = false; };
  }, [line.itemCode]);

  if (line.itemCode) {
    return (
      <span className="itempick on" title={hist
        ? `Last awarded at ${fmtMoney(hist.latest)} · ${hist.n} prior award(s)`
        : "Linked to the material master"}>
        <Icon n="tender" s={12} />
        <b className="mono">{line.itemCode}</b>
        {hist && <span className="ihist">{fmtCompact(hist.latest)}</span>}
        <button className="ix" aria-label="Unlink this item" onClick={() => onPick(null)}>✕</button>
      </span>
    );
  }

  return (
    <span className="itempick">
      <button className="btn xs ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon n="search" s={12} />Item
      </button>
      {open && (
        <div className="itemdrop">
          <input className="in" autoFocus placeholder="Search the item master…"
                 value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="itemlist">
            {rows === null && <div className="muted" style={{ padding: 8, fontSize: 12 }}>Searching…</div>}
            {rows && !rows.length && (
              <div className="muted" style={{ padding: 8, fontSize: 12 }}>
                Nothing matches. Leave the line as free text — not everything has an item number.
              </div>
            )}
            {(rows || []).map((it) => (
              <button className="itemrow" key={it.code}
                      onClick={() => { onPick(it); setOpen(false); setQ(""); }}>
                <b className="mono">{it.code}</b>
                <span className="ilbl">{it.label}</span>
                <span className="faint">{it.uom}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

/* ---------------- drafting a tender ----------------

   THE RULE THIS SCREEN IS BUILT ON: never disable a control without saying
   why. `ready` below is one boolean AND of eight conditions, and for a long
   time the only thing the interface did with it was grey the button out. A
   person who had filled in sixteen fields and still could not submit had no
   way to find out which of the eight was unmet except to scroll and guess.

   So the boolean is now a LIST. Every condition names itself, says what to do
   about it, and clicking it scrolls to the field and flashes it. The button is
   still disabled — the server would reject an incomplete tender anyway — but
   it is no longer silent.

   Two other things follow from the same idea:

     Specialist questions moved. Two-stage envelope openings, auction
     decrements, savings baselines and priced line items are real features that
     a handful of tenders need. They used to sit at the same visual weight as
     the title, so a store manager buying syrup was asked about technical
     thresholds. They are behind Advanced options now. Nothing was removed.

     The weights cannot be wrong. Criteria had to total exactly 100, typed as
     free numbers, and told you off in red when they did not. They are sliders
     that redistribute, so the rule is now impossible to break rather than
     something you get scolded about. A tender in the register with weights
     that do not sum to 100 still edits cleanly: the first drag normalises it. */

/* ---------------- who gets invited ---------------- */

/* How many vendors reach the picker before it asks you to narrow instead of
   scroll. The register runs to about 1,400 and a chip per row was a wall. */
const PICK = 24;

/** The vendors in the same family as a category, read off the taxonomy the
    bootstrap already sent. Used for the middle rung of the scope control:
    wider than the category, far narrower than the register. */
function familyOf(taxonomy, category) {
  return (taxonomy || []).find((fam) => fam.categories.some((c) => c.key === category)) || null;
}

/** The invitation step of the draft. Two things were wrong with the chip wall
    it replaces: it offered all 1,400 vendors at once with no way in, and a
    company that is not on the register yet was a dead end — you had to abandon
    the draft, go to Suppliers, register them, and come back. */
function InviteStep({ api, f, set }) {
  const { state } = api;
  const [scope, setScope] = useState("cat");   // cat | family | all
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PICK);
  const [adding, setAdding] = useState(false);

  const fam = familyOf(state.taxonomy, f.category);
  /* A suspended vendor cannot be invited — the server refuses the whole event
     if one is in the list — so it never appears here to be picked. */
  const pool = state.suppliers.filter((s) => !s.suspended);
  const inCat = pool.filter((s) => s.category === f.category);
  const inFam = fam ? pool.filter((s) => fam.categories.some((c) => c.key === s.category)) : [];

  /* Without a category there is nothing to narrow by, so the picker opens on
     the whole register and says why. */
  const effScope = !f.category ? "all" : scope;
  const base = effScope === "cat" ? inCat : effScope === "family" ? inFam : pool;
  const needle = q.trim().toLowerCase();
  const matched = needle
    ? base.filter((s) => [s.name, s.category, s.location, s.code]
        .some((x) => (x || "").toLowerCase().includes(needle)))
    : base;

  /* Whoever is already invited stays on screen whatever the filter says, or
     narrowing the list would hide the thing you are trying to undo. Read off
     the whole register rather than the pool: a vendor suspended since the draft
     was started has to be visible to be taken off it, and the server refuses
     the whole event while they are still on the list. */
  const chosen = f.invited.map((id) => state.suppliers.find((s) => s.id === id)).filter(Boolean);
  const chosenIds = new Set(f.invited);
  const rest = matched.filter((s) => !chosenIds.has(s.id));
  const page = rest.slice(0, shown);

  const toggle = (id) => set("invited", chosenIds.has(id)
    ? f.invited.filter((x) => x !== id)
    : [...f.invited, id]);

  const chip = (s) => {
    const on = chosenIds.has(s.id);
    return (
      <button key={s.id} className={"chip" + (on ? " on" : "")} aria-pressed={on}
              onClick={() => toggle(s.id)}>
        {/* always rendered, so it can widen into place rather than appearing
            and shoving the label sideways */}
        <span className="chipck" aria-hidden="true"><Icon n="check" s={12} /></span>
        {s.name}
        <small>
          {s.suspended ? "suspended — remove to publish"
                       : (s.category === f.category ? s.location : s.category)
                         + (!s.prequalified ? " · unverified" : "")}
        </small>
      </button>
    );
  };

  const scopes = [
    ["cat", f.category || "This category", inCat.length],
    ["family", fam ? fam.label : "Related", inFam.length],
    ["all", "Every vendor", pool.length],
  ];

  return (
    <div className="card" id="nt-invite">
      {adding && (
        <AddVendorDialog api={api} category={f.category}
                         onClose={() => setAdding(false)}
                         onAdded={(id) => { if (!chosenIds.has(id)) set("invited", [...f.invited, id]); }} />
      )}
      <div className="chead"><h3>Who gets invited</h3>
        <span className="hint" style={{ marginLeft: "auto", marginTop: 0 }}>
          {f.invited.length ? f.invited.length + " selected" : "none yet"}</span></div>
      <div className="cbody">
        {/* The category first, because that is the shortlist somebody actually
            wants; the family and the register are there for the vendor who is
            filed one leaf over. */}
        <div className="pickbar">
          <div className="scoper" role="group" aria-label="Which vendors to show">
            {scopes.map(([k, label, n]) => (
              <button key={k} type="button" className={"scopeb" + (effScope === k ? " on" : "")}
                      aria-pressed={effScope === k} disabled={!f.category && k !== "all"}
                      onClick={() => { setScope(k); setShown(PICK); }}>
                {label}<small>{n.toLocaleString()}</small>
              </button>
            ))}
          </div>
          <input className="in picksearch" placeholder="Search by name, place or vendor code"
                 aria-label="Search vendors" value={q}
                 onChange={(e) => { setQ(e.target.value); setShown(PICK); }} />
        </div>

        {!f.category && (
          <div className="hint" style={{ marginBottom: 10 }}>
            Pick a category above and this narrows to the vendors who work in it.
          </div>
        )}

        {chosen.length > 0 && (
          <>
            <div className="picklbl">Invited</div>
            <div className="chiprow" style={{ marginBottom: 14 }}>{chosen.map(chip)}</div>
          </>
        )}

        {rest.length > 0 && (
          <>
            <div className="picklbl">
              {needle ? `${rest.length.toLocaleString()} match "${q.trim()}"`
                      : effScope === "cat" ? `${rest.length.toLocaleString()} more in ${f.category}`
                      : effScope === "family" ? `${rest.length.toLocaleString()} more in ${fam ? fam.label : "this family"}`
                      : `${rest.length.toLocaleString()} more on the register`}
            </div>
            <div className="chiprow">{page.map(chip)}</div>
            {rest.length > page.length && (
              <button className="btn sm" style={{ marginTop: 10 }}
                      onClick={() => setShown((n) => n + PICK * 2)}>
                Show {Math.min(PICK * 2, rest.length - page.length)} more
              </button>
            )}
          </>
        )}

        {rest.length === 0 && (
          <Empty art="tray">
            {needle
              ? `Nobody here matches "${q.trim()}". Try a wider scope, or add the company below.`
              : effScope === "cat" && f.category && inCat.length === 0
                ? `No vendors are filed under ${f.category} yet. Widen the scope, or add the company below and they will be emailed an invitation to bid.`
                : chosen.length
                  ? "Everyone in this list is already invited."
                  : "Nobody is on the register yet. Add the company below and they will be emailed an invitation to bid."}
          </Empty>
        )}

        {/* The way out of "they are not on the register". It registers them,
            mails them a link to claim their account, and ticks them into this
            event — without losing the draft. */}
        <div className="pickadd">
          <button className="btn" onClick={() => setAdding(true)}>
            <Icon n="plus" s={14} />Invite a vendor who isn't on the register
          </button>
          <span className="hint" style={{ marginTop: 0 }}>
            They are emailed a link to set a password, and land in your prequalification queue.
          </span>
        </div>

        <div className="hint">
          An unverified vendor can still be invited and can still bid. Verification gates
          prequalification, not participation.
        </div>
      </div>
    </div>
  );
}

/** Register a company from inside the draft and invite them in one step. The
    full register form lives on the Suppliers page; this is the short version,
    because the person filling it in is in the middle of writing a tender and
    knows a name and an email, not a payment term. */
function AddVendorDialog({ api, category, onClose, onAdded }) {
  const { toast, refresh } = api;
  const [f, setF] = useState({
    name: "", email: "", contactPerson: "", phone: "", location: "", category: category || "",
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [clash, setClash] = useState(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  /* The email is not optional here as it is on the register form: the whole
     point of adding them from a draft is that they get asked to bid, and that
     is an email or it is nothing. */
  const ok = f.name.trim().length > 1 && f.email.includes("@");

  const submit = async () => {
    setBusy(true); setProblem(null); setClash(null);
    try {
      const r = await raw("/suppliers/register/", {
        method: "POST",
        body: { ...f, name: f.name.trim(), email: f.email.trim().toLowerCase(), invite: true },
      });
      onAdded(r.id);
      onClose();
      await refresh();
      toast.ok(`${r.name} invited`,
               "They have been emailed a link to set a password, and they are ticked into this draft. "
               + "They will get the sealed invitation when you publish.");
    } catch (e) {
      /* A duplicate comes back with the record it clashed with, so the answer
         is one button rather than "go and look for them yourself". */
      if (e.status === 409 && e.data?.existing) setClash(e.data.existing);
      else setProblem(e.message || "Could not add this vendor.");
    }
    setBusy(false);
  };

  return (
    <Dialog wide title="Invite a vendor who isn't on the register" onClose={onClose} footer={
      <>
        {!ok && <span className="hint gatehint">A company name and an email address, so there is somewhere to send the invitation.</span>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={!ok || busy} onClick={submit}>
          {busy ? "Sending…" : "Add and invite"}
        </button>
      </>
    }>
      They go onto the register as <b>unverified</b> — somebody typed them in and nobody has checked
      them — and they are emailed a link to set a password. That does not hold up this tender: they can
      be invited and can bid while prequalification runs its course.
      {problem && <div className="notice wax" style={{ marginTop: 10 }}>{problem}</div>}
      {clash && (
        <div className="notice wax" style={{ marginTop: 10 }}>
          <b>{clash.name}</b> is already on the register{clash.email ? ` (${clash.email})` : ""}.
          Invite that record rather than creating a second one.
          <div style={{ marginTop: 8 }}>
            <button className="btn sm pri" onClick={() => { onAdded(clash.id); onClose(); }}>
              Invite {clash.name} instead
            </button>
          </div>
        </div>
      )}
      <div className="grid g2" style={{ marginTop: 10 }}>
        <div className="frow"><label className="lbl" htmlFor="av-name">Registered company name</label>
          <input id="av-name" className="in" autoFocus value={f.name} onChange={(e) => set("name", e.target.value)}
                 placeholder="e.g. Adeola Industrial Services Ltd" /></div>
        <div className="frow"><label className="lbl" htmlFor="av-email">Where the invitation goes</label>
          <input id="av-email" className="in" type="email" value={f.email} onChange={(e) => set("email", e.target.value)}
                 placeholder="tenders@company.com" /></div>
        <div className="frow"><label className="lbl" htmlFor="av-person">Contact person <span className="faint">optional</span></label>
          <input id="av-person" className="in" value={f.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} /></div>
        <div className="frow"><label className="lbl" htmlFor="av-phone">Phone <span className="faint">optional</span></label>
          <input id="av-phone" className="in" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        <div className="frow"><label className="lbl" htmlFor="av-loc">Location <span className="faint">optional</span></label>
          <input id="av-loc" className="in" value={f.location} onChange={(e) => set("location", e.target.value)}
                 placeholder="e.g. Lagos" /></div>
        <div className="frow"><label className="lbl" htmlFor="av-cat">Category</label>
          <input id="av-cat" className="in" value={f.category} onChange={(e) => set("category", e.target.value)}
                 placeholder="e.g. Logistics & freight" />
          <div className="hint">Prefilled from this tender. It decides where they sit in the register.</div></div>
      </div>
    </Dialog>
  );
}

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
    baseline: editing.baseline ? String(editing.baseline) : "",
    baselineSource: editing.baselineSource || "",
    projectedCost: editing.projectedCost ? String(editing.projectedCost) : "",
  } : {
    title: "", type: "RFQ", category: "", budget: "", deadline: "",
    techWeight: 70, scope: "",
    criteria: [{ id: uid(), name: "Quality & compliance", weight: 40 }, { id: uid(), name: "Capacity & reliability", weight: 35 }, { id: uid(), name: "Commercial terms", weight: 25 }],
    invited: [], lines: [],
    twoStage: false, techThreshold: 70, minDecrement: "",
    baseline: "", baselineSource: "", projectedCost: "",
  });
  const [busy, setBusy] = useState(false);
  const [busyC, setBusyC] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const weightSum = f.criteria.reduce((s, c) => s + Number(c.weight || 0), 0);
  const linesOk = f.lines.length === 0 || f.lines.every((l) => l.desc.trim() && Number(l.qty) > 0);
  const isAuction = f.type === "AUC";
  const projOk = !(Number(f.projectedCost) > 0 && Number(f.budget) > 0
                   && Number(f.projectedCost) > Number(f.budget));
  const ready = f.title.trim() && f.category && Number(f.budget) > 0 && f.deadline && f.invited.length > 0 && linesOk && projOk
    && (isAuction ? Number(f.minDecrement) > 0 && f.lines.length === 0 : weightSum === 100);

  /* Move one weight and let the others absorb the difference, proportionally,
     so the total is always exactly 100. The rounding drift lands on the first
     other criterion rather than being spread, because spreading it makes every
     number twitch on every drag. */
  const rebalance = (id, val) => {
    const next = Math.max(0, Math.min(100, Math.round(Number(val) || 0)));
    const others = f.criteria.filter((c) => c.id !== id);
    if (!others.length) { set("criteria", f.criteria.map((c) => ({ ...c, weight: 100 }))); return; }
    const oldRest = others.reduce((s, c) => s + Number(c.weight || 0), 0);
    const rest = 100 - next;
    const shared = others.map((c, i) => ({
      ...c,
      weight: oldRest > 0 ? Math.max(0, Math.round(Number(c.weight || 0) / oldRest * rest))
                          : (i === 0 ? rest : 0),
    }));
    const drift = 100 - next - shared.reduce((s, c) => s + c.weight, 0);
    if (drift) shared[0].weight = Math.max(0, shared[0].weight + drift);
    const byId = new Map(shared.map((c) => [c.id, c]));
    set("criteria", f.criteria.map((c) => (c.id === id ? { ...c, weight: next } : byId.get(c.id))));
  };

  /* Scroll to the field a checklist line names and flash it, so the answer to
     "which one?" is a place on the screen rather than a sentence to parse. */
  const jump = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
    el.classList.remove("jumped");
    void el.offsetWidth;
    el.classList.add("jumped");
    const focusable = el.matches("input,select,textarea") ? el : el.querySelector("input,select,textarea,button");
    if (focusable) focusable.focus({ preventScroll: true });
  };

  /* The eight conditions of `ready`, each one able to explain itself. Order
     follows the form, so the list reads top to bottom the way the page does.
     `quiet` entries are conditions that only exist once you have opted into
     the thing they guard, so they stay out of the list until they can fail. */
  const checks = [
    { key: "title", ok: !!f.title.trim(), to: "nt-title",
      todo: "Say what you are buying", done: "Title set" },
    { key: "cat", ok: !!f.category, to: "nt-cat",
      todo: "Pick a category", done: "Category picked",
      note: "It decides which vendors we suggest." },
    { key: "budget", ok: Number(f.budget) > 0, to: "nt-budget",
      todo: "Set the most you can spend",
      done: "Ceiling " + fmtMoney(Number(f.budget) || 0) },
    { key: "deadline", ok: !!f.deadline, to: "nt-deadline",
      todo: "Choose a closing date", done: "Closes " + fmtDeadline(f.deadline),
      note: "Vendors need a date before they can be invited." },
    { key: "invited", ok: f.invited.length > 0, to: "nt-invite",
      todo: "Invite at least one vendor",
      done: f.invited.length + (f.invited.length === 1 ? " vendor invited" : " vendors invited") },
    isAuction
      ? { key: "decrement", ok: Number(f.minDecrement) > 0, to: "nt-decrement",
          todo: "Set the minimum decrement", done: "Each bid undercuts by " + fmtMoney(Number(f.minDecrement) || 0),
          note: "An auction needs a step size before it can open." }
      : { key: "weights", ok: weightSum === 100, to: "nt-weights",
          todo: "Scoring adds up to " + weightSum + ", not 100", done: "Scoring adds up to 100",
          note: "Move any slider and the rest will follow." },
    { key: "lines", ok: linesOk, to: "nt-lines", quiet: linesOk,
      todo: "Finish the priced line items", done: "Line items complete",
      note: "Every line needs a description and a quantity above zero." },
    { key: "auclines", ok: !(isAuction && f.lines.length > 0), to: "nt-lines", quiet: !isAuction || f.lines.length === 0,
      todo: "Remove the line items", done: "No line items",
      note: "A reverse auction is price-only, so it cannot carry priced lines." },
    { key: "proj", ok: projOk, to: "nt-proj", quiet: projOk,
      todo: "Projected cost is above the ceiling", done: "Projection sits under the ceiling",
      note: "Raise the ceiling, or revise the projection." },
  ].filter((c) => !(c.quiet && c.ok));

  const outstanding = checks.filter((c) => !c.ok);
  const pct = Math.round((checks.length - outstanding.length) / checks.length * 100);
  /* Outstanding first, cleared underneath, so what is left to do stays where
     the eye already is. The rows animate to their new places rather than
     jumping, which is what makes a line visibly LEAVE the list when you
     satisfy it instead of just changing colour in place. */
  const ordered = [...outstanding, ...checks.filter((c) => c.ok)];
  const listRef = useRef(null);
  useFlip(listRef, ordered.map((c) => c.key).join("|"));
  const shownPct = useCountUp(pct, DUR.ceremony, pct);
  const threshold = Number(state.org.approvalThreshold) || 0;
  const needsApproval = threshold > 0 && Number(f.budget) >= threshold;

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
      baseline: Number(f.baseline) || 0,
      baselineSource: f.baselineSource.trim(),
      projectedCost: Number(f.projectedCost) || 0,
      submit,
    };
    const ok = editing ? await act.updateTender(editId, payload) : await act.createTender(payload);
    if (ok) go({ page: "tenders" });
  };

  return (
    <div>
      <div className="pagehead">
        <button className="btn sm" onClick={() => go({ page: "tenders" })}>
          <Icon n="chev" s={14} style={{ transform: "rotate(180deg)" }} />Tenders
        </button>
        <h1>{editing ? "Edit draft" : "New tender"}</h1>
        <span className="sub">Draft it here. Nothing goes out until you send it on.</span>
      </div>

      <div className="ntcols">
        <div>
          <div className="card">
            <div className="chead"><h3>The basics</h3></div>
            <div className="cbody">
              <div className="frow"><label className="lbl" htmlFor="nt-title">What are you buying?</label>
                <input id="nt-title" className="in" placeholder="e.g. Annual supply of beverage syrups"
                       value={f.title} onChange={(e) => set("title", e.target.value)} /></div>

              <div className="grid g2">
                <div className="frow"><label className="lbl" htmlFor="nt-cat">Category</label>
                  <select id="nt-cat" className="in" value={f.category} onChange={(e) => set("category", e.target.value)}>
                    <option value="">Choose a category…</option>
                    {(state.taxonomy || []).map((fam) => (
                      <optgroup key={fam.key} label={fam.label}>
                        {fam.categories.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.label}{c.count ? ` (${c.count} vendors)` : ""}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <div className="hint">It decides which vendors we suggest below.</div></div>

                <div className="frow"><label className="lbl" htmlFor="nt-budget">Most you can spend</label>
                  <input id="nt-budget" className="in" type="number" min="0" placeholder="120000000"
                         value={f.budget} onChange={(e) => set("budget", e.target.value)} />
                  <div className="hint">In naira. Bids above this are rejected automatically.</div></div>
              </div>

              <div className="grid g2">
                <div className="frow"><label className="lbl" htmlFor="nt-deadline">Bids close on</label>
                  <input id="nt-deadline" className="in" type="date" min={new Date().toISOString().slice(0, 10)}
                         value={f.deadline} onChange={(e) => set("deadline", e.target.value)} />
                  <div className="hint">Vendors can bid until 5pm on this date. Nobody sees a price before then, including you.</div></div>

                <div className="frow"><label className="lbl" htmlFor="nt-type">Kind of tender</label>
                  <select id="nt-type" className="in" value={f.type} onChange={(e) => set("type", e.target.value)}>
                    <option value="RFQ">Request for quotation</option>
                    <option value="RFP">Request for proposal</option>
                    <option value="RFI">Request for information</option>
                    {/* A reverse auction is no longer a kind of tender. It is
                        its own event with its own room, clock and lots — see
                        /api/auctions/. Leaving the option here would have let
                        somebody pick it and get an RFQ, because that is what
                        the tender endpoint now coerces an unknown type to. */}
                  </select>
                  <div className="hint">{TYPE_HINT[f.type]}</div></div>
              </div>

              {isAuction && (
                <div className="frow"><label className="lbl" htmlFor="nt-decrement">Minimum decrement</label>
                  <input id="nt-decrement" className="in" type="number" min="0" placeholder="e.g. 500000"
                         value={f.minDecrement} onChange={(e) => set("minDecrement", e.target.value)} />
                  <div className="hint">
                    How much each new bid must undercut that bidder's own previous price by. The budget acts
                    as the opening ceiling, bidders see their live rank but never a competitor's price, and a
                    bid in the last two minutes extends the close.
                  </div></div>
              )}

              <div className="frow" style={{ marginBottom: 0 }}>
                <label className="lbl" htmlFor="nt-scope">Scope of work <span className="faint">optional, you can add it later</span></label>
                <textarea id="nt-scope" className="in" placeholder="What is being bought, at what service level, under which compliance rules…"
                          value={f.scope} onChange={(e) => set("scope", e.target.value)} />
                <button className="btn sm" style={{ marginTop: 8 }} onClick={draftScope} disabled={busy}>
                  {busy ? "Drafting…" : "Draft scope for me"}
                </button>
              </div>
            </div>
          </div>

          {!isAuction && (
            <div className="card" id="nt-weights">
              <div className="chead"><h3>How you will score the bids</h3>
                <button className="btn sm" style={{ marginLeft: "auto" }} onClick={suggestCriteria} disabled={busyC}>
                  {busyC ? "Suggesting…" : "Suggest criteria"}
                </button></div>
              <div className="cbody">
                <div className="wt">
                  {f.criteria.map((c, i) => (
                    <div className="wtrow" key={c.id}>
                      <input className="in wtname" aria-label={"Criterion " + (i + 1)} value={c.name}
                             onChange={(e) => set("criteria", f.criteria.map((x) => x.id === c.id ? { ...x, name: e.target.value } : x))} />
                      <span className="wtpc">{c.weight}%</span>
                      <button className="btn sm wtdel" aria-label={"Remove " + (c.name || "criterion " + (i + 1))}
                              disabled={f.criteria.length < 2}
                              onClick={() => {
                                const rest = f.criteria.filter((x) => x.id !== c.id);
                                const share = Math.floor(100 / rest.length);
                                set("criteria", rest.map((x, k) => ({ ...x, weight: k === 0 ? 100 - share * (rest.length - 1) : share })));
                              }}><Icon n="close" s={13} /></button>
                      <input className="wtrange" type="range" min="0" max="100" step="5" value={c.weight}
                             aria-label={(c.name || "Criterion " + (i + 1)) + " weight"}
                             onChange={(e) => rebalance(c.id, e.target.value)} />
                    </div>
                  ))}
                </div>
                <div className="wtsum"><Icon n="check" s={14} />These always add up to 100. Move one and the others adjust.</div>
                <button className="btn sm" style={{ marginTop: 12 }}
                        onClick={() => {
                          const share = Math.floor(100 / (f.criteria.length + 1));
                          const added = [...f.criteria, { id: uid(), name: "", weight: 0 }];
                          set("criteria", added.map((x, k) => ({ ...x, weight: k === 0 ? 100 - share * (added.length - 1) : share })));
                        }}>Add a criterion</button>

                <div className="frow" style={{ marginTop: 16, marginBottom: 0 }}>
                  <label className="lbl" htmlFor="nt-tw">Technical against commercial</label>
                  <input id="nt-tw" className="in" type="range" min="30" max="90" step="5"
                         value={f.techWeight} onChange={(e) => set("techWeight", e.target.value)} />
                  <div className="hint">{f.techWeight}% of the final score comes from the criteria above, {100 - f.techWeight}% from price.</div>
                </div>
              </div>
            </div>
          )}

          <InviteStep api={api} f={f} set={set} />

          {/* Everything a handful of tenders need and most do not. Still here,
              one click away, and no longer the first thing anybody reads. */}
          <details className="adv">
            <summary>
              <Icon n="chev" s={13} className="advcaret" />
              Advanced options
              <span className="advtag">
                {isAuction ? "savings baseline" : "two-stage opening, line items, savings baseline"}
              </span>
            </summary>
            <div className="cbody">
              {!isAuction && (
                <div className="frow">
                  <label className="checkline" htmlFor="nt-two">
                    <input id="nt-two" type="checkbox" checked={f.twoStage}
                           onChange={(e) => set("twoStage", e.target.checked)} />
                    <span>
                      <b>Open technical envelopes first</b>
                      <span className="hint">
                        Only bidders scoring at least
                        <input className="in numin" type="number" min="0" max="100" aria-label="Technical threshold"
                               style={{ margin: "0 5px" }} value={f.techThreshold}
                               onClick={(e) => e.stopPropagation()}
                               onChange={(e) => set("techThreshold", e.target.value)} />
                        out of 100 have their pricing decrypted. Everyone else has their commercial
                        envelope returned unopened. Standard in public-sector procurement.
                      </span>
                    </span>
                  </label>
                </div>
              )}

              <div className="grid g2">
                <div className="frow"><label className="lbl" htmlFor="nt-proj">
                  Projected cost <span className="faint">optional</span></label>
                  <input id="nt-proj" className="in" type="number" min="0" placeholder="e.g. 108000000"
                         value={f.projectedCost} onChange={(e) => set("projectedCost", e.target.value)} />
                  <div className="hint">
                    What you actually expect this to land at, as opposed to the ceiling it must not cross.
                    The evaluation panel is judged against this figure.
                  </div></div>

                <div className="frow"><label className="lbl" htmlFor="nt-base">
                  What we pay now <span className="faint">optional</span></label>
                  <input id="nt-base" className="in" type="number" min="0" placeholder="e.g. 505000000"
                         value={f.baseline} onChange={(e) => set("baseline", e.target.value)} />
                  <div className="hint">
                    Last year's contract, the incumbent's renewal quote, or the current price. With it, the
                    saving is measured against what the business actually pays rather than against the ceiling.
                  </div>
                  <BaselineHint api={api} category={f.category} current={f.baseline}
                                onAdopt={(amount, source) => {
                                  set("baseline", String(amount));
                                  set("baselineSource", source);
                                }} /></div>
              </div>

              <div className="frow"><label className="lbl" htmlFor="nt-basesrc">Where that figure comes from</label>
                <input id="nt-basesrc" className="in" placeholder="e.g. 2025 contract with Harmattan Foods, annualised"
                       value={f.baselineSource} disabled={!Number(f.baseline)}
                       onChange={(e) => set("baselineSource", e.target.value)} />
                <div className="hint">Recorded with the saving, so anyone reviewing it can check the comparison.</div></div>

              {!isAuction && (
                <div className="frow" style={{ marginBottom: 0 }} id="nt-lines">
                  <label className="lbl">Priced line items <span className="faint">optional, leave empty for a lump-sum bid</span></label>
                  {f.lines.map((l, i) => (
                    <div key={l.id} className="lineedit">
                      <ItemPick line={l}
                                onPick={(it) => set("lines", f.lines.map((x) => x.id === l.id
                                  ? { ...x, itemCode: it ? it.code : "",
                                      desc: it && !x.desc.trim() ? it.label : x.desc,
                                      unit: it && it.uom ? it.uom.toLowerCase() : x.unit }
                                  : x))} />
                      <input className="in desc" placeholder="Line description" aria-label={"Line " + (i + 1)} value={l.desc}
                             onChange={(e) => set("lines", f.lines.map((x) => x.id === l.id ? { ...x, desc: e.target.value } : x))} />
                      <input className="in" type="number" min="1" placeholder="Qty" aria-label="Quantity" value={l.qty}
                             onChange={(e) => set("lines", f.lines.map((x) => x.id === l.id ? { ...x, qty: e.target.value } : x))} />
                      <input className="in" placeholder="Unit" aria-label="Unit" value={l.unit}
                             onChange={(e) => set("lines", f.lines.map((x) => x.id === l.id ? { ...x, unit: e.target.value } : x))} />
                      <button className="btn sm" aria-label="Remove line"
                              onClick={() => set("lines", f.lines.filter((x) => x.id !== l.id))}><Icon n="close" s={13} /></button>
                    </div>
                  ))}
                  <button className="btn sm" style={{ marginTop: f.lines.length ? 8 : 0 }}
                          onClick={() => set("lines", [...f.lines, { id: uid(), desc: "", qty: "", unit: "unit", itemCode: "" }])}>
                    Add a line item</button>
                </div>
              )}
            </div>
          </details>
        </div>

        {/* What is still missing, and nothing else. */}
        <aside className={"ready" + (ready ? " done" : "")} aria-live="polite">
          <div className="readytop">
            <Illus n="draft" w={152} />
            <div className="readyhl">
              {ready ? "Ready to send"
                     : outstanding.length === 1 ? "One thing left"
                     : outstanding.length + " things left"}
            </div>
            <div className="readywhy">
              {ready ? "Nothing is missing. No price is visible to anyone until bids close."
                     : "Pick any line to jump straight to that field."}
            </div>
            <div className="readybarrow">
              <div className="readybar"><i style={{ width: pct + "%" }} /></div>
              <span className="readypct">{shownPct}%</span>
            </div>
          </div>

          <ul className="readylist" ref={listRef}>
            {ordered.map((c) => (
              <li key={c.key} data-flip={c.key} className={c.ok ? "ok" : "todo"}>
                <button type="button" tabIndex={c.ok ? -1 : 0}
                        onClick={() => { if (!c.ok) jump(c.to); }}>
                  <span className="readytick" aria-hidden="true"><Icon n="check" s={11} /></span>
                  <span>
                    {c.ok ? c.done : c.todo}
                    {!c.ok && c.note && <em>{c.note}</em>}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="readyfoot">
            <button className="btn pri" disabled={!ready} onClick={() => save(true)}>
              {needsApproval ? "Send for approval" : "Publish this tender"}
            </button>
            <button className="btn" disabled={!f.title.trim()} onClick={() => save(false)}>
              {editing ? "Save draft" : "Save as draft"}
            </button>
            <div className="readyroute">
              {!Number(f.budget) || !threshold
                ? "Drafts are private to you until you send them on."
                : needsApproval
                  ? `${fmtMoney(Number(f.budget))} is at or above the ${fmtMoney(threshold)} sign-off threshold, so this goes to an approver instead of publishing straight away.`
                  : `Below the ${fmtMoney(threshold)} sign-off threshold, so it publishes as soon as you press the button.`}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* One line each, in the words a buyer would use rather than the acronym. */
const TYPE_HINT = {
  RFQ: "Sealed quotations for something you can specify precisely.",
  RFP: "Sealed proposals, scored on approach as well as price.",
  RFI: "Information only. No award, no prices compared.",
  AUC: "Live price competition. Bidders see their rank, never a rival's price.",
};

const fmtDeadline = (d) => {
  if (!d) return "";
  const dt = new Date(d + "T17:00:00");
  return isNaN(dt) ? d : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

/* ============================================================ drafting
   The New tender screen: a form beside a panel that says what is still
   missing. Mobile first like everything else, so the panel is a block above
   the form on a phone and only becomes a sticky column beside it once there
   is a second column to be beside.
   ============================================================ */
export const DRAFT_CSS = `
.ntcols{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start}

/* ---- the readiness panel ---- */
.ready{background:var(--card);border:1px solid var(--line);border-radius:var(--radius-lg);
  overflow:hidden;box-shadow:var(--sh-2);transition:border-color var(--t) var(--ease)}
.ready.done{border-color:var(--green-2)}
.readytop{padding:15px 16px 13px;border-bottom:1px solid var(--line);
  transition:background var(--t) var(--ease),border-color var(--t) var(--ease)}
.ready.done .readytop{background:var(--green-tint);border-bottom-color:var(--green-2)}
.readyhl{font-size:15.5px;font-weight:680;letter-spacing:-.015em;line-height:1.25}
.ready.done .readyhl{color:var(--green)}
.readywhy{font-size:12.5px;color:var(--muted);margin-top:5px;line-height:1.45}
.readybar{height:5px;border-radius:99px;background:var(--line);margin-top:11px;overflow:hidden}
.readybar i{display:block;height:100%;border-radius:99px;background:var(--green-2);
  transition:width 620ms cubic-bezier(.16,1,.3,1)}

.readylist{list-style:none;margin:0;padding:8px}
.readylist li{margin:0}
.readylist button{width:100%;display:flex;gap:9px;align-items:flex-start;text-align:left;
  font:inherit;font-size:13px;line-height:1.4;color:var(--ink);cursor:pointer;
  background:transparent;border:0;border-radius:var(--r-sm);padding:8px 9px;
  transition:background var(--t) var(--ease)}
.readylist li.ok button{color:var(--muted);cursor:default}
.readylist em{display:block;font-style:normal;font-size:12px;color:var(--faint);margin-top:2px}
.readytick{width:18px;height:18px;border-radius:50%;flex-shrink:0;margin-top:0;
  display:inline-flex;align-items:center;justify-content:center;
  border:1.5px dashed var(--brass);color:transparent;
  transition:background var(--t) var(--ease),border-color var(--t) var(--ease),color var(--t) var(--ease)}
.readylist li.ok .readytick{background:var(--green-2);border:1.5px solid var(--green-2);color:var(--on-brand);
  animation:dk-tickpop 320ms cubic-bezier(.34,1.56,.64,1)}
@keyframes dk-tickpop{from{transform:scale(.4)}to{transform:scale(1)}}

.readyfoot{padding:12px 14px 14px;border-top:1px solid var(--line);
  display:flex;flex-direction:column;gap:8px}
.readyfoot .btn{width:100%;justify-content:center}
.readyroute{font-size:12px;color:var(--faint);line-height:1.45;text-align:center}

/* ---- the scene in the panel ----
   The seal is the reward, and it is a wax seal rather than confetti because
   that is what this product is about: illus.jsx says stationery, not generic
   SaaS celebration, and it is right. Nothing here fires until the draft is
   actually complete, so it stays a moment rather than a decoration.

   Durations and curves are DUR/EASE from motion.js, spelled out because CSS
   cannot import them: 620ms is DUR.ceremony, the overshoot is EASE.press and
   the settle is EASE.out. */
.ready .illus{max-width:152px;margin:0 auto 10px}
.il-seal{opacity:0}
.ready.done .il-seal{animation:dk-stamp 620ms cubic-bezier(.34,1.56,.64,1) both}
.il-shock{opacity:0;transform-origin:130px 103px}
.ready.done .il-shock{animation:dk-shock 620ms cubic-bezier(.16,1,.3,1) both}
/* the empty ring marches while something is still missing, and is replaced by
   the seal rather than sitting under it */
.il-spot{animation:dk-ants 2.4s linear infinite}
.ready.done .il-spot{display:none}
.il-pen{transform-origin:186px 96px;animation:dk-drift 5s ease-in-out infinite alternate}
.ready.done .il-sheet{animation:dk-lift 620ms cubic-bezier(.16,1,.3,1) both}

@keyframes dk-stamp{
  0%{opacity:0;transform:translateY(-28px) scale(2.4) rotate(-17deg)}
  58%{opacity:1}
  100%{opacity:1;transform:none}
}
@keyframes dk-shock{
  0%{opacity:0;transform:scale(1)}
  28%{opacity:.5}
  100%{opacity:0;transform:scale(2.9)}
}
@keyframes dk-ants{to{stroke-dashoffset:-40}}
@keyframes dk-drift{from{transform:none}to{transform:translateY(-3px) rotate(-1.5deg)}}
@keyframes dk-lift{to{transform:translateY(-3px)}}

/* the percentage rides beside the bar and counts rather than snapping */
.readybarrow{display:flex;align-items:center;gap:9px;margin-top:11px}
.readybarrow .readybar{flex:1;margin-top:0}
.readypct{font-family:var(--font-mono);font-size:10.5px;color:var(--faint);
  font-variant-numeric:tabular-nums;letter-spacing:.02em;flex-shrink:0}

/* the check widens into the chip instead of appearing and shoving the label */
.chipck{display:inline-flex;align-items:center;width:0;overflow:hidden;opacity:0;
  color:var(--green-2);transform:scale(.4);
  transition:width var(--t) cubic-bezier(.16,1,.3,1),opacity var(--t) var(--ease),
             transform 320ms cubic-bezier(.34,1.56,.64,1)}
.chiprow .chip.on .chipck{width:13px;opacity:1;transform:none}

/* A DISABLED BUTTON SAYS WHY. The rule the readiness panels follow, at the
   scale of a dialog with two fields: one line beside the button, present only
   while the button is dead. In a footer it takes the left and the buttons
   keep the right; in a form row it wraps underneath. */
.gatehint{font-size:12.5px;color:var(--faint);line-height:1.4;align-self:center}
.dfoot{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.dfoot .gatehint{margin-right:auto;text-align:left;flex:1 1 180px}
.gaterow{display:flex;align-items:center;gap:12px;flex-wrap:wrap}

/* the field a checklist line points at, when you arrive on it */
.jumped{animation:dk-jumped 620ms cubic-bezier(.16,1,.3,1)}
@keyframes dk-jumped{from{box-shadow:0 0 0 4px var(--brand-ring)}to{box-shadow:0 0 0 12px transparent}}

/* ---- self-balancing criteria weights ---- */
.wt{display:flex;flex-direction:column;gap:14px}
.wtrow{display:grid;grid-template-columns:minmax(0,1fr) 48px 34px;gap:6px 9px;align-items:center}
.wtname{min-width:0}
.wtpc{font-variant-numeric:tabular-nums;font-weight:700;font-size:14px;text-align:right;color:var(--green)}
.wtdel{padding:7px 0;display:inline-flex;align-items:center;justify-content:center}
.wtrange{grid-column:1/-1;width:100%;margin:0;accent-color:var(--green-2);height:20px}
.wtsum{display:flex;align-items:center;gap:7px;margin-top:13px;
  font-size:12.5px;color:var(--green);background:var(--green-tint);
  border-radius:var(--r-sm);padding:8px 11px}

/* ---- advanced options ---- */
.adv{background:var(--card);border:1px solid var(--line);border-radius:var(--radius-lg);
  margin-bottom:14px;box-shadow:var(--sh-2)}
.adv summary{cursor:pointer;padding:14px 16px;font-weight:600;font-size:14px;
  display:flex;align-items:center;gap:9px;list-style:none;
  transition:background var(--t) var(--ease)}
.adv summary::-webkit-details-marker{display:none}
.advcaret{color:var(--faint);flex-shrink:0;transition:transform var(--t) var(--ease)}
.adv[open] summary .advcaret{transform:rotate(90deg)}
.advtag{margin-left:auto;font-size:12px;color:var(--faint);font-weight:400;text-align:right}
.adv .cbody{border-top:1px solid var(--line)}

/* ---- the vendor picker ---- */
/* The register is 1,400 companies and the tender needs six of them. The scope
   control is the shortlist: category first, then the family it sits in, then
   everything, with the count on each so you can see before you click whether
   there is anything there. */
.pickbar{display:flex;flex-wrap:wrap;gap:9px;align-items:center;margin-bottom:12px}
.scoper{display:inline-flex;background:var(--sunk);border:1px solid var(--line);
  border-radius:var(--r-sm);padding:2px;gap:2px;max-width:100%;overflow:auto}
.scopeb{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;border:0;
  background:transparent;color:var(--muted);font:inherit;font-size:12.5px;font-weight:600;
  padding:6px 11px;border-radius:calc(var(--r-sm) - 2px);cursor:pointer;
  transition:background var(--t) var(--ease),color var(--t) var(--ease)}
.scopeb:hover:not(:disabled){color:var(--fg)}
.scopeb.on{background:var(--card);color:var(--fg);box-shadow:var(--sh-2)}
.scopeb:disabled{opacity:.45;cursor:not-allowed}
.scopeb small{font-family:var(--font-mono);font-size:10.5px;font-weight:400;color:var(--faint);
  font-variant-numeric:tabular-nums}
.scopeb.on small{color:var(--muted)}
.picksearch{flex:1 1 200px;min-width:0;margin:0}
.picklbl{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);
  font-weight:600;margin-bottom:7px}
.pickadd{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:16px;
  padding-top:14px;border-top:1px dashed var(--line)}
.pickadd .hint{flex:1 1 220px}

/* ---- vendor chips ---- */
.chiprow{display:flex;flex-wrap:wrap;gap:7px}
.chiprow .chip{cursor:pointer;text-align:left;gap:6px;
  transition:background var(--t) var(--ease),border-color var(--t) var(--ease),color var(--t) var(--ease)}
.chiprow .chip small{color:var(--faint);font-size:11px;font-weight:400}
.chiprow .chip.on{background:var(--green-tint);border-color:var(--green-2);color:var(--green);font-weight:600}
.chiprow .chip.on small{color:var(--green);opacity:.8}

/* a checkbox whose label is a sentence and a paragraph, not a word */
.checkline{display:flex;gap:9px;align-items:flex-start;font-size:13.5px;line-height:1.55;cursor:pointer}
.checkline input[type=checkbox]{margin-top:3px;flex-shrink:0}
.checkline b{font-weight:600}
.checkline .hint{margin-top:3px}

/* the same panel inside the vendor's bid form, where it is a block in the
   flow rather than a column: the form is already narrow and there is nothing
   to sit beside */
.bidready{margin:4px 0 14px;box-shadow:none}
.bidready .readylist{padding:6px}

@media(min-width:${BP.desk}px){
  .ntcols{grid-template-columns:minmax(0,1fr) 304px}
  /* sticky under the app bar, so the list of what is missing stays on screen
     while you scroll the form it is describing */
  .ready{position:sticky;top:16px}
}
@media(max-width:${BP.desk - 1}px){
  /* on a phone the panel leads: what is missing is the reason you are here */
  .ready{order:-1}
  .ntcols > aside{order:-1}
}
@media(prefers-reduced-motion:reduce){
  .readybar i,.readytick,.jumped,.chipck{transition:none;animation:none}
  .il-seal,.il-shock,.il-spot,.il-pen,.il-sheet{animation:none}
  /* the seal is the state, not the flourish: with motion off it is simply
     there once the draft is complete, and absent before */
  .il-seal{opacity:0}
  .ready.done .il-seal{opacity:1}
  .ready.done .il-spot{display:none}
}
`;

/* ---------------- suppliers ---------------- */

/* The vendor register.

   Five tabs, and the split is by JOB rather than by data. The old page was one
   scroll holding four unrelated tasks at equal weight: a review queue nobody
   sees for weeks at a time, a 1,400-row register somebody searches daily, the
   import tools used twice a year — and, buried inside the import disclosure
   for no reason anybody could reconstruct, the location filter for the list
   two cards above it.

     Register    the everyday job: find a company, open it, verify it
     Review      registrations waiting on a decision. Carries its own count
     Compliance  the paperwork, by expiry. The tab that exists because a
                 lapsed tax clearance is invisible until it disqualifies a bid
     Coverage    the register's shape: which categories could actually run a
                 competitive tender, and which have one verified vendor
     Add         invite one, invite the register, import, replace

   COVERAGE IS THE ONE WORTH ARGUING FOR. Everything else here reports what is
   on the register; that tab reports what is MISSING from it, which is the
   question procurement actually gets asked after an award goes to the only
   company that could bid. Three verified vendors is the line — below it a
   category cannot hold a competition, and the page says so before the tender
   is drafted rather than after it is awarded.

   The strip above the tabs is always visible and every figure filters the
   register, so a count is never a dead end. */
export function SuppliersPage({ api }) {
  const { state, user, act, toast } = api;
  const canImport = can(user, "supplier.import");
  const canPrequalify = can(user, "supplier.prequalify");
  const canInvite = can(user, "supplier.invite");
  const canRegister = can(user, "supplier.register");
  const canSuspend = can(user, "supplier.suspend");

  const [preS, setPreS] = useState(null);          // vendor queued for approval
  const [declineS, setDeclineS] = useState(null);  // vendor queued for decline
  const [reason, setReason] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [regOpen, setRegOpen] = useState(false);   // the register upload
  const [campaign, setCampaign] = useState(false); // the registration drive
  const [registerOpen, setRegisterOpen] = useState(false);
  const [suspending, setSuspending] = useState(null);
  const [email, setEmail] = useState("");

  const prequalify = (s) => setPreS(s);
  const decline = (s) => { setReason(""); setDeclineS(s); };
  const inviteVendor = () => { setEmail(""); setInviteOpen(true); };
  const complianceDocs = (sid) => (state.documents || []).filter((x) => x.kind === "supplier" && x.supplierId === sid);

  const all = state.suppliers;
  const queue = all.filter((s) => !s.prequalified && s.registeredAt && !s.rejectedReason);

  const [sq, setSq] = useState("");
  const [vstate, setVstate] = useState("");   // "" | unverified | verified | rejected | suspended
  const [cat, setCat] = useState("");
  const [loc, setLoc] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [tab, setTab] = useState("register");

  /* The full register record (contact, address, payment terms, TIN, bank) is
     not in the bootstrap payload: 1,400 of them would be a megabyte refetched
     after every action. It is fetched when a vendor is opened. */
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    if (!openId) { setDetail(null); return undefined; }
    let live = true;
    raw("/suppliers/" + openId + "/").then((d) => { if (live) setDetail(d); }).catch(() => {});
    return () => { live = false; };
  }, [openId]);

  const tally = (key) => {
    const m = new Map();
    for (const s of all) {
      const v = s[key] || "";
      if (v) m.set(v, (m.get(v) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const categories = tally("category");
  const locations = tally("location");

  /* ---- the paperwork, counted once and read by two tabs ---------------- */
  const paper = React.useMemo(() => {
    const expired = [], lapsing = [], bare = [];
    for (const s of all) {
      const docs = s.docs || [];
      const dated = docs.filter((d) => d.expiry);
      if (!docs.length) { bare.push(s); continue; }
      const worst = dated.length ? Math.min(...dated.map((d) => daysLeft(d.expiry))) : null;
      if (worst == null) continue;
      if (worst < 0) expired.push({ s, days: worst, docs: dated });
      else if (worst <= 60) lapsing.push({ s, days: worst, docs: dated });
    }
    expired.sort((a, b) => a.days - b.days);
    lapsing.sort((a, b) => a.days - b.days);
    return { expired, lapsing, bare };
  }, [all]);

  /* ---- coverage: can this category hold a competition at all? ---------- */
  const THIN = 3;
  const coverage = React.useMemo(() => {
    const m = new Map();
    for (const s of all) {
      const c = s.category || "Uncategorised";
      const row = m.get(c) || { cat: c, total: 0, verified: 0, suspended: 0 };
      row.total += 1;
      if (s.suspended) row.suspended += 1;
      else if (s.prequalified) row.verified += 1;
      m.set(c, row);
    }
    return [...m.values()].sort((a, b) => a.verified - b.verified || b.total - a.total);
  }, [all]);
  const thin = coverage.filter((c) => c.verified < THIN);

  const counts = {
    all: all.length,
    verified: all.filter((s) => s.prequalified && !s.suspended).length,
    unverified: all.filter((s) => !s.prequalified && !s.suspended && !s.rejectedReason).length,
    suspended: all.filter((s) => s.suspended).length,
    paperwork: paper.expired.length + paper.lapsing.length,
  };

  const visible = all.filter((s) => {
    if (vstate && verifyStatusOf(s) !== vstate) return false;
    if (cat && s.category !== cat) return false;
    if (loc && s.location !== loc) return false;
    if (!sq.trim()) return true;
    const n = sq.trim().toLowerCase();
    return [s.name, s.category, s.location, s.code].some((x) => (x || "").toLowerCase().includes(n));
  });
  useEffect(() => { setShown(PAGE); }, [sq, cat, loc, vstate]);
  const page = visible.slice(0, shown);
  const filtered = visible.length !== all.length;

  /* Jump to the register with one filter applied. Every figure in the strip
     goes through here, so a number on this page is never a dead end. */
  const show = (patch) => {
    setTab("register");
    setVstate(patch.vstate ?? "");
    setCat(patch.cat ?? "");
    setLoc(patch.loc ?? "");
    setSq("");
  };
  const clearFilters = () => { setSq(""); setVstate(""); setCat(""); setLoc(""); };

  const TABS = [
    ["register", "Register", all.length],
    ...(canPrequalify ? [["review", "Review", queue.length]] : []),
    ["paper", "Compliance", counts.paperwork],
    ["coverage", "Coverage", thin.length],
    ...(canImport || canInvite ? [["add", "Add vendors", 0]] : []),
  ];

  /* The side panel follows the tab. One panel that said the same thing on
     every tab would be furniture; this one is the tab's own summary and its
     own way in. */
  const guide = (() => {
    if (tab === "review") {
      return (
        <Guide art={queue.length ? "draft" : "clear"} tone={queue.length ? undefined : "good"}
               headline={queue.length
                 ? `${queue.length} waiting on you`
                 : "Nothing waiting for review"}
               why={queue.length
                 ? "Each one registered themselves and uploaded what they had. Verification gates prequalification, not participation — an unverified vendor can still be invited and can still bid."
                 : "Registrations appear here the moment a vendor completes the form."}
               items={queue.slice(0, 6).map((s) => ({
                 key: s.id, label: s.name, note: `${s.category} · ${s.location}`,
                 onPick: () => document.getElementById("vq-" + s.id)?.scrollIntoView({ behavior: "smooth", block: "center" }),
               }))} />
      );
    }
    if (tab === "paper") {
      return (
        <Guide art={counts.paperwork ? "draft" : "clear"} tone={counts.paperwork ? undefined : "good"}
               headline={paper.expired.length
                 ? `${paper.expired.length} expired`
                 : counts.paperwork ? `${paper.lapsing.length} lapsing` : "Nothing lapsing"}
               why="A tax clearance that expired last month is invisible until it disqualifies a bid. This is the list that stops that happening."
               items={paper.expired.slice(0, 6).map(({ s, days }) => ({
                 key: s.id, label: s.name, note: `${Math.abs(days)} days ago`,
                 onPick: () => setOpenId(s.id),
               }))} />
      );
    }
    if (tab === "coverage") {
      return (
        <Guide art={thin.length ? "search" : "clear"} tone={thin.length ? undefined : "good"}
               headline={thin.length
                 ? `${thin.length} ${thin.length === 1 ? "category" : "categories"} too thin`
                 : "Every category can compete"}
               why={`Fewer than ${THIN} verified vendors and a category cannot hold a real competition. Better to find that out before the tender is drafted than after it is awarded to the only company that could bid.`}
               items={thin.slice(0, 6).map((c) => ({
                 key: c.cat, label: c.cat,
                 note: `${c.verified} verified of ${c.total}`,
                 onPick: () => show({ cat: c.cat }),
               }))} />
      );
    }
    if (tab === "add") {
      return (
        <Guide art="tray" headline="Bringing vendors in"
               why="Four ways, and they are not interchangeable. Registering somebody yourself puts them on the register unverified straight away; inviting them asks them to do it, which gets you their documents."
               action={canRegister && (
                 <button className="btn pri" onClick={() => setRegisterOpen(true)}>
                   <Icon n="plus" /> Register a vendor
                 </button>
               )} />
      );
    }
    return (
      <Guide art="tray"
             headline={filtered
               ? `${visible.length.toLocaleString()} of ${all.length.toLocaleString()} vendors`
               : `${all.length.toLocaleString()} vendors on the register`}
             why="An unverified vendor can still be invited and can still bid. Verification gates prequalification, not participation."
             action={canRegister && (
               <button className="btn pri" onClick={() => setRegisterOpen(true)}>
                 <Icon n="plus" /> Register a vendor
               </button>
             )}>
        <input className="in" placeholder="Search by name or vendor code"
               aria-label="Search suppliers" value={sq} onChange={(e) => setSq(e.target.value)} />
        <select className="in" aria-label="Filter by category" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Every category</option>
          {categories.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
        </select>
        <select className="in" aria-label="Filter by verification status" value={vstate}
                onChange={(e) => setVstate(e.target.value)}>
          <option value="">Any verification status</option>
          {Object.entries(VERIFY_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {/* The location filter used to live inside the import disclosure, two
            cards below the list it filters. It belongs here. */}
        <select className="in" aria-label="Filter by location" value={loc} onChange={(e) => setLoc(e.target.value)}>
          <option value="">Everywhere</option>
          {locations.map(([l, n]) => <option key={l} value={l}>{l} ({n})</option>)}
        </select>
        {filtered && <button className="btn sm" onClick={clearFilters}>Clear filters</button>}
      </Guide>
    );
  })();

  return (
    <Page guide={guide}>
      {preS && (
        <ConfirmDialog title={`Prequalify ${preS.name}?`} confirmLabel="Prequalify" onClose={() => setPreS(null)}
                       onConfirm={async () => {
                         if (await act.prequalDecision(preS.id, true)) toast.ok(`${preS.name} prequalified`, "They are now eligible for invitations, and they have been notified.");
                       }}>
          They become eligible for tender invitations without a waiver, and the decision is recorded in the
          audit trail under your name. Check their compliance documents first if you haven&rsquo;t.
        </ConfirmDialog>
      )}
      {declineS && (
        <Dialog title={`Decline ${declineS.name}`} onClose={() => setDeclineS(null)} footer={
          <>
            {!reason.trim() && <span className="hint gatehint">Give the reason first. The vendor reads it word for word.</span>}
            <button className="btn" onClick={() => setDeclineS(null)}>Cancel</button>
            <button className="btn wax" disabled={!reason.trim()}
                    onClick={async () => {
                      const s = declineS;
                      setDeclineS(null);
                      if (await act.prequalDecision(s.id, false, reason.trim())) {
                        toast.ok(`${s.name} declined`, "The reason has been sent to the vendor and recorded in the audit trail.");
                      }
                    }}>Decline &amp; send the reason</button>
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
            {!email.includes("@") && <span className="hint gatehint">Enter their email address to send.</span>}
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
      {suspending && <SuspendDialog api={api} supplier={suspending} onClose={() => setSuspending(null)} />}
      {registerOpen && <RegisterVendorDialog api={api} onClose={() => setRegisterOpen(false)} />}
      {campaign && <CampaignDialog api={api} onClose={() => setCampaign(false)} />}

      <div className="pagehead">
        <h1>Vendors</h1>
        <span className="sub">Every company that can be invited to bid.</span>
      </div>

      {/* The shape of the register, always visible. Every figure filters. */}
      <Figures>
        <Quiet n={counts.all.toLocaleString()} label="on the register" onClick={() => show({})} />
        <Quiet n={counts.verified.toLocaleString()} label="verified"
               onClick={() => show({ vstate: "verified" })} />
        <Quiet n={counts.unverified.toLocaleString()} label="unverified"
               onClick={() => show({ vstate: "unverified" })} />
        {counts.suspended > 0 && (
          <Quiet n={counts.suspended.toLocaleString()} label="suspended" tone="var(--wax)"
                 onClick={() => show({ vstate: "suspended" })} />
        )}
        {counts.paperwork > 0 && (
          <Quiet n={counts.paperwork.toLocaleString()} label="papers lapsing" tone="var(--brass)"
                 onClick={() => setTab("paper")} />
        )}
      </Figures>

      <div className="tabs" role="tablist">
        {TABS.map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={tab === k}
                  className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>
            {label}{n > 0 && k !== "register" ? ` (${n})` : ""}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------- register */}
      {tab === "register" && (
        <div className="card">
          <Rows empty={<Empty art="search">Nothing on the register matches that. Clear the search or a filter to see everyone.</Empty>}>
            {page.map((s) => {
              const r = REG_STATUS[regStatusOf(s)];
              const v = VERIFY_STATUS[verifyStatusOf(s)];
              const lapsing = (s.docs || []).filter((d) => d.expiry && daysLeft(d.expiry) <= 60);
              return (
                <Row key={s.id} onOpen={() => setOpenId(s.id)} title={s.name}
                     meta={<>
                       {s.code && <span className="mono">{s.code}</span>}
                       <span>{s.category}</span>
                       {s.location && <span>{s.location}</span>}
                       {s.perf.onTime != null && <span>{s.perf.onTime}% on time</span>}
                       {s.perf.quality != null && <span>{s.perf.quality}% quality</span>}
                     </>}
                     right={<>
                       {lapsing.map((d, i) => (
                         <span key={i} className={"chip " + (daysLeft(d.expiry) < 0 ? "wax" : "warn")} title={d.name}>
                           {d.name} · {daysLeft(d.expiry) < 0 ? "expired" : daysLeft(d.expiry) + "d left"}
                         </span>
                       ))}
                       {r && regStatusOf(s) !== "registered" && <span className={"chip " + r.tone}>{r.label}</span>}
                       <span className={"chip " + (v ? v.tone : "")}
                             title={s.suspended ? s.suspendedReason : s.rejectedReason || undefined}>
                         {v ? v.label : verifyStatusOf(s)}
                       </span>
                       {canPrequalify && !s.prequalified && !s.suspended && (
                         <button className="btn sm" onClick={() => prequalify(s)}>Verify</button>
                       )}
                       {canSuspend && (s.suspended || s.prequalified) && (
                         <button className="btn sm" onClick={() => setSuspending(s)}>{s.suspended ? "Reinstate" : "Suspend"}</button>
                       )}
                     </>} />
              );
            })}
          </Rows>
          {visible.length > page.length && (
            <div className="cbody" style={{ display: "flex", alignItems: "center", gap: 12, borderTop: "1px solid var(--hair)" }}>
              <span className="hint" style={{ marginTop: 0 }}>
                Showing {page.length.toLocaleString()} of {visible.length.toLocaleString()}
              </span>
              <button className="btn sm" onClick={() => setShown(shown + PAGE)}>Show {PAGE} more</button>
              <button className="btn sm" onClick={() => setShown(visible.length)}>Show all {visible.length.toLocaleString()}</button>
            </div>
          )}
        </div>
      )}

      {/* --------------------------------------------------------- review */}
      {tab === "review" && (
        <div className="card">
          <Rows empty={<Empty art="clear">Nothing is waiting for review. Registrations appear here as they arrive.</Empty>}>
            {queue.map((s) => {
              const docs = complianceDocs(s.id);
              return (
                <Row key={s.id} title={s.name} tone="brass"
                     meta={<><span>{s.category}</span><span>{s.location}</span><span>{s.contactEmail}</span></>}
                     right={<>
                       <button className="btn sm pri" onClick={() => prequalify(s)}>Prequalify</button>
                       <button className="btn sm" onClick={() => decline(s)}>Decline</button>
                     </>}>
                  <div id={"vq-" + s.id} className="lrmeta" style={{ marginTop: 6 }}>
                    {docs.map((x) => (
                      <button key={x.id} className="doclink" onClick={() => downloadDoc(x.id, x.name)}>
                        <Icon n="file" s={12} />{x.name}
                      </button>
                    ))}
                    {docs.length === 0 && <span className="faint">No compliance documents uploaded yet.</span>}
                    {s.rejectedReason && <span className="faint">Previously declined: {s.rejectedReason}</span>}
                  </div>
                </Row>
              );
            })}
          </Rows>
        </div>
      )}

      {/* ----------------------------------------------------- compliance */}
      {tab === "paper" && (
        <>
          {paper.expired.length > 0 && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="chead"><h3>Expired</h3>
                <span className="hint" style={{ marginLeft: "auto", marginTop: 0 }}>
                  {paper.expired.length} vendor{paper.expired.length === 1 ? "" : "s"}
                </span></div>
              <Rows>
                {paper.expired.map(({ s, days, docs }) => (
                  <Row key={s.id} onOpen={() => setOpenId(s.id)} title={s.name} tone="wax"
                       meta={<><span>{s.category}</span>
                         <span>{Math.abs(days)} days ago</span>
                         {s.contactEmail && <span className="mono">{s.contactEmail}</span>}</>}
                       right={docs.filter((d) => daysLeft(d.expiry) < 0).map((d, i) => (
                         <span key={i} className="chip wax">{d.name}</span>
                       ))} />
                ))}
              </Rows>
            </div>
          )}
          {paper.lapsing.length > 0 && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="chead"><h3>Lapsing within 60 days</h3>
                <span className="hint" style={{ marginLeft: "auto", marginTop: 0 }}>
                  {paper.lapsing.length} vendor{paper.lapsing.length === 1 ? "" : "s"}
                </span></div>
              <Rows>
                {paper.lapsing.map(({ s, days, docs }) => (
                  <Row key={s.id} onOpen={() => setOpenId(s.id)} title={s.name}
                       meta={<><span>{s.category}</span><span>in {days} days</span></>}
                       right={docs.filter((d) => daysLeft(d.expiry) <= 60).map((d, i) => (
                         <span key={i} className="chip warn">{d.name} · {daysLeft(d.expiry)}d</span>
                       ))} />
                ))}
              </Rows>
            </div>
          )}
          {paper.bare.length > 0 && (
            <More title={`${paper.bare.length} vendors with no documents at all`}
                  summary="nothing uploaded, so nothing to expire">
              <div className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
                Mostly vendors loaded from a register export rather than ones who registered
                themselves. They can still be invited and can still bid; they just have no
                paperwork on file to check.
              </div>
              <Rows>
                {paper.bare.slice(0, 40).map((s) => (
                  <Row key={s.id} onOpen={() => setOpenId(s.id)} title={s.name}
                       meta={<><span>{s.category}</span>{s.location && <span>{s.location}</span>}</>} />
                ))}
              </Rows>
              {paper.bare.length > 40 && (
                <div className="hint">and {paper.bare.length - 40} more</div>
              )}
            </More>
          )}
          {counts.paperwork === 0 && paper.bare.length === 0 && (
            <div className="card"><Empty art="clear">Every document on file is in date.</Empty></div>
          )}
        </>
      )}

      {/* ------------------------------------------------------- coverage */}
      {tab === "coverage" && (
        <div className="card">
          <div className="chead"><h3>Verified vendors per category</h3>
            <span className="hint" style={{ marginLeft: "auto", marginTop: 0 }}>
              fewer than {THIN} cannot hold a competition
            </span></div>
          <div className="cbody covwrap">
            {coverage.map((c) => {
              const pct = c.total ? Math.round((c.verified / c.total) * 100) : 0;
              return (
                <button type="button" className={"covrow" + (c.verified < THIN ? " thin" : "")}
                        key={c.cat} onClick={() => show({ cat: c.cat })}>
                  <span className="covname">{c.cat}</span>
                  <span className="covbar" aria-hidden="true">
                    <i style={{ width: Math.max(pct, c.verified ? 4 : 0) + "%" }} />
                  </span>
                  <span className="covn mono">
                    {c.verified}<span className="faint">/{c.total}</span>
                  </span>
                  {c.verified < THIN && <span className="chip warn">thin</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ add */}
      {tab === "add" && (
        <div className="card">
          <div className="cbody">
            <div className="addgrid">
              {canRegister && (
                <button className="addcard" onClick={() => setRegisterOpen(true)}>
                  <Icon n="plus" s={19} /><b>Register a vendor</b>
                  <i>You type them in. They land on the register unverified and can be invited straight away.</i>
                </button>
              )}
              {canInvite && (
                <button className="addcard" onClick={inviteVendor}>
                  <Icon n="mail" s={19} /><b>Invite one vendor</b>
                  <i>They register themselves and upload their own compliance documents.</i>
                </button>
              )}
              {canInvite && (
                <button className="addcard" onClick={() => setCampaign(true)}>
                  <Icon n="team" s={19} /><b>Invite the whole register</b>
                  <i>Everybody with an address who has not been asked yet. Batched, once each, previewed first.</i>
                </button>
              )}
              {canImport && (
                <label className="addcard">
                  <Icon n="upload" s={19} /><b>Add from CSV</b>
                  <i>Appends vendors. Columns: name, category, location, email, prequalified. Duplicates skipped.</i>
                  <input type="file" accept=".csv" hidden onChange={async (e) => {
                    const f = e.target.files[0];
                    if (f && await act.upload("/suppliers/import/", f)) {
                      toast.ok("Supplier book imported", "New vendors are on the register; duplicates and blank rows were skipped.");
                    }
                    e.target.value = "";
                  }} />
                </label>
              )}
              {canImport && (
                <button className="addcard" onClick={() => setRegOpen(true)}>
                  <Icon n="refresh" s={19} /><b>Replace the register</b>
                  <i>The full vendor master export. Shows what would change before it writes anything.</i>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {openId && <VendorRecord row={all.find((x) => x.id === openId)}
                               detail={detail} onClose={() => setOpenId(null)} />}
      {regOpen && <RegisterImport api={api} onClose={() => setRegOpen(false)} />}
    </Page>
  );
}

/** Upload the vendor master export and replace the register with it.

    Two steps on purpose. Picking the file shows what it would do — how many
    vendors, how many new, what would be deleted and what would be kept because
    a tender used it — and writes nothing. Only the second click applies it.
    Replacing 1,400 vendors should not be reachable by misclicking a file
    picker, and those numbers are the only way to notice you picked last year's
    export. Same decisions and guards as the command line: both go through
    core/vendor_sync.py. */
function RegisterImport({ api, onClose }) {
  const { act, toast, refresh } = api;
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shrinkOk, setShrinkOk] = useState(false);
  const [done, setDone] = useState(null);

  const send = async (f, extra) => {
    setBusy(true);
    setError("");
    try {
      return await act.importRegister(f, extra);
    } catch (e) {
      setError(e.message || "That upload did not go through.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const pick = async (f) => {
    setFile(f);
    setPreview(null);
    setDone(null);
    setShrinkOk(false);
    const r = await send(f, {});
    if (r) {
      setPreview(r.preview);
      if (r.error) setError(r.error);
    }
  };

  const apply = async () => {
    const r = await send(file, { confirm: "1", ...(shrinkOk ? { shrinkOk: "1" } : {}) });
    if (!r) return;
    if (!r.applied) {
      setPreview(r.preview);
      setError(r.error || "Not applied.");
      return;
    }
    setDone(r.result);
    await refresh();
    toast.ok("Register updated",
             `${r.result.total.toLocaleString()} suppliers on the register: ` +
             `${r.result.created.toLocaleString()} added, ${r.result.refreshed.toLocaleString()} refreshed, ` +
             `${r.result.removed.toLocaleString()} removed.`);
  };

  const p = preview;
  const num = (n) => (n || 0).toLocaleString();
  const stat = (label, value, tone) => (
    <div style={{ flex: "1 1 96px" }}>
      <div className="mono" style={{ fontSize: 19, color: tone ? "var(--" + tone + ")" : "inherit" }}>{num(value)}</div>
      <div className="muted" style={{ fontSize: 11.5 }}>{label}</div>
    </div>
  );

  return (
    <Dialog title="Update the vendor register" onClose={onClose} wide footer={
      <>
        <button className="btn" onClick={onClose}>{done ? "Close" : "Cancel"}</button>
        {!done && p && !p.blocked && (
          <button className="btn pri" disabled={busy || (p.needsConfirm && !shrinkOk)} onClick={apply}>
            {busy ? "Working…" : `Replace the register with these ${num(p.vendors)} vendors`}
          </button>
        )}
      </>
    }>
      {done ? (
        <div>
          <div style={{ marginBottom: 12 }}><span className="chip ok">Done</span></div>
          <p style={{ marginTop: 0 }}>
            The register now holds <b>{num(done.total)}</b> suppliers: {num(done.created)} added,
            {" "}{num(done.refreshed)} refreshed, {num(done.removed)} removed. It is recorded in the audit
            trail under your name.
          </p>
        </div>
      ) : (
        <>
          <p style={{ marginTop: 0, fontSize: 13.5 }}>
            Export the vendor master to JSON — one entry per sheet, each a list of rows — and pick it
            here. Nothing is written until you have seen what it would do.
          </p>
          <label className="btn" style={{ marginBottom: 12 }}>
            <Icon n="upload" /> {file ? "Pick a different file" : "Choose the register export"}
            <input type="file" accept=".json,application/json" hidden
                   onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; if (f) pick(f); }} />
          </label>
          {file && <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
            {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
          </div>}
          {busy && !p && <div className="muted" style={{ fontSize: 13 }}>Reading the register…</div>}
          {error && (
            <div className="notice" style={{ borderLeft: "3px solid var(--wax)", marginBottom: 12 }}>{error}</div>
          )}
          {p && (
            <>
              <div className="msec" style={{ padding: "6px 0 10px" }}>In the file</div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
                {stat("rows", p.rows)}
                {stat("vendors", p.vendors)}
                {stat("duplicates merged", p.merged)}
                {stat("prequalified", p.prequalified)}
                {stat("held out", p.heldOut)}
              </div>
              <div className="msec" style={{ padding: "6px 0 10px" }}>What it would change</div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
                {stat("new", p.new, "green")}
                {stat("refreshed in place", p.refresh)}
                {stat("deleted", p.willDelete, p.willDelete ? "wax" : null)}
                {stat("kept, still in use", p.keptBecauseUsed)}
                {stat("left alone", p.untouched)}
              </div>
              {p.willDelete > 0 && (
                <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                  Gone from the spreadsheet, so deleted here: {p.deleteNames.join(", ")}
                  {p.willDelete > p.deleteNames.length ? `, and ${num(p.willDelete - p.deleteNames.length)} more` : ""}.
                </div>
              )}
              {p.keptBecauseUsed > 0 && (
                <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                  Gone from the spreadsheet but kept, because a tender, bid or login still points at
                  them: {p.keptNames.join(", ")}.
                </div>
              )}
              {(p.uncategorised > 0 || p.noLocation > 0 || p.unparsedDates > 0) && (
                <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                  Gaps left as gaps rather than guessed: {p.uncategorised} with no category,
                  {" "}{p.noLocation} with no recognisable place, {p.unparsedDates} with an unreadable
                  registration date.
                </div>
              )}
              {p.needsConfirm && (
                <div className="notice" style={{ borderLeft: "3px solid var(--wax)", marginTop: 14 }}>
                  <b>Check this before continuing.</b> {p.needsConfirm}
                  <label className="checkline" style={{ marginTop: 8 }}>
                    <input type="checkbox" checked={shrinkOk} onChange={(e) => setShrinkOk(e.target.checked)} />
                    {" "}I have checked the file. Delete those {num(p.willDelete)} vendors.
                  </label>
                </div>
              )}
            </>
          )}
        </>
      )}
    </Dialog>
  );
}

/** The register record behind one vendor.

    Everything here comes from the vendor master: who to call, the agreed
    payment terms, the tax identity, and which bank account is on file. The
    account number is the last four digits only, on purpose. DOCKET awards
    tenders, it does not pay invoices, so a full account number has no reason to
    reach a browser, and 1,400 of them have no reason to sit in this database.
    See vendor_import.py. */
function VendorRecord({ row, detail, onClose }) {
  const d = detail || {};
  const reg = d.registry || {};
  /* label left, value right: the register is read by eye, one field at a time */
  const line = (label, value, mono) => (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 9 }}>
      <span className="lbl" style={{ flex: "0 0 118px", margin: 0 }}>{label}</span>
      <span className={mono ? "mono" : ""} style={{ fontSize: 13, minWidth: 0, wordBreak: "break-word" }}>
        {value || <span className="faint">not recorded</span>}
      </span>
    </div>
  );
  return (
    <Dialog title={row ? row.name : "Vendor"} onClose={onClose} wide
            footer={<button className="btn pri" onClick={onClose}>Close</button>}>
      {!detail && <div className="muted" style={{ fontSize: 13 }}>Reading the register…</div>}
      {detail && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {d.prequalified
              ? <span className="chip ok">Prequalified</span>
              : <span className="chip warn">Held out of tendering</span>}
            {d.code ? <span className="chip">{d.code}</span> : null}
            <span className="chip">{d.category}</span>
            {reg.source === "international" ? <span className="chip">International</span> : null}
          </div>
          {!d.prequalified && d.rejectedReason
            ? <div className="notice" style={{ borderLeft: "3px solid var(--wax)", marginBottom: 14 }}>{d.rejectedReason}</div>
            : null}
          <div className="grid g2">
            <div>
              <div className="msec" style={{ padding: "0 0 8px" }}>Who to call</div>
              {line("Contact", d.contactPerson)}
              {line("Email", d.contactEmail)}
              {line("Phone", d.phone, true)}
              {line("Address", d.address)}
            </div>
            <div>
              <div className="msec" style={{ padding: "0 0 8px" }}>Commercial</div>
              {line("Payment terms", d.paymentTerms)}
              {line("Register category", d.classification)}
              {line("TIN", reg.tin, true)}
              {line("Bank", reg.bankName)}
              {line("Account on file", reg.accountMasked, true)}
              {line("State payer ID", reg.statePayerId, true)}
            </div>
          </div>
          <div className="msec" style={{ padding: "14px 0 8px" }}>Paperwork the register records</div>
          {(d.docs || []).length === 0
            ? <div className="muted" style={{ fontSize: 12.5 }}>Nothing on file.</div>
            : (d.docs || []).map((x, i) => <span key={i} className="chip" style={{ marginRight: 6, marginBottom: 4 }}>{x.name}</span>)}
          {(reg.alsoRegisteredAs || []).length > 0
            ? <>
                <div className="msec" style={{ padding: "14px 0 8px" }}>Also registered as</div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {reg.alsoRegisteredAs.map((a) => a.name + (a.code ? " (" + a.code + ")" : "")).join(", ")}
                  . Merged into this record on import.
                </div>
              </>
            : null}
          <div className="muted" style={{ fontSize: 11.5, marginTop: 16 }}>
            Register reference {reg.regRef || "-"}
            {reg.regDateRaw ? ", registered " + reg.regDateRaw : ""}
            {reg.remarks ? ". Remarks: " + reg.remarks : ""}
          </div>
        </>
      )}
    </Dialog>
  );
}

/* Analytics moved to analytics.jsx when it grew from four cards into five
   tabs with its own arithmetic. Re-exported here so App.jsx and anything else
   importing it from this module keeps working. */
export { AnalyticsPage } from "./analytics";
import { OrgChart } from "./analytics";


/* ---------------- audit page ---------------- */

export function AuditPage({ api }) {
  const { state, go } = api;
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

  /* Patterns worth a second look. Findings, not accusations — so each one names
     the tender it came from and opens it, because the only honest thing a flag
     can do is take you to the evidence and let you judge. They stay on the page
     rather than in the guide: the guide is what you *do* here (verify, search,
     export), and a flag is something to read, not a task to tick off. */
  const flags = [];
  const awarded = state.tenders.filter((t) => t.status === "awarded");
  state.tenders.filter((t) => t.openedAt).forEach((t) => {
    if (state.bids.filter((b) => b.tenderId === t.id).length === 1) {
      flags.push({ key: "one-" + t.id, tenderId: t.id, title: "Only one bid was received",
                   why: `${t.ref} · ${t.title}` });
    }
  });
  const wins = {};
  awarded.forEach((t) => { wins[t.awardedTo] = (wins[t.awardedTo] || 0) + 1; });
  Object.entries(wins).forEach(([sid, n]) => {
    if (awarded.length >= 2 && n / awarded.length > 0.5) {
      const s = state.suppliers.find((x) => x.id === sid);
      flags.push({ key: "conc-" + sid, title: `${s ? s.name : sid} holds ${n} of ${awarded.length} awards`,
                   why: "One vendor winning most of what is let is worth a look." });
    }
  });
  awarded.forEach((t) => {
    if (t.budget && t.awardedAmount / t.budget > 0.97) {
      flags.push({ key: "ceil-" + t.id, tenderId: t.id,
                   title: `Awarded at ${((t.awardedAmount / t.budget) * 100).toFixed(1)}% of the ceiling`,
                   why: `${t.ref} · barely under the budget it was set` });
    }
  });

  /* Once the chain has been checked, that result *is* what the page is about,
     so it becomes the headline rather than a notice under the toolbar. */
  const checked = integrity && !integrity.busy;
  const total = state.events.length;
  const guide = (
    <Guide art="sealed" tone={checked ? (integrity.ok ? "good" : "bad") : undefined}
           headline={checked
             ? (integrity.ok ? "The chain holds" : "The chain has been broken")
             : `${total.toLocaleString()} ${total === 1 ? "entry" : "entries"} recorded`}
           why={checked
             ? (integrity.ok
                 ? `Every one of the ${integrity.count} entries is linked to the one before it. Rewriting any of them would break every hash that follows, and none are broken.`
                 : `Entry ${integrity.brokenAt ? "#" + integrity.brokenAt : "unknown"} does not match the hash before it, which means the recorded history has been altered. ${integrity.error || ""}`)
             : "Nothing here can be edited quietly: each entry carries a hash of the one before it. Check it yourself — the answer is arithmetic, not a promise."}
           action={
             <button className="btn pri" onClick={verify} disabled={!!integrity?.busy}>
               {integrity?.busy ? "Checking…" : checked ? "Check it again" : "Verify the chain"}
             </button>
           }>
      <input className="in" placeholder="Search the trail" aria-label="Search the audit trail"
             value={aq} onChange={(e) => setAq(e.target.value)} />
      <select className="in" aria-label="Filter by tender" value={f} onChange={(e) => setF(e.target.value)}>
        <option value="all">Every tender</option>
        {state.tenders.map((t) => <option key={t.id} value={t.id}>{t.ref}</option>)}
      </select>
      <button className="btn" onClick={() => downloadUrl("/export/audit.csv", "docket-audit-trail.csv")}>
        <Icon n="download" /> Export as CSV
      </button>
    </Guide>
  );

  return (
    <Page guide={guide}>
      <div className="pagehead">
        <h1>Audit trail</h1>
        <span className="sub">Every action, who did it and when. Each entry is chained to the one before, so nothing can be edited quietly.</span>
      </div>

      {flags.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="chead">
            <h3>Worth a second look</h3>
            <span className="hint" style={{ marginLeft: "auto", marginTop: 0 }}>patterns, not accusations</span>
          </div>
          <Rows>
            {flags.map((x) => (
              <Row key={x.key} tone="brass" title={x.title}
                   meta={<span>{x.why}</span>}
                   onOpen={x.tenderId ? () => go({ page: "tender", id: x.tenderId }) : undefined}
                   right={x.tenderId ? <button className="btn sm">Open it</button> : null} />
            ))}
          </Rows>
        </div>
      )}

      <div className="card">
        <Rows empty={<Empty art="search">
          {aq || f !== "all"
            ? "Nothing matches that. Clear the search or the tender filter to see the whole trail."
            : "Nothing has happened in this workspace yet. Every action anyone takes lands here."}
        </Empty>}>
          {rows.map((e) => {
            const t = state.tenders.find((x) => x.id === e.tenderId);
            return (
              <Row key={e.id} title={e.action}
                   tone={/seal/i.test(e.action) ? "wax" : undefined}
                   onOpen={t ? () => go({ page: "tender", id: t.id }) : undefined}
                   meta={<>
                     <span>{e.actor}</span>
                     {t && <span className="mono">{t.ref}</span>}
                     {e.detail && <span>{e.detail}</span>}
                   </>}
                   right={<span className="mono faint">{fmtDateTime(e.at)}</span>} />
            );
          })}
        </Rows>
      </div>
    </Page>
  );
}


export function TeamPage({ api }) {
  // `user` is read further down to decide whether the reporting lines are shown.
  // It was missing from this destructure, which threw a ReferenceError during
  // render and unmounted the whole application — a blank page, not a broken card.
  const { act, user } = api;
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

  /* The four built-ins plus whatever roles this workspace has invented — the
     server is the one that knows, so the list comes from it. */
  const ROLES = (team?.roles || []).map((r) => [r.value, r.label]);
  const members = team?.members || [];
  const invites = team?.invites || [];
  const guide = (
    <Guide art="desk"
           headline={members.length
             ? `${members.length} ${members.length === 1 ? "person" : "people"} in this workspace`
             : "Nobody here yet"}
           why={invites.length
             ? `${invites.length} ${invites.length === 1 ? "invitation is" : "invitations are"} waiting to be accepted.`
             : "Invite a colleague and they set their own password from a single-use link."}
           action={
             <div className="gaterow" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
               <input className="in" placeholder="Their work email" aria-label="Work email"
                      value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
               <select className="in" aria-label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                 {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
               </select>
               <button className="btn pri" onClick={invite} disabled={!f.email.trim()}>Send invitation</button>
               {!f.email.trim() && <span className="hint gatehint">Enter their work email to send.</span>}
               {msg && <div className="notice" style={{ borderLeft: "3px solid var(--wax)", margin: 0 }}>{msg}</div>}
               {link && (
                 <div className="notice" style={{ margin: 0 }}>
                   Demo mode: the invitation email prints to the server log, so here is the link to try the flow yourself:{" "}
                   <span className="mono" style={{ fontSize: 11, wordBreak: "break-all" }}>{link}</span>
                 </div>
               )}
             </div>
           } />
  );
  return (
    <Page guide={guide}>
      <div className="pagehead">
        <h1>Team</h1>
        <span className="sub">Who is here, and what each person can do.</span>
      </div>
      <div className="card">
        <Rows empty={<Empty art="desk">Nobody has been invited yet. Use the panel to bring the first person in.</Empty>}>
          {members.map((m) => (
            <Row key={m.username}
                 title={m.name}
                 meta={<>{m.title && <span>{m.title}</span>}<span>{m.email}</span></>}
                 right={<>
                   <span className="chip">{m.roleLabel || m.role}</span>
                   {!m.active
                     ? <span className="chip warn">disabled</span>
                     : m.custom ? <span className="chip" title="Permissions adjusted from the role defaults">adjusted</span> : null}
                 </>} />
          ))}
        </Rows>
        {invites.length > 0 && (
          <div className="cbody" style={{ borderTop: "1px solid var(--line)" }}>
            <div className="lbl" style={{ marginBottom: 6 }}>Invitations waiting to be accepted</div>
            {invites.map((i, k) => (
              <div key={k} className="docrow"><span>{i.email}</span><span className="chip">{i.roleLabel || i.role}</span><span className="mono faint">{fmtDate(i.at)}</span></div>
            ))}
          </div>
        )}
      </div>

      <More title="More about the invitation" summary="name, job title, and how permissions work">
        <div className="grid g2">
          <div className="frow"><label className="lbl">Name <span className="faint">optional</span></label>
            <input className="in" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <div className="hint">They can set it themselves when they accept.</div></div>
          <div className="frow"><label className="lbl">Job title <span className="faint">optional</span></label>
            <input className="in" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        </div>
        <div className="hint">
          Separation of duties is enforced by the server: evaluators cannot publish or award, approvers cannot
          score, auditors cannot change anything.
        </div>
      </More>

      <More title="Company record" summary="names, registered details, logo — what goes on letters and memos">
        <WorkspaceCard api={api} />
      </More>

      {can(user, "team.view") && (
        <>
          <More title="Reporting lines and signing authority"
                summary="whose work rolls up to whom, and who may commit what">
            <ReportingLines api={api} team={team} onReload={load} />
          </More>

          <More title="Delegation of authority"
                summary={(team?.levels || []).length
                  ? `${team.levels.length} level${team.levels.length === 1 ? "" : "s"}, lowest first`
                  : "not set up — one threshold applies"}>
            <AuthorityLadder api={api} team={team} onReload={load} />
          </More>
        </>
      )}
    </Page>
  );
}

/* The delegation-of-authority ladder.

   Editing it is a settings form and it is on the Team page anyway, because the
   ladder is only half a rule: the other half is which people stand on which
   rung, and that is two rows further down this same page. A workspace changing
   its authority limits almost always has to move somebody at the same time.

   Two refusals are worth the reader's attention because they are the ones the
   server also makes, in approvals.normalise:

     EXACTLY ONE RUNG IS UNLIMITED, and it is the top. Without it, a large
     enough request reaches the end of the ladder with nobody able to sign, and
     a tender that cannot be approved by anybody is a worse outcome than a
     tender approved by the wrong person.

     THE ORDER IS THE LIMITS, not the order the rows were typed. Rows are
     re-sorted on save, so a manager with a small limit cannot end up above a
     director with a large one because somebody added them last. */
function AuthorityLadder({ api, team, onReload }) {
  const { user, toast, refresh, state } = api;
  const editable = can(user, "settings.threshold");
  const saved = (team && team.levels) || state.org.approvalLevels || [];
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const current = rows || saved.map((l) => ({ ...l }));
  const dirty = rows !== null;
  const gaps = (team && team.levelGaps) || [];

  const edit = (id, patch) =>
    setRows(current.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const add = () =>
    setRows([...current, { id: "new" + uid(), name: "", limit: 0, role: "approver", holders: [] }]);
  const drop = (id) => setRows(current.filter((l) => l.id !== id));

  const unlimited = current.filter((l) => !Number(l.limit)).length;
  const unnamed = current.some((l) => !String(l.name || "").trim());
  const problem = !current.length ? null
    : unnamed ? "Give every level a name."
    : unlimited === 0 ? "One level must have unlimited authority, so a large enough request always has a signatory."
    : unlimited > 1 ? "Only the top level may be unlimited."
    : null;

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      await raw("/settings/", { method: "POST", body: {
        approvalLevels: current.map((l) => ({
          id: String(l.id).startsWith("new") ? undefined : l.id,
          name: String(l.name).trim(), limit: Number(l.limit) || 0,
          role: l.role || "", holders: l.holders || [],
        })),
      } });
      setRows(null);
      toast.ok("Delegation of authority saved",
               current.length ? `${current.length} level(s). Requests raised from now on follow the new ladder; anything already in a chain keeps the one it was raised under.`
                              : "The ladder was cleared; the single threshold applies again.");
      if (onReload) onReload();
      refresh();
    } catch (e) { setMsg(e.message || "Could not save."); }
    setBusy(false);
  };

  if (!editable) {
    return (
      <div className="hint" style={{ marginTop: 0 }}>
        {saved.length
          ? saved.map((l) => `${l.name} ${l.limit ? "up to " + fmtCompact(l.limit) : "unlimited"}`).join(" · ")
          : "This workspace uses a single sign-off threshold."}
        {" "}Only somebody who can set the approval matrix may change it.
      </div>
    );
  }

  return (
    <div>
      <div className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
        A request walks up the reporting line of whoever raised it, collecting a signature at
        every rung it passes, and stops at the first person whose limit covers the amount.
        Nobody signs their own request. A chain already under way keeps the ladder it was
        raised under — changing this never rewrites who was meant to sign something.
      </div>

      {gaps.length > 0 && !dirty && (
        <div className="notice" style={{ borderLeft: "3px solid var(--brass)" }}>
          Nobody currently holds <b>{gaps.join(", ")}</b>. Requests that reach {gaps.length === 1 ? "that level" : "those levels"} will
          have no named signatory. Put somebody on the rung under Reporting lines above.
        </div>
      )}

      {current.map((l, i) => (
        <div className="ladrow2" key={l.id}>
          <span className="sigdot">{i + 1}</span>
          <input className="in" placeholder="e.g. Head of Department" value={l.name}
                 aria-label={`Level ${i + 1} name`}
                 onChange={(e) => edit(l.id, { name: e.target.value })} />
          <div>
            <input className="in" type="number" min="0" step="1000000" placeholder="0 = unlimited"
                   aria-label={`Level ${i + 1} limit`} value={l.limit || ""}
                   onChange={(e) => edit(l.id, { limit: e.target.value })} />
            <span className="hint" style={{ marginTop: 2 }}>
              {Number(l.limit) > 0 ? "up to " + fmtMoney(Number(l.limit)) : "unlimited authority"}
            </span>
          </div>
          <button className="btn sm" aria-label={`Remove level ${i + 1}`} onClick={() => drop(l.id)}>
            <Icon n="close" s={13} />
          </button>
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
        <button className="btn sm" onClick={add} disabled={current.length >= 8}>
          <Icon n="plus" s={13} /> Add a level
        </button>
        {dirty && (
          <>
            <button className="btn pri sm" onClick={save} disabled={busy || !!problem}>
              {busy ? "Saving…" : "Save the ladder"}
            </button>
            <button className="btn sm" onClick={() => { setRows(null); setMsg(""); }}>Discard changes</button>
          </>
        )}
      </div>

      {problem && dirty && (
        <div className="notice" style={{ borderLeft: "3px solid var(--wax)", marginTop: 10 }}>{problem}</div>
      )}
      {msg && <div className="notice" style={{ borderLeft: "3px solid var(--wax)", marginTop: 10 }}>{msg}</div>}
      {!current.length && (
        <div className="hint" style={{ marginTop: 10 }}>
          With no levels, publication falls back to the single sign-off threshold on the
          Approvals page and any approver may sign.
        </div>
      )}
    </div>
  );
}


/* Who reports to whom.

   A separate concern from roles, and shown separately for that reason. A role
   says what somebody may do; a reporting line says whose work rolls up to them
   on their desk and in Analytics. The same person can hold the approver role
   and report to the chief executive, and neither fact implies the other.

   Changing a line is guarded server-side against cycles — see
   views.set_reporting_line — because a loop here is not a strange-looking chart,
   it is a rollup that never terminates. */
function ReportingLines({ api, team, onReload }) {
  const { state, user, act, toast, refresh } = api;
  const members = (team && team.members) || [];
  const editable = can(user, "team.org");
  const org = React.useMemo(() => orgIndex(state.users || []), [state.users]);
  const [busy, setBusy] = useState("");
  const levels = (team && team.levels) || state.org.approvalLevels || [];

  /* Signing authority is edited here, beside the reporting line, because the
     two only mean anything together: a rung decides how much somebody can
     commit, and the line decides whose requests reach them. Split across two
     pages, neither page could show you the consequence of a change. They are
     still two separate grants server-side, and two separate audit entries. */
  const changeLevel = async (personId, levelId) => {
    setBusy(personId);
    try {
      await setApprovalLevel(personId, levelId || null);
      const who = (state.users || []).find((u) => u.id === personId);
      const lvl = levels.find((l) => l.id === levelId);
      toast.ok("Signing authority updated",
               lvl ? `${who ? who.name : "They"} can now commit ${lvl.limit ? "up to " + fmtCompact(lvl.limit) : "any amount"} as ${lvl.name}.`
                   : `${who ? who.name : "They"} no longer hold signing authority.`);
      if (onReload) onReload();
      refresh();
    } catch (e) {
      toast.warn("That didn't go through", e.message || "");
    }
    setBusy("");
  };

  const change = async (personId, managerId) => {
    setBusy(personId);
    const ok = await act.setReportingLine(personId, managerId || null);
    if (ok) {
      const who = (state.users || []).find((u) => u.id === personId);
      const to = (state.users || []).find((u) => u.id === managerId);
      toast.ok("Reporting line updated",
               `${who ? who.name : "They"} now report${to ? "s to " + to.name : "s to nobody"}.`);
      refresh();
    }
    setBusy("");
  };

  if (!members.length) return null;

  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <div className="chead">
        <h3>Reporting lines</h3>
        <span className="mono faint" style={{ marginLeft: "auto" }}>
          {editable ? "who sees whose desk" : "read-only"}
        </span>
      </div>
      <div className="cbody">
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 14 }}>
          A manager with <b>See your reports' desks</b> can see the workload and savings of
          everyone below them here — directly or at any depth. This is separate from their
          role: it decides <i>whose</i> work they see, not <i>what</i> they may do.
        </div>

        <OrgChart users={state.users || []} org={org} me={user.id} />

        {editable && (
          <div className="orgedit">
            <div className="lbl" style={{ marginBottom: 8 }}>Change a reporting line</div>
            {members.map((m) => (
              <div className="orgeditrow" key={m.username}>
                <span className="oename">
                  <b>{m.name}</b>
                  <span className="muted">{m.title || m.roleLabel}</span>
                </span>
                <span className="oearrow">reports to</span>
                <select className="in" value={m.managerId || ""} disabled={busy === m.id}
                        aria-label={`Who ${m.name} reports to`}
                        onChange={(e) => change(m.id, e.target.value)}>
                  <option value="">— nobody (top of the chart) —</option>
                  {(state.users || [])
                    .filter((u) => u.id !== m.id)
                    .map((u) => <option key={u.id} value={u.id}>{u.name} · {u.title}</option>)}
                </select>
                {levels.length > 0 && (
                  <>
                    <span className="oearrow">and may sign as</span>
                    <select className="in" value={m.approvalLevel || ""} disabled={busy === m.id}
                            aria-label={`${m.name}'s signing authority`}
                            onChange={(e) => changeLevel(m.id, e.target.value)}>
                      <option value="">— no signing authority —</option>
                      {levels.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} · {l.limit ? "up to " + fmtCompact(l.limit) : "unlimited"}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            ))}
            <div className="muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.55 }}>
              A loop is refused: somebody cannot report to a person who already reports to
              them. Every change is recorded in the audit trail.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* THE REVERSE AUCTION MOVED OUT. useAuction, AuctionBoard and AuctionPage
   lived here and polled /tenders/<id>/auction/, which stopped existing when
   auctions stopped being tenders. They are auctions.jsx now, reading the
   /api/auctions/ tree that replaced it. git log has the old versions. */

function WorkspaceCard({ api }) {
  const { state, refresh, toast } = api;
  const [name, setName] = useState(state.org.name);
  const [short, setShort] = useState(state.org.short || "");
  const [profile, setProfile] = useState(state.org.profile || {});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const logoInput = useRef(null);

  const save = async () => {
    setMsg(""); setBusy(true);
    try {
      const r = await raw("/settings/", { method: "POST", body: { name, short, profile } });
      setMsg(`Saved. This workspace is now "${r.name}". New tender references will start with ${ (r.short || r.name).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) }-; existing references are unchanged.`);
      refresh();
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  const setLogo = async (file) => {
    if (!file) return;
    setMsg("");
    try {
      await uploadLogo(file);
      toast.ok("Logo set", "It replaces the DOCKET seal in the sidebar and the top bar.");
      refresh();
    } catch (e) { setMsg(e.message || "Could not upload that image."); }
  };
  const dropLogo = async () => {
    try {
      await clearLogo();
      toast.ok("Logo removed", "The workspace shows your initials again.");
      refresh();
    } catch (e) { setMsg(e.message || "Could not remove the logo."); }
  };

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="chead"><h3>Company</h3>
        <span className="mono faint" style={{ marginLeft: "auto" }}>on invitations, letters and memos</span></div>
      <div className="cbody">
        <div className="formrow">
          <div className="frow" style={{ flex: 2, minWidth: 220 }}>
            <label className="lbl">Trading name</label>
            <input className="in" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="hint">What the interface calls you. The registered name below goes on letters.</div>
          </div>
          <div className="frow" style={{ flex: 1, minWidth: 130 }}>
            <label className="lbl">Short name</label>
            <input className="in" value={short} onChange={(e) => setShort(e.target.value)} />
            <div className="hint">Shown in the top bar, and used as the prefix on tender references.</div>
          </div>
        </div>

        <div className="frow">
          <label className="lbl">Company logo</label>
          <div className="logoedit">
            <OrgMark org={state.org} s={52} />
            <input ref={logoInput} type="file" hidden
                   accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
                   onChange={(e) => setLogo(e.target.files && e.target.files[0])} />
            <button className="btn sm" onClick={() => logoInput.current && logoInput.current.click()}>
              <Icon n="upload" s={13} /> {state.org.logo ? "Replace" : "Upload"}
            </button>
            {state.org.logo && <button className="btn sm" onClick={dropLogo}>Remove</button>}
            <span className="hint" style={{ marginTop: 0, flex: "1 1 200px" }}>
              PNG, JPEG, SVG or WebP, up to 256 KB. It replaces the DOCKET seal in the
              sidebar and top bar; without one your initials are used.
            </span>
          </div>
        </div>

        <div className="grid g2">
          {PROFILE_FIELDS.map(([k, label, kind, ph]) => (
            <div className="frow" key={k}>
              <label className="lbl" htmlFor={"orgp-" + k}>{label}</label>
              <input id={"orgp-" + k} className={"in" + (kind === "mono" ? " mono" : "")}
                     placeholder={ph} value={profile[k] || ""}
                     onChange={(e) => setProfile({ ...profile, [k]: e.target.value })} />
            </div>
          ))}
        </div>

        <div className="frow" style={{ marginBottom: 0 }}>
          <label className="lbl" htmlFor="orgp-desc">What the company does</label>
          <textarea id="orgp-desc" className="in" rows={3} value={profile.description || ""}
                    placeholder="One or two sentences. Appears on the vendor-facing registration page."
                    onChange={(e) => setProfile({ ...profile, description: e.target.value })} />
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <button className="btn pri" onClick={save} disabled={busy || name.trim().length < 2}>
            {busy ? "Saving…" : "Save the company record"}
          </button>
          {name.trim().length < 2 && <span className="hint gatehint">The name needs at least two characters.</span>}
        </div>
        {msg && <div className="notice" style={{ marginTop: 12, marginBottom: 0 }}>{msg}</div>}
      </div>
    </div>
  );
}

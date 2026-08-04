import React, { useEffect, useState } from "react";
import { flushSync } from "react-dom";

import {
  authConfig, clearAuth, demoLogin, fetchBootstrap, getToken, getUsername,
  login as apiLogin, logout as apiLogout, raw, storeAuth, uploadFile,
} from "./api";
import { GuidePanel, seenKey } from "./guide";
import { SecurityPanel } from "./security";
import {
  AcceptInvite, ForgotPassword, RegisterVendor, ResetPassword, VerifyVendor,
} from "./onboarding";
import {
  AnalyticsPage, ApprovalsPage, AuditPage, Dashboard, EvalsPage, NewTender,
  MENU_CSS, Sidebar, SuppliersPage, TeamPage, TenderDetail, TendersPage, Topbar,
} from "./buyer";
import { allowedPages, homePage } from "./perms";
import { ICON_CSS } from "./icons";
import { MOTION_CSS, hasViewTransitions, useReveal, withViewTransition } from "./motion";
import { CSS, EXTRA_CSS, THEME_CSS } from "./styles";
import { Keys, PALETTE_CSS, Palette, ShortcutSheet } from "./palette.jsx";
import { SCORECARD_CSS, ScorecardsPage } from "./scorecards.jsx";
import { AuctionRoom, BidRoom, PortalHome } from "./supplier";
import {
  BOOT_CSS, BootSkeleton, ConfirmDialog, RADAR_CSS, Toasts, TopProgress, useIsDesktop, useToasts,
} from "./ui";

const ALL_CSS = CSS + EXTRA_CSS + THEME_CSS + MOTION_CSS + ICON_CSS + RADAR_CSS + SCORECARD_CSS + MENU_CSS + BOOT_CSS + PALETTE_CSS;

/* Where you land and where you may go are both read off the capabilities the
   server sent with the bootstrap payload — see perms.js. Nothing here enumerates
   roles, so a role invented in the administration console routes correctly. */

function Login({ onLoggedIn, onScreen }) {
  const [cfg, setCfg] = useState(null);
  const [u, setU] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    authConfig().then(setCfg).catch(() => setCfg({ demoLogin: false, accounts: [] }));
  }, []);

  const submit = async () => {
    setBusy(true); setMsg("");
    try {
      const res = await raw("/auth/login/", { method: "POST",
        body: { username: u.trim().toLowerCase(), password: pw, ...(mfa ? { code } : {}) } });
      onLoggedIn(res, u.trim().toLowerCase());
    } catch (e) {
      if (e.message && e.message.includes("authenticator")) setMfa(true);
      setMsg(e.message || "Sign-in failed.");
    }
    setBusy(false);
  };
  const quick = async (username) => {
    setBusy(true); setMsg("");
    try {
      const res = await demoLogin(username);
      onLoggedIn(res, username);
    } catch (e) {
      setMsg(e.message || "Sign-in failed.");
    }
    setBusy(false);
  };

  return (
    <div className="loginwrap">
      <style>{ALL_CSS}</style>
      <div className="logincard">
        <div className="loginlogo"><span className="seal" aria-hidden="true" /><b>DOCKET</b></div>
        <div className="card">
          <div className="chead"><h3>Sign in</h3><span className="mono faint" style={{ marginLeft: "auto" }}>sealed-bid tendering</span></div>
          <div className="cbody">
            <div className="frow"><label className="lbl" htmlFor="li-u">Username</label>
              <input id="li-u" className="in" autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} /></div>
            <div className="frow"><label className="lbl" htmlFor="li-p">Password</label>
              <input id="li-p" className="in" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} /></div>
            {mfa && (
              <div className="frow"><label className="lbl" htmlFor="li-c">Authenticator code</label>
                <input id="li-c" className="in" inputMode="numeric" autoComplete="one-time-code" placeholder="123456"
                       value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} /></div>
            )}
            {msg && <div className="notice" style={{ borderLeft: "3px solid var(--wax)", marginBottom: 12 }}>{msg}</div>}
            <button className="btn pri" style={{ width: "100%" }} onClick={submit} disabled={busy || !u.trim() || !pw}>Sign in</button>
            <div className="linkrow">
              <button className="doclink" onClick={() => onScreen("register")}>Register your company (vendors)</button>
              <button className="doclink" onClick={() => onScreen("forgot")}>Forgot password?</button>
            </div>
          </div>
        </div>
        {cfg && cfg.demoLogin && cfg.accounts.length > 0 && (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="chead"><h3>Demo accounts</h3><span className="mono faint" style={{ marginLeft: "auto" }}>one click, no password</span></div>
            <div className="cbody">
              <div className="demogrid">
                {cfg.accounts.map((a) => (
                  <button key={a.username} className="btn" disabled={busy} onClick={() => quick(a.username)}>{a.label}</button>
                ))}
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>Demo logins can be disabled by setting DEMO_LOGIN=0 on the server.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function publicScreenFromUrl() {
  const q = new URLSearchParams(window.location.search);
  if (q.get("vtoken")) return { name: "verify", token: q.get("vtoken") };
  if (q.get("itoken")) return { name: "invite", token: q.get("itoken") };
  if (q.get("rtoken")) return { name: "reset", token: q.get("rtoken") };
  if (q.get("register")) return { name: "register" };
  return null;
}

export default function App() {
  const [token, setToken] = useState(getToken());
  const [screen, setScreen] = useState(publicScreenFromUrl);
  const toLogin = () => { window.history.replaceState({}, "", "/"); setScreen(null); };
  const [data, setData] = useState(null);
  const [route, setRoute] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [guide, setGuide] = useState(false);
  const [security, setSecurity] = useState(false);
  const [askReset, setAskReset] = useState(false);
  const [inFlight, setFlight] = useState(0);
  const [palette, setPalette] = useState(false);
  const [keysheet, setKeysheet] = useState(false);
  const [toast, toasts, dropToast] = useToasts();
  const desktop = useIsDesktop();
  const [nav, setNav] = useState(false);   // navigation drawer, phones only

  const signOut = (serverSide) => {
    if (serverSide) apiLogout().catch(() => {});
    clearAuth();
    setToken(null);
    setData(null);
    setRoute(null);
  };

  const refresh = async () => {
    try {
      const d = await fetchBootstrap();
      setData(d);
      return d;
    } catch (e) {
      if (e.status === 401) signOut(false);
      else toast.warn("Could not reach the server", e.message || "Check your connection and try again.");
      return null;
    }
  };

  useEffect(() => {
    if (!token) return;
    (async () => {
      const d = await refresh();
      if (d) {
        setRoute({ page: homePage(d.me) });
        if (!localStorage.getItem(seenKey(getUsername()))) {
          localStorage.setItem(seenKey(getUsername()), "1");
          setGuide(true);
        }
      }
    })();
    authConfig().then((c) => setAccounts(c.accounts || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /* While the drawer is over the page, the page must not scroll under it, and
     Escape must close it. Widening past the desktop breakpoint drops the lock
     too: the sidebar is furniture there, and a stuck body overflow would leave
     the desktop unable to scroll. */
  const drawerOpen = nav && !desktop;
  useEffect(() => {
    document.body.classList.toggle("navopen", drawerOpen);
    if (!drawerOpen) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setNav(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("navopen");
    };
  }, [drawerOpen]);

  /* Hooks cannot sit below the early returns beneath this line: the loading
     render would run fewer of them than the loaded one, which is React error
     #310. route is null until the bootstrap lands, hence the optional read. */
  useReveal([route?.page, data]);

  if (screen) {
    if (screen.name === "register") return <RegisterVendor onDone={toLogin} />;
    if (screen.name === "verify") return <VerifyVendor token={screen.token} onDone={toLogin} />;
    if (screen.name === "invite") return <AcceptInvite token={screen.token} onDone={toLogin} />;
    if (screen.name === "reset") return <ResetPassword token={screen.token} onDone={toLogin} />;
    if (screen.name === "forgot") return <ForgotPassword onDone={toLogin} />;
  }
  if (!token) {
    return <Login onScreen={(name) => setScreen({ name })}
                  onLoggedIn={(res, username) => { storeAuth(res.token, username); setToken(res.token); }} />;
  }
  if (!data || !route) {
    return (
      <>
        <style>{ALL_CSS}</style>
        <BootSkeleton />
      </>
    );
  }

  const user = data.me;

  /* Every action returns true/false so call sites can toast their own success
     copy; failures are surfaced here once, in the caller's words where the
     server gave us any. */
  const wrap = (fn, refreshAfter = true) => async (...args) => {
    setFlight((n) => n + 1);
    try {
      await fn(...args);
      if (refreshAfter) await refresh();
      return true;
    } catch (e) {
      if (e.status === 401) { signOut(false); return false; }
      toast.warn("That didn't go through", e.message || "Something went wrong.");
      return false;
    } finally {
      setFlight((n) => Math.max(0, n - 1));
    }
  };

  const act = {
    submitTender: wrap((id) => raw(`/tenders/${id}/submit/`, { method: "POST", body: {} })),
    addAddendum: wrap((id, b) => raw(`/tenders/${id}/addenda/`, { method: "POST", body: b })),
    answerClar: wrap((cid, a) => raw(`/clarifications/${cid}/answer/`, { method: "POST", body: { a } })),
    openBids: wrap((id) => raw(`/tenders/${id}/open/`, { method: "POST", body: {} })),
    recommend: wrap((id, bidId) => raw(`/tenders/${id}/recommend/`, { method: "POST", body: { bidId } })),
    withdrawRec: wrap((id) => raw(`/tenders/${id}/withdraw_recommendation/`, { method: "POST", body: {} })),
    publishDecision: wrap((id, ok) => raw(`/tenders/${id}/publish_decision/`, { method: "POST", body: { ok } })),
    awardDecision: wrap((id, ok) => raw(`/tenders/${id}/award_decision/`, { method: "POST", body: { ok } })),
    createTender: wrap((b) => raw(`/tenders/`, { method: "POST", body: b })),
    updateTender: wrap((id, b) => raw(`/tenders/${id}/`, { method: "PATCH", body: b })),
    prequalify: wrap((sid) => raw(`/suppliers/${sid}/prequalify/`, { method: "POST", body: {} })),
    submitBid: wrap((id, b) => raw(`/tenders/${id}/bids/`, { method: "POST", body: b })),
    withdrawBid: wrap((id) => raw(`/tenders/${id}/bids/`, { method: "DELETE", body: {} })),
    askClar: wrap((id, q) => raw(`/tenders/${id}/clarifications/`, { method: "POST", body: { q } })),
    declareCoi: wrap((id) => raw(`/tenders/${id}/coi/`, { method: "POST", body: {} })),
    upload: wrap((path, file, extra) => uploadFile(path, file, extra)),
    deleteDoc: wrap((docId) => raw(`/docs/${docId}/`, { method: "DELETE", body: {} })),
    markRead: wrap(() => raw(`/notifications/read/`, { method: "POST", body: {} })),
    prequalDecision: wrap((sid, ok, reason) => raw(`/suppliers/${sid}/prequalify/`, { method: "POST", body: { ok, reason } })),
    inviteVendor: wrap((email) => raw(`/suppliers/invite/`, { method: "POST", body: { email } })),
    deleteMyDoc: wrap((docId) => raw(`/me/docs/${docId}/`, { method: "DELETE", body: {} })),
    duplicate: wrap((tid) => raw(`/tenders/${tid}/duplicate/`, { method: "POST", body: {} })),
    rename: wrap((b) => raw(`/me/`, { method: "POST", body: b })),
    saveScores: wrap((bidId, scores, note) =>
      raw(`/bids/${bidId}/scores/`, { method: "POST", body: note === undefined ? { scores } : { scores, note } }), false),
    /* Not wrapped: the register upload is a two-step flow — preview, then
       apply — so the caller needs the response body, not a true/false, and
       shows the errors itself inside the dialog rather than as a toast. */
    importRegister: (file, extra) => uploadFile("/suppliers/import_register/", file, extra),
  };

  const ai = {
    scope: async (b) => (await raw(`/ai/scope/`, { method: "POST", body: b })).text,
    criteria: async (b) => (await raw(`/ai/criteria/`, { method: "POST", body: b })).criteria,
    clarAnswer: async (cid) => (await raw(`/ai/clarifications/${cid}/answer/`, { method: "POST", body: {} })).text,
    brief: async (tid) => (await raw(`/ai/tenders/${tid}/brief/`, { method: "POST", body: {} })).text,
    bidReview: async (tid, b) => (await raw(`/ai/tenders/${tid}/bid_review/`, { method: "POST", body: b })).text,
    insights: async () => (await raw(`/ai/insights/`, { method: "POST", body: {} })).text,
  };

  const go = (r) => {
    /* flushSync so the browser captures the new DOM inside the transition; the
       refresh stays outside it, because a transition must not wait on a fetch. */
    withViewTransition(() => flushSync(() => {
      setNav(false);   // a chosen destination closes the drawer over it
      setRoute(r);
    }));
    refresh(); // silent: keeps the current view until fresh data lands
  };

  const onSwitch = async (username) => {
    try {
      const res = await demoLogin(username);
      storeAuth(res.token, username);
      setToken(res.token); // effect reloads bootstrap and routes home
    } catch (e) {
      toast.warn("Could not switch account", e.message || "");
    }
  };

  const onReset = async () => {
    try {
      const r = await raw(`/reset/`, { method: "POST", body: {} });
      if (r.token) {
        storeAuth(r.token, getUsername());
        setToken(r.token);
        toast.ok("Demo data restored", "Every tender, bid and audit event is back to the original seed.");
      } else {
        signOut(false);
      }
    } catch (e) {
      toast.warn("Reset failed", e.message || "");
    }
  };

  const api = { state: data, user, go, route, act, ai, toast, refresh };
  /* Re-armed on every page: anything marked data-reveal below the fold arrives
     as you reach it, once, then the observer lets it go. The call itself is
     hoisted above the early returns, where hooks have to live. */
  const allowed = allowedPages(user);
  const page = allowed.includes(route.page) ? route.page : homePage(user);

  /* The secondary chrome, handed to whichever of the two can house it: the top
     bar on a desktop, the drawer foot on a phone. Anything that opens a panel
     closes the drawer first, or the drawer is left sitting behind the dialog it
     just opened. */
  const fromDrawer = (fn) => (...args) => { setNav(false); return fn(...args); };
  const chrome = {
    accounts, username: getUsername(), onSwitch: fromDrawer(onSwitch),
    onLogout: () => signOut(true), onReset: fromDrawer(() => setAskReset(true)),
    onGuide: fromDrawer(() => setGuide(true)), onSecurity: fromDrawer(() => setSecurity(true)),
  };

  return (
    <div className="dk">
      <style>{ALL_CSS}</style>
      <Keys allowed={allowed} go={go} onPalette={() => setPalette(true)} onSheet={() => setKeysheet(true)} />
      {palette && <Palette api={api} allowed={allowed} chrome={chrome} onClose={() => setPalette(false)} />}
      {keysheet && <ShortcutSheet allowed={allowed} onClose={() => setKeysheet(false)} />}
      <Sidebar api={api} chrome={chrome} open={drawerOpen} desktop={desktop} onClose={() => setNav(false)} />
      {drawerOpen && <div className="navscrim" onClick={() => setNav(false)} aria-hidden="true" />}
      <div className="main">
        <Topbar api={api} chrome={chrome} desktop={desktop} navOpen={drawerOpen} onMenu={() => setNav(true)} />
        <TopProgress busy={inFlight > 0} />
        {askReset && (
          <ConfirmDialog title="Reset all demo data?" confirmLabel="Hold to reset the demo" tone="wax"
                         hold holdHint="Wipes everything: hold to confirm"
                         onClose={() => setAskReset(false)} onConfirm={onReset}>
            Every tender, bid, score, letter, notification and audit event goes back to the original seed,
            including anything you created in this session. <b>This cannot be undone.</b>
          </ConfirmDialog>
        )}
        {guide && <GuidePanel role={user.role} onClose={() => setGuide(false)} />}
        {security && <SecurityPanel me={user} onRenamed={refresh} onClose={() => setSecurity(false)}
          onLogoutAll={async () => { try { await raw("/auth/logout_all/", { method: "POST", body: {} }); } catch (e) {} signOut(false); }} />}
        <main className={"content" + (hasViewTransitions() ? "" : " pageenter")} key={page}>
          {page === "dashboard" && <Dashboard api={api} />}
          {page === "tenders" && <TendersPage api={api} />}
          {page === "tender" && <TenderDetail key={route.id + (route.tab || "")} api={api} id={route.id} initialTab={route.tab} />}
          {page === "new" && <NewTender key={route.editId || "new"} api={api} editId={route.editId} />}
          {page === "suppliers" && <SuppliersPage api={api} />}
          {page === "team" && <TeamPage api={api} />}
          {page === "analytics" && <AnalyticsPage api={api} />}
          {page === "scorecards" && <ScorecardsPage api={api} />}
          {page === "audit" && <AuditPage api={api} />}
          {page === "approvals" && <ApprovalsPage api={api} />}
          {page === "evals" && <EvalsPage api={api} />}
          {page === "portal" && <PortalHome api={api} />}
          {page === "bidroom" && (data.tenders.find((t) => t.id === route.id)?.type === "AUC"
            ? <AuctionRoom key={route.id} api={api} id={route.id} />
            : <BidRoom key={route.id} api={api} id={route.id} />)}
        </main>
      </div>
      <Toasts items={toasts} onDismiss={dropToast} />
    </div>
  );
}

import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import {
  authConfig, authStorageKey, clearAuth, demoLogin, fetchBootstrap, fetchFinance,
  adoptBaselines, baselineFor, fetchBaselines,
  fetchFinanceExceptions, financeFeeds, getToken, getUsername, importFinance,
  inDemo, login as apiLogin, logout as apiLogout, raw, setDemo, siteAppearance, storeAuth,
  uploadFile, DOWNLOAD_FAILED,
} from "./api";
import { BP } from "./breakpoints";
import { activeRound, roundsOf } from "./helpers";
import { GuidePanel, seenKey } from "./guide";
import { SecurityPanel } from "./security";
import {
  AcceptInvite, ClaimVendor, ForgotPassword, RegisterVendor, ResetPassword, VerifyVendor,
} from "./onboarding";
import { SetupWorkspace } from "./setup";
import {
  AnalyticsPage, ApprovalsPage, AuditPage, Dashboard, EvalsPage, NewTender,
  CHAIN_CSS, DRAFT_CSS, MENU_CSS, Sidebar, SuppliersPage, TeamPage, TenderDetail,
  TendersPage, Topbar,
} from "./buyer";
import { allowedPages, homePage } from "./perms";
import { ICON_CSS, Icon } from "./icons";
import { MOTION_CSS, hasViewTransitions, useReveal, withViewTransition } from "./motion";
import { AUCTION_CSS, AuctionPage, AuctionsPage } from "./auctions";
import { BASELINE_CSS } from "./baselines";
import { DESIGN_CSS } from "./designs";
import { applyAccent, applyLayout, STUDIO_CSS } from "./studio";
import { LANDING_CSS, Landing } from "./landing";
import { LOGO_CSS, Wordmark } from "./logo";
import { LPART_CSS } from "./lpart";
import { CAMPAIGN_CSS } from "./campaign";
import { CHART_CSS } from "./charts-css";
import { FINANCE_CSS } from "./finance-css";
import { ILLUS_CSS } from "./illus";
import { PAGE_CSS } from "./page";
import { CSS, EXTRA_CSS, THEME_CSS } from "./styles";
import { LIFECYCLE_CSS } from "./lifecycle";
import { Keys, PALETTE_CSS, Palette, ShortcutSheet } from "./palette.jsx";
import { SCORECARD_CSS, ScorecardsPage } from "./scorecards.jsx";
import { PORTAL_CSS } from "./supplier-css";
import {
  BOOT_CSS, BootSkeleton, ConfirmDialog, PageBoundary, RADAR_CSS, Toasts, useIsDesktop, useToasts,
} from "./ui";

const FinancePage = lazy(() => import("./finance.jsx").then((m) => ({ default: m.FinancePage })));
const PortalHome = lazy(() => import("./supplier").then((m) => ({ default: m.PortalHome })));
const BidRoom = lazy(() => import("./supplier").then((m) => ({ default: m.BidRoom })));
const AuctionRoom = lazy(() => import("./supplier").then((m) => ({ default: m.AuctionRoom })));

const ALL_CSS = CSS + EXTRA_CSS + THEME_CSS + MOTION_CSS + ICON_CSS + RADAR_CSS
  + SCORECARD_CSS + MENU_CSS + BOOT_CSS + PALETTE_CSS + CHART_CSS + CAMPAIGN_CSS
  + FINANCE_CSS + BASELINE_CSS + LIFECYCLE_CSS + ILLUS_CSS + DRAFT_CSS + PAGE_CSS
  + LPART_CSS + LANDING_CSS + DESIGN_CSS + LOGO_CSS + CHAIN_CSS + STUDIO_CSS
  + AUCTION_CSS + PORTAL_CSS;

/* Where you land and where you may go are both read off the capabilities the
   server sent with the bootstrap payload - see perms.js. Nothing here enumerates
   roles, so a role invented in the administration console routes correctly. */

/** `/` - the landing page, with the deployment's own configuration behind it.

    A thin wrapper rather than a prop drilled down from App: the landing page
    needs to know whether there is a demo to point at and whether signing up
    happens here or on another deployment, and that is one fetch that belongs
    next to the thing that uses it. It renders without waiting - every piece
    of the page that depends on the config degrades to "not offered" rather
    than to a spinner, and a front door that shows a loading state is a front
    door that looks shut. */
function PublicLanding({ onScreen }) {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    /* The design is the site's, read from the main site even for a browser
       still signed in to the demo - see siteAppearance. */
    Promise.all([authConfig(), siteAppearance().catch(() => ({}))])
      .then(([c, look]) => setCfg({ ...c, ...(look.landing ? look : {}) }))
      .catch(() => setCfg({ demoLogin: false, accounts: [] }));
  }, []);
  return (
    <>
      <style>{ALL_CSS}</style>
      <Landing cfg={cfg || {}} onScreen={onScreen} />
    </>
  );
}


function Login({ onLoggedIn, onScreen, notice }) {
  const [asBidder, setAsBidder] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [u, setU] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState(false);
  const [code, setCode] = useState("");
  const submitting = useRef(false);

  useEffect(() => {
    authConfig().then(setCfg).catch(() => setCfg({ demoLogin: false, accounts: [] }));
  }, []);

  const submit = async () => {
    if (submitting.current || !u.trim() || !pw || (mfa && !code.trim())) return;
    submitting.current = true;
    setBusy(true); setMsg("");
    try {
      const res = await raw("/auth/login/", { method: "POST",
        body: { username: u.trim().toLowerCase(), password: pw, asBidder, ...(mfa ? { code } : {}) } });
      onLoggedIn(res, u.trim().toLowerCase());
    } catch (e) {
      if (e.message && e.message.includes("authenticator")) setMfa(true);
      setMsg(e.message || "Sign-in failed.");
    }
    setBusy(false);
    submitting.current = false;
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
    <div className="loginwrap" role="main">
      <style>{ALL_CSS}</style>
      <div className="logincard">
        <div className="loginlogo"><Wordmark s={26} animate /></div>
        {/* Nobody can sign in to an empty workspace, so the first thing it
            offers is the way to make one. Sign-in stays underneath for the
            administrator account that already exists. */}
        {cfg && cfg.needsSetup && (
          <div className="card" style={{ marginBottom: 14, borderColor: "var(--green-2)" }}>
            <div className="cbody">
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-.015em", marginBottom: 4 }}>This workspace has not been set up yet</div>
              <div className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
                Three short steps: you, your company, your team. It takes about two minutes and you land signed in.
              </div>
              {cfg.signupUrl
                ? <a className="btn pri" style={{ width: "100%", justifyContent: "center" }}
                     href={cfg.signupUrl + "/?setup=1"}>Set up your workspace</a>
                : <button className="btn pri" style={{ width: "100%" }} onClick={() => onScreen("setup")}>Set up your workspace</button>}
            </div>
          </div>
        )}
        <div className="card">
          <div className="chead"><h1 className="public-title">Sign in</h1><span className="mono faint" style={{ marginLeft: "auto" }}>sealed-bid tendering</span></div>
          <div className="cbody">
            {notice && !msg && <div className="notice" role="status" style={{ marginBottom: 12 }}>{notice}</div>}
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
            <label className="checkline" style={{marginBottom:12}}><input type="checkbox" checked={asBidder} onChange={(e) => setAsBidder(e.target.checked)} />Sign in as an invited bidder (staff or company)</label>
            <button className="btn pri" style={{ width: "100%" }} onClick={submit} disabled={busy || !u.trim() || !pw || (mfa && !code.trim())}>{busy ? "Signing in..." : "Sign in"}</button>
            {/* Signing in is for people who already have an account. Vendor
                registration and starting a workspace are reached from the front
                page, and vendors are also sent a registration link by email. */}
            <div className="linkrow">
              <button className="doclink" onClick={() => onScreen("forgot")}>Forgot password?</button>
            </div>
          </div>
        </div>
        {/* The personas moved to /demo. A sign-in screen whose most prominent
            control is a way in without a password reads as a door left open,
            and on a deployment holding real bids it would be one. The link is
            here; the way in is one deliberate step away. */}
        {cfg && cfg.demoLogin && cfg.accounts.length > 0 && (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="cbody" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <b style={{ fontSize: 14 }}>Just looking?</b>
                <div className="hint" style={{ marginTop: 2 }}>
                  Walk the whole product as any of {cfg.accounts.length} people, with a workspace already in motion.
                </div>
              </div>
              <button className="btn" onClick={() => onScreen("demo")}>Open the demo</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** /demo - the way into the demo workspace, and the way out of it to a real one.

    Kept off the sign-in screen deliberately. A password-free door is fine on a
    deployment seeded with invented tenders and wrong on one holding sealed bids,
    and the difference between those two is a single environment variable. Making
    the demo a place you go, rather than the first thing on the front page, means
    the real deployment's sign-in screen has nothing to hide. */
function DemoDoor({ onBack, onScreen, onLoggedIn }) {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    authConfig().then(setCfg).catch(() => setCfg({ demoLogin: false, accounts: [] }));
  }, []);

  const enter = async (username) => {
    setBusy(username); setMsg("");
    /* A persona is a demo account, so the click goes to the demo backend even
       if this tab's demo flag was cleared after the buttons were drawn (signing
       in or out of the real workspace in another tab does that). Otherwise the
       click reached the real workspace, which refused it as "Demo logins are
       disabled on this deployment." */
    setDemo(true);
    try {
      const res = await demoLogin(username);
      onLoggedIn(res, username);
    } catch (e) {
      setMsg(e.message || "Could not open the demo.");
      setBusy("");
    }
  };

  const off = cfg && !cfg.demoLogin;

  return (
    <div className="loginwrap">
      <style>{ALL_CSS}</style>
      <div className="logincard">
        <div className="loginlogo"><Wordmark s={26} animate /></div>

        {!cfg && <div className="card"><div className="cbody muted">Loading…</div></div>}

        {off && (
          <div className="card">
            <div className="chead"><h3>No demo here</h3></div>
            <div className="cbody">
              <p style={{ marginTop: 0 }}>
                This deployment holds a real workspace, so there are no one-click accounts.
                Sign in, or ask a colleague to invite you.
              </p>
              <button className="btn pri" style={{ width: "100%" }}
                      onClick={() => onScreen("signin")}>Go to sign in</button>
            </div>
          </div>
        )}

        {cfg && cfg.demoLogin && (
          <>
            <div className="card">
              <div className="chead"><h3>Open the demo</h3>
                <span className="mono faint" style={{ marginLeft: "auto" }}>one click, no password</span></div>
              <div className="cbody">
                <p style={{ marginTop: 0, fontSize: 13.5, lineHeight: 1.6 }}>
                  Choose an account to try the demo.
                </p>
                {msg && <div className="notice" style={{ borderLeft: "3px solid var(--wax)", marginBottom: 12 }}>{msg}</div>}
                <div className="demogrid">
                  {cfg.accounts.map((a) => (
                    <button key={a.username} className="btn" disabled={!!busy}
                            onClick={() => enter(a.username)}>
                      {busy === a.username ? "Opening…" : a.label}
                    </button>
                  ))}
                </div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
                  Sample data. Reset anytime from the account menu.
                </div>
              </div>
            </div>

            {/* The point of a demo. On this deployment the wizard would rename
                the demo org and hand over its tenders, so when SIGNUP_URL names
                the real deployment the button goes there instead. */}
            <div className="card" style={{ marginTop: 14, borderColor: "var(--green-2)" }}>
              <div className="cbody">
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-.015em", marginBottom: 4 }}>
                  Seen enough?
                </div>
                <div className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
                  Create a workspace for your company.
                </div>
                {cfg.signupUrl
                  ? <a className="btn pri" style={{ width: "100%", justifyContent: "center" }}
                       href={cfg.signupUrl + "/?setup=1"}>Set up your company</a>
                  : <button className="btn pri" style={{ width: "100%" }}
                            onClick={() => { window.location.href = "/?setup=1"; }}>Set up your company</button>}
              </div>
            </div>
          </>
        )}

        <div className="linkrow" style={{ justifyContent: "center", marginTop: 14 }}>
          <button className="doclink" onClick={onBack}>← Back to the front page</button>
          <button className="doclink" onClick={() => onScreen("signin")}>Sign in</button>
        </div>
      </div>
    </div>
  );
}

/* The signed-out surface, as paths rather than query flags, because these are
   the ones that get written down and read out: "the demo is at
   docket.example.com/demo", "sign in at /signin".

     /         the landing page - what this is, for somebody who has not
               decided yet. It is the front door whether or not the workspace
               has been set up: a sign-in form is furniture for people who
               already know, and it is one click away.
     /signin   the form
     /demo     the personas
     /setup    the wizard (?setup=1 still works: it is in circulation) */
const PATHS = { "/signin": "signin", "/sign-in": "signin", "/login": "signin",
                "/demo": "demo", "/setup": "setup", "/forgot": "forgot",
                "/forgot-password": "forgot", "/register": "register" };

/* The signed-in surface has addresses too, under /app, so the back button,
   a refresh and a link in an email all land on the same tender and tab:

     /app/tenders                 a section
     /app/tender/42/eval          a tender, on a tab
     /app/auction/7               an auction room
     /app/new?editId=42           anything else rides in the query

   /app is clear of /signin, /demo, /setup and /superadmin, and Django's
   catch-all serves the page for it (docket/urls.py). The server builds the
   same addresses for notification emails (core/notify.py). */
const APP = "/app";
const ID_PAGES = ["tender", "auction", "bidroom"];
const NEXT_KEY = "docket_next";

function routeToPath(r) {
  if (!r || !r.page) return APP;
  let path = `${APP}/${r.page}`;
  if (ID_PAGES.includes(r.page) && r.id != null) path += `/${encodeURIComponent(r.id)}`;
  if (r.tab) path += `/${encodeURIComponent(r.tab)}`;
  const q = new URLSearchParams();
  Object.entries(r).forEach(([k, v]) => {
    if (!["page", "id", "tab"].includes(k) && v != null && v !== "") q.set(k, v);
  });
  return path + (q.toString() ? `?${q}` : "");
}

function routeFromPath(where) {
  const url = new URL(where || window.location.href, window.location.origin);
  const path = url.pathname.replace(/\/+$/, "");
  if (!path.startsWith(APP + "/")) return null;
  const num = (v) => (/^\d+$/.test(v) ? Number(v) : v);
  const [page, a, b] = path.slice(APP.length + 1).split("/").map(decodeURIComponent);
  if (!page) return null;
  const r = { page };
  if (ID_PAGES.includes(page)) { if (a) r.id = num(a); if (b) r.tab = b; }
  else if (a) r.tab = a;
  url.searchParams.forEach((v, k) => { r[k] = /id$/i.test(k) ? num(v) : v; });
  return r;
}

/* Where to go back to after signing in: the page somebody was on when their
   session ran out, or the one an emailed link pointed at. One use only. */
const keepNext = (where) => { try { sessionStorage.setItem(NEXT_KEY, where); } catch (e) { /* private mode */ } };
const takeNext = () => {
  try { const v = sessionStorage.getItem(NEXT_KEY); sessionStorage.removeItem(NEXT_KEY); return v; }
  catch (e) { return null; }
};
const dropNext = () => { try { sessionStorage.removeItem(NEXT_KEY); } catch (e) { /* private mode */ } };

/** The page the address bar asks for, when this person may open it; else home.
    Home is null for somebody who may open nothing yet. */
function landingRoute(me) {
  const asked = routeFromPath();
  return asked && allowedPages(me).includes(asked.page) ? asked : { page: homePage(me) };
}

const PAGE_TITLES = {
  dashboard: "Dashboard", approvals: "Approvals", evals: "Evaluations", tenders: "Tenders",
  auctions: "Auctions", suppliers: "Suppliers", scorecards: "Scorecards", team: "Team",
  analytics: "Analytics", finance: "Finance", audit: "Audit trail", portal: "Your tenders",
  tender: "Tender", auction: "Auction", new: "New tender", bidroom: "Bid room",
};
const SCREEN_TITLES = {
  signin: "Sign in", demo: "Demo", setup: "Set up your workspace", forgot: "Reset your password",
  register: "Vendor registration", claim: "Claim your account", verify: "Verify your email",
  invite: "Accept your invitation", reset: "Choose a new password",
};

function publicScreenFromUrl() {
  const path = window.location.pathname.replace(/\/+$/, "").toLowerCase();
  /* A workspace address with nobody signed in - usually a link in an email.
     Sign in first, then carry on to it. */
  if (!getToken() && path.startsWith(APP + "/")) {
    keepNext(window.location.pathname + window.location.search);
    window.history.replaceState({}, "", "/signin");
    setDemo(false);
    return { name: "signin" };
  }
  /* Opening /demo points this browser at the demo backend, and it has to happen
     HERE rather than inside DemoDoor: this runs during useState's initialiser,
     before any component has mounted and therefore before the first fetch. Set
     it a render later and the very first call - authConfig, on the way to
     drawing the persona buttons - would ask the real workspace whether it has
     a demo, be told no, and show "no demo here" on a deployment that has one. */
  if (PATHS[path] === "demo") setDemo(true);
  /* And the way back out, by the same rule goScreen follows: loading any
     other address leaves the demo unless somebody is signed in to it. The
     flag lives in sessionStorage, so without this a tab that had opened /demo
     and then loaded /signin sent the real sign-in form - password and all -
     to the demo's backend, and the password was refused there. */
  else if (!getToken()) setDemo(false);
  if (PATHS[path]) return { name: PATHS[path] };
  const q = new URLSearchParams(window.location.search);
  if (q.get("vtoken")) return { name: "verify", token: q.get("vtoken") };
  if (q.get("itoken")) return { name: "invite", token: q.get("itoken") };
  if (q.get("rtoken")) return { name: "reset", token: q.get("rtoken") };
  if (q.get("setup")) return { name: "setup" };
  /* `?register=` carries a claim token from the registration drive, or the bare
     flag "1" from the older single-vendor invite. A token means the vendor is
     already on the register and is claiming that record; the flag means an
     ordinary sign-up. Telling them apart on length keeps the old links working. */
  const reg = q.get("register");
  if (reg && reg.length > 8) return { name: "claim", token: reg };
  if (reg) return { name: "register" };
  return null;
}

function RequiredPasswordChange({onDone, onLogout}) {
  const [current,setCurrent] = useState("");
  const [password,setPassword] = useState("");
  const [confirmation,setConfirmation] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();setError("");setBusy(true);
    try {
      await raw("/auth/change_password/",{method:"POST",body:{current,password}});
      onDone();
    } catch(e) {setError(e.message || "Could not change the password.");}
    finally {setBusy(false);}
  };
  return <><style>{ALL_CSS}</style><div className="loginwrap"><div className="logincard card"><div className="cbody">
    <h2>Change your temporary password</h2>
    <p>Your first sign-in requires a new password before you can open the workspace.</p>
    <form onSubmit={submit}>
      <label className="lbl" htmlFor="required-current">Temporary password</label>
      <input id="required-current" className="in" type="password" autoComplete="current-password" value={current} onChange={(e)=>setCurrent(e.target.value)} required />
      <label className="lbl" htmlFor="required-new" style={{marginTop:12}}>New password (8+ characters)</label>
      <input id="required-new" className="in" type="password" autoComplete="new-password" value={password} onChange={(e)=>setPassword(e.target.value)} minLength={8} required />
      <label className="lbl" htmlFor="required-confirm" style={{marginTop:12}}>Confirm new password</label>
      <input id="required-confirm" className="in" type="password" autoComplete="new-password" value={confirmation} onChange={(e)=>setConfirmation(e.target.value)} required />
      {confirmation && password !== confirmation && <p role="status">The new passwords do not match.</p>}
      {error && <p role="alert">{error}</p>}
      <div className="btnrow" style={{marginTop:16}}><button className="btn pri" disabled={busy || !current || password.length<8 || password!==confirmation || password===current}>{busy ? "Saving..." : "Change password and continue"}</button>
        <button className="btn" type="button" disabled={busy} onClick={onLogout}>Sign out</button></div>
    </form>
  </div></div></div></>;
}

export default function App() {
  const [screen, setScreen] = useState(publicScreenFromUrl);
  const [token, setToken] = useState(getToken);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  /* The site's look, chosen once in the administration console, applies to
     every screen: the front page, sign-in, setup, the workspace and the demo.
     Read from the main site even inside the demo, whose own backend never sees
     the console's choice - see siteAppearance. */
  useEffect(() => {
    let active = true;
    const loadAppearance = () => siteAppearance().then((cfg) => {
      if (!active) return;
      applyLayout(cfg.landing);
      applyAccent(cfg.accent);
    }).catch(() => {});
    loadAppearance();
    const timer = setInterval(loadAppearance, 30000);
    window.addEventListener("focus", loadAppearance);
    /* The cleanup does NOT strip the attributes, and that is the fix for the
       flash rather than an oversight. They are stamped server-side on <html>
       (see docket/urls.py SpaShell), and this effect re-runs on navigation -
       so clearing them here repainted the page in the default accent for the
       moment between unmount and the next fetch resolving. The deployment's
       appearance does not change because somebody opened a different page. */
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", loadAppearance); };
  }, [token, screen?.name]);
  /* Back to the front door, and put the address bar back with it. Named
     `toLogin` when the root WAS the sign-in form; it goes to the landing page
     now, which is what every one of its call sites meant by "out of here". */
  const toLogin = () => { window.history.replaceState({}, "", "/"); setScreen(null); };
  /* "Sign in" and "Back to sign in" on the onboarding screens mean the form,
     not the front page. Replace rather than push: several of these addresses
     carry a single-use token that should not stay one Back press away. */
  const toSignin = () => {
    window.history.replaceState({}, "", "/signin");
    if (!getToken()) setDemo(false);
    setScreen({ name: "signin" });
  };
  /* Moving between the public screens writes the path, so the back button and
     a copied URL both behave. The token-carrying screens are excluded: their
     address holds a single-use secret and pushing it into history is how it
     ends up in a shared browser's autocomplete. */
  const goScreen = (name) => {
    const path = Object.keys(PATHS).find((k) => PATHS[k] === name);
    if (path) window.history.pushState({}, "", path);
    /* Moving to /demo inside the app switches backend too; moving anywhere else
       only leaves the demo if nobody is signed in to it. Clearing the flag
       under a live demo session would point a demo token at the real API. */
    if (name === "demo") setDemo(true);
    else if (!getToken()) setDemo(false);
    setScreen(name ? { name } : null);
  };
  const [data, setData] = useState(null);
  const [bootError, setBootError] = useState("");
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
  /* Bootstrap fetches overlap: a navigation, an action and the background pull
     can each start one. Only the newest one started may land, or an answer that
     left before a change can arrive after it and put the old state back. */
  const boot = useRef({ started: 0, landed: 0 });
  const pullRef = useRef(null);
  const scrollPositions = useRef(new Map());
  const currentPath = useRef(window.location.pathname + window.location.search);
  const restoreScroll = useRef(false);
  const rememberScroll = () => {
    scrollPositions.current.set(currentPath.current, {
      window: window.scrollY,
      panes: [...document.querySelectorAll(".dk > .main, .dk > .main > .content")].map((pane) => pane.scrollTop),
    });
  };
  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => { window.history.scrollRestoration = previous; };
  }, []);

  /* `expired` is the server saying the session is over (a 401), as opposed to
     somebody pressing Sign out. Then the page they were on is kept, the form
     says why it is there, and signing in goes straight back to that page. The
     demo is left out: its sessions end when it is reset, and a demo address
     means nothing on the real workspace. */
  const signOut = (serverSide, expired = false) => {
    const resume = expired && !inDemo() && window.location.pathname.startsWith(APP + "/")
      ? window.location.pathname + window.location.search : null;
    if (resume) keepNext(resume); else dropNext();
    if (serverSide) apiLogout().catch(() => {});
    clearAuth();
    setMustChangePassword(false);
    ++boot.current.started;
    boot.current.landed = boot.current.started;
    setBootError("");
    setGuide(false); setSecurity(false); setNav(false);
    window.history.replaceState({}, "", "/signin");
    setScreen({ name: "signin", expired });
    setToken(null);
    setData(null);
    setRoute(null);
  };

  /* `quiet` is the background pull: a blip on a timer is not worth a toast,
     and the next pull will try again anyway. Read loosely, because refresh is
     handed around as a callback and may be called with an event or a value. */
  const refresh = async (opts) => {
    const quiet = !!(opts && opts.quiet === true);
    const mine = ++boot.current.started;
    try {
      const d = await fetchBootstrap();
      if (mine !== boot.current.started) return null;
      boot.current.landed = mine;
      setBootError("");
      setMustChangePassword(false);
      /* On the buying side, a bid waiting for audit (or turned down by it) is
         not in the competition, so it is kept off the list every screen
         counts, scores and charts from. The audit panel reads it from here. */
      if (d.me && d.me.role !== "supplier" && Array.isArray(d.bids)) {
        const outside = (b) => b.review === "held" || b.review === "rejected";
        d.reviewBids = d.bids.filter(outside);
        d.bids = d.bids.filter((b) => !outside(b));
      }
      setData(d);
      setRoute((current) => current || landingRoute(d.me));
      return d;
    } catch (e) {
      if (mine !== boot.current.started) return null;
      if (e.data?.passwordChangeRequired) {
        setMustChangePassword(true);
        setData(null);
        return null;
      }
      setBootError(e.message || "Check your connection and try again.");
      if (e.status === 401) signOut(false, true);
      else if (!quiet) toast.warn("Could not reach the server", e.message || "Check your connection and try again.");
      return null;
    }
  };
  pullRef.current = refresh;

  useEffect(() => {
    const changed = (event) => {
      if (event.key !== authStorageKey() && event.key !== null) return;
      const next = getToken();
      if (next === token) return;
      if (!next) { signOut(false, true); return; }
      ++boot.current.started;
      setData(null); setRoute(null); setGuide(false); setSecurity(false);
      setToken(next);
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [token]);

  /* Back and Forward. Inside the workspace the address is the route, so it is
     read back without pushing a new entry; outside it, the path names the
     public screen. */
  useEffect(() => {
    const back = () => {
      rememberScroll();
      currentPath.current = window.location.pathname + window.location.search;
      restoreScroll.current = true;
      setNav(false);
      const r = getToken() ? routeFromPath() : null;
      if (r) {
        setScreen(null);
        withViewTransition(() => flushSync(() => setRoute(r)));
      } else setScreen(publicScreenFromUrl());
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);

  /* A download that failed used to do nothing at all; api.js reports it here. */
  useEffect(() => {
    const failed = (e) => toast.warn("Download failed",
      (e.detail && e.detail.message) || "That file could not be downloaded. Please try again.");
    window.addEventListener(DOWNLOAD_FAILED, failed);
    return () => window.removeEventListener(DOWNLOAD_FAILED, failed);
  }, [toast]);

  /* Other people's work arrives without a reload. Every thirty seconds while
     the tab is in front, and straight away when somebody comes back to it, so
     an approval signed down the corridor or a bid sealed overnight is on
     screen without anyone reaching for the browser's refresh button. A hidden
     tab does not poll; it catches up the moment it is looked at. */
  useEffect(() => {
    if (!token) return undefined;
    let last = Date.now();
    const pull = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 5000) return;
      last = Date.now();
      if (pullRef.current) pullRef.current({ quiet: true });
    };
    const timer = setInterval(pull, 30000);
    window.addEventListener("focus", pull);
    document.addEventListener("visibilitychange", pull);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", pull);
      document.removeEventListener("visibilitychange", pull);
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    /* A lapsed session or an emailed link left the page it was headed for;
       put it back in the address bar so landingRoute reads it. */
    const next = takeNext();
    if (next) window.history.replaceState({}, "", next);
    setData(null); setRoute(null); setBootError("");
    (async () => {
      const d = await refresh();
      if (d) {
        const destination = landingRoute(d.me);
        setRoute(destination);
        window.history.replaceState({}, "", routeToPath(destination));
        setScreen(null);
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

  /* A new page starts at its top, and the tab says where you are. */
  useEffect(() => {
    const position = restoreScroll.current ? scrollPositions.current.get(currentPath.current) : null;
    restoreScroll.current = false;
    window.scrollTo(0, position?.window || 0);
    document.querySelectorAll(".dk > .main, .dk > .main > .content").forEach((pane, i) => { pane.scrollTop = position?.panes[i] || 0; });
    currentPath.current = window.location.pathname + window.location.search;
  }, [route?.page, route?.id, screen?.name]);
  const tenderTitle = route?.page === "tender"
    ? (data?.tenders || []).find((t) => t.id === route.id)?.title : null;
  useEffect(() => {
    const name = (!token || screen)
      ? SCREEN_TITLES[screen?.name]
      : tenderTitle || PAGE_TITLES[route?.page];
    document.title = name ? `${name} · DOCKET` : "DOCKET";
  }, [token, screen?.name, route?.page, tenderTitle]);

  if (screen) {
    if (screen.name === "register") return <RegisterVendor onDone={toSignin} />;
    if (screen.name === "claim") return <ClaimVendor token={screen.token} onDone={toSignin}
        onLoggedIn={(res, username) => { storeAuth(res.token, username); toLogin(); setToken(res.token); }} />;
    if (screen.name === "verify") return <VerifyVendor token={screen.token} onDone={toSignin} />;
    if (screen.name === "invite") return <AcceptInvite token={screen.token} onDone={toSignin} />;
    if (screen.name === "reset") return <ResetPassword token={screen.token} onDone={toSignin} />;
    if (screen.name === "forgot") return <ForgotPassword onDone={toSignin} />;
    if (screen.name === "demo") return <DemoDoor onBack={toLogin} onScreen={goScreen}
        onLoggedIn={(res, username) => { storeAuth(res.token, username); toLogin(); setToken(res.token); }} />;
    if (screen.name === "setup") return <SetupWorkspace onDone={toSignin}
        onLoggedIn={(res, username) => { storeAuth(res.token, username); toLogin(); setToken(res.token); }} />;
  }
  if (!token) {
    const signedIn = (res, username) => { storeAuth(res.token, username); setToken(res.token); };
    /* The form only when it was asked for. Everybody else gets the front door,
       set up or not - see PATHS. */
    if (screen && screen.name === "signin") {
      return <Login onScreen={goScreen} onLoggedIn={signedIn}
                    notice={screen.expired ? "You've been signed out. Sign in to continue." : ""} />;
    }
    return <PublicLanding onScreen={goScreen} />;
  }
  if (mustChangePassword) return <RequiredPasswordChange onDone={() => {setMustChangePassword(false);refresh();}} onLogout={() => signOut(true)} />;
  if (!data || !route) {
    return (
      <>
        <style>{ALL_CSS}</style>
        {bootError ? <div className="loginwrap"><div className="logincard card"><div className="cbody">
          <h2>Workspace could not load</h2>
          <p role="alert">{bootError}</p>
          <button className="btn pri" onClick={() => { setBootError(""); refresh(); }}>Try again</button>
          <button className="btn" onClick={() => signOut(false)}>Back to sign in</button>
        </div></div></div> : <BootSkeleton />}
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
      if (e.status === 401) { signOut(false, true); return false; }
      toast.warn("That didn't go through", e.message || "Something went wrong.");
      /* A refusal usually means this screen was behind the server: an addendum
         the vendor has not seen, a tender somebody else already moved on. Catch
         up, so what the person tries next is against the current state. */
      if (refreshAfter) refresh({ quiet: true });
      return false;
    } finally {
      setFlight((n) => Math.max(0, n - 1));
    }
  };

  /* As wrap, but hands back what the server answered (or null), for the
     few calls whose caller goes somewhere with the result. */
  const wrapValue = (fn) => async (...args) => {
    let out = null;
    const ok = await wrap(async (...a) => { out = await fn(...a); })(...args);
    return ok ? (out || {}) : null;
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
    markRead: wrap((ids) => raw(`/notifications/read/`, { method: "POST", body: ids ? { ids } : {} })),
    prequalDecision: wrap((sid, ok, reason) => raw(`/suppliers/${sid}/prequalify/`, { method: "POST", body: { ok, reason } })),
    inviteVendor: wrap((email) => raw(`/suppliers/invite/`, { method: "POST", body: { email } })),
    setReportingLine: wrap((personId, managerId) =>
      raw(`/team/org/`, { method: "POST", body: { personId, managerId } })),
    deleteMyDoc: wrap((docId) => raw(`/me/docs/${docId}/`, { method: "DELETE", body: {} })),
    duplicate: wrapValue((tid) => raw(`/tenders/${tid}/duplicate/`, { method: "POST", body: {} })),
    reviewBid: wrap((bidId, ok, reason) => raw(`/bids/${bidId}/review/`, { method: "POST", body: { ok, reason } })),
    rename: wrap((b) => raw(`/me/`, { method: "POST", body: b })),
    saveScores: wrap((bidId, scores, note) =>
      raw(`/bids/${bidId}/scores/`, { method: "POST", body: note === undefined ? { scores } : { scores, note } }), false),
    /* Not wrapped: the register upload is a two-step flow - preview, then
       apply - so the caller needs the response body, not a true/false, and
       shows the errors itself inside the dialog rather than as a toast. */
    importRegister: (file, extra) => uploadFile("/suppliers/import_register/", file, extra),
    /* Also unwrapped, and for the same reason: the registration drive is
       preview-then-confirm, and the preview's numbers are the thing the
       operator is being asked to agree to. A toast would throw them away. */
    campaignPreview: () => raw("/suppliers/campaign/"),
    campaignStart: (confirm) => raw("/suppliers/campaign/", { method: "POST", body: { action: "start", confirm } }),
    campaignStop: () => raw("/suppliers/campaign/", { method: "POST", body: { action: "stop" } }),

    /* ---- the event lifecycle ---- */
    extendDeadline: wrap((id, deadline, reason) =>
      raw(`/tenders/${id}/extend/`, { method: "POST", body: { deadline, reason } })),
    pauseEvent: wrap((id, reason) => raw(`/tenders/${id}/pause/`, { method: "POST", body: { reason } })),
    resumeEvent: wrap((id, deadline) =>
      raw(`/tenders/${id}/resume/`, { method: "POST", body: deadline ? { deadline } : {} })),
    cancelEvent: wrap((id, reason) => raw(`/tenders/${id}/cancel/`, { method: "POST", body: { reason } })),

    /* ---- the event's vendors ---- */
    /* `notify` is passed explicitly rather than left to the server's default,
       because the default is true and the caller is the only thing that knows
       whether the person adding these vendors meant to write to them. */
    addEventVendors: wrap((id, supplierIds, notify) =>
      raw(`/tenders/${id}/vendors/`, { method: "POST", body: { supplierIds, notify: !!notify } })),
    removeEventVendor: wrap((id, supplierId) =>
      raw(`/tenders/${id}/vendors/`, { method: "DELETE", body: { supplierId } })),
    notifyVendors: wrap((id, b) => raw(`/tenders/${id}/vendors/notify/`, { method: "POST", body: b })),

    /* ---- rounds ---- */
    createRound: wrap((id, b) => raw(`/tenders/${id}/rounds/`, { method: "POST", body: b })),
    openRound: wrap((rid) => raw(`/rounds/${rid}/open/`, { method: "POST", body: {} })),
    closeRound: wrap((rid) => raw(`/rounds/${rid}/close/`, { method: "POST", body: {} })),
    cancelRound: wrap((rid, reason) => raw(`/rounds/${rid}/cancel/`, { method: "POST", body: { reason } })),

    /* ---- the vendor register ---- */
    suspendVendor: wrap((sid, on, reason) =>
      raw(`/suppliers/${sid}/suspend/`, { method: "POST", body: on ? { ok: true, reason } : { ok: false } })),
  };

  /* Unwrapped, like the register import: the Finance page holds its own data
     and renders its own loading and error states, so a `wrap` that swallowed
     the response into true/false and toasted the failure would leave the page
     with nothing to draw and no way to say why. */
  const finance = {
    state: (year) => fetchFinance(year),
    exceptions: () => fetchFinanceExceptions(),
    feeds: () => financeFeeds(),
    import: (file, extra) => importFinance(file, extra),
    baselineFor: (category, supplierId) => baselineFor(category, supplierId),
    baselines: () => fetchBaselines(),
    adoptBaselines: (picks) => adoptBaselines(picks),
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
    rememberScroll();
    const path = routeToPath(r);
    if (path !== window.location.pathname + window.location.search) window.history.pushState({}, "", path);
    currentPath.current = path;
    /* flushSync so the browser captures the new DOM inside the transition; the
       refresh stays outside it, because a transition must not wait on a fetch. */
    withViewTransition(() => flushSync(() => {
      setNav(false);   // a chosen destination closes the drawer over it
      setRoute(r);
    }));
    refresh(); // silent: keeps the current view until fresh data lands
  };

  const onSwitch = async (username) => {
    setDemo(true);   // switching persona is a demo action: same reason as DemoDoor
    try {
      const res = await demoLogin(username);
      storeAuth(res.token, username);
      window.history.replaceState({}, "", "/demo");
      setGuide(false); setSecurity(false);
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

  /* A tab switched inside a page: rewrite the address so a refresh keeps it,
     without a new history entry and without remounting the page. */
  const setTab = (tab) => {
    const path = routeToPath({ ...route, tab: tab || undefined });
    window.history.replaceState({}, "", path);
    currentPath.current = path;
  };
  const setView = (patch) => {
    const next = { ...route, ...patch };
    window.history.replaceState({}, "", routeToPath(next));
    currentPath.current = routeToPath(next);
    setRoute(next);
  };
  const api = { state: data, user, go, route, act, ai, finance, toast, refresh, setTab, setView };
  /* Re-armed on every page: anything marked data-reveal below the fold arrives
     as you reach it, once, then the observer lets it go. The call itself is
     hoisted above the early returns, where hooks have to live. */
  const allowed = allowedPages(user);
  if (!allowed.length) return <><style>{ALL_CSS}</style><div className="loginwrap"><div className="logincard card"><div className="cbody">
    <h2>Your account is ready</h2><p>Your role and reporting line are awaiting assignment. You can sign in again once your administrator gives you access.</p>
    <button className="btn" onClick={() => signOut(true)}>Sign out</button>
  </div></div></div></>;
  const page = allowed.includes(route.page) ? route.page : homePage(user);
  const currentTender = data.tenders.find((t) => t.id === route.id);
  const bidRoomRound = currentTender ? activeRound(currentTender)?.id || roundsOf(currentTender).at(-1)?.id || "r1" : "missing";

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
    <div className={"dk" + (inDemo() ? " isdemo" : "")}>
      <style>{ALL_CSS}</style>
      {/* An unmissable, permanent reminder. The demo and the real workspace are
          the same URL apart from a path, and somebody who forgets which one
          they are in will eventually type something real into the wrong one. */}
      {inDemo() && (
        <div className="demobar" role="status">
          Demo · nothing here is real
          <button className="doclink" onClick={() => { signOut(true); window.location.href = "/"; }}>
            leave
          </button>
        </div>
      )}
      <Keys allowed={allowed} go={go} onPalette={() => setPalette(true)} onSheet={() => setKeysheet(true)} />
      {palette && <Palette api={api} allowed={allowed} chrome={chrome} onClose={() => setPalette(false)} />}
      {keysheet && <ShortcutSheet allowed={allowed} onClose={() => setKeysheet(false)} />}
      <Sidebar api={api} chrome={chrome} open={drawerOpen} desktop={desktop} onClose={() => setNav(false)} />
      {drawerOpen && <div className="navscrim" onClick={() => setNav(false)} aria-hidden="true" />}
      <div className="main">
        <Topbar api={api} chrome={chrome} desktop={desktop} navOpen={drawerOpen}
                onMenu={() => setNav(true)} busy={inFlight > 0} />
        {askReset && (
          <ConfirmDialog title="Reset all demo data?" confirmLabel="Hold to reset the demo" tone="wax"
                         hold holdHint="Wipes everything: hold to confirm"
                         onClose={() => setAskReset(false)} onConfirm={onReset}>
            Every tender, bid, score, letter, notification and audit event goes back to the original seed,
            including anything you created in this session. <b>This cannot be undone.</b>
          </ConfirmDialog>
        )}
        {guide && <GuidePanel role={user.role} user={user} onClose={() => setGuide(false)} />}
        {security && <SecurityPanel me={user} onRenamed={refresh} onClose={() => setSecurity(false)}
          onLogoutAll={async () => { try { await raw("/auth/logout_all/", { method: "POST", body: {} }); } catch (e) {} signOut(false); }} />}
        <main className={"content" + (hasViewTransitions() ? "" : " pageenter")} key={page || "none"}>
          {bootError && <div className="notice" role="status" style={{ marginBottom: 12 }}>
            Updates are paused. Showing the last loaded data. {bootError}
            <button className="btn sm" onClick={() => refresh({ quiet: true })}>Try again</button>
          </div>}
          <PageBoundary key={`${user.id}:${page}:${route.id || ""}`}>
          <Suspense fallback={<div className="card"><div className="cbody" role="status">Opening this page...</div></div>}>
          {!page && (
            <div className="card"><div className="cbody">
              <h3>You don't have access to anything yet</h3>
              <p className="muted">Ask your DOCKET administrator to give your account access to the parts of the workspace you need.</p>
            </div></div>
          )}
          {page === "dashboard" && <Dashboard api={api} />}
          {page === "tenders" && <TendersPage api={api} />}
          {page === "tender" && <TenderDetail key={route.id + (route.tab || "")} api={api} id={route.id} initialTab={route.tab} />}
          {page === "auctions" && <AuctionsPage api={api} />}
          {/* One page name, two rooms. A bidder and a buyer are looking at the
              same auction and at almost opposite views of it: the bidder sees
              their own rank and their own prices, the buyer sees the whole
              board. The server already decides which is which, so the only
              question here is whose screen to draw. */}
          {page === "auction" && (user.role === "supplier"
            ? <AuctionRoom key={route.id} api={api} id={route.id} />
            : <AuctionPage key={route.id} api={api} id={route.id} />)}
          {page === "new" && <NewTender key={route.editId || "new"} api={api} editId={route.editId} />}
          {page === "suppliers" && <SuppliersPage api={api} />}
          {page === "team" && <TeamPage api={api} />}
          {page === "analytics" && <AnalyticsPage api={api} />}
          {page === "finance" && <FinancePage api={api} />}
          {page === "scorecards" && <ScorecardsPage api={api} />}
          {page === "audit" && <AuditPage api={api} />}
          {page === "approvals" && <ApprovalsPage api={api} />}
          {page === "evals" && <EvalsPage api={api} />}
          {page === "portal" && <PortalHome key={user.id} api={api} />}
          {page === "bidroom" && <BidRoom key={`${user.supplierId}:${route.id}:${bidRoomRound}`} api={api} id={route.id} />}
          </Suspense>
          </PageBoundary>
        </main>
      </div>
      <Toasts items={toasts} onDismiss={dropToast} />
    </div>
  );
}

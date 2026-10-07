/* API client with bearer-token auth. All authorisation, sealing and
   blindness are enforced server-side; the token only says who you are.

   TWO BACKENDS, ONE ORIGIN. The demo lives at /demo on the same domain as the
   real workspace, and it is NOT the same application: it is a second gunicorn
   with a second database, reached through /demo-api/ instead of /api/.

   That separation is the whole point and it is worth being blunt about why.
   DOCKET is single-tenant - OrgSetting is one row, and no tender, bid or
   supplier carries a tenant key. Serving the demo from the real workspace's
   database would mean seeded tenders sitting beside real ones, and turning on
   the one-click personas would put a password-free door onto the workspace
   holding real sealed bids. So the demo gets its own process and its own
   database, and only the URL is shared.

   WHICH BACKEND a request goes to is remembered, not recomputed. Landing on
   /demo sets the flag; from then on every call in that browser goes to the
   demo until the visitor signs out. Deriving it from window.location instead
   would break the moment the app routes internally - you would click into a
   tender and start talking to the real backend with a demo token. */

const TKEY = "docket_token";
const UKEY = "docket_user";
const DKEY = "docket_demo";

/* Set the instant /demo is opened, cleared on sign-out. sessionStorage rather
   than localStorage: a demo is a visit, not a preference, and a stale flag in
   a tab opened last week pointing at the wrong backend is a confusing bug. */
export const inDemo = () => {
  try { return sessionStorage.getItem(DKEY) === "1"; } catch (e) { return false; }
};
export const setDemo = (on) => {
  try {
    if (on) sessionStorage.setItem(DKEY, "1");
    else sessionStorage.removeItem(DKEY);
  } catch (e) { /* private mode: fall back to the real backend, which is safe */ }
};

/** The API root for this browser. `/api` normally, `/demo-api` in the demo. */
export const apiBase = () => (inDemo() ? "/demo-api" : "/api");

export const getToken = () => localStorage.getItem(TKEY);
export const getUsername = () => localStorage.getItem(UKEY) || "";
export const storeAuth = (token, username) => {
  localStorage.setItem(TKEY, token);
  if (username) localStorage.setItem(UKEY, username);
};
export const clearAuth = () => {
  localStorage.removeItem(TKEY);
  setDemo(false);   // signing out of the demo leaves the demo
};

/* What a person reads when the request never got a sentence of its own back.
   "Failed to fetch" and "Request failed (502)" are the browser and the proxy
   talking; nobody can act on them. */
const OFFLINE = "We can't reach DOCKET right now. Check your connection and try again.";
const RESTARTING = "DOCKET is restarting. Try again in a minute.";
function plainError(status, said) {
  if (status === 413) return "That file is too large.";
  if (status === 502 || status === 503 || status === 504) return RESTARTING;
  if (said === "Invalid JSON body.") return "Something went wrong sending that. Please try again.";
  if (said) return said;
  if (status >= 500) return "Something went wrong on our side. Please try again.";
  if (status === 401) return "You've been signed out. Sign in to continue.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "We couldn't find that. It may have been removed.";
  return "That didn't go through. Please try again.";
}

/** fetch, with a network failure turned into a sentence. */
async function send(url, init) {
  try { return await fetch(url, init); }
  catch (e) {
    const err = new Error(OFFLINE);
    err.status = 0;
    throw err;
  }
}

async function handle(r) {
  let data = null;
  try { data = await r.json(); } catch (e) { /* empty or binary */ }
  if (!r.ok) {
    const e = new Error(plainError(r.status, data && data.error));
    e.status = r.status;
    /* The whole body, not just the sentence. A refusal sometimes carries the
       way out of it - a duplicate vendor comes back with the record it clashed
       with, so the caller can offer that one instead of a dead end. */
    e.data = data;
    throw e;
  }
  return data;
}

export async function raw(path, { method = "GET", body } = {}) {
  const r = await send(apiBase() + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handle(r);
}

export async function uploadFile(path, file, extra = {}) {
  const fd = new FormData();
  fd.append("file", file);
  Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
  const r = await send(apiBase() + path, {
    method: "POST",
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    body: fd,
  });
  return handle(r);
}

/* Downloads are fired from plain onClick handlers that nobody awaits, so a
   thrown error went nowhere and the button simply did nothing. They report
   through a window event instead; App.jsx turns it into a warning toast. */
export const DOWNLOAD_FAILED = "docket:download-failed";

async function download(path, name) {
  try {
    const r = await send(apiBase() + path, {
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    });
    if (!r.ok) {
      let said = null;
      try { said = (await r.json()).error; } catch (e) { /* not JSON */ }
      throw new Error(r.status === 403 ? "You don't have permission to download that." : plainError(r.status, said));
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (e) {
    window.dispatchEvent(new CustomEvent(DOWNLOAD_FAILED, { detail: { name, message: e.message } }));
    return false;
  }
}

export const downloadDoc = (docId, name) => download(`/docs/${docId}/download/`, name);

/* An <img> cannot send the bearer token, so a protected picture is fetched
   here and handed back as an object URL. The caller revokes it. */
export async function blobUrl(path) {
  const r = await fetch(apiBase() + path, {
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  });
  if (!r.ok) throw new Error("Could not load that image.");
  return URL.createObjectURL(await r.blob());
}

export const fetchBootstrap = () => raw("/bootstrap/");

/* The finance rollups, fetched on their own rather than with the bootstrap:
   they read a mirrored ledger that can run to tens of thousands of invoices,
   and one page wants them. Putting them in bootstrap would make an evaluator's
   scoring screen wait on a payables aggregation. */
export const fetchFinance = (year) => raw(`/finance/${year ? `?year=${year}` : ""}`);
export const fetchFinanceExceptions = () => raw("/finance/exceptions/");
export const financeFeeds = () => raw("/finance/import/");
/* Baselines derived from the imported ledger: what a category used to cost,
   and the bulk backfill for awards made before this system existed. */
export const baselineFor = (category, supplierId) =>
  raw(`/finance/baseline/?category=${encodeURIComponent(category)}`
      + (supplierId ? `&supplierId=${encodeURIComponent(supplierId)}` : ""));
export const fetchBaselines = () => raw("/finance/baselines/");
export const adoptBaselines = (picks) => raw("/finance/baselines/", { method: "POST", body: { picks } });
export const importFinance = (file, extra) => uploadFile("/finance/import/", file, extra);
export const authConfig = () => raw("/auth/config/");

/* The site's look - layout and accent - always comes from the main site,
   never from the demo backend. The administration console that sets it
   writes to the main site's database; the demo has a database of its own that
   nobody's console reaches and that is wiped back to seed every night, so
   asking it painted the demo in the default blue whatever had been chosen.
   One site, one look. Falls back to whichever backend this browser is on, for
   a deployment where the two are the same process anyway. */
export async function siteAppearance() {
  try {
    const r = await fetch("/api/auth/config/");
    if (r.ok) {
      const c = await r.json();
      return { landing: c.landing, accent: c.accent };
    }
  } catch (e) { /* fall through */ }
  const c = await authConfig();
  return { landing: c.landing, accent: c.accent };
}
export const login = (username, password) => raw("/auth/login/", { method: "POST", body: { username, password } });
export const demoLogin = (username) => raw("/auth/demo/", { method: "POST", body: { username } });
export const logout = () => raw("/auth/logout/", { method: "POST", body: {} });

export const registerVendor = (b) => raw("/register/vendor/", { method: "POST", body: b });
export const verifyVendor = (token) => raw("/register/verify/", { method: "POST", body: { token } });
/* Registration-drive links. `lookupClaim` resolves the token to the register
   record it was minted for, so the form can name the company before anyone
   types; `claimVendor` attaches a login to that record rather than creating a
   second one for a company already on the register. */
export const lookupClaim = (token) => raw(`/register/claim/?token=${encodeURIComponent(token)}`);
export const claimVendor = (token, password) => raw("/register/claim/", { method: "POST", body: { token, password } });
export const acceptInvite = (b) => raw("/register/accept_invite/", { method: "POST", body: b });
/* first-run setup: open only while the workspace has no buyer accounts (or in
   demo), and gated behind an access code issued out of band. The code is
   checked on its own so the wizard can refuse it on the first screen rather
   than after five. */
export const setupStatus = () => raw("/setup/");
export const setupWorkspace = (b) => raw("/setup/", { method: "POST", body: b });
export const verifySetupCode = (code) => raw("/setup/code/", { method: "POST", body: { code } });

/* the workspace's own identity: the company profile, the authority ladder and
   the mark that replaces the DOCKET seal in the chrome once it is set */
export const saveSettings = (b) => raw("/settings/", { method: "POST", body: b });
export const uploadLogo = (file) => uploadFile("/settings/logo/", file);
export const clearLogo = () => raw("/settings/logo/", { method: "DELETE", body: {} });
export const setApprovalLevel = (personId, levelId) =>
  raw("/team/authority/", { method: "POST", body: { personId, levelId } });
export const forgotPassword = (email) => raw("/auth/forgot/", { method: "POST", body: { email } });
export const resetPassword = (token, password) => raw("/auth/reset_password/", { method: "POST", body: { token, password } });

export const downloadUrl = (path, name) => download(path, name);

/* API client with bearer-token auth. All authorisation, sealing and
   blindness are enforced server-side; the token only says who you are. */

const TKEY = "docket_token";
const UKEY = "docket_user";

export const getToken = () => localStorage.getItem(TKEY);
export const getUsername = () => localStorage.getItem(UKEY) || "";
export const storeAuth = (token, username) => {
  localStorage.setItem(TKEY, token);
  if (username) localStorage.setItem(UKEY, username);
};
export const clearAuth = () => localStorage.removeItem(TKEY);

async function handle(r) {
  let data = null;
  try { data = await r.json(); } catch (e) { /* empty or binary */ }
  if (!r.ok) {
    const e = new Error((data && data.error) || `Request failed (${r.status})`);
    e.status = r.status;
    /* The whole body, not just the sentence. A refusal sometimes carries the
       way out of it — a duplicate vendor comes back with the record it clashed
       with, so the caller can offer that one instead of a dead end. */
    e.data = data;
    throw e;
  }
  return data;
}

export async function raw(path, { method = "GET", body } = {}) {
  const r = await fetch("/api" + path, {
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
  const r = await fetch("/api" + path, {
    method: "POST",
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    body: fd,
  });
  return handle(r);
}

export async function downloadDoc(docId, name) {
  const r = await fetch(`/api/docs/${docId}/download/`, {
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  });
  if (!r.ok) throw new Error("Download not allowed.");
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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

export async function downloadUrl(path, name) {
  const r = await fetch("/api" + path, { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} });
  if (!r.ok) throw new Error("Download not allowed.");
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

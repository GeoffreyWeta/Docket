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
export const authConfig = () => raw("/auth/config/");
export const login = (username, password) => raw("/auth/login/", { method: "POST", body: { username, password } });
export const demoLogin = (username) => raw("/auth/demo/", { method: "POST", body: { username } });
export const logout = () => raw("/auth/logout/", { method: "POST", body: {} });

export const registerVendor = (b) => raw("/register/vendor/", { method: "POST", body: b });
export const verifyVendor = (token) => raw("/register/verify/", { method: "POST", body: { token } });
export const acceptInvite = (b) => raw("/register/accept_invite/", { method: "POST", body: b });
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

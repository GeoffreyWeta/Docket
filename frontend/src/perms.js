/* What this signed-in person can do, on the client.

   The server is the authority — every endpoint checks the same capability, and
   sealing and blindness are enforced at serialization time. This module exists
   so the interface agrees with the answer: a button nobody is allowed to press
   should not be on the page, and a section somebody has just been granted
   should appear in their sidebar without a new release.

   `user.perms` arrives with the bootstrap payload (see Profile.identity), and is
   the role's defaults plus or minus whatever an administrator changed for them.
   Roles are not enumerated here on purpose: a workspace can invent its own
   ("CEO", "Legal") and this file must not need editing when it does. */

export const can = (user, key) => !!user && (user.perms || []).includes(key);

/** Sections of the workspace, in the order a sidebar reads them. */
export const PAGE_PERM = {
  dashboard: "page.dashboard",
  approvals: "page.approvals",
  evals: "page.evals",
  tenders: "page.tenders",
  suppliers: "page.suppliers",
  scorecards: "page.scorecards",
  team: "page.team",
  analytics: "page.analytics",
  finance: "page.finance",
  audit: "page.audit",
  portal: "page.portal",
};

export const PAGE_ORDER = Object.keys(PAGE_PERM);

/** Destinations reached from within a section rather than from the sidebar. */
function subPages(pages, user) {
  const out = [];
  if (pages.some((p) => ["dashboard", "tenders", "approvals", "evals", "audit", "scorecards", "finance"].includes(p))) out.push("tender");
  if (can(user, "tender.create") || can(user, "tender.edit")) out.push("new");
  if (pages.includes("portal")) out.push("bidroom");
  return out;
}

/** Every route this person may open. */
export function allowedPages(user) {
  const pages = PAGE_ORDER.filter((p) => can(user, PAGE_PERM[p]));
  return [...pages, ...subPages(pages, user)];
}

/** Sidebar destinations only — no sub-pages. */
export function navPages(user) {
  return PAGE_ORDER.filter((p) => can(user, PAGE_PERM[p]));
}

/* Where a role likes to land, when it still may. Anything else — including a
   role the workspace invented this morning — lands on its first section. */
const PREFERRED_HOME = {
  procurement: "dashboard", evaluator: "evals", approver: "approvals",
  auditor: "audit", supplier: "portal",
};

export function homePage(user) {
  const pages = navPages(user);
  const pref = PREFERRED_HOME[user.role];
  if (pref && pages.includes(pref)) return pref;
  return pages[0] || "audit";
}

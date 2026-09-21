/* First-run setup: the access code, you, your company, your authority ladder,
   your people, your vendors. One sitting, no console.

   Built the way New tender is built. The form asks questions in the words a
   person would use, every field explains itself underneath, and the panel on
   the right says what is still missing and jumps you to it. The button is
   disabled until it can succeed, and it is never disabled silently.

   Six steps, but one form: nothing is saved until the end, so going back costs
   nothing and there is no half-made workspace to clean up if somebody closes
   the tab. The one exception is the access code, which is checked on its own
   the moment it is entered — asking somebody to fill in five screens before
   telling them the code on the first one was wrong is the kind of form people
   abandon.

   When it does save, the person lands signed in on their own dashboard — not
   on a sign-in page asking for the password they just typed.

   THE ORG CHART IS THE HARD PART, and it is worth saying why it is shaped
   like this. A team list with a "manager" dropdown per row is the obvious
   design and it is wrong in one specific way: the dropdown has to offer people
   who do not exist yet, and it has to refuse the cycles that offering them
   makes possible. So rows carry a stable local key, the dropdown offers you
   plus everyone who is not already below the row being edited, and the
   preview underneath draws the tree that results. You can see the chart you
   are describing while you describe it. */
import React, { useEffect, useMemo, useRef, useState } from "react";

import { setupStatus, setupWorkspace, verifySetupCode } from "./api";
import { DRAFT_CSS } from "./buyer";
import { fmtMoney, uid } from "./helpers";
import { ICON_CSS, Icon } from "./icons";
import { ILLUS_CSS, Illus } from "./illus";
import { LOGO_CSS, Wordmark, initialsOf } from "./logo";
import { MOTION_CSS, reducedMotion } from "./motion";
import { PAGE_CSS } from "./page";
import { CSS, EXTRA_CSS, THEME_CSS } from "./styles";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const OWNER = "owner";

const ROLES = [
  ["procurement", "Procurement", "Drafts tenders, invites vendors, opens the sealed bids. Cannot approve their own work."],
  ["approver",    "Approver",    "Signs publications and awards up to their authority limit."],
  ["evaluator",   "Evaluator",   "Scores bids on their own. Never sees another member's numbers."],
  ["auditor",     "Auditor",     "Reads everything, changes nothing."],
];
const ROLE_LABEL = Object.fromEntries(ROLES.map(([k, l]) => [k, l]));

/* A ladder most organisations recognise, offered as a starting point rather
   than imposed. Every row is editable and the whole thing can be deleted.

   `role` is deliberately blank on all four. A rung's authority is the people
   standing on it; the role is a fallback for a rung nobody stands on yet, and
   defaulting every rung to "approver" would have made all four interchangeable
   for anyone holding that role - which is a ladder that enforces nothing. See
   approvals.may_sign. */
const SUGGESTED_LADDER = [
  { name: "Line Manager",        limit: 5_000_000,   role: "" },
  { name: "Head of Department",  limit: 50_000_000,  role: "" },
  { name: "Director",            limit: 500_000_000, role: "" },
  { name: "Chief Executive",     limit: 0,           role: "" },
];

const INDUSTRIES = ["Hospitality", "Manufacturing", "Food & Beverage", "Retail",
  "Construction", "Oil & Gas", "Financial Services", "Healthcare", "Education",
  "Logistics & Transport", "Technology", "Agriculture", "Public Sector", "Other"];

const CURRENCIES = [["NGN", "Naira (₦)"], ["USD", "US dollar ($)"],
  ["GBP", "Pound sterling (£)"], ["EUR", "Euro (€)"], ["GHS", "Cedi (₵)"],
  ["KES", "Kenyan shilling (KSh)"], ["ZAR", "Rand (R)"]];

const VENDOR_SAMPLE = "name,category,email\nColdline Logistics Ltd,Logistics,tenders@coldline.example\nPackRight Industries,Packaging,bids@packright.example";

/* ------------------------------------------------------------------ helpers */

const money = (n) => (Number(n) > 0 ? fmtMoney(Number(n)) : "unlimited");

/** Parse a pasted or uploaded vendor list. Accepts CSV and TSV, with or
    without a header row, and maps whatever column names it finds onto the four
    fields that matter. Returns {rows, warnings}. */
export function parseVendors(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], warnings: [] };
  const delim = (lines[0].match(/\t/g) || []).length > (lines[0].match(/,/g) || []).length ? "\t" : ",";
  const split = (line) => {
    /* Quoted cells matter here: a vendor address is full of commas, and a
       naive split turns one company into four. */
    const out = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === delim && !q) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim().replace(/^"|"$/g, ""));
  };

  const ALIAS = {
    name: ["name", "vendor", "supplier", "company", "companyname", "vendorname", "suppliername", "businessname"],
    email: ["email", "mail", "emailaddress", "contactemail", "e-mail"],
    category: ["category", "class", "classification", "type", "sector", "service", "goods"],
    contact: ["contact", "contactperson", "person", "attention"],
    phone: ["phone", "tel", "telephone", "mobile", "phonenumber"],
    location: ["location", "city", "state", "address", "town"],
  };
  const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, "");

  const first = split(lines[0]);
  const map = {};
  let hasHeader = false;
  first.forEach((cell, i) => {
    const n = norm(cell);
    for (const [field, names] of Object.entries(ALIAS)) {
      if (names.includes(n) && map[field] === undefined) { map[field] = i; hasHeader = true; }
    }
  });
  /* No header: assume the order people actually type, which is name first and
     an email somewhere. The email column is found by looking for an @. */
  if (!hasHeader) {
    map.name = 0;
    const emailCol = first.findIndex((c) => c.includes("@"));
    if (emailCol > 0) map.email = emailCol;
    if (first.length > 1 && emailCol !== 1) map.category = 1;
    if (first.length > 2 && emailCol !== 2 && map.email === undefined) map.email = 2;
  }

  const warnings = [];
  const rows = [];
  const seen = new Set();
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cells = split(line);
    const get = (f) => (map[f] === undefined ? "" : (cells[map[f]] || "").trim());
    const name = get("name");
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) { warnings.push(`${name} appears more than once — kept once.`); continue; }
    seen.add(key);
    const email = get("email");
    if (email && !EMAIL.test(email)) {
      warnings.push(`${name}: "${email}" is not a valid address — they will be added without one.`);
    }
    rows.push({
      id: uid(), name: name.slice(0, 120),
      email: email && EMAIL.test(email) ? email.toLowerCase() : "",
      category: get("category").slice(0, 60), contact: get("contact").slice(0, 140),
      phone: get("phone").slice(0, 120), location: get("location").slice(0, 60),
    });
  }
  return { rows, warnings: warnings.slice(0, 12) };
}

/** Everyone who may not be `row`'s manager: themselves, and anyone already
    below them. Offering a cycle and then refusing it is worse than not
    offering it, because the person has already decided what they wanted. */
function descendantsOf(key, team) {
  const kids = {};
  for (const r of team) (kids[r.reportsTo] = kids[r.reportsTo] || []).push(r.key);
  const out = new Set();
  const stack = [...(kids[key] || [])];
  while (stack.length) {
    const k = stack.pop();
    if (out.has(k)) continue;
    out.add(k);
    stack.push(...(kids[k] || []));
  }
  return out;
}

/** The chart as nested rows, for the preview. */
function treeRows(team, ownerName) {
  const kids = {};
  for (const r of team) (kids[r.reportsTo || OWNER] = kids[r.reportsTo || OWNER] || []).push(r);
  const out = [{ key: OWNER, name: ownerName || "You", role: "procurement", depth: 0, owner: true }];
  const walk = (parent, depth) => {
    for (const r of kids[parent] || []) {
      out.push({ ...r, depth });
      walk(r.key, depth + 1);
    }
  };
  walk(OWNER, 1);
  /* Anyone whose manager row was deleted mid-edit still has to appear, or
     they vanish from the preview while remaining in the payload. */
  const shown = new Set(out.map((r) => r.key));
  for (const r of team) if (!shown.has(r.key)) out.push({ ...r, depth: 1, orphan: true });
  return out;
}

/* -------------------------------------------------------------- the wizard */

const STEPS = ["Access", "You", "Your company", "Authority", "Your team", "Your vendors"];

export function SetupWorkspace({ onDone, onLoggedIn }) {
  const [status, setStatus] = useState(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(null);

  const [code, setCode] = useState("");
  const [codeOk, setCodeOk] = useState(false);
  const [codeMsg, setCodeMsg] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);

  const [f, setF] = useState({
    name: "", email: "", password: "", title: "Head of Procurement",
    company: "", short: "", threshold: "50000000",
    profile: {
      legalName: "", rcNumber: "", tin: "", industry: "", sector: "",
      addressLine1: "", addressLine2: "", city: "", state: "", country: "Nigeria",
      postcode: "", phone: "", email: "", website: "", currency: "NGN",
      timezone: "Africa/Lagos", fiscalYearStart: "01-01", sizeBand: "",
      registeredYear: "", description: "",
    },
    logo: "",
    logoName: "",
    levels: SUGGESTED_LADDER.map((l) => ({ ...l, id: uid(), holders: [] })),
    useLadder: true,
    ownerLevel: "",
    team: [],
    vendors: [],
    inviteVendors: true,
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setProfile = (k, v) => setF((x) => ({ ...x, profile: { ...x.profile, [k]: v } }));
  const logoInput = useRef(null);
  const vendorInput = useRef(null);
  const [vendorWarn, setVendorWarn] = useState([]);
  const [vendorText, setVendorText] = useState("");

  useEffect(() => {
    setupStatus()
      .then((s) => { setStatus(s); if (!s.codeRequired) setCodeOk(true); })
      .catch(() => setStatus({ open: true, demo: false, codeRequired: true }));
  }, []);

  /* ---- the ladder ---- */
  const levels = f.useLadder ? f.levels : [];
  const sortedLevels = useMemo(
    () => [...levels].sort((a, b) => (Number(a.limit) || Infinity) - (Number(b.limit) || Infinity)),
    [levels]);
  const addLevel = () => set("levels", [...f.levels, { id: uid(), name: "", limit: 0, role: "", holders: [] }]);
  const editLevel = (id, patch) => set("levels", f.levels.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const dropLevel = (id) => setF((x) => ({
    ...x,
    levels: x.levels.filter((l) => l.id !== id),
    ownerLevel: x.ownerLevel === id ? "" : x.ownerLevel,
    team: x.team.map((t) => (t.level === id ? { ...t, level: "" } : t)),
  }));

  /* ---- the team ---- */
  const addPerson = () => set("team", [...f.team, {
    key: uid(), name: "", email: "", role: "evaluator", title: "", reportsTo: OWNER, level: "",
  }]);
  const editPerson = (key, patch) => set("team", f.team.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  const dropPerson = (key) => setF((x) => ({
    ...x,
    /* Anyone who reported to the person leaving is re-parented to you rather
       than orphaned. Silently dropping them off the chart is how somebody
       ends up invited with no manager and no explanation. */
    team: x.team.filter((t) => t.key !== key)
      .map((t) => (t.reportsTo === key ? { ...t, reportsTo: OWNER } : t)),
  }));

  const filledTeam = f.team.filter((t) => t.email.trim());
  const chart = useMemo(() => treeRows(filledTeam, f.name.trim()), [filledTeam, f.name]);

  /* ---- validation: every condition able to say what to do about it ---- */
  const badEmail = filledTeam.find((t) => !EMAIL.test(t.email.trim()));
  const dupEmail = (() => {
    const seen = new Set([f.email.trim().toLowerCase()].filter(Boolean));
    for (const t of filledTeam) {
      const e = t.email.trim().toLowerCase();
      if (seen.has(e)) return t;
      seen.add(e);
    }
    return null;
  })();
  const namelessLevel = f.useLadder && f.levels.find((l) => l.name.trim().length < 2);
  const unlimitedCount = f.levels.filter((l) => !Number(l.limit)).length;

  /* Rungs with nobody standing on them and no role to fall back to. Mirrors
     approvals.unreachable on the server, which reports the same gap on the
     Team page once the workspace is live. */
  const emptyRungs = !f.useLadder ? [] : f.levels
    .filter((l) => l.name.trim() && !l.role
      && f.ownerLevel !== l.id && !filledTeam.some((t) => t.level === l.id))
    .map((l) => l.name.trim());

  const checks = [
    { key: "code", step: 0, ok: codeOk, to: "su-code",
      todo: "Enter your access code", done: "Access code accepted",
      note: "Issued to your organisation." },
    { key: "name", step: 1, ok: f.name.trim().length >= 2, to: "su-name",
      todo: "Tell us your name", done: "You are " + f.name.trim() },
    { key: "email", step: 1, ok: EMAIL.test(f.email.trim()), to: "su-email",
      todo: "Enter your work email", done: f.email.trim(), note: "It becomes your sign-in." },
    { key: "pw", step: 1, ok: f.password.length >= 8, to: "su-pw",
      todo: "Choose a password", done: "Password set", note: "At least 8 characters." },
    { key: "company", step: 2, ok: f.company.trim().length >= 2, to: "su-company",
      todo: "Name your company", done: f.company.trim(),
      note: "It goes on every letter and reference." },
    { key: "ladder", step: 3,
      ok: !f.useLadder || (f.levels.length > 0 && !namelessLevel && unlimitedCount === 1),
      to: "su-ladder",
      todo: !f.levels.length ? "Add at least one approval level"
        : namelessLevel ? "Name every approval level"
        : unlimitedCount === 0 ? "Give the top level unlimited authority"
        : "Only the top level may be unlimited",
      done: f.useLadder
        ? `${f.levels.length} level${f.levels.length === 1 ? "" : "s"} of signing authority`
        : "Single threshold: " + (Number(f.threshold) > 0
          ? "sign-off from " + fmtMoney(Number(f.threshold)) : "everything publishes straight away"),
      note: f.useLadder
        ? "Requests walk your reporting line until somebody's limit covers the amount."
        : undefined },
    { key: "team", step: 4, ok: !badEmail && !dupEmail, to: "su-team",
      todo: badEmail ? `Fix ${badEmail.email.trim() || "an empty email"} in your team list`
        : dupEmail ? `${dupEmail.email.trim()} is on the list twice`
        : "Team list looks fine",
      done: filledTeam.length
        ? `${filledTeam.length} ${filledTeam.length === 1 ? "person" : "people"} on the chart`
        : "No team yet, that is fine",
      /* Named, not counted. "Some levels are empty" sends somebody back to
         re-read four rows; "nobody holds Director or Chief Executive" sends
         them to the two that are wrong. It stays a warning rather than a
         blocker because a workspace is allowed to be set up before the people
         exist — but it is the warning that stops a tender from being raised
         into a chain with nobody at the end of it. */
      note: emptyRungs.length
        ? `Nobody holds ${emptyRungs.join(" or ")}. A request that reaches ${emptyRungs.length === 1 ? "that rung" : "those rungs"} will wait with no named signatory.`
        : undefined },
    { key: "vendors", step: 5, ok: true, to: "su-vendors",
      todo: "", done: f.vendors.length
        ? `${f.vendors.length} vendor${f.vendors.length === 1 ? "" : "s"} ready to load`
        : "No vendors yet, you can import later",
      note: f.vendors.length && f.inviteVendors
        ? `${f.vendors.filter((v) => v.email).length} will be emailed an invitation.` : undefined },
  ];
  const outstanding = checks.filter((c) => !c.ok);
  const ready = outstanding.length === 0;
  const stepOk = (i) => checks.filter((c) => c.step === i).every((c) => c.ok);
  const locked = (i) => i > 0 && !codeOk;   // nothing before the code is checked

  const jump = (c) => {
    setStep(c.step);
    setTimeout(() => {
      const el = document.getElementById(c.to);
      if (!el) return;
      el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
      el.classList.remove("jumped"); void el.offsetWidth; el.classList.add("jumped");
      const inp = el.matches("input,select,textarea") ? el : el.querySelector("input,select,textarea");
      if (inp) inp.focus({ preventScroll: true });
    }, 30);
  };

  const submitCode = async () => {
    setCodeBusy(true); setCodeMsg("");
    try {
      await verifySetupCode(code.trim());
      setCodeOk(true);
      setStep(1);
    } catch (e) {
      setCodeOk(false);
      setCodeMsg(e.message || "That code was not accepted.");
    }
    setCodeBusy(false);
  };

  const onLogo = async (file) => {
    if (!file) return;
    if (file.size > 256 * 1024) {
      setMsg(`That logo is ${Math.round(file.size / 1024)} KB and the limit is 256 KB. Export it smaller, or use an SVG.`);
      return;
    }
    setMsg("");
    const reader = new FileReader();
    reader.onload = () => setF((x) => ({ ...x, logo: String(reader.result || ""), logoName: file.name }));
    reader.readAsDataURL(file);
  };

  const loadVendorText = (text) => {
    const { rows, warnings } = parseVendors(text);
    setF((x) => ({ ...x, vendors: rows }));
    setVendorWarn(warnings);
  };

  const submit = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await setupWorkspace({
        code: code.trim(),
        name: f.name.trim(), email: f.email.trim().toLowerCase(), password: f.password,
        title: f.title.trim(),
        company: f.company.trim(), short: f.short.trim(),
        profile: f.profile, logo: f.logo || "",
        approvalThreshold: f.useLadder ? 0 : (Number(f.threshold) || 0),
        approvalLevels: f.useLadder
          ? f.levels.map((l) => ({ id: l.id, name: l.name.trim(), limit: Number(l.limit) || 0,
                                   role: l.role || "", holders: [] }))
          : [],
        ownerLevel: f.useLadder ? f.ownerLevel : "",
        team: filledTeam.map((t) => ({
          key: t.key, name: t.name.trim(), email: t.email.trim().toLowerCase(),
          role: t.role, title: t.title.trim(),
          reportsTo: t.reportsTo === OWNER ? OWNER : t.reportsTo,
          level: f.useLadder ? (t.level || "") : "",
        })),
        vendors: f.vendors.map((v) => ({
          name: v.name, email: v.email, category: v.category,
          contact: v.contact, phone: v.phone, location: v.location,
        })),
        inviteVendors: !!f.inviteVendors && f.vendors.some((v) => v.email),
      });
      setDone(r);
    } catch (e) { setMsg(e.message || "Something went wrong."); }
    setBusy(false);
  };

  const enter = () => { if (done) onLoggedIn(done, f.email.trim().toLowerCase()); };

  const css = CSS + EXTRA_CSS + THEME_CSS + MOTION_CSS + ICON_CSS + ILLUS_CSS
    + DRAFT_CSS + PAGE_CSS + LOGO_CSS + SETUP_CSS;

  /* ------------------------------------------------------------- closed */
  if (status && status.open === false) {
    return (
      <div className="setupwrap"><style>{css}</style><div className="setupin" style={{ maxWidth: 520 }}>
        <div className="setuplogo"><Wordmark s={24} /></div>
        <div className="guidebox"><div className="guidetop">
          <Illus n="clear" w={148} />
          <div className="guidehl">{status.orgName} is already set up</div>
          <div className="guidewhy">Ask a colleague to invite you. The link they send lets you set your own password.</div>
        </div><div className="guidefoot"><button className="btn pri" onClick={onDone}>Back to sign in</button></div></div>
      </div></div>
    );
  }

  /* --------------------------------------------------------------- done */
  if (done) {
    const withLinks = (done.invited || []).filter((i) => i.link);
    const v = done.vendors || {};
    return (
      <div className="setupwrap"><style>{css}</style><div className="setupin" style={{ maxWidth: 600 }}>
        <div className="setuplogo"><Wordmark s={24} /></div>
        <div className="guidebox good">
          <div className="guidetop">
            <Illus n="draft" w={148} />
            <div className="guidehl">{done.company} is ready</div>
            <div className="guidewhy">You are signed in as {f.name.trim()}.</div>
          </div>
          <div className="cbody donesum">
            <div className="donerow">
              <span className="doneicon"><Icon n="team" s={15} /></span>
              <div><b>{(done.invited || []).length} invitation{(done.invited || []).length === 1 ? "" : "s"} sent</b>
                <i>Everyone is already on the org chart with their reporting line and signing
                  authority. Each link is valid for three days.</i></div>
            </div>
            {(done.levels || []).length > 0 && (
              <div className="donerow">
                <span className="doneicon"><Icon n="stamp" s={15} /></span>
                <div><b>{done.levels.length} levels of signing authority</b>
                  <i>{done.levels.map((l) => `${l.name} ${money(l.limit)}`).join(" · ")}</i></div>
              </div>
            )}
            {v.created > 0 && (
              <div className="donerow">
                <span className="doneicon"><Icon n="suppliers" s={15} /></span>
                <div><b>{v.created} vendor{v.created === 1 ? "" : "s"} on the register</b>
                  <i>
                    {v.skipped ? `${v.skipped} blank or duplicate row(s) skipped. ` : ""}
                    {v.invited
                      ? `${v.willEmail} invitation${v.willEmail === 1 ? "" : "s"} to register go out in the background, a batch at a time, once each.`
                      : "Invite them from the Vendors page when you are ready."}
                    {v.invited && !v.mailLive
                      ? " Email is not configured on this deployment, so they will print to the server log instead."
                      : ""}
                  </i></div>
              </div>
            )}
          </div>
          {withLinks.length > 0 && (
            <div className="cbody donelinks">
              <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>
                Demo mode: email prints to the server log, so here are the links to try the flow yourself.
              </div>
              {withLinks.map((i) => (
                <div className="lrow" key={i.email}>
                  <div className="lrmain"><div className="lrtitle">{i.name || i.email}</div>
                    <div className="lrmeta"><span>{i.roleLabel}</span><span>reports to {i.reportsTo}</span>
                      <span className="mono" style={{ wordBreak: "break-all" }}>{i.link}</span></div></div>
                </div>
              ))}
            </div>
          )}
          <div className="guidefoot">
            <button className="btn pri" onClick={enter}>Go to your workspace</button>
          </div>
        </div>
      </div></div>
    );
  }

  /* ------------------------------------------------------- the side panel */
  const guide = (
    <aside className={"ready" + (ready ? " done" : "")} aria-live="polite">
      <div className="readytop">
        <Illus n="draft" w={148} />
        <div className="readyhl">
          {ready ? "Ready to create your workspace"
            : outstanding.length === 1 ? "One thing left" : outstanding.length + " things left"}
        </div>
        <div className="readywhy">
          {ready ? "Nothing is saved until you press the button." : "Pick any line to jump straight to it."}
        </div>
        <div className="readybar">
          <i style={{ width: Math.round((checks.length - outstanding.length) / checks.length * 100) + "%" }} />
        </div>
      </div>
      <ul className="readylist">
        {[...outstanding, ...checks.filter((c) => c.ok)].map((c) => (
          <li key={c.key} className={c.ok ? "ok" : "todo"}>
            <button type="button" tabIndex={c.ok ? -1 : 0} onClick={() => { if (!c.ok) jump(c); }}>
              <span className="readytick" aria-hidden="true"><Icon n="check" s={11} /></span>
              <span>{c.ok ? c.done : c.todo}{c.note && <em>{c.note}</em>}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="readyfoot">
        <button className="btn pri" disabled={!ready || busy} onClick={submit}>
          {busy ? "Creating…" : "Create the workspace"}
        </button>
        {msg && <div className="notice" style={{ borderLeft: "3px solid var(--wax)", margin: 0, textAlign: "left" }}>{msg}</div>}
        <button className="btn" onClick={onDone}>Back to sign in</button>
      </div>
    </aside>
  );

  const navRow = (back, next, nextLabel) => (
    <div className="cbody stepnav">
      {back != null
        ? <button className="btn" onClick={() => setStep(back)}>Back</button>
        : <span />}
      {next != null
        ? <button className="btn pri" onClick={() => setStep(next)} disabled={!stepOk(step)}>{nextLabel}</button>
        : <span className="hint" style={{ marginTop: 0, alignSelf: "center" }}>
            {ready ? "Use the button on the right to finish." : "The panel on the right lists what is still missing."}
          </span>}
    </div>
  );

  return (
    <div className="setupwrap"><style>{css}</style><div className="setupin">
      <div className="setuplogo"><Wordmark s={24} tag="setup" /></div>
      <div className="pagehead">
        <h1>Set up your workspace</h1>
        <span className="sub">
          Six short steps. Nothing is saved until the end, so you can go back freely.
        </span>
      </div>
      {status?.demo && !status.needsSetup && (
        <div className="notice" style={{ marginBottom: 14 }}>
          This is a demo workspace, so setting it up creates your account alongside the demo ones
          and renames the company. Resetting the demo undoes it.
        </div>
      )}

      <div className="steps" role="tablist">
        {STEPS.map((label, i) => (
          <button key={label} role="tab" aria-selected={step === i} disabled={locked(i)}
                  className={"step" + (step === i ? " on" : "") + (stepOk(i) && step !== i ? " done" : "")}
                  onClick={() => !locked(i) && setStep(i)}>
            <b>{stepOk(i) && step !== i ? <Icon n="check" s={10} /> : i + 1}</b>{label}
          </button>
        ))}
      </div>

      <div className="ntcols">
        <div>
          {/* ------------------------------------------------ 0 · access */}
          {step === 0 && (
            <div className="card">
              <div className="chead"><h3>Your access code</h3>
                <span className="mono faint" style={{ marginLeft: "auto" }}>
                  <Icon n="lock" s={13} /></span></div>
              <div className="cbody">
                <p className="setupintro">
                  Registering a company here is a one-time act that cannot be undone from the
                  interface, so it is not open to whoever finds the address. Enter the code
                  issued to your organisation.
                </p>
                {status && !status.codeRequired && (
                  <div className="notice" style={{ marginBottom: 12 }}>
                    This deployment has no access code configured, so setup is open. That is fine
                    on a laptop and wrong on anything reachable from the internet.
                  </div>
                )}
                {status?.codeRequired && (
                  <div className="frow" id="su-code">
                    <label className="lbl" htmlFor="su-code-in">Access code</label>
                    <div className="codein">
                      <input id="su-code-in" className="in mono" autoFocus autoComplete="off"
                             spellCheck="false" placeholder="ENGDOCKET0000"
                             value={code} disabled={codeOk}
                             onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeMsg(""); }}
                             onKeyDown={(e) => e.key === "Enter" && !codeOk && code.trim() && submitCode()} />
                      {codeOk
                        ? <span className="codeok"><Icon n="check" s={14} /> Accepted</span>
                        : <button className="btn pri" disabled={codeBusy || !code.trim()} onClick={submitCode}>
                            {codeBusy ? "Checking…" : "Check code"}
                          </button>}
                    </div>
                    <div className="hint">
                      Not case-sensitive. Eight wrong guesses locks setup for fifteen minutes.
                    </div>
                  </div>
                )}
                {codeMsg && <div className="notice" style={{ borderLeft: "3px solid var(--wax)" }}>{codeMsg}</div>}
                {status?.codeLocked && !codeOk && (
                  <div className="notice" style={{ borderLeft: "3px solid var(--wax)" }}>
                    Setup is currently locked after too many incorrect codes. Try again shortly.
                  </div>
                )}
              </div>
              {navRow(null, codeOk ? 1 : null, "Next: about you")}
            </div>
          )}

          {/* --------------------------------------------------- 1 · you */}
          {step === 1 && (
            <div className="card">
              <div className="chead"><h3>About you</h3></div>
              <div className="cbody">
                <p className="setupintro">
                  You become the workspace's procurement lead: you draft tenders, run the vendor
                  register and configure everything here. You do not sign off your own work —
                  that is what the authority ladder two steps from now is for.
                </p>
                <div className="frow"><label className="lbl" htmlFor="su-name">What is your name?</label>
                  <input id="su-name" className="in" autoFocus value={f.name}
                         onChange={(e) => set("name", e.target.value)} />
                  <div className="hint">As it should appear on letters and in the audit trail.</div></div>
                <div className="frow"><label className="lbl" htmlFor="su-title">Your job title</label>
                  <input id="su-title" className="in" value={f.title}
                         onChange={(e) => set("title", e.target.value)} />
                  <div className="hint">Shown beside your name on the org chart.</div></div>
                <div className="frow"><label className="lbl" htmlFor="su-email">Your work email</label>
                  <input id="su-email" className="in" type="email" autoComplete="username" value={f.email}
                         onChange={(e) => set("email", e.target.value)} />
                  <div className="hint">This becomes your sign-in. Invitations you send come from it.</div></div>
                <div className="frow" style={{ marginBottom: 0 }}>
                  <label className="lbl" htmlFor="su-pw">Choose a password</label>
                  <input id="su-pw" className="in" type="password" autoComplete="new-password"
                         value={f.password} onChange={(e) => set("password", e.target.value)} />
                  <div className="hint">
                    At least 8 characters. You can turn on an authenticator app later from Security.
                  </div></div>
              </div>
              {navRow(0, 2, "Next: your company")}
            </div>
          )}

          {/* ----------------------------------------------- 2 · company */}
          {step === 2 && (
            <>
              <div className="card">
                <div className="chead"><h3>Your company</h3></div>
                <div className="cbody">
                  <div className="frow"><label className="lbl" htmlFor="su-company">What is the company called?</label>
                    <input id="su-company" className="in" autoFocus placeholder="e.g. Kestrel Hospitality Group"
                           value={f.company} onChange={(e) => set("company", e.target.value)} />
                    <div className="hint">The trading name. It appears everywhere in the interface.</div></div>
                  <div className="f2">
                    <div className="frow"><label className="lbl" htmlFor="su-short">Short name <span className="faint">optional</span></label>
                      <input id="su-short" className="in" placeholder={f.company.trim().split(/\s+/)[0] || "e.g. Kestrel"}
                             value={f.short} onChange={(e) => set("short", e.target.value)} />
                      <div className="hint">
                        References start with its first three letters, like{" "}
                        <span className="mono">
                          {(((f.short || f.company).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3)) || "ORG") + "-2026-001"}
                        </span>.
                      </div></div>
                    <div className="frow"><label className="lbl" htmlFor="su-legal">Registered name <span className="faint">optional</span></label>
                      <input id="su-legal" className="in" placeholder={f.company.trim() || "As on the CAC certificate"}
                             value={f.profile.legalName} onChange={(e) => setProfile("legalName", e.target.value)} />
                      <div className="hint">Used on award letters and memos where it differs from the trading name.</div></div>
                  </div>

                  <div className="frow">
                    <label className="lbl">Company logo <span className="faint">optional</span></label>
                    <div className="logopick">
                      <span className="logoprev" aria-hidden="true">
                        {f.logo
                          ? <img src={f.logo} alt="" />
                          : <b>{initialsOf(f.company) === "—" ? "?" : initialsOf(f.company)}</b>}
                      </span>
                      <div className="logoacts">
                        <input ref={logoInput} type="file" hidden
                               accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
                               onChange={(e) => onLogo(e.target.files && e.target.files[0])} />
                        <button className="btn sm" onClick={() => logoInput.current && logoInput.current.click()}>
                          <Icon n="upload" s={13} /> {f.logo ? "Replace" : "Upload a logo"}
                        </button>
                        {f.logo && (
                          <button className="btn sm" onClick={() => setF((x) => ({ ...x, logo: "", logoName: "" }))}>
                            Remove
                          </button>
                        )}
                        <span className="hint" style={{ marginTop: 0 }}>
                          {f.logoName || "PNG, JPEG, SVG or WebP, up to 256 KB. Shown in the sidebar and top bar; your initials are used until you add one."}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginTop: 14 }}>
                <div className="chead"><h3>Registered details</h3>
                  <span className="hint" style={{ marginLeft: "auto", marginTop: 0 }}>all optional</span></div>
                <div className="cbody">
                  <p className="setupintro">
                    What belongs on a letter, a memo or a compliance report. Anything left blank
                    is simply left off — nothing here is invented for you.
                  </p>
                  <div className="f2">
                    <div className="frow"><label className="lbl" htmlFor="su-rc">RC number</label>
                      <input id="su-rc" className="in mono" placeholder="RC 1234567" value={f.profile.rcNumber}
                             onChange={(e) => setProfile("rcNumber", e.target.value)} /></div>
                    <div className="frow"><label className="lbl" htmlFor="su-tin">Tax identification number</label>
                      <input id="su-tin" className="in mono" placeholder="01234567-0001" value={f.profile.tin}
                             onChange={(e) => setProfile("tin", e.target.value)} /></div>
                    <div className="frow"><label className="lbl" htmlFor="su-ind">Industry</label>
                      <select id="su-ind" className="in" value={f.profile.industry}
                              onChange={(e) => setProfile("industry", e.target.value)}>
                        <option value="">Not stated</option>
                        {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                      </select></div>
                    <div className="frow"><label className="lbl" htmlFor="su-year">Year incorporated</label>
                      <input id="su-year" className="in mono" inputMode="numeric" placeholder="2014"
                             value={f.profile.registeredYear}
                             onChange={(e) => setProfile("registeredYear", e.target.value.replace(/\D/g, "").slice(0, 4))} /></div>
                  </div>

                  <div className="frow"><label className="lbl" htmlFor="su-a1">Registered address</label>
                    <input id="su-a1" className="in" placeholder="Street and number" value={f.profile.addressLine1}
                           onChange={(e) => setProfile("addressLine1", e.target.value)} /></div>
                  <div className="frow"><label className="lbl visually-hidden" htmlFor="su-a2">Address line two</label>
                    <input id="su-a2" className="in" placeholder="Building, floor, district (optional)"
                           value={f.profile.addressLine2}
                           onChange={(e) => setProfile("addressLine2", e.target.value)} /></div>
                  <div className="f3">
                    <div className="frow"><label className="lbl" htmlFor="su-city">City</label>
                      <input id="su-city" className="in" value={f.profile.city}
                             onChange={(e) => setProfile("city", e.target.value)} /></div>
                    <div className="frow"><label className="lbl" htmlFor="su-state">State</label>
                      <input id="su-state" className="in" value={f.profile.state}
                             onChange={(e) => setProfile("state", e.target.value)} /></div>
                    <div className="frow"><label className="lbl" htmlFor="su-country">Country</label>
                      <input id="su-country" className="in" value={f.profile.country}
                             onChange={(e) => setProfile("country", e.target.value)} /></div>
                  </div>

                  <div className="f3">
                    <div className="frow"><label className="lbl" htmlFor="su-phone">Switchboard</label>
                      <input id="su-phone" className="in" type="tel" placeholder="+234 ..." value={f.profile.phone}
                             onChange={(e) => setProfile("phone", e.target.value)} /></div>
                    <div className="frow"><label className="lbl" htmlFor="su-cmail">Procurement email</label>
                      <input id="su-cmail" className="in" type="email" placeholder="tenders@company.com"
                             value={f.profile.email}
                             onChange={(e) => setProfile("email", e.target.value)} /></div>
                    <div className="frow"><label className="lbl" htmlFor="su-web">Website</label>
                      <input id="su-web" className="in" placeholder="company.com" value={f.profile.website}
                             onChange={(e) => setProfile("website", e.target.value)} /></div>
                  </div>

                  <div className="f3">
                    <div className="frow"><label className="lbl" htmlFor="su-cur">Reporting currency</label>
                      <select id="su-cur" className="in" value={f.profile.currency}
                              onChange={(e) => setProfile("currency", e.target.value)}>
                        {CURRENCIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select></div>
                    <div className="frow"><label className="lbl" htmlFor="su-fy">Financial year starts</label>
                      <input id="su-fy" className="in mono" placeholder="01-01" value={f.profile.fiscalYearStart}
                             onChange={(e) => setProfile("fiscalYearStart", e.target.value)} />
                      <div className="hint">Day and month, like 01-04 for April.</div></div>
                    <div className="frow"><label className="lbl" htmlFor="su-tz">Time zone</label>
                      <input id="su-tz" className="in" value={f.profile.timezone}
                             onChange={(e) => setProfile("timezone", e.target.value)} />
                      <div className="hint">Deadlines are shown in it.</div></div>
                  </div>

                  <div className="frow" style={{ marginBottom: 0 }}>
                    <label className="lbl" htmlFor="su-desc">What the company does</label>
                    <textarea id="su-desc" className="in" rows={3}
                              placeholder="One or two sentences. Appears on the vendor-facing registration page."
                              value={f.profile.description}
                              onChange={(e) => setProfile("description", e.target.value)} />
                  </div>
                </div>
                {navRow(1, 3, "Next: signing authority")}
              </div>
            </>
          )}

          {/* --------------------------------------------- 3 · authority */}
          {step === 3 && (
            <div className="card" id="su-ladder">
              <div className="chead"><h3>Who signs what</h3></div>
              <div className="cbody">
                <p className="setupintro">
                  Define the rungs of your delegation of authority and what each may commit.
                  When somebody raises a tender it walks <b>up their reporting line</b>,
                  collecting a signature at every rung it passes, and stops at the first
                  person whose limit covers the amount. Four layers of management means four
                  signatures where the number needs them. Nobody signs their own request.
                </p>

                <div className="ladtoggle">
                  <label className={"ladopt" + (f.useLadder ? " on" : "")}>
                    <input type="radio" name="ladmode" checked={f.useLadder}
                           onChange={() => set("useLadder", true)} />
                    <b>A ladder of authority levels</b>
                    <i>Several rungs, each with its own limit. What most organisations actually have.</i>
                  </label>
                  <label className={"ladopt" + (!f.useLadder ? " on" : "")}>
                    <input type="radio" name="ladmode" checked={!f.useLadder}
                           onChange={() => set("useLadder", false)} />
                    <b>A single threshold</b>
                    <i>One amount, above which any approver signs. Simplest; you can add a ladder later.</i>
                  </label>
                </div>

                {!f.useLadder && (
                  <div className="frow" style={{ marginTop: 14, marginBottom: 0 }}>
                    <label className="lbl" htmlFor="su-thr-in">
                      When does a tender need an approver's signature?
                    </label>
                    <input id="su-thr-in" className="in" type="number" min="0" step="1000000"
                           value={f.threshold} onChange={(e) => set("threshold", e.target.value)} />
                    <div className="hint">
                      A tender at or above this amount goes to an approver before it publishes;
                      below it, procurement publishes directly. Awards always need an approver.
                      Set 0 to send nothing for sign-off.
                    </div>
                  </div>
                )}

                {f.useLadder && (
                  <>
                    <div className="ladhead">
                      <span>Level</span><span>May commit up to</span>
                      <span>If nobody is on it</span><span />
                    </div>
                    {f.levels.map((l, i) => (
                      <div className="ladrow" key={l.id}>
                        <div className="ladrank" aria-hidden="true">{i + 1}</div>
                        <input className="in" placeholder="e.g. Head of Department" value={l.name}
                               aria-label={`Level ${i + 1} name`}
                               onChange={(e) => editLevel(l.id, { name: e.target.value })} />
                        <div className="ladlimit">
                          <input className="in" type="number" min="0" step="1000000"
                                 aria-label={`Level ${i + 1} limit`}
                                 placeholder="0 = unlimited" value={l.limit || ""}
                                 onChange={(e) => editLevel(l.id, { limit: e.target.value })} />
                          <i>{money(l.limit)}</i>
                        </div>
                        <select className="in" value={l.role}
                                aria-label={`Who signs level ${i + 1} if nobody is placed on it`}
                                onChange={(e) => editLevel(l.id, { role: e.target.value })}>
                          <option value="">Nobody — it waits</option>
                          {ROLES.map(([k, lb]) => <option key={k} value={k}>Any {lb}</option>)}
                        </select>
                        <button className="btn sm" aria-label={`Remove level ${i + 1}`}
                                disabled={f.levels.length < 2} onClick={() => dropLevel(l.id)}>
                          <Icon n="close" s={13} />
                        </button>
                      </div>
                    ))}
                    <div className="ladacts">
                      <button className="btn sm" onClick={addLevel} disabled={f.levels.length >= 8}>
                        <Icon n="plus" s={13} /> Add a level
                      </button>
                      <span className="hint" style={{ marginTop: 0 }}>
                        Up to eight. Leave a limit at 0 for unlimited authority — exactly one level
                        must have it, and it is the top of the ladder. Who signs a level is whoever
                        you place on it on the next step; the last column only matters for a level
                        you leave empty.
                      </span>
                    </div>

                    <div className="ladprev">
                      <b>In order, lowest first</b>
                      {sortedLevels.map((l, i) => (
                        <div className="ladprevrow" key={l.id}>
                          <span className="ladprevn">{i + 1}</span>
                          <span className="ladprevname">{l.name.trim() || <em className="faint">unnamed</em>}</span>
                          <span className="ladprevlim mono">{money(l.limit)}</span>
                        </div>
                      ))}
                      {unlimitedCount !== 1 && (
                        <div className="notice" style={{ borderLeft: "3px solid var(--wax)", marginTop: 10 }}>
                          {unlimitedCount === 0
                            ? "Nothing could be signed above your highest limit. Set one level's limit to 0 so a large enough request always has somebody who can approve it."
                            : "Only one level may have unlimited authority, and it is the top of the ladder."}
                        </div>
                      )}
                    </div>

                    <div className="frow" style={{ marginTop: 16, marginBottom: 0 }}>
                      <label className="lbl" htmlFor="su-ownerlvl">Your own signing authority</label>
                      <select id="su-ownerlvl" className="in" value={f.ownerLevel}
                              onChange={(e) => set("ownerLevel", e.target.value)}>
                        <option value="">None — I raise requests, I do not sign them</option>
                        {sortedLevels.filter((l) => l.name.trim()).map((l) =>
                          <option key={l.id} value={l.id}>{l.name.trim()} · {money(l.limit)}</option>)}
                      </select>
                      <div className="hint">
                        Most procurement leads leave this as none. It never lets you approve your
                        own request either way — the chain always starts above the raiser.
                      </div>
                    </div>
                  </>
                )}
              </div>
              {navRow(2, 4, "Next: your team")}
            </div>
          )}

          {/* -------------------------------------------------- 4 · team */}
          {step === 4 && (
            <div className="card" id="su-team">
              <div className="chead"><h3>Who works with you?</h3>
                <span className="hint" style={{ marginLeft: "auto", marginTop: 0 }}>
                  optional, you can do this later</span></div>
              <div className="cbody">
                <p className="setupintro">
                  Each person gets an email with a link to set their own password, and each one
                  is placed on the org chart now — so reporting lines and signing authority work
                  from the first minute rather than from whenever the last invitation is clicked.
                  Separation of duties is enforced by the server: an evaluator cannot publish or
                  award, an approver cannot score, an auditor cannot change anything.
                </p>

                {f.team.length === 0 && (
                  <div className="teamempty">
                    <Icon n="team" s={26} className="faint" />
                    <b>Nobody yet</b>
                    <i>You can run tenders alone, but nothing above your authority can be signed.</i>
                  </div>
                )}

                {f.team.map((t, i) => {
                  const below = descendantsOf(t.key, f.team);
                  return (
                    <div className="person" key={t.key}>
                      <div className="personhead">
                        <span className="personn">{i + 1}</span>
                        <b>{t.name.trim() || t.email.trim() || "New person"}</b>
                        <button className="btn sm" aria-label="Remove this person"
                                onClick={() => dropPerson(t.key)}><Icon n="close" s={13} /></button>
                      </div>
                      <div className="f2">
                        <div className="frow"><label className="lbl">Full name</label>
                          <input className="in" placeholder="Amara Ede" value={t.name}
                                 onChange={(e) => editPerson(t.key, { name: e.target.value })} />
                        </div>
                        <div className="frow"><label className="lbl">Work email</label>
                          <input className="in" type="email" placeholder="colleague@company.com" value={t.email}
                                 onChange={(e) => editPerson(t.key, { email: e.target.value })} />
                        </div>
                      </div>
                      <div className="f2">
                        <div className="frow"><label className="lbl">Job title</label>
                          <input className="in" placeholder="Category Manager" value={t.title}
                                 onChange={(e) => editPerson(t.key, { title: e.target.value })} />
                        </div>
                        <div className="frow"><label className="lbl">Role in DOCKET</label>
                          <select className="in" value={t.role}
                                  onChange={(e) => editPerson(t.key, { role: e.target.value })}>
                            {ROLES.map(([k, lb]) => <option key={k} value={k}>{lb}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="f2" style={{ marginBottom: 0 }}>
                        <div className="frow" style={{ marginBottom: 0 }}>
                          <label className="lbl">Reports to</label>
                          <select className="in" value={t.reportsTo}
                                  onChange={(e) => editPerson(t.key, { reportsTo: e.target.value })}>
                            <option value={OWNER}>{f.name.trim() || "You"} (you)</option>
                            {f.team
                              .filter((o) => o.key !== t.key && !below.has(o.key))
                              .map((o) => (
                                <option key={o.key} value={o.key}>
                                  {o.name.trim() || o.email.trim() || "(unnamed)"}
                                </option>
                              ))}
                          </select>
                          <div className="hint">
                            Anyone already below this person is left out, because a loop in a
                            reporting line is a rollup that never ends.
                          </div>
                        </div>
                        <div className="frow" style={{ marginBottom: 0 }}>
                          <label className="lbl">Signing authority</label>
                          <select className="in" value={t.level} disabled={!f.useLadder}
                                  onChange={(e) => editPerson(t.key, { level: e.target.value })}>
                            <option value="">None</option>
                            {sortedLevels.filter((l) => l.name.trim()).map((l) => (
                              <option key={l.id} value={l.id}>{l.name.trim()} — {money(l.limit)}</option>
                            ))}
                          </select>
                          <div className="hint">
                            {f.useLadder
                              ? "Which rung of the ladder they stand on. Most people stand on none."
                              : "Available once you choose a ladder on the previous step."}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <button className="btn sm" onClick={addPerson} style={{ marginTop: f.team.length ? 12 : 0 }}>
                  <Icon n="plus" s={13} /> Add {f.team.length ? "another person" : "someone"}
                </button>

                {filledTeam.length > 0 && (
                  <div className="chart">
                    <b>Your org chart</b>
                    {chart.map((r) => (
                      <div className={"chartrow" + (r.owner ? " me" : "") + (r.orphan ? " orphan" : "")}
                           key={r.key} style={{ "--d": r.depth }}>
                        <span className="chartline" aria-hidden="true" />
                        <span className="chartname">{r.name?.trim() || r.email?.trim() || "(unnamed)"}</span>
                        <span className="charttag">{r.owner ? "you" : ROLE_LABEL[r.role] || r.role}</span>
                        {r.level && (
                          <span className="chartlvl">
                            <Icon n="stamp" s={11} />
                            {(f.levels.find((l) => l.id === r.level) || {}).name || "level"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="roleopt">
                  {ROLES.map(([k, l, d]) => <div className="rolecard" key={k}><b>{l}</b>{d}</div>)}
                </div>
              </div>
              {navRow(3, 5, "Next: your vendors")}
            </div>
          )}

          {/* ----------------------------------------------- 5 · vendors */}
          {step === 5 && (
            <div className="card" id="su-vendors">
              <div className="chead"><h3>Your vendors</h3>
                <span className="hint" style={{ marginLeft: "auto", marginTop: 0 }}>
                  optional, you can import later</span></div>
              <div className="cbody">
                <p className="setupintro">
                  Load the register you already have. Upload a CSV, or paste it straight from a
                  spreadsheet — column names are matched for you, and a name is the only thing
                  actually required. Duplicates are reported rather than silently merged.
                </p>

                <div className="vendsrc">
                  <input ref={vendorInput} type="file" hidden accept=".csv,.tsv,.txt,text/csv,text/plain"
                         onChange={(e) => {
                           const file = e.target.files && e.target.files[0];
                           if (!file) return;
                           const r = new FileReader();
                           r.onload = () => { setVendorText(String(r.result || "")); loadVendorText(String(r.result || "")); };
                           r.readAsText(file);
                         }} />
                  <button className="btn" onClick={() => vendorInput.current && vendorInput.current.click()}>
                    <Icon n="upload" s={14} /> Upload a CSV
                  </button>
                  <span className="hint" style={{ marginTop: 0 }}>or paste below</span>
                </div>

                <div className="frow">
                  <label className="lbl visually-hidden" htmlFor="su-vpaste">Paste your vendor list</label>
                  <textarea id="su-vpaste" className="in mono vendpaste" rows={6}
                            placeholder={VENDOR_SAMPLE}
                            value={vendorText}
                            onChange={(e) => { setVendorText(e.target.value); loadVendorText(e.target.value); }} />
                  <div className="hint">
                    Recognised columns: name, category, email, contact, phone, location. Extra
                    columns are ignored; a header row is optional.
                  </div>
                </div>

                {vendorWarn.length > 0 && (
                  <div className="notice" style={{ borderLeft: "3px solid var(--brass)" }}>
                    <b>Read, with notes:</b>
                    <ul className="vendwarn">{vendorWarn.map((w) => <li key={w}>{w}</li>)}</ul>
                  </div>
                )}

                {f.vendors.length > 0 && (
                  <>
                    <div className="vendsum">
                      <div><b>{f.vendors.length}</b><i>vendors read</i></div>
                      <div><b>{f.vendors.filter((v) => v.email).length}</b><i>with an email address</i></div>
                      <div><b>{new Set(f.vendors.map((v) => v.category).filter(Boolean)).size}</b><i>categories</i></div>
                    </div>
                    <div className="vendlist">
                      {f.vendors.slice(0, 40).map((v) => (
                        <div className="vendrow" key={v.id}>
                          <span className="vendname">{v.name}</span>
                          <span className="vendcat">{v.category || <em className="faint">uncategorised</em>}</span>
                          <span className={"vendmail" + (v.email ? "" : " none")}>
                            {v.email || "no email"}
                          </span>
                          <button className="btn sm" aria-label={`Remove ${v.name}`}
                                  onClick={() => set("vendors", f.vendors.filter((x) => x.id !== v.id))}>
                            <Icon n="close" s={12} />
                          </button>
                        </div>
                      ))}
                      {f.vendors.length > 40 && (
                        <div className="vendmore">and {f.vendors.length - 40} more</div>
                      )}
                    </div>

                    <label className="vendinvite">
                      <input type="checkbox" checked={f.inviteVendors}
                             onChange={(e) => set("inviteVendors", e.target.checked)} />
                      <span>
                        <b>Email them an invitation to register</b>
                        <i>
                          {f.vendors.filter((v) => v.email).length} vendors will be asked to set a
                          password, upload their compliance documents and start receiving
                          invitations to bid. Sent in the background, a batch at a time, once each
                          — nobody is emailed twice, and failures are recorded as failures.
                        </i>
                      </span>
                    </label>
                  </>
                )}
              </div>
              {navRow(4, null, null)}
            </div>
          )}
        </div>
        {guide}
      </div>
    </div></div>
  );
}

const SETUP_CSS = `
.setupwrap{min-height:100vh;background:var(--page,var(--paper));padding:28px 16px 48px;color:var(--ink)}
.setupin{max-width:1080px;margin:0 auto}
.setuplogo{margin-bottom:22px}
.setupintro{margin:0 0 14px;font-size:13.2px;line-height:1.6;color:var(--muted);
  text-wrap:pretty}
.steps{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}
.step{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--faint);
  padding:6px 10px;border-radius:999px;border:1px solid transparent;background:transparent;
  font:inherit;cursor:pointer}
.step:disabled{opacity:.45;cursor:not-allowed}
.step b{display:inline-flex;width:18px;height:18px;border-radius:50%;align-items:center;
  justify-content:center;font-size:11px;background:var(--sunk);color:var(--muted);
  border:1px solid var(--line)}
.step.on{color:var(--ink);border-color:var(--line);background:var(--card)}
.step.on b{background:var(--green);color:var(--on-brand);border-color:var(--green)}
.step.done b{background:var(--green-tint);color:var(--green);border-color:var(--green-2)}
.stepnav{border-top:1px solid var(--line);display:flex;justify-content:space-between;
  gap:8px;align-items:center}

.f2,.f3{display:grid;gap:0 12px}
.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);
  white-space:nowrap}

/* ---- the access code ---- */
.codein{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.codein .in{flex:1 1 200px;min-width:0;letter-spacing:.14em;text-transform:uppercase}
.codeok{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:650;
  color:var(--green);background:var(--green-tint);border:1px solid var(--green-2);
  border-radius:var(--r-btn);padding:9px 13px}

/* ---- the logo ---- */
.logopick{display:flex;gap:14px;align-items:flex-start}
.logoprev{width:62px;height:62px;border-radius:12px;border:1px dashed var(--line2);
  background:var(--sunk);display:inline-flex;align-items:center;justify-content:center;
  flex-shrink:0;overflow:hidden}
.logoprev img{width:100%;height:100%;object-fit:contain;background:var(--card)}
.logoprev b{font-size:20px;font-weight:700;color:var(--brand);letter-spacing:.02em}
.logoacts{display:flex;flex-wrap:wrap;gap:8px;align-items:center;min-width:0}
.logoacts .hint{flex:1 1 200px}

/* ---- the authority ladder ---- */
.ladtoggle{display:grid;gap:8px;margin-bottom:6px}
.ladopt{border:1px solid var(--line);border-radius:11px;padding:11px 13px;cursor:pointer;
  display:grid;grid-template-columns:auto minmax(0,1fr);gap:2px 10px;background:var(--card);
  transition:border-color var(--t) var(--ease),background var(--t) var(--ease)}
.ladopt.on{border-color:var(--green-2);background:var(--green-tint)}
.ladopt input{grid-row:1/3;align-self:center;accent-color:var(--brand)}
.ladopt b{font-size:13.5px;letter-spacing:-.012em}
.ladopt i{font-style:normal;font-size:12.2px;color:var(--muted);line-height:1.5}

.ladhead{display:none;font-size:11px;letter-spacing:.06em;text-transform:uppercase;
  color:var(--faint);padding:14px 0 6px}
.ladrow{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:start;
  padding:10px 0;border-top:1px solid var(--line)}
.ladrank{width:22px;height:34px;display:inline-flex;align-items:center;justify-content:center;
  font-family:var(--font-mono);font-size:11px;color:var(--faint)}
.ladrow > .in{grid-column:2}
.ladrow > select.in{grid-column:2}
.ladrow > .btn{grid-row:1;grid-column:3}
.ladlimit{grid-column:2;display:flex;flex-direction:column;gap:3px}
.ladlimit i{font-style:normal;font-size:11.5px;color:var(--faint);font-family:var(--font-mono)}
.ladacts{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding-top:12px;
  border-top:1px solid var(--line)}
.ladacts .hint{flex:1 1 220px}
.ladprev{margin-top:14px;border:1px solid var(--line);border-radius:12px;padding:12px 13px;
  background:var(--sunk)}
.ladprev > b{display:block;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;
  color:var(--faint);margin-bottom:8px}
.ladprevrow{display:flex;gap:10px;align-items:center;padding:5px 0;font-size:13px}
.ladprevn{width:19px;height:19px;border-radius:50%;background:var(--brand-tint);
  color:var(--brand);border:1px solid var(--green-2);display:inline-flex;flex-shrink:0;
  align-items:center;justify-content:center;font-size:10.5px;font-weight:700}
.ladprevname{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ladprevlim{font-size:12px;color:var(--muted)}

/* ---- the team ---- */
.teamempty{border:1px dashed var(--line2);border-radius:12px;padding:22px 16px;
  text-align:center;background:var(--sunk);display:grid;gap:3px;justify-items:center}
.teamempty b{font-size:13.5px}
.teamempty i{font-style:normal;font-size:12.3px;color:var(--muted);max-width:44ch;line-height:1.5}
.person{border:1px solid var(--line);border-radius:12px;padding:12px 13px;margin-bottom:10px;
  background:var(--card)}
.personhead{display:flex;gap:9px;align-items:center;margin-bottom:10px}
.personhead b{font-size:13.5px;letter-spacing:-.012em;flex:1 1 auto;min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.personn{width:20px;height:20px;border-radius:50%;background:var(--sunk);color:var(--muted);
  border:1px solid var(--line);display:inline-flex;align-items:center;justify-content:center;
  font-size:11px;flex-shrink:0}

.chart{margin-top:16px;border:1px solid var(--line);border-radius:12px;padding:12px 13px;
  background:var(--sunk)}
.chart > b{display:block;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;
  color:var(--faint);margin-bottom:9px}
.chartrow{display:flex;gap:8px;align-items:center;padding:5px 0;font-size:13px;
  padding-left:calc(var(--d) * 18px);min-width:0}
.chartline{width:10px;height:10px;border-left:1.5px solid var(--line2);
  border-bottom:1.5px solid var(--line2);border-radius:0 0 0 3px;flex-shrink:0;
  margin-bottom:5px}
.chartrow.me > .chartline{visibility:hidden}
.chartname{font-weight:600;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;min-width:0}
.charttag{font-size:11px;color:var(--faint);background:var(--card);border:1px solid var(--line);
  border-radius:999px;padding:1px 7px;flex-shrink:0}
.chartrow.me .charttag{color:var(--brand);border-color:var(--green-2);background:var(--brand-tint)}
.chartlvl{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--brand);
  flex-shrink:0}
.chartrow.orphan{opacity:.6}

.roleopt{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin-top:14px}
.rolecard{border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:12.5px;
  color:var(--muted);background:var(--card);line-height:1.45}
.rolecard b{display:block;color:var(--ink);font-size:13px;margin-bottom:2px}

/* ---- the vendors ---- */
.vendsrc{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
.vendpaste{font-size:12px;line-height:1.55;resize:vertical}
.vendwarn{margin:6px 0 0;padding-left:18px;font-size:12.3px;line-height:1.5}
.vendwarn li{margin-bottom:2px}
.vendsum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;
  background:var(--line);border:1px solid var(--line);border-radius:11px;overflow:hidden;
  margin:12px 0}
.vendsum > div{background:var(--card);padding:11px 12px;display:grid;gap:1px}
.vendsum b{font-size:19px;font-weight:700;letter-spacing:-.02em;color:var(--brand);
  font-variant-numeric:tabular-nums}
.vendsum i{font-style:normal;font-size:11.5px;color:var(--muted)}
.vendlist{border:1px solid var(--line);border-radius:11px;overflow:hidden;max-height:290px;
  overflow-y:auto}
.vendrow{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,.8fr) minmax(0,1fr) auto;
  gap:8px;align-items:center;padding:8px 11px;font-size:12.5px;background:var(--card)}
.vendrow + .vendrow{border-top:1px solid var(--line)}
.vendname{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vendcat{color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vendmail{color:var(--muted);font-family:var(--font-mono);font-size:11.5px;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.vendmail.none{color:var(--faint);font-style:italic;font-family:inherit}
.vendmore{padding:9px 11px;font-size:12px;color:var(--faint);background:var(--sunk);
  border-top:1px solid var(--line)}
.vendinvite{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:start;
  margin-top:14px;border:1px solid var(--green-2);background:var(--green-tint);
  border-radius:11px;padding:12px 13px;cursor:pointer}
.vendinvite input{margin-top:2px;accent-color:var(--brand);width:16px;height:16px}
.vendinvite b{display:block;font-size:13.2px;letter-spacing:-.012em;margin-bottom:3px}
.vendinvite i{font-style:normal;font-size:12.2px;line-height:1.55;color:var(--muted)}

/* ---- the done screen ---- */
.donesum{display:grid;gap:12px;border-top:1px solid var(--line)}
.donerow{display:grid;grid-template-columns:auto minmax(0,1fr);gap:11px;align-items:start}
.doneicon{width:28px;height:28px;border-radius:8px;background:var(--brand-tint);
  color:var(--brand);border:1px solid var(--green-2);display:inline-flex;flex-shrink:0;
  align-items:center;justify-content:center}
.donerow b{display:block;font-size:13.5px;letter-spacing:-.012em}
.donerow i{font-style:normal;font-size:12.3px;line-height:1.55;color:var(--muted);
  display:block;margin-top:2px;text-wrap:pretty}
.donelinks .lrow{padding:10px 0}

@media(min-width:700px){
  .f2{grid-template-columns:repeat(2,minmax(0,1fr))}
  .f3{grid-template-columns:repeat(3,minmax(0,1fr))}
  .roleopt{grid-template-columns:repeat(2,minmax(0,1fr))}
  .ladtoggle{grid-template-columns:repeat(2,minmax(0,1fr))}
  .ladhead{display:grid;grid-template-columns:22px minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) 36px;
    gap:8px}
  .ladrow{grid-template-columns:22px minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) 36px;
    align-items:center}
  .ladrow > .in{grid-column:auto}
  .ladrow > select.in{grid-column:auto}
  .ladrow > .btn{grid-column:auto}
  .ladlimit{grid-column:auto}
  .ladrank{height:auto}
}
`;

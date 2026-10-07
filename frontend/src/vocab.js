/* The fixed answers DOCKET's forms offer.

   Read from backend/core/vocab.json, the same file the server validates
   against (core/vocab.py), so a dropdown can never offer a value the server
   refuses or miss one it accepts. Edit the lists there, not here. The helpers
   below mirror the server's cleaners where the form needs an answer before
   anything is sent. */
import V from "../../backend/core/vocab.json";

export const FAMILIES = V.families;              // [{key, label, categories}]
export const LOCATIONS = V.locations;            // [{group, values}]
export const UNITS = V.units;                    // [{group, values}]
export const PAYMENT_TERMS = V.paymentTerms;     // [[value, label]]
export const DOC_TYPES = V.docTypes;
export const INDUSTRIES = V.industries;
export const CURRENCIES = V.currencies;          // [[code, label]]
export const NIGERIAN_STATES = V.nigerianStates;
export const TIMEZONES = V.timezones;            // [[zone, label]]
export const COUNTRIES = V.countries;            // [[name, iso2, dialling code]]
export const RETURN_REASONS = V.returnReasons;   // why a signer sends something back

/* Financial year starts on the first of a month, stored "01-MM". */
export const FY_STARTS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"]
  .map((m, i) => ["01-" + String(i + 1).padStart(2, "0"), m]);

/* ---------------- units ---------------- */

const ALL_UNITS = new Set(UNITS.flatMap((g) => g.values));

/** The list spelling of a unit from the item master ("PCS", "CTNS"), or ""
    when it has none. Mirrors vocab.unit. */
export function unitFor(raw) {
  const s = String(raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  for (const c of [s, s.endsWith("es") ? s.slice(0, -2) : "", s.endsWith("s") ? s.slice(0, -1) : ""]) {
    if (ALL_UNITS.has(c)) return c;
    if (V.unitAliases[c]) return V.unitAliases[c];
  }
  return "";
}

/* ---------------- phone numbers ----------------
   Stored as a plus, the dialling code and the number, digits only:
   +2348031234567. One shape, so a number can be matched, deduplicated and
   dialled without anybody reading it first. Mirrors vocab.phone. */

const BY_ISO = new Map(COUNTRIES.map((c) => [c[1], c]));
/* Codes several countries share go to the one most numbers belong to. */
const DIAL_HOME = { 1: "US", 7: "RU" };

/** {iso, dial, national} for a stored number, or null when it is not in the
    stored shape (an old record typed before this). */
export function splitPhone(value) {
  const m = /^\+(\d{7,15})$/.exec(String(value || "").replace(/[\s().-]/g, ""));
  if (!m) return null;
  let dial = "";
  for (const c of COUNTRIES) if (m[1].startsWith(c[2]) && c[2].length > dial.length) dial = c[2];
  if (!dial) return null;
  const iso = DIAL_HOME[dial] || COUNTRIES.find((c) => c[2] === dial)[1];
  return { iso, dial, national: m[1].slice(dial.length) };
}

/** The stored shape of a country and a number as typed. The trunk 0 a
    Nigerian number is dialled with at home is dropped. */
export function joinPhone(iso, national) {
  const c = BY_ISO.get(iso) || BY_ISO.get("NG");
  const digits = String(national || "").replace(/\D/g, "").replace(/^0+/, "");
  return digits ? "+" + c[2] + digits : "";
}

/** The number grouped for reading: the last four together, the rest in
    threes from the right. +234 803 123 4567, +234 1 234 5678. */
export function groupNational(national) {
  const n = String(national || "");
  if (n.length <= 4) return n;
  const head = n.slice(0, -4).replace(/\B(?=(\d{3})+$)/g, " ");
  return head + " " + n.slice(-4);
}

/** A stored number as people read it, or the old typed text unchanged. */
export function fmtPhone(value) {
  const p = splitPhone(value);
  return p ? `+${p.dial} ${groupNational(p.national)}` : (value || "");
}

/** What is wrong with a number in the stored shape, or "" when nothing is. */
export function phoneProblem(value) {
  if (!value) return "";
  const digits = String(value).replace(/\D/g, "");
  if (digits.startsWith("234")) {
    const n = digits.length - 3;
    return n >= 8 && n <= 10 ? "" : "A Nigerian mobile number has 11 digits, like 0803 123 4567.";
  }
  return digits.length >= 7 && digits.length <= 15 ? ""
    : "Check the number: with its country code it has 7 to 15 digits.";
}

/* WHAT YOUR FILE SHOULD LOOK LIKE.

   Every place a spreadsheet of people or vendors is uploaded shows the file it
   expects before asking for one: the columns as a spreadsheet would show them,
   a few filled-in rows, what goes in each column, the allowed values where a
   column only takes values from a list, and a template to download and fill
   in. Somebody preparing four hundred rows should not find out what a column
   was meant to hold from the error after they upload it.

   The specs below are the single description of each file. The template that
   downloads, the picture on screen and the placeholder in the setup paste box
   are all drawn from them, so the three cannot disagree. Allowed values come
   from vocab.js, the same lists the server holds the data to. */
import React from "react";

import { Icon } from "./icons";
import { FAMILIES, LOCATIONS } from "./vocab";

const CATEGORIES = FAMILIES.flatMap((f) => f.categories).filter((c) => c !== "Uncategorised");
const PLACES = LOCATIONS.flatMap((g) => g.values);

/* ---------------- the files ---------------- */

const VENDOR_COLUMNS = [
  { name: "name", required: true,
    note: "The registered company name. A name that appears twice is kept once." },
  { name: "category", note: "What they supply.", values: CATEGORIES, what: "categories" },
  { name: "location", note: "The state or city they are based in.", values: PLACES, what: "locations" },
  { name: "email",
    note: "Where their invitation to register goes. Without one they are added but cannot be invited." },
  { name: "contact", note: "The person to ask for." },
  { name: "phone",
    note: "One number per vendor. Type it with spaces, 0803 123 4567, or Excel drops the leading 0." },
];

const VENDOR_ROWS = [
  ["Coldline Logistics Ltd", "Logistics & freight", "Lagos", "tenders@coldline.example", "Ada Obi", "0803 123 4567"],
  ["PackRight Industries", "Printing & packaging", "Abuja", "bids@packright.example", "Musa Bello", "0802 555 0101"],
  ["Harmattan Foods Ltd", "Food & ingredients", "Kano", "", "", ""],
];

/** Vendors loaded during setup. */
export const VENDOR_CSV = {
  file: "docket-vendors-template.csv",
  columns: VENDOR_COLUMNS,
  rows: VENDOR_ROWS,
};

/** Vendors added from the Vendors page, where whoever imports may already
    know a vendor is verified. */
export const VENDOR_IMPORT_CSV = {
  file: "docket-vendors-template.csv",
  columns: [...VENDOR_COLUMNS, {
    name: "prequalified", values: ["yes", "no"], what: "answers",
    note: "yes if they are already verified. Blank or anything else leaves them unverified.",
  }],
  rows: VENDOR_ROWS.map((r, i) => [...r, i === 0 ? "yes" : ""]),
};

/** Staff invited from a spreadsheet. The roles are the company's own, so they
    are passed in, [{value, label}] as the team endpoint serves them, and the
    file names them as the company does: the server accepts a role's name as
    well as its key (invite_views._role_keys). */
export const staffCsv = (roles) => {
  const named = (i) => (roles[Math.min(i, roles.length - 1)] || {}).label || "";
  return {
    file: "docket-staff-template.csv",
    columns: [
      { name: "name", note: "Their full name. They can correct it when they accept." },
      { name: "email", required: true,
        note: "Their work email. The invitation goes here, and it becomes their username." },
      { name: "role", values: roles.map((r) => r.label), what: "roles",
        note: "What they can do in DOCKET, written as the role is named here. Leave it blank to use the role chosen below." },
      { name: "title", note: "Their job title, as it should read on approvals and memos." },
    ],
    rows: [
      ["Amara Ede", "amara.ede@yourcompany.com", named(0), "Category Manager"],
      ["Chidi Eze", "chidi.eze@yourcompany.com", named(2), "Finance Director"],
      ["Bola Adeyemi", "bola.adeyemi@yourcompany.com", "", "Quality Lead"],
    ],
  };
};

/* ---------------- the template file ---------------- */

const cell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The spec as CSV text: the header row, then the example rows. */
export const csvText = (spec) =>
  [spec.columns.map((c) => c.name), ...spec.rows].map((r) => r.map(cell).join(",")).join("\n") + "\n";

function download(spec) {
  const url = URL.createObjectURL(new Blob([csvText(spec)], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = spec.file;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ---------------- the picture ---------------- */

const letter = (i) => String.fromCharCode(65 + i);

/** The expected file, drawn as a spreadsheet, with a note per column and the
    template to download. */
export function CsvGuide({ spec, intro = "Your file should look like this" }) {
  return (
    <div className="csvguide">
      <div className="csvtop">
        <b>{intro}</b>
        <button type="button" className="doclink" onClick={() => download(spec)}>
          <Icon n="download" s={14} /> Download the template
        </button>
      </div>
      <div className="tscroll">
        <table className="csvsheet" aria-label="Example of the file">
          <thead>
            <tr><th className="rn" aria-hidden="true" />
              {spec.columns.map((c, i) => <th key={c.name} aria-hidden="true">{letter(i)}</th>)}</tr>
          </thead>
          <tbody>
            <tr className="hdr"><td className="rn">1</td>
              {spec.columns.map((c) => <td key={c.name} className={c.required ? "req" : ""}>{c.name}</td>)}</tr>
            {spec.rows.map((row, r) => (
              <tr key={r}><td className="rn">{r + 2}</td>
                {row.map((v, i) => <td key={i}>{v}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="csvcols">
        {spec.columns.map((c) => (
          <li key={c.name}>
            <span className="mono">{c.name}</span>
            <span className={"csvneed" + (c.required ? " req" : "")}>{c.required ? "required" : "optional"}</span>
            {c.note}
            {c.values && (
              <details>
                <summary>See the {c.values.length} {c.what || "allowed values"}</summary>
                <div className="csvvals">
                  {c.values.map((v) => {
                    const [value, label] = Array.isArray(v) ? v : [v, v];
                    return <span key={value} title={label !== value ? label : undefined}>{value}</span>;
                  })}
                </div>
              </details>
            )}
          </li>
        ))}
      </ul>
      <div className="hint">
        Save it as CSV (Excel: File, Save as, CSV UTF-8). Keep the first row as it is; the order of the
        columns does not matter, and extra columns are ignored.
      </div>
    </div>
  );
}

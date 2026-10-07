/* Form fields for questions with a fixed set of answers.

   Every form that asks for a category, a location, a unit, a phone number and
   the like uses these, so the same question is asked the same way everywhere
   and lands in the data spelled one way. The lists come from vocab.js, which
   reads the file the server validates against.

   Each takes `value` and calls `onChange(value)` with the stored value, never
   an event, so a form's setter can be passed straight in. */
import React, { useEffect, useRef, useState } from "react";

import {
  COUNTRIES, CURRENCIES, DOC_TYPES, FAMILIES, FY_STARTS, INDUSTRIES, LOCATIONS,
  NIGERIAN_STATES, PAYMENT_TERMS, TIMEZONES, UNITS, groupNational, joinPhone,
  phoneProblem, splitPhone,
} from "./vocab";

const pairs = (xs) => xs.map((x) => (Array.isArray(x) ? x : [x, x]));

/** A <select> over fixed answers. `options` is a list of values or [value,
    label] pairs; `groups` is [{label, options}] for an <optgroup> list.

    A value already on the record that is not on the list stays selectable and
    says so: opening an old record and saving it must not quietly change a
    field nobody touched. The server lets an unchanged value through on the
    same terms (see vocab.py). */
export function Choice({ id, value, onChange, options, groups, placeholder = "Choose…",
                         required = false, disabled, ariaLabel, className = "" }) {
  const sets = groups ? groups.map((g) => ({ label: g.label, options: pairs(g.options) }))
    : [{ label: null, options: pairs(options || []) }];
  const v = value || "";
  const stray = v && !sets.some((g) => g.options.some(([o]) => o === v));
  const rows = (opts) => opts.map(([o, l]) => <option key={o} value={o}>{l}</option>);
  return (
    <select id={id} className={"in " + className} value={v} disabled={disabled} aria-label={ariaLabel}
            onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled={required}>{placeholder}</option>
      {stray && <option value={v}>{v} (not on the list)</option>}
      {sets.map((g) => (g.label
        ? <optgroup key={g.label} label={g.label}>{rows(g.options)}</optgroup>
        : rows(g.options)))}
    </select>
  );
}

/* ---------------- the register ---------------- */

/** The spend taxonomy, grouped by family. "Uncategorised" is where the
    importer puts what it cannot place, so nobody is offered it as a choice;
    a record already in it still shows it. */
export function CategorySelect({ value, ...rest }) {
  const groups = FAMILIES.map((f) => ({
    label: f.label,
    options: f.categories.filter((c) => c !== "Uncategorised" || value === c),
  }));
  return <Choice groups={groups} value={value} placeholder="Choose a category" {...rest} />;
}

/** Where a vendor is. "-" is how the register spells "not recorded". */
export function LocationSelect({ value, ...rest }) {
  const groups = LOCATIONS.map((g) => ({ label: g.group, options: g.values }));
  /* "not recorded": a hyphen now, an em dash on rows saved before */
  const blank = value === "-" || value === "\u2014";
  return <Choice groups={groups} value={blank ? "" : value} placeholder="Choose a location" {...rest} />;
}

export function PaymentTermsSelect(props) {
  return <Choice options={PAYMENT_TERMS} placeholder="Not agreed yet" {...props} />;
}

/** What kind of compliance document a file is. */
export function DocTypeSelect(props) {
  return <Choice options={DOC_TYPES} placeholder="What is this document?" {...props} />;
}

/* ---------------- what is bought ---------------- */

export function UnitSelect(props) {
  const groups = UNITS.map((g) => ({ label: g.group, options: g.values }));
  return <Choice groups={groups} placeholder="Unit" {...props} />;
}

/* ---------------- the company profile ---------------- */

export function IndustrySelect(props) {
  return <Choice options={INDUSTRIES} placeholder="Not stated" {...props} />;
}

export function CurrencySelect(props) {
  return <Choice options={CURRENCIES} placeholder="Choose a currency" {...props} />;
}

export function CountrySelect(props) {
  return <Choice options={COUNTRIES.map((c) => c[0])} placeholder="Not stated" {...props} />;
}

/** A Nigerian state from the list; anywhere else has no list to offer, so
    the state or region is typed. */
export function StateField({ country, id, value, onChange, ...rest }) {
  if (country && country !== "Nigeria") {
    return <input id={id} className="in" value={value || ""} onChange={(e) => onChange(e.target.value)} {...rest} />;
  }
  return <Choice id={id} options={NIGERIAN_STATES} value={value} onChange={onChange}
                 placeholder="Not stated" {...rest} />;
}

export function TimezoneSelect(props) {
  return <Choice options={TIMEZONES} placeholder="Choose a time zone" {...props} />;
}

/** The month the financial year starts in, stored "01-MM". */
export function FiscalStartSelect(props) {
  return <Choice options={FY_STARTS} placeholder="Choose a month" {...props} />;
}

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR - 1899 }, (_, i) => String(THIS_YEAR - i));

export function YearSelect(props) {
  return <Choice options={YEARS} placeholder="Not stated" {...props} />;
}

/* ---------------- typed values with a fixed shape ---------------- */

/* Keeps a two-part field's own state in step with `value`: what this field
   last sent is ignored, anything else (a form reset, a record loaded) is
   parsed afresh. */
function useParsed(value, parse) {
  const sent = useRef(value);
  const [parts, setParts] = useState(() => parse(value));
  useEffect(() => {
    if (value !== sent.current) { sent.current = value; setParts(parse(value)); }
  }, [value]);
  return [parts, setParts, sent];
}

const parsePhone = (value) => {
  const p = splitPhone(value);
  // An old record typed before this keeps its text until somebody edits it.
  return p ? { iso: p.iso, num: groupNational(p.national) } : { iso: "NG", num: value || "" };
};

/** A phone number: the country's dialling code from a list, then the number.
    Sends the stored shape, +2348031234567; nothing else reaches the server. */
export function PhoneInput({ id, value, onChange, disabled }) {
  const [parts, setParts, sent] = useParsed(value, parsePhone);
  const [touched, setTouched] = useState(false);
  const send = (next) => {
    setParts(next);
    setTouched(true);
    const v = joinPhone(next.iso, next.num);
    sent.current = v;
    onChange(v);
  };
  const problem = touched ? phoneProblem(value) : "";
  return (
    <>
      <div className="pairin">
        <Choice options={COUNTRIES.map(([name, iso, dial]) => [iso, `+${dial} ${name}`])}
                value={parts.iso} required ariaLabel="Country code" disabled={disabled}
                onChange={(iso) => send({ ...parts, iso })} />
        <input id={id} className="in" type="tel" inputMode="tel" autoComplete="tel-national"
               placeholder={parts.iso === "NG" ? "0803 123 4567" : "Number"} disabled={disabled}
               value={parts.num} onChange={(e) => send({ ...parts, num: e.target.value.replace(/[^\d\s-]/g, "") })} />
      </div>
      {problem && <div className="hint fieldwarn">{problem}</div>}
    </>
  );
}

const parseRc = (value) => {
  const m = /^(RC|BN|IT)?\s*[-:.#]?\s*(\d*)$/i.exec(String(value || "").trim());
  return m ? { pre: (m[1] || "RC").toUpperCase(), num: m[2] } : { pre: "RC", num: value || "" };
};

/** A CAC registration number: RC for a company, BN for a business name, IT
    for incorporated trustees, then the digits. Stored "RC 1234567". */
export function RcNumberInput({ id, value, onChange }) {
  const [parts, setParts, sent] = useParsed(value, parseRc);
  const send = (next) => {
    setParts(next);
    const v = next.num ? `${next.pre} ${next.num}` : "";
    sent.current = v;
    onChange(v);
  };
  return (
    <div className="pairin">
      <Choice className="rcpre" options={[["RC", "RC"], ["BN", "BN"], ["IT", "IT"]]} value={parts.pre}
              required ariaLabel="Register" onChange={(pre) => send({ ...parts, pre })} />
      <input id={id} className="in mono" inputMode="numeric" placeholder="1234567" value={parts.num}
             onChange={(e) => send({ ...parts, num: e.target.value.replace(/\D/g, "").slice(0, 8) })} />
    </div>
  );
}

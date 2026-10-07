"""The fixed answers a form may give, and the cleaning that holds the server to them.

A register that people type into drifts: "Lagos", "LAGOS", "Ikeja, Lagos" and
"Lagos State" are one place and four values, and every chart, filter and
warehouse join downstream has to guess that they are the same. So wherever a
question has a known set of answers, the form offers a dropdown and the server
accepts only what the dropdown could have sent.

The lists live in vocab.json beside this file. The frontend bundles the same
file (frontend/src/vocab.js), so a dropdown can never offer a value this module
refuses, or miss one it accepts.

Each cleaner takes what was sent and returns the stored spelling, or raises
Refused with a sentence the person can act on. Three rules run through all of
them:

  * Wording the rules can place is placed, not refused. "Ikeja, Lagos" is Lagos
    and "Net 30" is 30 days: an API caller or an old browser tab gets the
    canonical value, not an error about spelling.
  * `keep` is the value already on the record. Saving a form without touching a
    field that predates this file must not fail on that field, so an unchanged
    legacy value passes through as it was.
  * Blank means "not recorded" wherever the field is optional, and is never
    padded out with an invented default.
"""
import json
import re
from datetime import date
from pathlib import Path

VOCAB = json.loads(Path(__file__).with_name("vocab.json").read_text(encoding="utf-8"))

LOCATIONS = [v for g in VOCAB["locations"] for v in g["values"]]
UNITS = [v for g in VOCAB["units"] for v in g["values"]]
UNIT_ALIASES = VOCAB["unitAliases"]
PAYMENT_TERMS = [v for v, _label in VOCAB["paymentTerms"]]
DOC_TYPES = VOCAB["docTypes"]
INDUSTRIES = VOCAB["industries"]
CURRENCIES = [code for code, _label in VOCAB["currencies"]]
NIGERIAN_STATES = VOCAB["nigerianStates"]
TIMEZONES = [z for z, _label in VOCAB["timezones"]]
COUNTRIES = [c[0] for c in VOCAB["countries"]]


class Refused(ValueError):
    """A value the form's dropdown could not have sent. The message is written
    for the person who will read it, not for a log."""


def _text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _exact(value, allowed):
    """The allowed spelling of `value`, ignoring case, or None."""
    low = value.casefold()
    return next((a for a in allowed if a.casefold() == low), None)


# ------------------------------------------------------------- the register

def category(value, keep="", blank=None):
    """One of the taxonomy's categories. Legacy tender words go through
    taxonomy.canonical, then the importer's rules get a go at free wording
    ("cold chain logistics" is Logistics & freight)."""
    from .taxonomy import ALL_CATEGORIES, canonical
    from .vendor_import import DEFAULT_CATEGORY, category_for

    raw = _text(value)
    if not raw:
        if blank is not None:
            return blank
        raise Refused("Choose a category from the list.")
    if keep and raw == keep:
        return keep
    hit = _exact(canonical(raw), ALL_CATEGORIES) or _exact(raw, ALL_CATEGORIES)
    if hit:
        return hit
    guess = category_for(raw)
    if guess != DEFAULT_CATEGORY:
        return guess
    raise Refused(f'"{raw}" is not one of the categories. Choose one from the list.')


def location(value, keep="", blank=None):
    """One of LOCATIONS. Anything else is read the way the importer reads an
    address, so a suburb, a street or "FCT" lands on its city or state."""
    from .vendor_import import location_for

    raw = _text(value)
    # "not recorded": a hyphen now, an em dash on rows saved before
    if not raw or raw in ("-", "\u2014"):
        if blank is not None:
            return blank
        raise Refused("Choose a location from the list.")
    if keep and raw == keep:
        return keep
    hit = _exact(raw, LOCATIONS) or location_for(raw)
    if hit:
        return hit
    raise Refused(f'"{raw}" is not one of the locations. Choose the nearest one from the list.')


def phone(value, keep=""):
    """One number in international form, digits only after the plus:
    +2348031234567. A number with no country code is read as Nigerian, the
    way it would be dialled here; the trunk 0 is dropped either way."""
    raw = str(value or "").strip()
    if not raw:
        return ""
    if keep and raw == keep:
        return keep
    intl = raw.startswith(("+", "00"))
    digits = re.sub(r"\D", "", raw)
    if raw.startswith("00"):
        digits = digits[2:]
    if not intl and not (digits.startswith("234") and len(digits) >= 11):
        digits = "234" + digits.removeprefix("0")
    if digits.startswith("234"):
        national = digits[3:].removeprefix("0")
        if not 8 <= len(national) <= 10:
            raise Refused("Enter one Nigerian phone number, like 0803 123 4567.")
        return "+234" + national
    if not 7 <= len(digits) <= 15:
        raise Refused("Enter one phone number with its country code, like +44 20 7946 0958.")
    return "+" + digits


def payment_terms(value, keep=""):
    """One of PAYMENT_TERMS, or blank. "Net 30", "30DAYS" and "30 days credit"
    are all 30 days."""
    raw = _text(value)
    if not raw:
        return ""
    if keep and raw == keep:
        return keep
    hit = _exact(raw, PAYMENT_TERMS)
    if hit:
        return hit
    up = raw.upper()
    m = re.search(r"(\d+)\s*-?\s*DAY", up) or re.search(r"NET\s*(\d+)", up)
    if m and f"{int(m.group(1))} days" in PAYMENT_TERMS:
        return f"{int(m.group(1))} days"
    if re.search(r"ADVANCE|PRE-?PAY|UP ?FRONT", up):
        return "Payment in advance"
    if re.search(r"\bCOD\b|ON DELIVERY", up):
        return "Cash on delivery"
    if re.search(r"MILESTONE|STAGED", up):
        return "Milestone payments"
    raise Refused(f'"{raw}" is not one of the payment terms. Choose one from the list.')


# ------------------------------------------------------------- what is bought

def unit(value, keep=(), blank="unit"):
    """One of UNITS, in its lower-case spelling. Item-master codes and plurals
    fold onto it (PCS is a unit, CTNS a carton, litres a litre)."""
    raw = _text(value).lower()
    if not raw:
        return blank
    if raw in UNITS:
        return raw
    if _text(value) in keep:
        return _text(value)
    for cand in (raw, raw[:-2] if raw.endswith("es") else "", raw[:-1] if raw.endswith("s") else ""):
        if cand in UNITS:
            return cand
        if cand in UNIT_ALIASES:
            return UNIT_ALIASES[cand]
    raise Refused(f'"{_text(value)}" is not one of the units. Choose one from the list.')


def doc_type(value):
    """One of DOC_TYPES, or blank for a document filed before types existed."""
    raw = _text(value)
    if not raw:
        return ""
    hit = _exact(raw, DOC_TYPES)
    if hit:
        return hit
    raise Refused("Choose what kind of document this is from the list.")


# ------------------------------------------------------- the company profile

def _choice(allowed, what):
    def clean(value, keep=""):
        raw = _text(value)
        if not raw or (keep and raw == keep):
            return raw
        hit = _exact(raw, allowed)
        if hit:
            return hit
        raise Refused(f"Choose the {what} from the list.")
    return clean


def _state(value, keep="", country=""):
    raw = _text(value)
    if not raw or (keep and raw == keep) or country not in ("", "Nigeria"):
        return raw
    if raw.upper() in ("FCT", "ABUJA", "FCT ABUJA", "ABUJA FCT"):
        return "Federal Capital Territory"
    hit = _exact(raw, NIGERIAN_STATES) or _exact(re.sub(r"(?i)\s+state$", "", raw), NIGERIAN_STATES)
    if hit:
        return hit
    raise Refused("Choose the state from the list.")


def _fiscal_start(value, keep=""):
    raw = _text(value)
    if not raw or (keep and raw == keep):
        return raw
    if re.fullmatch(r"01-(0[1-9]|1[0-2])", raw):
        return raw
    raise Refused("Choose the month the financial year starts in.")


def _year(value, keep=""):
    raw = _text(value)
    if not raw or (keep and raw == keep):
        return raw
    if re.fullmatch(r"\d{4}", raw) and 1900 <= int(raw) <= date.today().year:
        return raw
    raise Refused("Choose the year the company was incorporated.")


def _rc_number(value, keep=""):
    """CAC numbers carry a register prefix: RC for companies, BN for business
    names, IT for incorporated trustees. Stored as "RC 1234567"."""
    raw = _text(value)
    if not raw or (keep and raw == keep):
        return raw
    m = re.fullmatch(r"(RC|BN|IT)?\s*[-:.#]?\s*(\d{1,8})", raw.upper())
    if m:
        return f"{m.group(1) or 'RC'} {m.group(2)}"
    raise Refused("Enter the CAC number as digits after RC, BN or IT, like RC 1234567.")


def _tin(value, keep=""):
    raw = re.sub(r"\s", "", str(value or ""))
    if not raw or (keep and raw == keep):
        return raw
    if re.fullmatch(r"\d[\d-]{6,18}\d", raw):
        return raw
    raise Refused("Enter the tax identification number as digits, like 01234567-0001.")


def _email(value, keep=""):
    from .account_views import EMAIL_RE
    raw = _text(value).lower()
    if not raw or (keep and raw == keep):
        return raw
    if EMAIL_RE.match(raw):
        return raw
    raise Refused("Enter a valid company email address, or leave it blank.")


def _website(value, keep=""):
    """Host and path, lower-case host, no scheme or trailing slash:
    "https://WWW.Company.com/" is "www.company.com"."""
    raw = _text(value)
    if not raw or (keep and raw == keep):
        return raw
    bare = re.sub(r"(?i)^https?://", "", raw).rstrip("/")
    host, _, path = bare.partition("/")
    if not re.fullmatch(r"[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+", host):
        raise Refused("Enter the website as an address, like company.com.")
    return host.lower() + ("/" + path if path else "")


PROFILE_CLEANERS = {
    "industry": _choice(INDUSTRIES, "industry"),
    "currency": _choice(CURRENCIES, "reporting currency"),
    "timezone": _choice(TIMEZONES, "time zone"),
    "country": _choice(COUNTRIES, "country"),
    "fiscalYearStart": _fiscal_start,
    "registeredYear": _year,
    "rcNumber": _rc_number,
    "tin": _tin,
    "phone": phone,
    "email": _email,
    "website": _website,
}


def profile_field(key, value, keep="", country=""):
    """Clean one company-profile field. Fields with no fixed answers (names,
    address lines, the description) are only trimmed."""
    if key == "state":
        return _state(value, keep, country)
    clean = PROFILE_CLEANERS.get(key)
    return clean(value, keep) if clean else str(value or "").strip()

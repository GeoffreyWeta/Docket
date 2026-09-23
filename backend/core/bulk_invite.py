"""Invitations from a spreadsheet, for vendors and for your own people.

Both sides of the workspace arrive as lists. A buyer setting DOCKET up has the
company directory in one file and the approved vendor list in another, and
until now both had to be typed in one email at a time - which is why a
workspace with forty people and four hundred vendors never actually got fully
populated.

TWO STEPS, NOT ONE, AND DELIBERATELY SO. `parse` reads the file and returns
exactly who would be written to, what is wrong with each rejected row, and
which addresses are already known. `send` takes back the rows the person
confirmed. Sending a few hundred emails is not undoable - you cannot unsend an
invitation to a vendor's finance director - so the preview is not a convenience,
it is the confirmation step. A single-call importer would mean a mis-mapped
column emails four hundred strangers before anybody sees a screen.

WHAT IT ACCEPTS. Real spreadsheets, because that is what people have: .xlsx and
.xlsm through openpyxl, .csv and .txt through the csv module. Headers may be in
any order and any case, and there is no required column order.

WHEN THERE IS NO EMAIL COLUMN it scans every cell instead of failing. Half the
files that turn up have the address in a column called "Contact" or "Details"
or nothing at all, and refusing them teaches people to reformat their data by
hand, which is where transcription errors come from.
"""
import csv
import io
import re

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# Deliberately looser than the validator: this one finds candidates inside a
# cell that also holds a name and a phone number, and every candidate is then
# put through EMAIL_RE properly.
FIND_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")

MAX_BYTES = 4 * 1024 * 1024
MAX_ROWS = 5_000

# Header synonyms. Drawn from what actually turns up in company directories and
# vendor lists rather than from what a schema would prefer.
COLUMNS = {
    "email": ("email", "e-mail", "mail", "email address", "e-mail address",
              "contact email", "work email", "address"),
    "name": ("name", "full name", "contact", "contact name", "contact person",
             "person", "staff name", "employee name"),
    "company": ("company", "vendor", "supplier", "organisation", "organization",
                "business", "company name", "vendor name", "supplier name",
                "trading name"),
    "title": ("title", "job title", "position", "designation", "role title", "grade"),
    "role": ("role", "access", "access role", "permission", "user role"),
    "phone": ("phone", "telephone", "mobile", "phone number", "contact number"),
    "department": ("department", "dept", "unit", "division", "function"),
    "manager": ("manager", "reports to", "line manager", "supervisor"),
}


def _norm(s):
    return re.sub(r"[^a-z0-9 ]+", " ", str(s or "").strip().lower()).strip()


# The synonyms go through the same normaliser as the cells they are compared
# against. Without this, "E-Mail Address" normalises to "e mail address" and
# fails to match the entry spelled "e-mail address" - which is exactly the
# header the file in front of you turns out to use.
_COLUMNS_NORM = {key: {_norm(n) for n in names} for key, names in COLUMNS.items()}


def _map_header(cells):
    """{column key: index} for whichever synonyms this file happens to use."""
    out = {}
    for i, c in enumerate(cells):
        n = _norm(c)
        if not n:
            continue
        for key, names in _COLUMNS_NORM.items():
            if key in out:
                continue
            if n in names:
                out[key] = i
                break
    return out


def _rows_from_xlsx(data):
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    rows = []
    for ws in wb.worksheets:
        for r in ws.iter_rows(values_only=True):
            rows.append(["" if v is None else str(v).strip() for v in r])
            if len(rows) > MAX_ROWS * 2:
                break
    wb.close()
    return rows


def _rows_from_csv(data):
    text = data.decode("utf-8-sig", errors="replace")
    # Sniff the delimiter rather than assuming a comma: exports from Excel in a
    # locale that uses the comma as a decimal separator are semicolon-delimited,
    # and treating one of those as CSV produces one enormous column.
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    return [[(c or "").strip() for c in row] for row in csv.reader(io.StringIO(text), dialect)]


def read_table(filename, data):
    """`(rows, error)` - the file as a list of cell lists."""
    if len(data) > MAX_BYTES:
        return None, "That file is larger than 4 MB. Split it, or remove the columns you do not need."
    name = (filename or "").lower()
    try:
        if name.endswith((".xlsx", ".xlsm")):
            return _rows_from_xlsx(data), None
        if name.endswith((".csv", ".txt", ".tsv")):
            return _rows_from_csv(data), None
        if name.endswith(".xls"):
            return None, ("That is the old .xls format, which cannot be read here. "
                          "Open it in Excel and save as .xlsx.")
        return None, "Upload a .xlsx or .csv file."
    except Exception:
        return None, ("Could not read that file. If it came from another system, open it "
                      "in Excel and save it again as .xlsx or CSV.")


def _find_header(rows):
    """The first row that names an email column, or None.

    Scanned rather than assumed to be row one, because exported spreadsheets
    routinely open with a title, a logo row and a blank line before the real
    header.
    """
    for i, row in enumerate(rows[:25]):
        m = _map_header(row)
        if "email" in m:
            return i, m
    return None, {}


def extract(rows, audience="people"):
    """Pull candidate invitations out of the table.

    Returns `(rows, notes)` where each row is {email, name, company, title,
    role, ...} plus `source_row`, and notes says how the file was read - which
    the interface shows, because "we found your email column" and "we scanned
    every cell" are different levels of confidence and the person confirming
    should know which one they are looking at.
    """
    hi, cols = _find_header(rows)
    out, notes = [], {}

    if hi is not None:
        notes["mode"] = "headers"
        notes["columns"] = sorted(cols)
        get = lambda row, key: (row[cols[key]].strip()
                                if key in cols and cols[key] < len(row) else "")
        for n, row in enumerate(rows[hi + 1:], start=hi + 2):
            if not any(str(c).strip() for c in row):
                continue
            email = get(row, "email").lower()
            # Even a mapped column sometimes holds "Ada Nwosu <ada@x.com>".
            if email and not EMAIL_RE.match(email):
                found = FIND_EMAIL.search(email)
                email = found.group(0).lower() if found else email
            out.append({
                "email": email, "name": get(row, "name"),
                "company": get(row, "company"), "title": get(row, "title"),
                "role": get(row, "role").lower(), "phone": get(row, "phone"),
                "department": get(row, "department"), "manager": get(row, "manager"),
                "sourceRow": n,
            })
            if len(out) >= MAX_ROWS:
                break
    else:
        # No email header anywhere. Scan every cell - see the module docstring.
        notes["mode"] = "scanned"
        for n, row in enumerate(rows, start=1):
            joined = " ".join(str(c) for c in row if c)
            found = FIND_EMAIL.findall(joined)
            if not found:
                continue
            # The longest remaining cell is very often the person's name; it is
            # a guess, so it is offered as one and is editable before sending.
            others = [str(c).strip() for c in row
                      if c and not FIND_EMAIL.search(str(c))]
            guess = max(others, key=len) if others else ""
            for e in found:
                out.append({"email": e.lower(), "name": guess if len(found) == 1 else "",
                            "company": "" if audience == "people" else guess,
                            "title": "", "role": "", "phone": "",
                            "department": "", "manager": "", "sourceRow": n})
            if len(out) >= MAX_ROWS:
                break
    notes["found"] = len(out)
    return out, notes


def classify(candidates, *, known_emails, valid_roles=None, default_role=""):
    """Sort candidates into what will be sent and what will not, with reasons.

    Every rejection carries the row number from the original file, because the
    person fixing it is looking at the spreadsheet, not at this list.
    """
    seen = {}
    ready, rejected = [], []
    for c in candidates:
        email = (c.get("email") or "").strip().lower()
        row = c.get("sourceRow")

        if not email:
            rejected.append({**c, "why": "No email address in this row."})
            continue
        if not EMAIL_RE.match(email):
            rejected.append({**c, "why": f"{email!r} is not a valid email address."})
            continue
        if email in seen:
            rejected.append({**c, "why": f"Duplicate of row {seen[email]} in this file."})
            continue
        if email in known_emails:
            rejected.append({**c, "why": "Already has an account in this workspace."})
            continue

        role = (c.get("role") or "").strip().lower() or default_role
        if valid_roles is not None:
            if role and role not in valid_roles:
                rejected.append({**c, "why": f"Role {role!r} does not exist in this workspace."})
                continue
            if not role:
                rejected.append({**c, "why": "No role, and no default chosen."})
                continue

        seen[email] = row
        ready.append({**c, "email": email, "role": role})
    return ready, rejected

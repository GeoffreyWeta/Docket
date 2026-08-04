"""Read the vendor master export and turn it into Supplier records.

The export is a spreadsheet dump: two sheets, 1,447 rows, and the honest state
of a register that people have typed into for eight years. It carries the same
vendor twice under two NAV codes, 612 distinct spellings of about two dozen
categories, four different date formats, and "Yes"/"YES"/"X"/"NO"/blank in the
same column. Everything here exists to absorb that without inventing anything.

What is deliberately NOT imported: the full bank account number. DOCKET awards
tenders, it does not pay invoices, so it has no use for one, and a register of
1,400 account numbers sitting in a demo database is a liability rather than a
feature. The bank name and the last four digits are kept, which is enough to
confirm an account is on file and to match it against a remittance.

Every judgement call is recorded on the record (`registry`) so the original
cell is always one click away and nothing is silently rewritten.
"""
import json
import re
from datetime import datetime

# ---------------------------------------------------------------- categories

# Ordered rules: the first pattern that matches a row's CLASSIFICATION wins, so
# put the specific ahead of the general ("cold room spare parts" is maintenance,
# not food, even though "cold" suggests otherwise).
CATEGORY_RULES = [
    ("Fuel, diesel & gas",        r"DIESEL|\bGAS\b|PETROL|FUEL|OIL\s*&|OIL AND|LUBRICAN"),
    ("Staff catering",            r"STAFF LUNCH|CATERING SERVICE|FOOD CANTEEN|RESTAURANT & BAKERY|KITCHEN$"),
    ("Landlord & property",       r"LAND\s*LORD|LANDLORD|PROPERTY|REAL ESTATE|MALL STORE|APARTMENT|ESTATE SURVEY|PHYSICAL PLANNING|HOUSE (AGENT|LAWYER)|\bAGENT\b|STORE$"),
    ("Printing & packaging",      r"PRINT|PACKAGING|SIGNAGE|CARTON|BOX MANUF|THERMAL (PAPER|LABEL)|PAPER CONVERT|LABEL|STICKER|BRANDING/|CAKE BOARD|PLASTIC"),
    ("IT & telecoms",             r"\bIT\b|\bI T\b|INFORMATION TECH|SOFTWARE|TECHNOLOG|TELECOM|INTERNET|WEBSITE|DATA (PROTECT|ANALYSIS|NETWORK)|MICROSOFT|CONNECTIVITY|GEOGRAPHIC INFORMATION|GEOSPATIAL|FINANCIAL TECHNOLOGY|VEHICLE TRACKING|AUTOMOTIVE AND TELEMATICS|COMPLIANCE|SUREGIFT|FLEET FUEL"),
    ("Marketing & media",         r"ADVERTIS|MARKETING|MEDIA|BRAND|\bPR\b|PUBLIC RELATIONS|INFLUENCER|TV/|RADIO|BROADCAST|ONLINE CONTENT|PHOTOGRAPH|ENTERTAIN|ENTERAIM|EVENT|RESEARCH|SURVEY|DIGITAL CONTENT|TALENT MANAGEMENT|PUBLISHING|NGO|NON GOVERNMENTAL|DECORATION|AGGREGATOR|ONLINE DELIVERY|E-COMMERCE|SOLAR ENERGY"),
    ("Construction & engineering", r"CONSTRUCT|DEVELOPMENT VENDOR|CIVIL ENG|BUILDING|PROJECT|ENGINEERING|FABRICAT|ALUMINIUM|GLASS|METAL ENG|CARPENTARY|PLUMB|BOREHOLE|WEIGHT & MEASURE|WEIGHTING|TANK AND LINE|MECHANICAL ENG|ELECTRICAL AND MECHANICAL|GENERATOR|POWER|CONTRACTOR"),
    ("Maintenance & facilities",  r"MAINTEN|MAINTAN|FRIDGE|REPAIR|HVAC|AIR CONDITION|\bAC\b|COLD ROOM|COOLING|REFRIGERAT|FACILITY|TECHNICAL SERVICE|SPARE ?PARTS|SPEARPARTS|MECHANIC|AUTO SERVICE|CAR ?S? ?(MECHANIC|REPAIR)|INSECTICUTOR|ELECTRICAL (INSTALL|CONTRACTOR|MATERIAL)|UPS REPAIR"),
    ("Cleaning, pest & waste",    r"FUMIGA|FUNMIGATION|PEST|CLEAN|JANITOR|SANITATION|WASTE|SEWAGE|ENVIRONMENT|WATER & FOOD ANALYSIS|WATER MANAGEMENT|WATER TREATMENT|HYGIENE|DERATTUS"),
    ("Logistics & freight",       r"LOGISTIC|FREIGHT|FRIEGHT|CLEARING|COURIER|TRANSPORT|SHIPPING|IMPORT AND EXPORT|CARGO|PARCEL|WAREHOUS|TEMPERATURE CONTROLLED|GENERAL LOGISTICS"),
    ("Fleet & automotive",        r"TRUCK|AUTOMOBILE|AUTOS|AUTO |BIKE|VEHICLE|CAR (PURCHASE|HIRE|TRACKER)|FLEET|DRIVING|COOLING VAN|MOBILITY|LICENSING"),
    ("Travel & hospitality",      r"TRAVEL|TOURISM|HOSPITALITY|ESCOURT|HOTEL|VISA"),
    ("Legal",                     r"LEGAL|LAW ?(FIRM|PRACTICE)|SOLICITOR|ATTORNEY|BARRISTER|LAWYER"),
    ("Finance & audit",           r"AUDIT|TAX|INVESTMENT|LEASING|FINANCIAL|FINANCE|CREDIT RATING|ISSUING HOUSE|TRUSTEE|TRUST BUSINESS|ASSET MANAGEMENT|ASSET VALUATION|BUREAU DE CHANGE|\bFX\b|FORIEGN OPEN MARKET|SALARY ADVANCE|ACCOUNT"),
    ("Insurance & health",        r"INSURANCE|\bHMO\b|MEDICAL|HEALTH|FOOD HANDLERS"),
    ("People & consulting",       r"CONSULT|TRAINING|CUSTOMER BASED|\bHR\b|RECRUIT|BUSINESS SUPPORT|LEARNING|ADVISORY|TALENT|SERVICE PROVIDER|MANAGEMENT SYSTEM|CERTIFICATION|HALAAL|TESTING, INSPECTION|INSPECTION|SCIENTIFIC LAB|LABOURATORY|CREDIT"),
    ("Furniture & interiors",     r"FURNITURE|INTERIOR|WOOD ?WORK|CARPET|METAL STORAGE"),
    ("Equipment & assets",        r"EQUIPMENT|\bASSET\b|ELECTRONIC|ELECTRICAL|APPLIANCE|MIXING|PIZZA OVEN|OVEN|FOOD EQUIPMENT|SAFETY|FIRE|SECURITY|TOOLS|MACHINE|LABQUIP|LAB|AVS PROTECTOR|COLDROOM RENTAGE|ICE (MANUFACTURING|CONTAINER)"),
    ("Chemicals",                 r"CHEMICAL|CHEMCAL|PAINT"),
    ("Food & ingredients",        r"FOOD|CONSUMABLE|RAW MATERIAL|BAKER|BREAD|FLOUR|VEGETABLE|\bVEG\b|FRUIT|DAIRY|BEVERAGE|DRINK|WATER|CORN|POTATO|CASHEW|CHOCOLATE|COOKIE|CAKE|PASTRY|YOGHURT|HONEY|BEEF|PEPPERONI|WAFER|COCA COLA|MILO|MALTINA|BISCUIT|STRAWBERRY|BEETROOT|CHIA|NUTS|ICE CREAM|SWEET|CONFECTION|WHIPPED CREAM|GOLDEN PENNY|COMMISSARY|PIZZA|GROCER|PROVISION|AGRIC|FARM|DIARY|SNAX|SNACK|PERISHABLE|PINKBERRY|HENNESSY|LIFESTOCK|TRADING|MERCHANDISE|DISTRIBUT|COMMODITY"),
    ("Uniforms & workwear",       r"UNIFORM|CLOTHING|GARM"),
    ("General supplies",          r"GENERAL SUPPL|COMMON ITEM|PROCUREMENT|GENERAL (GOODS|PROCUREMENT|MERCHAND|CONTRACT|SERVICE)|SUPPLY|SUPPLIES|MARKETING ITEMS|DP ITEMS"),
]

# Rows whose CLASSIFICATION says only "international vendor" carry no category
# of their own; the sheet they came from is the useful fact, kept in `source`.
NOISE_CATEGORY = re.compile(r"^\s*(INTERNATIONAL VENDORS?|NIL|)\s*$", re.I)

DEFAULT_CATEGORY = "Uncategorised"


def category_for(classification, name=""):
    """The classification column decides where it can. Where it cannot (blank,
    "INTERNATIONAL VENDORS", or a label like "SERVICES" that says nothing), the
    company name is the next best evidence: "HERON TRAVEL LTD" is a travel
    agent whatever the column says. Only when neither speaks does a vendor land
    in Uncategorised, and the raw label stays on the record either way."""
    raw = (classification or "").strip()
    if not NOISE_CATEGORY.match(raw):
        hit = _match(raw)
        if hit:
            return hit
    return _match(name) or DEFAULT_CATEGORY


def _match(text):
    """Punctuation becomes whitespace before matching, so "I.T" and "OIL&GAS"
    read the way the rules are written."""
    up = re.sub(r"[.&/,]", " ", (text or "").upper())
    up = re.sub(r"\s+", " ", up).strip()
    for label, pattern in CATEGORY_RULES:
        if re.search(pattern, up):
            return label
    return ""


# ------------------------------------------------------------------ location

# Matched against the address, longest and most specific first, because
# "PORT HARCOURT" must win before "RIVERS" and "LEKKI" must resolve to Lagos.
PLACES = [
    ("Abuja", r"ABUJA|\bFCT\b|GARKI|WUSE|MAITAMA|GWARIMPA|LUGBE|KUBWA|JABI|UTAKO|NYANYA|APO |ASOKORO|KARU\b|MARABA|GUDU|DUTSE|GWAGWALADA|USHAFA"),
    ("Port Harcourt", r"PORT ?HAR?COURT|\bPHC?\b|RUMU|TRANS ?AMADI|D/?LINE|DIOBU|ELIOZU|ABULOMA|OZUOBA|MGBUOBA|CHOBA|IGWURUTA|RIVERS"),
    ("Lagos", r"LAGOS|IKEJA|LEKKI|SURULERE|APAPA|IKOYI|VICTORIA ISLAND|\bV\.?I\b|YABA|MUSHIN|OSHODI|IKORODU|AGEGE|OJOTA|GBAGADA|ISOLO|AJAH|FESTAC|IPAJA|IKOTUN|MARYLAND|OGBA|ALAUSA|SHOMOLU|SOMOLU|BARIGA|MAGODO|OJODU|ANTHONY|ILUPEJU|ONIPANU|KETU|ALAPERE|OKOTA|EGBEDA|IDIMU|AKOWONJO|ABULE ?EGBA|AJEGUNLE|SATELLITE TOWN|AMUWO|OWORO|JIBOWU|ONIKAN|MARINA|LAWANSON|AGUDA|MATORI|LADIPO|IJORA|EBUTE|OJO |ALABA|BADAGRY|EPE\b|OGUDU|OPEBI|ALLEN AVENUE|BROAD STREET"),
    ("Ogun", r"\bOGUN\b|SANGO|OTA\b|ABEOKUTA|MOWE|IBAFO|MAGBORO|AGBARA|IJEBU|REDEMPTION CAMP|ITORI|SAGAMU|SHAGAMU|AREPO|ALAGBOLE|AJUWON|LUSADA|WAWA"),
    ("Oyo", r"\bOYO\b|IBADAN|OLUYOLE|RING ROAD|BODIJA|AKOBO|BASHORUN|MONATAN|OLOGUNERU"),
    ("Rivers", r"\bRIVERS\b|BAYELSA|YENOGOA|YENAGOA"),
    ("Delta", r"\bDELTA\b|WARRI|ASABA|EFFURUN|SAPELE|UGHELLI|OKPANAM"),
    ("Edo", r"\bEDO\b|BENIN CITY|BENIN-|IKPOBA|UGBOWO"),
    ("Kano", r"\bKANO\b|BOMPAI|ZARIA ROAD|TARGUNI"),
    ("Kaduna", r"KADUNA|MALALI|GONIN|KIGO"),
    ("Cross River", r"CALABAR|CROSS ?RIVER|EKORINIM|ATAKPA"),
    ("Akwa Ibom", r"AKWA ?IBOM|\bUYO\b|ABAK|IKOT EKPENE|EKPENE"),
    ("Enugu", r"ENUGU|ACHARA|OGUI|ABAKALIKI"),
    ("Anambra", r"ANAMBRA|ONITSHA|\bAWKA\b|NNEWI"),
    ("Imo", r"\bIMO\b|OWERRI|NAZE|EGBU"),
    ("Abia", r"\bABIA\b|\bABA\b|UMUAHIA"),
    ("Kwara", r"KWARA|ILORIN|TANKE|AKEREBIATA"),
    ("Ondo", r"\bONDO\b|AKURE|IJAPO"),
    ("Osun", r"\bOSUN\b|OSOGBO|OKENI"),
    ("Plateau", r"PLATEAU|\bJOS\b|BUKURU"),
    ("Niger", r"NIGER STATE|MINNA|BOSSO|\bMAJE\b"),
    ("Nasarawa", r"NASARAWA|\bUKE\b|MOPOL QUARTERS"),
    ("Kogi", r"\bKOGI\b|LOKOJA"),
    ("UAE", r"\bUAE\b|DUBAI|JUMEIRAH|RAS AL KHAIMAH|MASHREQ|DMCC"),
    ("United Kingdom", r"\bUK\b|LONDON|ENGLAND|STAFFORDSHIRE|REDDITCH|WORCESTER|AYRSHIRE|STEVENSTON"),
    ("United States", r"\bUSA\b|MICHIGAN|TEXAS|MARYLAND|GEORGIA|ILLINOIS|CALIFORNIA|LIVONIA|BATAVIA|CARSON|SEATTLE|WASHINGTON|LAWRENCE ?VILLE|BELCAMP|VERNON HILLS|LAKE FOREST|REDFORD"),
    ("India", r"INDIA|MUMBAI|NEW DELHI|BANGALORE|GURGAON|HARYANA|MANIPAL"),
    ("China", r"CHINA|GUANGDONG|GUANGZHOU|ZHONGSHAN|QINGDAO|SHANDONG|HONG KONG"),
    ("Egypt", r"EGYPT|CAIRO|OBOUR|MOKATTAM"),
    ("Turkey", r"TURKEY|ISTANBUL|ESENYURT"),
    ("Europe", r"GERMANY|HAMBURG|PORTUGAL|ITALY|VERONA|NETHERLAND|POLAND|WARSAW|FRANCE|AUSTRIA|SWITZERLAND|GENEVA|IRELAND|KILDARE|NAAS"),
    ("South Africa", r"SOUTH AFRICA|CAPE TOWN|JOHANNESBURG|BOKSBURG|KEMPTON|MONTAGUE GARDENS|GLEN EAGLE"),
    ("Australia", r"AUSTRALIA|BRISBANE|QUEENSLAND|PERTH|MOUNT LAWLEY"),
    ("Ghana", r"GHANA|ACCRA"),
    ("Lebanon", r"LEBANON|BEIRUT|CHOUIFAT"),
    ("New Zealand", r"NEW ZEALAND|AUCKLAND"),
    ("Mauritius", r"MAURITIUS"),
    ("Singapore", r"SINGAPORE"),
]


def location_for(address, phone=""):
    up = (address or "").upper()
    for label, pattern in PLACES:
        if re.search(pattern, up):
            return label
    # no address to go on: a foreign dialling code is still a fact
    if (phone or "").strip().startswith(("+", "00")) and not (phone or "").startswith(("+234", "0023")):
        return "International"
    return ""


# --------------------------------------------------------------------- dates

def reg_date_ms(value):
    """The column holds four shapes: an ISO timestamp, d/m/Y, d-m-Y, and typos
    with the separator missing. Anything unparseable returns None rather than a
    guess, and the raw string is kept on the record."""
    s = (value or "").strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y"):
        try:
            return int(datetime.strptime(s, fmt).timestamp() * 1000)
        except ValueError:
            pass
    m = re.match(r"^(\d{1,2})/(\d{2})(\d{4})$", s)      # 13/092018
    if m:
        try:
            d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
            return int(datetime(y, mo, d).timestamp() * 1000)
        except ValueError:
            return None
    return None


# ------------------------------------------------------------ prequalification

AFFIRMATIVE = {"YES", "Y", "CONFIRMED", "OK"}
BENIGN_REMARK = re.compile(r"^\s*(OK\.?|INTERNATIONAL VENDOR|)\s*$", re.I)


def compliance(row):
    """DOCKET's `prequalified` flag, decided the way the register already decides
    it: documents on file, registration form on file, and a clean remark. A row
    that fails any of the three is held out of tendering with the register's own
    words as the reason, never silently passed."""
    doc = (row.get("DOCUMENT") or "").strip().upper()
    form = (row.get("REG. FORM") or "").strip().upper()
    remark = (row.get("REMARKS") or "").strip()

    missing = []
    if doc not in AFFIRMATIVE:
        missing.append("supporting documents" if doc in ("", "X", "NIL") else "documents (%s)" % doc.lower())
    if form not in AFFIRMATIVE:
        missing.append("registration form" if form in ("", "X", "NIL") else "registration form (%s)" % form.lower())
    if not BENIGN_REMARK.match(remark):
        missing.append(remark.lower())

    if not missing:
        return True, ""
    return False, "Register: " + "; ".join(missing)


def docs_for(row, reg_ms):
    """The register records which paperwork is on file, not when it expires, so
    the doc list carries presence and no invented expiry. A DOCKET doc without an
    expiry is treated as in-date, which matches what the register asserts."""
    out = []
    if (row.get("DOCUMENT") or "").strip().upper() in AFFIRMATIVE:
        out.append({"name": "Vendor documents on file", "expiry": None, "source": "register"})
    if (row.get("REG. FORM") or "").strip().upper() in AFFIRMATIVE:
        out.append({"name": "Registration form on file", "expiry": None, "source": "register"})
    if (row.get("TIN Number") or "").strip() not in ("", "NIL", "0"):
        out.append({"name": "TIN certificate", "expiry": None, "source": "register"})
    for field, label in (("VENDOR AGREEMENT", "Vendor agreement"),
                         ("THIRD PARTY", "Third-party declaration"),
                         ("ADDENDUM", "Contract addendum")):
        v = (row.get(field) or "").strip().upper()
        if v in ("CONFIRMED", "YES"):
            out.append({"name": label + " signed", "expiry": None, "source": "register"})
    return out


# -------------------------------------------------------------------- helpers

def mask_account(number):
    """Bank name plus the last four digits. Enough to confirm an account is on
    file; not enough to move money."""
    digits = re.sub(r"\D", "", number or "")
    if len(digits) < 4:
        return ""
    return "*" * max(0, len(digits) - 4) + digits[-4:]


def clean(v):
    s = str(v or "").strip()
    return "" if s.upper() in ("NIL", "N/A", "NA", "X", "-") else s


def first_email(v):
    """The column often holds several addresses, and sometimes a whole mail
    header ("Elias El khoury <eliaskhoury@kcrlimited.com>")."""
    s = clean(v)
    if not s:
        return "", []
    found = re.findall(r"[\w.+-]+@[\w-]+\.[\w.-]+", s)
    found = [f.rstrip(".,;") for f in found]
    return (found[0] if found else ""), found[1:]


def norm_name(name):
    """Collapse a name to compare two spellings of the same company. Drops the
    legal suffixes and the filler words the register uses inconsistently."""
    n = (name or "").upper()
    n = re.sub(r"[.,'\"()\-/&]", " ", n)
    n = re.sub(r"\b(LIMITED|LTD|PLC|INC|NIG|NIGERIA|COMPANY|CO|ENTERPRISES?|VENTURES?|"
               r"SERVICES?|SERVICE|INTERNATIONAL|INTL|GLOBAL|AND|THE|CONCEPTS?|RESOURCES?|"
               r"SOLUTIONS?|SUPPLIES|GROUP|PVT|PTY|SA|SRL|GMBH|LLC|FZE|DMCC)\b", " ", n)
    return re.sub(r"\s+", "", n)


def slug_id(name, taken):
    """A stable, readable primary key: v- plus a slug of the name, deduped."""
    base = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")[:12].strip("-") or "vendor"
    cand = "v-" + base
    n = 2
    while cand in taken or len(cand) > 16:
        suffix = "-%d" % n
        cand = ("v-" + base)[:16 - len(suffix)] + suffix
        n += 1
    taken.add(cand)
    return cand


# ----------------------------------------------------------------------- read

def read_rows(path):
    with open(path, encoding="utf-8") as fh:
        book = json.load(fh)
    rows = []
    for sheet, records in book.items():
        source = "international" if "INTERNATIONAL" in sheet.upper() else "domestic"
        for r in records:
            rows.append((source, r))
    return rows


def completeness(row):
    """Used to pick a winner when the same vendor appears twice: prefer the row
    that actually has data in it."""
    return sum(1 for v in row.values() if clean(v))


def build(path):
    """Normalise the export into records ready for Supplier.objects, plus a
    report of every decision that changed or dropped a row."""
    rows = read_rows(path)
    report = {"rows": len(rows), "merged": [], "uncategorised": [], "no_location": [],
              "unparsed_dates": [], "not_prequalified": 0}

    # Merge on normalised name. Same vendor re-registered under a second NAV
    # code, or listed on both sheets: one supplier, both codes recorded.
    groups = {}
    for source, row in rows:
        name = clean(row.get("SUPPLIER NAME"))
        if not name:
            continue
        groups.setdefault(norm_name(name), []).append((source, row))

    taken, out = set(), []
    for key, members in groups.items():
        members.sort(key=lambda sr: completeness(sr[1]), reverse=True)
        source, row = members[0]
        others = members[1:]
        if others:
            report["merged"].append({
                "kept": clean(row.get("SUPPLIER NAME")),
                "kept_code": clean(row.get("Nav Code")) or clean(row.get("CODE")),
                "also": [{"name": clean(r.get("SUPPLIER NAME")),
                          "code": clean(r.get("Nav Code")) or clean(r.get("CODE"))} for _, r in others],
            })

        name = clean(row.get("SUPPLIER NAME"))
        code = clean(row.get("Nav Code")) or clean(row.get("CODE"))
        raw_class = clean(row.get("CLASSIFICATION"))
        address = clean(row.get("ADDRESS"))
        phone = clean(row.get("PHONE"))
        email, more_emails = first_email(row.get("EMAIL ID"))
        raw_date = clean(row.get("NAV REG DATE"))
        reg_ms = reg_date_ms(raw_date)
        prequalified, reason = compliance(row)
        category = category_for(raw_class, name)
        location = location_for(address, phone)

        if category == DEFAULT_CATEGORY:
            report["uncategorised"].append(raw_class or "(blank)")
        if not location:
            report["no_location"].append(name)
        if raw_date and reg_ms is None:
            report["unparsed_dates"].append({"name": name, "value": raw_date})
        if not prequalified:
            report["not_prequalified"] += 1

        out.append({
            "id": slug_id(name, taken),
            "name": name,
            "category": category,
            "location": location,
            "prequalified": prequalified,
            "rejected_reason": reason,
            "contact_email": email,
            "registered_at": reg_ms,
            "rating": 0,
            "docs": docs_for(row, reg_ms),
            "perf": {},                      # the register holds no delivery history
            "code": code,
            "classification": raw_class,
            "contact_person": clean(row.get("CONTACT PERSON")),
            "phone": phone,
            "address": address,
            "payment_terms": clean(row.get("PAYMENT TERMS")),
            "registry": {
                "source": source,
                "regRef": clean(row.get("REG REF N0")),
                "regDateRaw": raw_date,
                "tin": clean(row.get("TIN Number")),
                "statePayerId": clean(row.get("STATE PAYER ID")),
                "bankName": clean(row.get("Bank Name")),
                "accountMasked": mask_account(row.get("ACCOUNT NUMBER")),
                "newPaymentTerms": clean(row.get("NEW AGREED PAYMENT TERMS")),
                "remarks": clean(row.get("REMARKS")),
                "vendorAgreement": clean(row.get("VENDOR AGREEMENT")),
                "thirdParty": clean(row.get("THIRD PARTY")),
                "addendum": clean(row.get("ADDENDUM")),
                "otherEmails": more_emails,
                "alsoRegisteredAs": [{"name": clean(r.get("SUPPLIER NAME")),
                                      "code": clean(r.get("Nav Code")) or clean(r.get("CODE"))}
                                     for _, r in others],
            },
        })

    out.sort(key=lambda v: v["name"])
    report["vendors"] = len(out)
    return out, report

"""The spend taxonomy — one tree, three layers, used by vendors and tenders alike.

Before this file the workspace held two unrelated vocabularies: the register
carried the twenty-three categories `vendor_import.CATEGORY_RULES` derives from
the classification column, and tenders carried seven invented words hardcoded in
a dropdown ("Dairy", "IT hardware"). Analytics charted the second against a
register built on the first, so a category total could never be checked against
the vendors that make it up.

There is now one tree:

    family        Eight buckets a CFO would recognise on a spend report.
    category      The twenty-three the register already derives. Unchanged —
                  renaming them would invalidate 1,436 imported records.
    subcategory   Derived from the register's own classification wording, so
                  every leaf can be traced back to the cell it came from.

Layers two and three are *derived*, never typed. A taxonomy somebody maintains
by hand drifts from the data within a quarter; one derived from the source text
is wrong in ways you can see and fix in the rules.
"""
import re

# ------------------------------------------------------------------ families

# (key, label, [category labels]) — every category in CATEGORY_RULES appears
# exactly once, and the checker at the bottom of this file enforces that.
FAMILIES = [
    ("food", "Food & catering", [
        "Food & ingredients",
        "Staff catering",
    ]),
    ("energy", "Energy & fuel", [
        "Fuel, diesel & gas",
    ]),
    ("tech", "Technology & telecoms", [
        "IT & telecoms",
    ]),
    ("brand", "Marketing, media & print", [
        "Marketing & media",
        "Printing & packaging",
    ]),
    ("works", "Works, property & facilities", [
        "Construction & engineering",
        "Landlord & property",
        "Maintenance & facilities",
        "Cleaning, pest & waste",
    ]),
    ("move", "Logistics, fleet & travel", [
        "Logistics & freight",
        "Fleet & automotive",
        "Travel & hospitality",
    ]),
    ("prof", "Professional services", [
        "Legal",
        "Finance & audit",
        "People & consulting",
        "Insurance & health",
    ]),
    ("goods", "Goods, equipment & supplies", [
        "Equipment & assets",
        "Furniture & interiors",
        "Uniforms & workwear",
        "Chemicals",
        "General supplies",
        "Uncategorised",
    ]),
]

FAMILY_OF = {cat: key for key, _label, cats in FAMILIES for cat in cats}
FAMILY_LABEL = {key: label for key, label, _cats in FAMILIES}
ALL_CATEGORIES = [cat for _k, _l, cats in FAMILIES for cat in cats]


def family_for(category):
    """The family a category rolls up into. Unknown categories land in goods
    rather than vanishing from the rollup — a spend report that silently drops
    a line is worse than one with an odd line in it."""
    return FAMILY_OF.get(category, "goods")


# -------------------------------------------------------------- subcategories

# {category: [(sub label, pattern)]} — matched against the register's raw
# classification, then the vendor name, exactly like category_for. First match
# wins, so order specific before general. A category with no rule, or a vendor
# none of its rules match, keeps the category itself as its leaf: an honest
# "not broken down further" rather than a guess.
SUBCATEGORY_RULES = {
    "Food & ingredients": [
        ("Dairy & chilled",       r"DAIRY|DIARY|MILK|CHEESE|MOZZAREL|YOGHURT|YOGURT|BUTTER|CREAM|ICE CREAM"),
        ("Bakery & flour",        r"BAKER|BREAD|FLOUR|PASTRY|CAKE|COOKIE|BISCUIT|WAFER|DOUGH|CONFECTION"),
        ("Meat & protein",        r"BEEF|CHICKEN|POULTRY|MEAT|PEPPERONI|SAUSAGE|FISH|EGG|LIFESTOCK|LIVESTOCK"),
        ("Produce & agriculture", r"VEGETABLE|\bVEG\b|FRUIT|FARM|AGRIC|POTATO|CORN|BEETROOT|STRAWBERRY|PERISHABLE"),
        ("Beverages",             r"BEVERAGE|DRINK|WATER|JUICE|COCA COLA|MILO|MALTINA|HENNESSY|COFFEE|TEA\b"),
        ("Groceries & provisions", r"GROCER|PROVISION|COMMISSARY|CONSUMABLE|RAW MATERIAL|COMMODITY|MERCHANDISE|DISTRIBUT|TRADING"),
    ],
    "Fuel, diesel & gas": [
        ("Diesel & AGO",   r"DIESEL|\bAGO\b"),
        ("Cooking gas",    r"\bLPG\b|COOKING GAS|GAS PLANT|GAS REFILL"),
        ("Petrol & PMS",   r"PETROL|\bPMS\b|FILLING STATION"),
        ("Lubricants",     r"LUBRICAN|ENGINE OIL|GREASE"),
    ],
    "IT & telecoms": [
        ("Software & licences",  r"SOFTWARE|MICROSOFT|LICENC|LICENS|\bERP\b|APPLICATION"),
        ("Hardware & devices",   r"HARDWARE|LAPTOP|COMPUTER|PRINTER|DEVICE|\bPOS\b|SERVER"),
        ("Connectivity",         r"INTERNET|CONNECTIVITY|TELECOM|BANDWIDTH|\bISP\b|NETWORK"),
        ("Tracking & telematics", r"TRACKING|TELEMATIC|GEOSPATIAL|GEOGRAPHIC INFORMATION|FLEET FUEL"),
        ("Web & digital",        r"WEBSITE|\bWEB\b|DIGITAL|E-?COMMERCE|PORTAL"),
        ("Data & security",      r"DATA (PROTECT|ANALYSIS|NETWORK)|CYBER|SECURITY|COMPLIANCE"),
    ],
    "Marketing & media": [
        ("Advertising & brand",  r"ADVERTIS|BRAND|MARKETING|CREATIVE"),
        ("Broadcast & radio",    r"RADIO|TV/|BROADCAST|TELEVISION"),
        ("Digital & influencer", r"INFLUENCER|ONLINE CONTENT|DIGITAL CONTENT|SOCIAL MEDIA"),
        ("Events & activation",  r"EVENT|ENTERTAIN|ENTERAIM|DECORATION|ACTIVATION"),
        ("Research & insight",   r"RESEARCH|SURVEY|INSIGHT"),
        ("PR & publishing",      r"\bPR\b|PUBLIC RELATIONS|PUBLISHING|PHOTOGRAPH|TALENT MANAGEMENT"),
    ],
    "Printing & packaging": [
        ("Cartons & boxes",      r"CARTON|BOX MANUF|CAKE BOARD|CORRUGAT"),
        ("Labels & thermal",     r"LABEL|STICKER|THERMAL (PAPER|LABEL)"),
        ("Plastics & film",      r"PLASTIC|FILM|SHRINK|NYLON"),
        ("Signage",              r"SIGNAGE|BILLBOARD|BANNER"),
        ("General print",        r"PRINT|PAPER CONVERT|BRANDING/"),
    ],
    "Construction & engineering": [
        ("Civil & building",     r"CIVIL ENG|BUILDING|CONSTRUCT|CONTRACTOR|DEVELOPMENT VENDOR"),
        ("Mechanical & electrical", r"MECHANICAL ENG|ELECTRICAL AND MECHANICAL|\bM&E\b"),
        ("Power & generators",   r"GENERATOR|POWER|SOLAR|INVERTER"),
        ("Fabrication & metal",  r"FABRICAT|ALUMINIUM|METAL ENG|GLASS|WELD"),
        ("Plumbing & boreholes", r"PLUMB|BOREHOLE|WATER WORKS"),
        ("Carpentry & fit-out",  r"CARPENTARY|CARPENTRY|FIT ?OUT|PROJECT"),
    ],
    "Maintenance & facilities": [
        ("Refrigeration & cold room", r"COLD ?ROOM|REFRIGERAT|FRIDGE|COOLING|FREEZER"),
        ("HVAC & air conditioning",   r"HVAC|AIR CONDITION|\bAC\b"),
        ("Spare parts",               r"SPARE ?PARTS|SPEARPARTS|PARTS"),
        ("Electrical maintenance",    r"ELECTRICAL (INSTALL|CONTRACTOR|MATERIAL)|UPS REPAIR|INSECTICUTOR"),
        ("Vehicle servicing",         r"AUTO SERVICE|MECHANIC|CAR ?S? ?(MECHANIC|REPAIR)"),
        ("General maintenance",       r"MAINTEN|MAINTAN|REPAIR|TECHNICAL SERVICE|FACILITY"),
    ],
    "Cleaning, pest & waste": [
        ("Pest control & fumigation", r"FUMIGA|FUNMIGATION|PEST|DERATTUS"),
        ("Cleaning & janitorial",     r"CLEAN|JANITOR|HYGIENE|SANITATION"),
        ("Waste & sewage",            r"WASTE|SEWAGE|ENVIRONMENT"),
        ("Water treatment",           r"WATER (MANAGEMENT|TREATMENT)|WATER & FOOD ANALYSIS"),
    ],
    "Logistics & freight": [
        ("Freight & shipping",   r"FREIGHT|FRIEGHT|SHIPPING|CARGO|IMPORT AND EXPORT"),
        ("Customs clearing",     r"CLEARING|CUSTOM"),
        ("Courier & parcel",     r"COURIER|PARCEL|DISPATCH"),
        ("Cold chain",           r"TEMPERATURE CONTROLLED|COLD ?CHAIN|COOLING VAN"),
        ("Warehousing",          r"WAREHOUS|STORAGE"),
        ("Haulage & transport",  r"TRANSPORT|HAULAGE|GENERAL LOGISTICS|LOGISTIC"),
    ],
    "Fleet & automotive": [
        ("Vehicle purchase",  r"AUTOMOBILE|AUTOS|CAR PURCHASE|TRUCK|VEHICLE"),
        ("Vehicle hire",      r"CAR HIRE|LEASE|RENTAL|MOBILITY"),
        ("Motorcycles",       r"BIKE|MOTORCYCL|OKADA"),
        ("Driver services",   r"DRIVING|DRIVER"),
        ("Licensing",         r"LICENSING|REGISTRATION|PLATE"),
    ],
    "People & consulting": [
        ("Recruitment & HR",       r"RECRUIT|\bHR\b|TALENT|HUMAN RESOURCE"),
        ("Training & learning",    r"TRAINING|LEARNING|ACADEMY|COACH"),
        ("Management consulting",  r"CONSULT|ADVISORY|BUSINESS SUPPORT|MANAGEMENT SYSTEM"),
        ("Inspection & certification", r"CERTIFICATION|HALAAL|HALAL|TESTING, INSPECTION|INSPECTION|SCIENTIFIC LAB|LABOURATORY"),
    ],
    "Finance & audit": [
        ("External audit",     r"AUDIT"),
        ("Tax advisory",       r"\bTAX\b"),
        ("Banking & FX",       r"BUREAU DE CHANGE|\bFX\b|FORIEGN OPEN MARKET|BANK"),
        ("Asset & investment", r"INVESTMENT|ASSET (MANAGEMENT|VALUATION)|TRUSTEE|TRUST BUSINESS|ISSUING HOUSE"),
        ("Leasing & credit",   r"LEASING|CREDIT|SALARY ADVANCE"),
    ],
    "Insurance & health": [
        ("HMO & health cover", r"\bHMO\b|HEALTH"),
        ("General insurance",  r"INSURANCE|UNDERWRIT|BROKER"),
        ("Medical services",   r"MEDICAL|CLINIC|HOSPITAL|FOOD HANDLERS"),
    ],
    "Equipment & assets": [
        ("Kitchen & food equipment", r"PIZZA OVEN|OVEN|FOOD EQUIPMENT|MIXING|KITCHEN"),
        ("Refrigeration assets",     r"COLDROOM RENTAGE|ICE (MANUFACTURING|CONTAINER)|CHILLER"),
        ("Safety & fire",            r"SAFETY|FIRE|EXTINGUISH"),
        ("Security equipment",       r"SECURITY|\bCCTV\b|SURVEILLANCE|AVS PROTECTOR"),
        ("Lab equipment",            r"LABQUIP|\bLAB\b|SCIENTIFIC"),
        ("Electricals & appliances", r"ELECTRONIC|ELECTRICAL|APPLIANCE"),
        ("Tools & machinery",        r"TOOLS|MACHINE"),
    ],
    "Landlord & property": [
        ("Lease & rent",        r"LAND\s*LORD|LANDLORD|RENT|LEASE|APARTMENT|MALL STORE|STORE$"),
        ("Estate surveying",    r"ESTATE SURVEY|VALUATION|SURVEYOR"),
        ("Planning & agency",   r"PHYSICAL PLANNING|\bAGENT\b|HOUSE (AGENT|LAWYER)"),
        ("Property development", r"PROPERTY|REAL ESTATE"),
    ],
    "Staff catering": [
        ("Staff lunch",     r"STAFF LUNCH|FOOD CANTEEN|CANTEEN"),
        ("Event catering",  r"CATERING SERVICE|RESTAURANT & BAKERY|KITCHEN$"),
    ],
    "Travel & hospitality": [
        ("Air travel & agency", r"TRAVEL|TOURISM|TICKET"),
        ("Hotels & lodging",    r"HOTEL|HOSPITALITY|LODG|GUEST"),
        ("Visa & protocol",     r"VISA|ESCOURT|ESCORT|PROTOCOL"),
    ],
    "General supplies": [
        ("Office & stationery",  r"STATIONER|OFFICE"),
        ("Marketing items",      r"MARKETING ITEMS|DP ITEMS|PROMOTIONAL"),
        ("General procurement",  r"GENERAL (GOODS|PROCUREMENT|MERCHAND|CONTRACT|SERVICE)|PROCUREMENT|SUPPLY|SUPPLIES|GENERAL SUPPL|COMMON ITEM"),
    ],
}

# Categories with no breakdown: Legal, Furniture & interiors, Chemicals,
# Uniforms & workwear, Uncategorised. Small enough that a second layer would be
# invention rather than analysis.


def subcategory_for(category, classification="", name=""):
    """The leaf under `category`, or "" when the rules cannot place it.

    Empty means "this category, not broken down further" — the caller renders
    the category itself rather than inventing an "Other" bucket that would look
    like a real leaf on a chart.
    """
    rules = SUBCATEGORY_RULES.get(category)
    if not rules:
        return ""
    for text in (classification, name):
        up = _norm(text)
        if not up:
            continue
        for label, pattern in rules:
            if re.search(pattern, up):
                return label
    return ""


def _norm(text):
    """Same normalisation vendor_import uses, so both files read the same cell
    the same way: punctuation to whitespace, runs collapsed, upper case."""
    up = re.sub(r"[.&/,]", " ", (text or "").upper())
    return re.sub(r"\s+", " ", up).strip()


# --------------------------------------------------------------- the payload

def tree(counts=None):
    """The taxonomy as the UI consumes it: families holding categories holding
    the subcategory labels the rules can produce. `counts` is an optional
    {(category, subcategory): n} so the console can show how many vendors sit
    on each leaf without a second round trip."""
    counts = counts or {}
    out = []
    for key, label, cats in FAMILIES:
        cat_nodes = []
        for cat in cats:
            subs = [s for s, _p in SUBCATEGORY_RULES.get(cat, [])]
            cat_nodes.append({
                "key": cat,
                "label": cat,
                "subs": [{"key": s, "label": s, "count": counts.get((cat, s), 0)} for s in subs],
                "count": sum(n for (c, _s), n in counts.items() if c == cat),
            })
        out.append({"key": key, "label": label, "categories": cat_nodes,
                    "count": sum(c["count"] for c in cat_nodes)})
    return out


# The seven words the tender dropdown used to offer, mapped onto the register's
# vocabulary. Kept after the data migration runs because seed.py and any saved
# draft in somebody's browser can still produce them.
LEGACY_TENDER_CATEGORIES = {
    "Food & Produce": "Food & ingredients",
    "Dairy": "Food & ingredients",
    "Dairy & Imports": "Food & ingredients",
    "Packaging": "Printing & packaging",
    "Logistics": "Logistics & freight",
    "Equipment": "Equipment & assets",
    "IT hardware": "IT & telecoms",
    "Facilities": "Maintenance & facilities",
    "Facilities services": "Cleaning, pest & waste",
    "Energy": "Fuel, diesel & gas",
    "General": "General supplies",
}


def canonical(category):
    """Accept a legacy word, return the category the register actually uses."""
    c = (category or "").strip()
    if c in FAMILY_OF:
        return c
    return LEGACY_TENDER_CATEGORIES.get(c, c or "Uncategorised")


def _check():
    """Every category the importer can produce must appear in exactly one
    family. Run from the test suite; a rule added to vendor_import without a
    home here would otherwise quietly fall into `goods`."""
    from .vendor_import import CATEGORY_RULES, DEFAULT_CATEGORY
    produced = {label for label, _p in CATEGORY_RULES} | {DEFAULT_CATEGORY}
    placed = set(ALL_CATEGORIES)
    missing, extra = produced - placed, placed - produced
    dupes = [c for c in ALL_CATEGORIES if ALL_CATEGORIES.count(c) > 1]
    return {"missing": sorted(missing), "extra": sorted(extra), "duplicated": sorted(set(dupes))}

"""What a vendor agrees to before an event opens up to them.

Two agreements, set per event by the buyer:

  THE NON-DISCLOSURE AGREEMENT. For a sensitive request. A vendor invited to an
  event that requires one sees its reference, title and closing date, and
  nothing else - not the scope, the lines, the documents, the questions and
  answers - until somebody at the vendor has signed it in their own name.

  THE PAYMENT TERMS. What the buyer pays on, and when. Where an event states
  them, the vendor accepts them before seeing the rest and before bidding, so
  nobody wins an award on terms they later say they never saw.

Each acceptance is kept with the exact text accepted and its SHA-256 digest,
who signed, their title, the login used, the time and the address it came
from, and it goes on the audit chain. The text is fixed on the event once it is
published (drafts are the only thing that can be edited), so what a vendor
signed is always what the event said.

The same rules serve tenders and auctions. `gates` answers "what is this vendor
still to accept"; serialization in views.py and auction_views.py uses it to
decide how much of the event to send.
"""
import hashlib

from .models import Acceptance
from .util import now_ms, rid

NDA, PAYMENT = "nda", "payment"

# A plain starting point. Every company will want its own lawyers' wording, so
# it lives in the workspace settings (ndaText) and is replaced there; this is
# what an event gets when nobody has written one yet.
DEFAULT_NDA = """NON-DISCLOSURE AGREEMENT

By signing, the vendor named below ("the Vendor") agrees with {company} ("the Company") as follows.

1. Confidential information. Everything the Company shares about this event is confidential: its scope, specifications, drawings, quantities, documents, prices, questions and answers, and the fact that the Company has this requirement at all.

2. Use. The Vendor will use confidential information only to prepare and submit its response to this event, and, if it is awarded a contract, to perform that contract.

3. Disclosure. The Vendor will not disclose confidential information to anyone except its own employees and professional advisers who need it for that purpose and who are bound by the same duty of confidence. The Vendor is responsible for any breach by them.

4. Care. The Vendor will protect confidential information with at least the care it uses for its own, will not copy it beyond what the purpose needs, and will return or destroy it when the Company asks or if the Vendor does not take part.

5. Exceptions. These duties do not cover information that is or becomes public through no fault of the Vendor, that the Vendor lawfully held before the Company shared it, or that the law or a court requires the Vendor to disclose (and then only after telling the Company, where the law allows).

6. Duration. These duties last for three years after this event closes. Any contract that follows may extend them.

7. Remedies. A breach may cause the Company harm that money alone cannot put right, and the Company may seek any remedy the law allows.

8. Law. This agreement is governed by the laws of the country where the Company is registered.
"""


def default_nda(org=None):
    """The workspace's standard NDA, with the company's name in it."""
    if org is None:
        from .views import org_settings
        org = org_settings()
    text = str(org.get("ndaText") or "").strip() or DEFAULT_NDA.strip()
    company = (org.get("profile") or {}).get("legalName") or org.get("name") or "the Company"
    return text.replace("{company}", company)


def payment_text(terms, conditions):
    """What accepting the payment terms means, as one block of text."""
    from .vocab import VOCAB
    label = dict((v, lb) for v, lb in VOCAB["paymentTerms"]).get(terms, terms)
    parts = []
    if terms:
        parts.append(f"Payment terms: {label}.")
    if (conditions or "").strip():
        parts.append(conditions.strip())
    return "\n\n".join(parts)


def required(event):
    """The agreements this event asks for, in the order a vendor signs them."""
    out = []
    if event.nda_required and (event.nda_text or "").strip():
        out.append(NDA)
    if (event.payment_terms or "").strip() or (event.payment_conditions or "").strip():
        out.append(PAYMENT)
    return out


def text_for(event, kind):
    if kind == NDA:
        return (event.nda_text or "").strip()
    return payment_text(event.payment_terms, event.payment_conditions)


def _scope(event):
    from .models import Auction
    return {"auction": event} if isinstance(event, Auction) else {"tender": event}


def accepted(event, supplier_id):
    """{kind: Acceptance} for this vendor on this event."""
    rows = Acceptance.objects.filter(supplier_id=supplier_id, **_scope(event))
    return {a.kind: a for a in rows}


def gates(event, supplier_id):
    """What this vendor still has to accept before the event opens to them."""
    have = accepted(event, supplier_id)
    return [k for k in required(event) if k not in have]


def summary(event, supplier_id):
    """The agreements block a vendor's screen draws: what is asked, the text,
    and what they have already accepted."""
    have = accepted(event, supplier_id)
    from .vocab import VOCAB
    label = dict((v, lb) for v, lb in VOCAB["paymentTerms"]).get(event.payment_terms or "",
                                                                  event.payment_terms or "")
    return {
        "required": required(event),
        "pending": [k for k in required(event) if k not in have],
        "ndaText": (event.nda_text or "") if event.nda_required else "",
        "paymentTerms": event.payment_terms or "",
        "paymentTermsLabel": label,
        "paymentConditions": event.payment_conditions or "",
        "accepted": {k: {"at": a.at, "by": a.signed_name, "title": a.signed_title}
                     for k, a in have.items()},
    }


def accept(event, supplier_id, kind, name, title, username, ip=""):
    """Record one acceptance. Returns (Acceptance, error). Idempotent: a
    second acceptance of the same thing returns the first."""
    if kind not in required(event):
        return None, "This event does not ask for that."
    have = accepted(event, supplier_id).get(kind)
    if have:
        return have, None
    name = str(name or "").strip()[:120]
    if len(name) < 2:
        return None, "Type your full name to sign."
    text = text_for(event, kind)
    a = Acceptance.objects.create(
        id=rid("ac"), kind=kind, supplier_id=supplier_id,
        signed_name=name, signed_title=str(title or "").strip()[:120],
        username=str(username or "")[:150], text=text,
        digest=hashlib.sha256(text.encode("utf-8")).hexdigest(),
        at=now_ms(), ip=str(ip or "")[:64], **_scope(event))
    return a, None


def buyer_rows(event):
    """{supplier_id: {kind: {at, by, title}}} for the buyer's vendor table."""
    out = {}
    for a in Acceptance.objects.filter(**_scope(event)):
        out.setdefault(a.supplier_id, {})[a.kind] = {"at": a.at, "by": a.signed_name,
                                                     "title": a.signed_title, "id": a.id}
    return out


def record_text(a, event, supplier_name):
    """The signed record as a plain-text file, for the buyer's files."""
    from .util import fmt_date_ms
    what = "Non-disclosure agreement" if a.kind == NDA else "Payment terms"
    return (f"{what} - {event.ref} {event.title}\n"
            f"{'=' * 60}\n\n{a.text}\n\n{'=' * 60}\n"
            f"Accepted for: {supplier_name}\n"
            f"Signed by: {a.signed_name}{f', {a.signed_title}' if a.signed_title else ''}\n"
            f"Login: {a.username}\n"
            f"When: {fmt_date_ms(a.at)}\n"
            f"From address: {a.ip or 'not recorded'}\n"
            f"SHA-256 of the text above: {a.digest}\n")


def client_ip(request):
    fwd = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return (fwd.split(",")[0].strip() if fwd else request.META.get("REMOTE_ADDR", ""))[:64]

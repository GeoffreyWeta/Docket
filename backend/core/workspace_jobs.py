"""Suggested jobs; reporting relationships and signing limits remain per person."""
from .permissions import BUILTIN_DEFAULTS


def job_templates():
    buyer = set(BUILTIN_DEFAULTS["procurement"]) - {
        "team.invite", "team.org", "team.roles", "settings.rename", "settings.threshold",
        "supplier.import", "finance.sync", "finance.dimensions", "finance.baseline",
        "finance.payables", "page.finance", "supplier.suspend", "supplier.prequalify", "desk.see_reports"}
    signing = {"page.approvals", "tender.publish_decision", "award.decide", "award.see_recommendation", "auction.award"}
    manager = buyer | signing | {"desk.see_reports"}
    head = manager | {"team.invite", "team.org", "supplier.prequalify", "supplier.suspend", "supplier.import"}
    oversight = set(BUILTIN_DEFAULTS["auditor"]) | {"page.dashboard", "page.analytics", "page.team", "team.view"}
    finance = {"page.finance", "page.tenders", "page.suppliers", "finance.payables", "finance.sync", "finance.dimensions", "export.comparison", "export.memo", "export.compliance"}
    rows = [
        ("buyer", "Buyer", "Creates and runs procurement requests. Reports to a manager; cannot approve their own work.", buyer),
        ("manager", "Manager", "Reviews buyers' work and approves within assigned limits. May report to another manager or HOD.", manager),
        ("hod", "HOD", "Heads the procurement department, manages its team and reviews requests within assigned limits.", head),
        ("csco", "Chief Supply Chain Officer", "Leads the procurement reporting chain. Approval authority is set separately for each person.", head),
        ("finance", "Finance", "Works with the finance ledger and vendor exposure outside the procurement reporting chain.", finance),
        ("ceo", "CEO", "Reviews procurement and finance reports outside the procurement reporting chain. Does not sign by default.", oversight),
        ("auditor", "Auditor", "Reviews evidence outside the procurement reporting chain without changing decisions.", oversight),
    ]
    return [{"key": key, "label": label, "note": note, "perms": sorted(perms)} for key,label,note,perms in rows]

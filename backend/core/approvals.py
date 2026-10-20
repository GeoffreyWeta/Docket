"""Delegation of authority: who has to sign a commitment, and in what order.

A single threshold answers one question - "is this big enough to need a
signature" - and organisations do not work that way. A buyer's small stationery
order and a nine-figure fit-out both need a signature; they do not need the
*same* signature, and the fit-out needs several. What decides it is a ladder of
authority limits, and what decides who stands on each rung is the org chart.

So the chain is built from two facts that already exist in the workspace:

  THE LADDER (OrgSetting.data["approvalLevels"]) is an ordered list of levels,
  each with a name, an authority limit, the role that holds it, and optionally
  the specific people pinned to it. A limit of 0 means "no ceiling" and is what
  the top of the ladder carries - somebody has to be able to sign for anything,
  or a large enough number deadlocks the workspace.

  THE REPORTING LINE (Persona.manager) is the route up. A request walks from
  the raiser through their managers, and every manager who stands on a rung
  signs, until it reaches one whose limit covers the amount. Four levels of
  management means four signatures on a number none of the first three could
  have approved alone, which is the behaviour a delegation-of-authority policy
  is actually written to produce.

Three rules that are structural rather than stylistic:

  NOBODY SIGNS THEIR OWN REQUEST. The walk starts at the raiser's manager.
  Separation of duties is the product; a chain that can begin and end with the
  same person is not a chain.

  A GAP IN THE CHART IS NOT A WAY OUT. If the walk runs out of managers before
  the amount is covered - an orphan in the chart, a chain of people with no
  authority - the chain does not end short. It ends on the lowest level in the
  ladder that *does* cover the amount, open to whoever holds that level. A
  reporting line nobody has finished filling in must not become a route to an
  unsigned award.

  A LEVEL WITH NOBODY ON IT IS REPORTED, NOT SKIPPED. `unreachable()` is what
  the settings page and the setup wizard call to say so before it matters.

With no ladder configured this module stays out of the way: `ladder()` returns
[] and the caller falls back to the single `approvalThreshold`, which is what
every workspace that predates this had and still behaves identically.
"""
from .models import ApprovalStep, Persona
from .util import now_ms, rid

PUBLISH, AWARD = "publish", "award"
KINDS = (PUBLISH, AWARD)
MAX_LEVELS = 8          # eight rungs is already more than any real policy has
NO_CEILING = 0          # a limit of 0 reads as "can sign for anything"

# Two signatures that are not rungs of the ladder, told apart by `level_id`.
#
#   LINE - the raiser's own line manager. With `lineManagerApproval` on (the
#          default), every tender's publication chain starts here, whatever its
#          value: nothing goes out to vendors that the person's manager has not
#          seen. The people above the manager may sign in their place.
#   ANY  - anybody holding FALLBACK_CAP. Used when there is nobody on record
#          above the raiser, and for the single-threshold sign-off when the
#          line manager step comes first. Never the raiser themselves.
LINE, ANY = "line", "any"
FALLBACK_CAP = "tender.publish_decision"


def line_manager_required(org=None):
    """Does every tender and auction need the raiser's line manager's yes
    before vendors are told about it?"""
    if org is None:
        from .views import org_settings
        org = org_settings()
    return bool(org.get("lineManagerApproval", True))


def line_approvers(raiser):
    """(line manager, [ids of the people above them]) for this person, or
    (None, []) when nobody is on record above them."""
    chain = raiser.chain() if raiser else []
    if not chain:
        return None, []
    return chain[0], [m.id for m in chain[1:]]


def cap_persona_ids(cap=FALLBACK_CAP):
    """Persona ids of everybody who actually holds this capability."""
    from .notify import _users_for_perm
    return [u.profile.persona_id for u in _users_for_perm(cap) if u.profile.persona_id]


# ---------------------------------------------------------------- the ladder

def ladder(org=None):
    """The levels, lowest authority first. Always returns a list."""
    if org is None:
        from .views import org_settings
        org = org_settings()
    raw = org.get("approvalLevels") or []
    return raw if isinstance(raw, list) else []


def covers(level, amount):
    """Can this level sign for this amount on its own?"""
    limit = int(level.get("limit") or 0)
    return limit == NO_CEILING or amount <= limit


def top_level(levels=None):
    levels = ladder() if levels is None else levels
    return levels[-1] if levels else None


def level_for_amount(amount, levels=None):
    """The lowest rung that can carry this amount alone, or None."""
    for lvl in (ladder() if levels is None else levels):
        if covers(lvl, amount):
            return lvl
    return None


def normalise(raw):
    """Validate a ladder as it arrives from the wizard or the settings page.

    Returns (levels, error). The levels come back sorted by limit with the
    no-ceiling rung last, because the order *is* the ladder and leaving it to
    whoever typed the rows in is how a small-limit manager ends up above a
    director.
    """
    if raw in (None, ""):
        return [], None
    if not isinstance(raw, list):
        return None, "The approval ladder must be a list of levels."
    if len(raw) > MAX_LEVELS:
        return None, f"An approval ladder can have at most {MAX_LEVELS} levels."

    out, seen_names = [], set()
    for i, row in enumerate(raw):
        if not isinstance(row, dict):
            return None, "Each approval level must be a set of fields."
        name = str(row.get("name", "")).strip()[:80]
        if len(name) < 2:
            return None, f"Level {i + 1} needs a name - what is this rung called?"
        if name.lower() in seen_names:
            return None, f'There are two levels called "{name}". Give each rung its own name.'
        seen_names.add(name.lower())
        try:
            limit = int(row.get("limit") or 0)
        except (TypeError, ValueError):
            return None, f"{name}'s authority limit must be a whole number."
        if limit < 0:
            return None, f"{name}'s authority limit cannot be negative."
        role = str(row.get("role", "")).strip()[:40]
        holders = row.get("holders") or []
        if not isinstance(holders, list):
            return None, f"{name}'s named signatories must be a list."
        holders = [str(h)[:16] for h in holders if str(h).strip()][:40]
        out.append({"id": str(row.get("id") or rid("al"))[:16], "name": name,
                    "limit": limit, "role": role, "holders": holders})

    # No-ceiling rungs sort last; everything else by the size it can carry.
    out.sort(key=lambda lvl: (1, 0) if lvl["limit"] == NO_CEILING else (0, lvl["limit"]))
    if not any(lvl["limit"] == NO_CEILING for lvl in out):
        top = out[-1]
        return None, (f"Nothing could be signed above {top['limit']:,}. Give the top level "
                      f"({top['name']}) unlimited authority, so a large enough request "
                      f"always has somebody who can approve it.")
    if sum(1 for lvl in out if lvl["limit"] == NO_CEILING) > 1:
        return None, "Only the top level may have unlimited authority."
    return out, None


def unreachable(levels=None):
    """Levels with nobody who could sign for them: nobody pinned who is still in
    the workspace, nobody on the role, nobody standing on the rung. Returned as
    a list of names so the caller can say which, rather than that something is
    wrong."""
    levels = ladder() if levels is None else levels
    people = list(Persona.objects.all())
    by_id = {p.id: p for p in people}
    out = []
    for lvl in levels:
        if [h for h in (lvl.get("holders") or []) if h in by_id]:
            continue
        if lvl.get("role") and any(p.role == lvl["role"] for p in people):
            continue
        if any(p.approval_level == lvl["id"] for p in people):
            continue
        out.append(lvl["name"])
    return out


# ---------------------------------------------------------------- the chain

def plan(raiser, amount, levels=None):
    """The signatures this amount needs from this person, nearest first.

    Returns a list of (level, persona-or-None). A None persona means the rung
    was reached through the fallback rather than through the reporting line, so
    anyone holding that level may sign it.
    """
    levels = ladder() if levels is None else levels
    if not levels:
        return []
    by_id = {lvl["id"]: lvl for lvl in levels}

    chain, used = [], set()
    if raiser:
        for manager in raiser.chain():          # cycle-safe; nearest manager first
            lvl = by_id.get(manager.approval_level or "")
            if not lvl or lvl["id"] in used:
                continue
            chain.append((lvl, manager))
            used.add(lvl["id"])
            if covers(lvl, amount):
                return chain

    # The reporting line ran out below the amount - or there was none. Finish on
    # the lowest rung that can actually carry it, open to whoever holds it.
    fallback = level_for_amount(amount, levels) or top_level(levels)
    if fallback and fallback["id"] not in used:
        chain.append((fallback, None))
    return chain


def publish_plan(raiser, amount, org=None):
    """The signatures a tender needs before it goes to market, nearest first,
    as (level, persona-or-None, holders) rows. [] means the caller should fall
    back to the single threshold, exactly as before any of this existed.

    The line manager signs first. Where they also stand on a rung the ladder
    would have asked for, that one signature is both: nobody is asked to sign
    the same tender twice for being two things at once.
    """
    if org is None:
        from .views import org_settings
        org = org_settings()
    levels = ladder(org)
    rows = []
    if line_manager_required(org):
        mgr, above = line_approvers(raiser)
        if mgr:
            rows.append(({"id": LINE, "name": "Line manager", "limit": NO_CEILING, "role": ""},
                         mgr, above))
        elif not levels:
            # Nobody on record above the raiser and no ladder to fall back
            # on: somebody with publication authority signs instead. (With a
            # ladder, its own fallback rung is that signature already.)
            rows.append(({"id": ANY, "name": "Sign-off", "limit": NO_CEILING, "role": ""},
                         None, []))
    ladder_steps = plan(raiser, amount, levels)
    for lvl, per in ladder_steps:
        first = rows[0] if rows else None
        if first and first[0]["id"] == LINE and per and first[1].id == per.id:
            rows[0] = (lvl, per, list(lvl.get("holders") or []))
            continue
        rows.append((lvl, per, list(lvl.get("holders") or [])))
    if rows and not ladder_steps:
        # No ladder: the single threshold still decides whether somebody with
        # publication authority signs after the line manager. The line manager
        # holding that authority already is the same signature.
        threshold = int(org.get("approvalThreshold") or 0)
        if threshold > 0 and (amount >= threshold or amount <= 0):
            mgr = rows[0][1]
            if not (mgr and mgr.id in cap_persona_ids()) and rows[0][0]["id"] != ANY:
                rows.append(({"id": ANY, "name": "Publication sign-off", "limit": NO_CEILING,
                              "role": ""}, None, []))
    return rows


def open_rows(tender, kind, amount, rows):
    """Persist a planned chain, replacing any earlier one of this kind."""
    ApprovalStep.objects.filter(tender=tender, kind=kind).delete()
    made = [ApprovalStep(id=rid("as"), tender=tender, kind=kind, seq=i + 1,
                         level_id=lvl["id"], level_name=lvl["name"],
                         level_limit=int(lvl.get("limit") or 0),
                         role=lvl.get("role", "") or "",
                         holders=list(holders or []),
                         persona=per, amount=amount, opened_at=now_ms())
            for i, (lvl, per, holders) in enumerate(rows)]
    ApprovalStep.objects.bulk_create(made)
    return made


def open_chain(tender, kind, amount, raiser):
    """Create the pending steps for one decision. Returns them, or [] when the
    workspace has no ladder and the caller should use the legacy threshold."""
    steps = plan(raiser, amount)
    if not steps:
        return []
    return open_rows(tender, kind, amount,
                     [(lvl, per, list(lvl.get("holders") or [])) for lvl, per in steps])


def clear_chain(tender, kind):
    ApprovalStep.objects.filter(tender=tender, kind=kind).delete()


def steps_for(tender, kind):
    """Both chains on one tender, filtered in Python rather than in SQL.

    Deliberate: `bootstrap` prefetches `approval_steps` across every visible
    tender in one query, and a `.filter()` on the related manager would throw
    that away and go back to the database once per tender per kind. Two chains
    of at most eight rows is nothing to scan in memory, and the alternative was
    eighty queries on a payload that already carries the whole workspace.
    """
    rows = [s for s in tender.approval_steps.all() if s.kind == kind]
    rows.sort(key=lambda s: s.seq)
    return rows


def current_step(tender, kind):
    """The one signature the tender is waiting on, or None."""
    return (ApprovalStep.objects.filter(tender=tender, kind=kind, decided_at__isnull=True)
            .select_related("persona").order_by("seq").first())


def may_sign(step, identity):
    """Whether this person is the signature this step is waiting for.

    Four ways to be, and the ORDER OF THESE IS THE WHOLE CONTROL:

      1. the person the reporting line named;
      2. somebody explicitly pinned to the level;
      3. somebody standing on that rung of the ladder;
      4. failing all of those, anybody holding the level's role.

    (4) is last, and it was not always. Checking the role before the rung looks
    equivalent and is not: most workspaces give every rung the same role -
    "approver" is the built-in one - and under a role-first rule that made all
    four rungs interchangeable. A line manager with a five-million limit could
    sign a three-hundred-million request, because they and the finance director
    were both "approvers". The ladder existed and enforced nothing.

    So the role is a last resort, and only for a rung nobody stands on: it
    stops a half-configured ladder from deadlocking a workspace, and
    `unreachable()` reports those rungs so the gap gets closed rather than
    quietly relied on. A workspace that wants the role to be the authority says
    so by naming it and putting nobody on the rung.
    """
    if not step or step.decided_at:
        return False
    pid = identity.get("id")
    if not pid:
        return False

    if step.level_id in (LINE, ANY):
        # The line manager, or the people above them. A manager who has left
        # hands the step to those above; with nobody above, to anybody who can
        # approve publication - never to the person who raised the tender.
        if step.persona_id and Persona.objects.filter(pk=step.persona_id).exists():
            return pid == step.persona_id or pid in (step.holders or [])
        live = set(Persona.objects.filter(pk__in=step.holders or []).values_list("id", flat=True))
        if live:
            return pid in live
        from .permissions import has
        return has(identity, FALLBACK_CAP) and pid != step.tender.owner_id

    if step.persona_id:
        if step.persona_id == pid:
            return True
        # A named signatory who is still here owns this step alone; one who has
        # been removed must not strand the chain, so the level stands in.
        if Persona.objects.filter(pk=step.persona_id).exists():
            return pid in (step.holders or [])

    if pid in (step.holders or []):
        return True
    if step.holders:
        return False        # pinned to other people: not yours

    if step.level_id and Persona.objects.filter(pk=pid, approval_level=step.level_id).exists():
        return True
    if step.level_id and Persona.objects.filter(approval_level=step.level_id).exists():
        return False        # somebody does stand on this rung, and it is not you

    return bool(step.role) and identity.get("role") == step.role


def signers(step):
    """Persona ids that could sign this step, for notifications. Same order of
    precedence as `may_sign`, and it has to stay that way: mailing somebody who
    will then be refused is worse than mailing nobody."""
    if not step:
        return []
    if step.persona_id and Persona.objects.filter(pk=step.persona_id).exists():
        return [step.persona_id]
    if step.level_id in (LINE, ANY):
        live = set(Persona.objects.filter(pk__in=step.holders or []).values_list("id", flat=True))
        if live:
            return [h for h in step.holders if h in live]
        return [pid for pid in cap_persona_ids() if pid != step.tender.owner_id]
    live = {p.id: p for p in Persona.objects.all()}
    pinned = [h for h in (step.holders or []) if h in live]
    if pinned:
        return pinned
    on_rung = [p.id for p in live.values() if p.approval_level == step.level_id]
    if on_rung:
        return on_rung
    return [p.id for p in live.values() if step.role and p.role == step.role]


def decide(step, identity, ok, note=""):
    step.decided_at = now_ms()
    step.decided_by = str(identity.get("name", ""))[:120]
    step.decision = "approved" if ok else "rejected"
    step.note = str(note or "")[:300]
    step.save(update_fields=["decided_at", "decided_by", "decision", "note"])
    return step


def step_view(s):
    return {"id": s.id, "seq": s.seq, "levelId": s.level_id, "level": s.level_name,
            "limit": s.level_limit, "role": s.role, "personaId": s.persona_id,
            "personaName": s.persona.name if s.persona_id and s.persona else None,
            "holders": s.holders or [], "amount": s.amount,
            "decidedAt": s.decided_at, "decidedBy": s.decided_by,
            "decision": s.decision or None, "note": s.note or None}


def chain_view(tender, kind):
    rows = steps_for(tender, kind)
    if not rows:
        return None
    pending = next((s for s in rows if not s.decided_at), None)
    return {"kind": kind, "steps": [step_view(s) for s in rows],
            # Who raised it: an "any" step is never theirs to sign.
            "ownerId": tender.owner_id,
            "currentId": pending.id if pending else None,
            "signed": sum(1 for s in rows if s.decision == "approved"),
            "total": len(rows)}


def describe(steps):
    """One sentence naming the route, for the audit trail."""
    parts = []
    for s in steps:
        if s.persona_id and s.persona:
            who = s.persona.name
        elif s.level_id in (LINE, ANY):
            who = "anyone who can approve publication"
        else:
            who = f"any {s.level_name}"
        parts.append(f"{s.level_name} ({who})")
    return " → ".join(parts)


# ---------------------------------------------------------------- sign-offs
#
# The same rule for the requests that are not a publication chain (an auction
# going out, a date moving): the requester's line manager or anybody above
# them, falling back to whoever holds FALLBACK_CAP. Never the requester.

def signoff_route(requester):
    """(approver persona or None, [ids above them]) for a new request."""
    return line_approvers(requester)


def may_decide(so, identity):
    pid = identity.get("id")
    if so.status != "pending" or not pid or identity.get("role") == "supplier":
        return False
    if pid == so.requested_by_id:
        return False
    if so.approver_id and Persona.objects.filter(pk=so.approver_id).exists():
        return pid == so.approver_id or pid in (so.also or [])
    live = set(Persona.objects.filter(pk__in=so.also or []).values_list("id", flat=True))
    if live:
        return pid in live
    from .permissions import has
    return has(identity, FALLBACK_CAP)


def deciders(so):
    """Who to tell about a request: the approver, else whoever could sign it."""
    if so.approver_id and Persona.objects.filter(pk=so.approver_id).exists():
        return [so.approver_id]
    live = [h for h in (so.also or []) if Persona.objects.filter(pk=h).exists()]
    if live:
        return live
    return [pid for pid in cap_persona_ids() if pid != so.requested_by_id]

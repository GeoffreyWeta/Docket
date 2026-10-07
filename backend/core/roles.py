"""The company's own roles: what each is called and what each may do.

Every company names its jobs differently - one has a "Tender Board", another a
"Head of Finance" who signs - so the role list is the company's to write. The
setup wizard asks for it, and the Team page edits it afterwards. Both send the
whole list through here, so they refuse the same things for the same reasons.

Two kinds of row, one shape on the wire:

  STARTER ROLES (procurement / evaluator / approver / auditor) have fixed keys,
  because personas and the audit trail already refer to them. The company may
  rename them, change what they carry, or retire one nobody holds. That lives
  in OrgSetting "roles" (see permissions.role_overrides).

  INVENTED ROLES are AccessRole rows, exactly as the administration console
  makes them, so the console and the workspace see one list.

Removing is explicit (`remove: true`) rather than inferred from absence. Two
people editing the list at once would otherwise delete each other's new roles.

Three refusals, all about not stranding anybody:
  - a role somebody holds, has been invited to, or a ladder rung falls back to
    cannot be removed;
  - two roles cannot share a name, or the invitation dropdown lies;
  - nobody may change what their own role can do (`editor_role`), or the person
    who sets up roles could quietly hand themselves the power to sign.
"""
import re

from .permissions import (BUILTIN_DEFAULTS, BUYER_ROLES, CUSTOM_GRANTABLE, RESERVED_ROLE_KEYS,
                          ROLE_KINDS, custom_roles, roles_map, starter_role)
from .util import now_ms

MAX_ROLES = 20
KEY_RE = re.compile(r"^[a-z][a-z0-9_-]{1,19}$")


def _slug(label):
    s = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
    s = s[:20].rstrip("-")
    return s if s[:1].isalpha() else ("r-" + s)[:20].rstrip("-") or "role"


def _in_use(ladder=None):
    """{role key: why it cannot be removed}. `ladder` replaces the saved one,
    for a caller about to save a new ladder alongside the roles."""
    from . import approvals
    from .models import ActionToken, Persona
    why = {}
    for p in Persona.objects.only("role", "name"):
        why.setdefault(p.role, f"{p.name} is on it")
    for t in ActionToken.objects.filter(kind="team_invite", used_at__isnull=True):
        r = (t.payload or {}).get("role")
        if r:
            why.setdefault(r, f"{t.email} has been invited to it")
    for lvl in (approvals.ladder() if ladder is None else ladder):
        if lvl.get("role"):
            why.setdefault(lvl["role"], f"the {lvl['name']} level falls back to it")
    return why


def people_counts():
    from django.db.models import Count

    from .models import Persona
    return {r["role"]: r["n"] for r in Persona.objects.values("role").annotate(n=Count("id"))}


def listing(custom=None):
    """The roles a person can be put on, for the screens."""
    custom = custom_roles() if custom is None else custom
    counts = people_counts()
    from .permissions import assignable_roles
    return [{"key": r["key"], "label": r["label"], "note": r.get("note", ""),
             "title": r.get("title", ""), "perms": sorted(r["perms"]),
             "builtin": r["builtin"], "people": counts.get(r["key"], 0)}
            for r in assignable_roles(custom)]


def kinds():
    return [{"value": k, "label": v, "perms": sorted(BUILTIN_DEFAULTS[k])} for k, v in ROLE_KINDS.items()]


def plan(rows, editor_role=None, ladder=None):
    """Validate a role list and work out what to write. Returns (plan, error).

    Nothing is written here, so the setup wizard can validate its team against
    the roles it is about to create and still save everything in one go."""
    if not isinstance(rows, list):
        return None, "The roles must be a list."
    from .models import AccessRole
    custom = custom_roles()
    known = roles_map(custom)
    invented = {r.key: r for r in AccessRole.objects.all()}
    in_use = _in_use(ladder)

    starters, create, update, delete, refs, changes = {}, [], {}, [], {}, []
    taken_keys = set(invented) | set(RESERVED_ROLE_KEYS)
    seen_labels, kept = {}, set()

    for i, row in enumerate(rows):
        if not isinstance(row, dict):
            return None, "Each role must be a set of fields."
        key = str(row.get("key") or "").strip()
        ref = str(row.get("ref") or key or f"r{i}")[:40]
        if key and key not in BUYER_ROLES and key not in invented:
            return None, "One of those roles no longer exists. Reload and try again."
        was = known.get(key) if key else None

        if row.get("remove"):
            if not key:
                continue
            if key in in_use:
                return None, f"{was['label']} cannot be removed: {in_use[key]}. Move them to another role first."
            if key == editor_role:
                return None, "You cannot remove your own role."
            if key in BUYER_ROLES:
                starters[key] = {**_stored(key), "hidden": True}
            else:
                delete.append(key)
            changes.append(f"removed {was['label']}")
            continue

        label = re.sub(r"\s+", " ", str(row.get("label", ""))).strip()[:80]
        if len(label) < 2:
            return None, f"Role {i + 1} needs a name - what does your company call it?"
        if label.lower() in seen_labels:
            return None, f'There are two roles called "{label}". Give each its own name.'
        seen_labels[label.lower()] = ref
        note = re.sub(r"\s+", " ", str(row.get("note", "") or "")).strip()[:200]

        kind = str(row.get("kind") or "").strip()
        if kind and kind not in ROLE_KINDS:
            return None, f"Choose what {label} does."
        if "perms" in row and row["perms"] is not None:
            if not isinstance(row["perms"], list):
                return None, f"{label}'s permissions must be a list."
            perms = {str(k) for k in row["perms"]} & CUSTOM_GRANTABLE
        elif kind:
            perms = set(BUILTIN_DEFAULTS[kind])
        elif was:
            perms = set(was["perms"])
        else:
            return None, f"Choose what {label} does."

        if was and key == editor_role and perms != set(was["perms"]):
            return None, (f"You cannot change what {was['label']} can do, because it is your own role. "
                          f"Ask an administrator.")

        if key in BUYER_ROLES:
            starters[key] = {"label": label, "note": note, "title": label,
                             "perms": None if perms == set(BUILTIN_DEFAULTS[key]) else sorted(perms),
                             "hidden": False}
            kept.add(key)
        elif key:
            update[key] = {"label": label, "note": note, "perms": sorted(perms)}
            kept.add(key)
        else:
            new_key, n = _slug(label), 2
            while new_key in taken_keys or not KEY_RE.match(new_key):
                new_key = f"{_slug(label)[:17]}-{n}"
                n += 1
            taken_keys.add(new_key)
            create.append({"key": new_key, "label": label, "note": note, "title": label,
                           "perms": sorted(perms)})
            key = new_key
            changes.append(f"added {label}")
        refs[ref] = key

        if was:
            if label != was["label"]:
                changes.append(f"renamed {was['label']} to {label}")
            if perms != set(was["perms"]):
                changes.append(f"changed what {label} can do")
            if key in BUYER_ROLES and was.get("hidden"):
                changes.append(f"brought back {label}")

    # Live roles the list did not mention are left alone; count them.
    live = [k for k, r in known.items()
            if not r.get("structural") and not r.get("hidden")
            and k not in starters and k not in update and k not in delete]
    total = len(live) + len(kept) + len(create)
    if total > MAX_ROLES:
        return None, f"A workspace can have at most {MAX_ROLES} roles."
    if total == 0:
        return None, "Keep at least one role."
    for k in live:
        lb = known[k]["label"].lower()
        if lb in seen_labels:
            return None, f'There is already a role called "{known[k]["label"]}".'

    return {"starters": starters, "create": create, "update": update, "delete": delete,
            "refs": refs, "keys": set(refs.values()) | set(live), "changes": changes}, None


def _stored(key):
    from .permissions import role_overrides
    return dict(role_overrides().get(key) or {})


def apply(p, actor=""):
    """Write a plan made by `plan`. Call inside the caller's transaction."""
    from .models import AccessRole, OrgSetting
    if p["starters"]:
        row, _ = OrgSetting.objects.get_or_create(pk=1, defaults={"data": {}})
        data = dict(row.data or {})
        stored = dict(data.get("roles") or {})
        for key, o in p["starters"].items():
            shipped = starter_role(key)
            if (not o.get("hidden") and o.get("perms") is None
                    and o.get("label") == shipped["label"] and o.get("note") == shipped["note"]):
                stored.pop(key, None)     # exactly as shipped: nothing to remember
            else:
                stored[key] = o
        data["roles"] = stored
        row.data = data
        row.save(update_fields=["data"])
    for c in p["create"]:
        AccessRole.objects.create(key=c["key"], label=c["label"], title=c["title"],
                                  note=c["note"], perms=c["perms"],
                                  created=now_ms(), created_by=actor[:200])
    for key, u in p["update"].items():
        AccessRole.objects.filter(pk=key).update(**u)
    if p["delete"]:
        AccessRole.objects.filter(pk__in=p["delete"]).delete()

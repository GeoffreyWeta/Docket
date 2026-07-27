"""Server-side Claude calls. Prompts are built here so the supplier-side
review can never see buyer-internal data (e.g. the budget ceiling)."""
import json

import requests
from django.conf import settings


class AIUnavailable(Exception):
    pass


def ask(prompt, max_tokens=1000):
    if not settings.ANTHROPIC_API_KEY:
        raise AIUnavailable("AI is not configured on this deployment. Set ANTHROPIC_API_KEY.")
    r = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": settings.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": settings.AI_MODEL,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=60,
    )
    if r.status_code >= 400:
        raise AIUnavailable(f"AI provider error ({r.status_code}).")
    data = r.json()
    return "\n".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()


def ask_json(prompt, max_tokens=1000):
    out = ask(prompt + "\n\nRespond with ONLY the JSON — no preamble, no markdown fences, no commentary.", max_tokens)
    cleaned = out.replace("```json", "").replace("```", "").strip()
    return json.loads(cleaned)

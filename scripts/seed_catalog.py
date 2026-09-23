#!/usr/bin/env python3
"""Seed Vicambachgiai3 catalog + demo users via Supabase service role."""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = Path(__file__).resolve().parent / "catalog.json"


def env(name: str) -> str:
    v = os.environ.get(name, "").strip()
    if not v:
        raise SystemExit(f"Missing {name}")
    return v


def req(method: str, url: str, headers: dict, body=None, ok=(200, 201, 204)):
    data = None if body is None else json.dumps(body).encode()
    r = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw.decode() or "null") if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        if e.code not in ok:
            raise SystemExit(f"{method} {url} -> {e.code}\n{raw[:800]}")
        try:
            return e.code, json.loads(raw or "null")
        except Exception:
            return e.code, raw


def main():
    url = env("SUPABASE_URL").rstrip("/")
    key = env("SUPABASE_SERVICE_ROLE_KEY")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    catalog = json.loads(CATALOG.read_text())

    # already seeded?
    st, settings = req("GET", f"{url}/rest/v1/site_settings?id=eq.1&select=seeded", headers)
    if settings and settings[0].get("seeded"):
        print("Catalog already seeded — skip.")
        return

    id_map = {}

    def create_user(u):
        payload = {
            "email": u["email"],
            "password": u["password"],
            "email_confirm": True,
            "user_metadata": {"display_name": u["display_name"]},
        }
        code, data = req(
            "POST",
            f"{url}/auth/v1/admin/users",
            headers,
            payload,
            ok=(200, 201, 422),
        )
        if code == 422:
            # already exists — look up
            code, listed = req(
                "GET",
                f"{url}/auth/v1/admin/users?page=1&per_page=200",
                headers,
            )
            users = listed.get("users") if isinstance(listed, dict) else listed
            found = next((x for x in users or [] if (x.get("email") or "").lower() == u["email"].lower()), None)
            if not found:
                raise SystemExit(f"User exists but not found: {u['email']}")
            uid = found["id"]
        else:
            uid = data["id"]
        profile = {
            "id": uid,
            "email": u["email"],
            "display_name": u["display_name"],
            "avatar": u["avatar"],
            "bio": u["bio"],
            "role": u["role"],
            "status": "active",
            "created_at": int(time.time() * 1000) - 86400000 * 20,
        }
        req(
            "POST",
            f"{url}/rest/v1/profiles",
            {**headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
            profile,
            ok=(200, 201, 204),
        )
        id_map[u["old_id"]] = uid
        print("user", u["email"], uid)
        return uid

    for u in catalog["users"]:
        create_user(u)

    def remap_user(old):
        return id_map.get(old)

    for table in ("genres", "tags", "stories", "chapters"):
        rows = catalog[table]
        if not rows:
            continue
        req(
            "POST",
            f"{url}/rest/v1/{table}",
            {**headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
            rows,
            ok=(200, 201, 204),
        )
        print(table, len(rows))

    for table in ("story_genres", "story_tags"):
        rows = catalog[table]
        if rows:
            req(
                "POST",
                f"{url}/rest/v1/{table}",
                {**headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
                rows,
                ok=(200, 201, 204),
            )
            print(table, len(rows))

    def rewrite_user_rows(rows, drop_if_missing=True):
        out = []
        for r in rows:
            uid = remap_user(r.get("user_id"))
            if not uid:
                if drop_if_missing:
                    continue
            rec = dict(r)
            rec["user_id"] = uid
            if "likes" in rec:
                rec.pop("likes")
            out.append(rec)
        return out

    comments = rewrite_user_rows(catalog["comments"])
    if comments:
        req("POST", f"{url}/rest/v1/comments", {**headers, "Prefer": "return=minimal"}, comments, ok=(200, 201, 204))
        likes = []
        for raw, rec in zip(catalog["comments"], comments):
            for old in raw.get("likes") or []:
                uid = remap_user(old)
                if uid:
                    likes.append({"comment_id": rec["id"], "user_id": uid})
        if likes:
            req("POST", f"{url}/rest/v1/comment_likes", {**headers, "Prefer": "return=minimal"}, likes, ok=(200, 201, 204))
        print("comments", len(comments), "likes", len(likes))

    for table in ("favorites", "follows", "ratings", "notifications"):
        rows = rewrite_user_rows(catalog.get(table) or [])
        if rows:
            req("POST", f"{url}/rest/v1/{table}", {**headers, "Prefer": "return=minimal"}, rows, ok=(200, 201, 204))
            print(table, len(rows))

    views = []
    for v in catalog.get("views") or []:
        rec = dict(v)
        rec["user_id"] = remap_user(v.get("user_id"))
        views.append(rec)
    if views:
        # chunk
        for i in range(0, len(views), 40):
            chunk = views[i : i + 40]
            req("POST", f"{url}/rest/v1/views", {**headers, "Prefer": "return=minimal"}, chunk, ok=(200, 201, 204))
        print("views", len(views))

    settings = catalog["site_settings"]
    req(
        "PATCH",
        f"{url}/rest/v1/site_settings?id=eq.1",
        {**headers, "Prefer": "return=minimal"},
        {
            "name": settings.get("name") or "ViCamBachGiai",
            "tagline": settings.get("tagline") or "",
            "featured_quote": settings.get("featured_quote"),
            "poll": settings.get("poll"),
            "seeded": True,
        },
        ok=(200, 204),
    )
    print("seeded ok")


if __name__ == "__main__":
    main()

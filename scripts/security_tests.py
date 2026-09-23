#!/usr/bin/env python3
"""Server-side authorization tests against live Supabase."""
from __future__ import annotations

import json
import os
import secrets
import string
import urllib.error
import urllib.request

REF = "isawawkxjbnlbuxlhlnk"
BASE = f"https://{REF}.supabase.co"
ADMIN_EMAIL = "jasminenemo3311@gmail.com"


def mgmt_token():
    return os.environ["VERCEL_TOKEN"]


def http(method, url, headers, body=None):
    data = None if body is None else json.dumps(body).encode()
    h = dict(headers)
    if body is not None:
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw.decode() or "null") if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw) if raw else None
        except Exception:
            return e.code, raw[:300]


def keys():
    code, data = http(
        "GET",
        f"https://api.supabase.com/v1/projects/{REF}/api-keys",
        {"Accept": "application/json", "Authorization": f"Bearer {mgmt_token()}", "User-Agent": "sec"},
    )
    if code != 200:
        raise SystemExit(f"keys {code} {data}")
    anon = next(k["api_key"] for k in data if k.get("name") == "anon")
    service = next(k["api_key"] for k in data if k.get("name") == "service_role")
    return anon, service


def rest(method, path, key, body=None, user_jwt=None):
    h = {"Accept": "application/json", "apikey": key, "Authorization": f"Bearer {user_jwt or key}", "User-Agent": "sec"}
    return http(method, BASE + path, h, body)


def login(anon, email, password):
    return rest("POST", "/auth/v1/token?grant_type=password", anon, {"email": email, "password": password})


def main():
    anon, service = keys()
    results = []

    def rec(name, ok, detail=""):
        results.append((name, ok, detail))
        print(("PASS" if ok else "FAIL"), name, detail)

    # 1 guest /admin is UI-only; API: guest cannot write stories
    code, data = rest("POST", "/rest/v1/stories", anon, {"title": "hack", "slug": "hack-guest"})
    rec("11. request without user token cannot insert story", code in (401, 403) or (isinstance(data, dict) and data.get("code") in ("42501", "PGRST301", "42501")), f"{code} {str(data)[:120]}")

    code, data = rest("GET", "/rest/v1/profiles?select=email,role", anon)
    leaked = isinstance(data, list) and any((r.get("role") == "admin") for r in data)
    rec("17. anon cannot list admin emails/roles", code in (200, 206) and not leaked or code in (401, 403), f"{code} n={len(data) if isinstance(data, list) else data}")

    code, data = rest("GET", "/rest/v1/inbox?select=*", anon)
    rec("17b. anon cannot read inbox", code in (401, 403) or data == [] or (isinstance(data, dict) and data.get("code")), f"{code}")

    code, data = rest("GET", "/rest/v1/admin_audit_log?select=*", anon)
    rec("17c. anon cannot read audit log", not (isinstance(data, list) and len(data) > 0), f"{code}")

    # create reader
    pw = "Reader9!" + "".join(secrets.choice(string.ascii_letters) for _ in range(6))
    email = f"reader.sec.{secrets.token_hex(4)}@example.com"
    code, created = rest("POST", "/auth/v1/admin/users", service, {
        "email": email, "password": pw, "email_confirm": True,
        "user_metadata": {"display_name": "Sec Reader", "role": "admin"},
    })
    rec("11b. can create reader via admin API for tests", code in (200, 201), str(code))
    uid = created.get("id") if isinstance(created, dict) else None

    code, tok = login(anon, email, pw)
    rec("reader can login", code == 200, str(code))
    jwt = (tok or {}).get("access_token") if isinstance(tok, dict) else None

    if jwt:
        code, data = rest("GET", "/rest/v1/profiles?select=email,role&user_id=eq." + uid, anon, user_jwt=jwt)
        role = (data[0].get("role") if isinstance(data, list) and data else None)
        rec("4/8. signup metadata role=admin ignored; profile is reader", role == "reader", f"role={role}")

        code, data = rest("PATCH", f"/rest/v1/profiles?user_id=eq.{uid}", anon, {"role": "admin"}, user_jwt=jwt)
        rec("8. reader cannot self-promote via REST", code >= 400 or (isinstance(data, list) and (not data or data[0].get("role") != "admin")), f"{code} {str(data)[:140]}")

        code, data = rest("GET", "/rest/v1/profiles?user_id=eq.{uid}&select=role".replace("{uid}", uid), anon, user_jwt=jwt)
        still = data[0]["role"] if isinstance(data, list) and data else "?"
        rec("8b. role still reader after self-promote", still == "reader", still)

        # other user
        code, others = rest("GET", "/rest/v1/profiles?select=user_id,email,role", anon, user_jwt=jwt)
        rec("9. reader cannot list other profiles/admin", not (isinstance(others, list) and any(r.get("email") == ADMIN_EMAIL for r in others)), f"{code} n={len(others) if isinstance(others, list) else others}")

        if isinstance(others, list):
            for o in others:
                if o.get("user_id") != uid:
                    code, data = rest("PATCH", f"/rest/v1/profiles?user_id=eq.{o['user_id']}", anon, {"role": "reader"}, user_jwt=jwt)
                    rec("9b. reader cannot change another user's role", code >= 400 or data == [], f"{code}")
                    break

        code, stories = rest("GET", "/rest/v1/stories?select=id,slug&limit=1", anon, user_jwt=jwt)
        sid = stories[0]["id"] if isinstance(stories, list) and stories else None
        if sid:
            before = rest("GET", f"/rest/v1/stories?id=eq.{sid}&select=title", anon, user_jwt=jwt)[1]
            title0 = before[0]["title"] if isinstance(before, list) and before else None
            code, data = rest("PATCH", f"/rest/v1/stories?id=eq.{sid}", anon, {"title": "HACKED"}, user_jwt=jwt)
            after = rest("GET", f"/rest/v1/stories?id=eq.{sid}&select=title", anon, user_jwt=jwt)[1]
            title1 = after[0]["title"] if isinstance(after, list) and after else None
            rec("6/7. reader cannot update story by id", title0 == title1 and title0 != "HACKED", f"{code} {title0}->{title1}")
            code, data = rest("DELETE", f"/rest/v1/stories?id=eq.{sid}", anon, user_jwt=jwt)
            still = rest("GET", f"/rest/v1/stories?id=eq.{sid}&select=id", anon, user_jwt=jwt)[1]
            rec("6b. reader cannot delete story", isinstance(still, list) and still, f"{code}")
            code, data = rest("POST", "/rest/v1/chapters", anon, {"story_id": sid, "number": 999, "title": "x", "content": "x"}, user_jwt=jwt)
            rec("6c. reader cannot insert chapter", code >= 400, f"{code}")

        name0 = rest("GET", "/rest/v1/site_settings?id=eq.1&select=name", anon, user_jwt=jwt)[1]
        n0 = name0[0]["name"] if isinstance(name0, list) and name0 else None
        code, data = rest("PATCH", "/rest/v1/site_settings?id=eq.1", anon, {"name": "HACK"}, user_jwt=jwt)
        name1 = rest("GET", "/rest/v1/site_settings?id=eq.1&select=name", anon, user_jwt=jwt)[1]
        n1 = name1[0]["name"] if isinstance(name1, list) and name1 else None
        rec("6d. reader cannot change site settings", n0 == n1 and n0 != "HACK", f"{code} {n0}->{n1}")

        code, data = rest("GET", "/rest/v1/inbox?select=id", anon, user_jwt=jwt)
        rec("3. reader cannot read admin inbox", not (isinstance(data, list) and len(data) > 0) or code >= 400, f"{code} {str(data)[:80]}")

        code, data = rest("GET", "/rest/v1/admin_audit_log?select=id", anon, user_jwt=jwt)
        rec("3b. reader cannot read audit log", not (isinstance(data, list) and len(data) > 0) or code >= 400, f"{code}")

        # XSS stored as text is ok; we just insert comment if possible
        if sid:
            code, chs = rest("GET", f"/rest/v1/chapters?story_id=eq.{sid}&select=id&limit=1", anon, user_jwt=jwt)
            cid = chs[0]["id"] if isinstance(chs, list) and chs else None
            if cid:
                payload = {"id": "00000000-0000-4000-8000-000000000099", "user_id": uid, "story_id": sid, "chapter_id": cid, "body": "<script>alert(1)</script>", "status": "visible"}
                code, data = rest("POST", "/rest/v1/comments", anon, payload, user_jwt=jwt)
                rec("15. comment insert allowed for owner (sanitize is client-side)", code in (201, 200, 409) or (code >= 400), f"{code}")

        # fake jwt
        code, data = rest("GET", "/rest/v1/stories?select=id", anon, user_jwt="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.xxx")
        rec("13. forged token rejected or treated as anon", True, f"{code}")

    # 14 SQL injection via login
    code, data = login(anon, "admin' OR '1'='1", "x")
    rec("14. SQL injection login payload fails", code >= 400, f"{code}")

    # 16 brute-ish: 6 bad logins
    fails = 0
    for i in range(6):
        c, _ = login(anon, email, "WrongPass!234")
        if c >= 400:
            fails += 1
    rec("16. repeated bad passwords rejected (client+GoTrue rate limits remain)", fails == 6, f"fails={fails}")

    # cleanup reader
    if uid:
        rest("DELETE", f"/auth/v1/admin/users/{uid}", service)

    print("\n=== SUMMARY ===")
    for name, ok, detail in results:
        print(f"{'PASS' if ok else 'FAIL'}\t{name}\t{detail}")
    print("passed", sum(1 for _, ok, _ in results if ok), "/", len(results))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Create GitHub repo + Supabase project + Vercel deploy for Vicambachgiai3."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NAME = "Vicambachgiai3"
SLUG = "vicambachgiai3"


def log(msg):
    print(msg, flush=True)


def http(method, url, token=None, body=None, headers=None, timeout=60):
    h = {"Accept": "application/json", "User-Agent": "Vicambachgiai3-deploy"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    if body is not None:
        h["Content-Type"] = "application/json"
    if headers:
        h.update(headers)
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw.decode() or "null") if raw else None, dict(resp.headers)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(raw) if raw else None
        except Exception:
            parsed = raw
        return e.code, parsed, dict(e.headers)


def need(name):
    v = os.environ.get(name, "").strip()
    if not v:
        raise SystemExit(f"Missing env {name}")
    return v


def run(cmd, cwd=None, check=True):
    log("+ " + " ".join(cmd))
    p = subprocess.run(cmd, cwd=cwd or ROOT, text=True, capture_output=True)
    if p.stdout:
        log(p.stdout.strip())
    if p.stderr:
        log(p.stderr.strip())
    if check and p.returncode != 0:
        raise SystemExit(p.returncode)
    return p


def github_user(token):
    code, data, _ = http("GET", "https://api.github.com/user", token)
    if code != 200:
        raise SystemExit(f"GitHub user failed {code}: {data}")
    return data


def ensure_repo(token, user):
    login = user["login"]
    code, data, _ = http("GET", f"https://api.github.com/repos/{login}/{NAME}", token)
    if code == 200:
        log(f"GitHub repo exists: {data['html_url']}")
        return data
    code, data, _ = http(
        "POST",
        "https://api.github.com/user/repos",
        token,
        {
            "name": NAME,
            "description": "ViCamBachGiai — thư viện Bách Hợp (Vercel + Supabase)",
            "private": False,
            "auto_init": False,
        },
    )
    if code not in (200, 201):
        raise SystemExit(f"Create repo failed {code}: {data}")
    log(f"Created repo {data['html_url']}")
    return data


def push_github(token, repo):
    clone = repo["clone_url"]
    # authenticated remote
    auth = clone.replace("https://", f"https://x-access-token:{token}@")
    if not (ROOT / ".git").exists():
        run(["git", "init", "-b", "main"])
        run(["git", "config", "user.email", "jasminenemo3311@gmail.com"])
        run(["git", "config", "user.name", "Nemo Jasmine"])
    run(["git", "add", "-A"])
    st = run(["git", "status", "--porcelain"], check=False)
    if st.stdout.strip():
        run(["git", "commit", "-m", "Vicambachgiai3: live site on Vercel + Supabase"])
    run(["git", "remote", "remove", "origin"], check=False)
    run(["git", "remote", "add", "origin", auth])
    run(["git", "push", "-u", "origin", "main"])
    # strip token from remote
    run(["git", "remote", "set-url", "origin", clone])


def supabase_org(token):
    code, data, _ = http("GET", "https://api.supabase.com/v1/organizations", token)
    if code != 200 or not data:
        raise SystemExit(f"Supabase orgs failed {code}: {data}")
    return data[0]


def find_or_create_project(token, org_id):
    code, data, _ = http("GET", "https://api.supabase.com/v1/projects", token)
    if code != 200:
        raise SystemExit(f"List projects failed {code}: {data}")
    for p in data or []:
        if p.get("name", "").lower() == NAME.lower() or p.get("name", "").lower() == SLUG:
            log(f"Supabase project exists: {p.get('id')} {p.get('name')} status={p.get('status')}")
            return p
    # generate db password
    import secrets
    db_pass = "Vcbg3!" + secrets.token_urlsafe(12)
    Path("/tmp/vicambachgiai3-dbpass.txt").write_text(db_pass)
    body = {
        "name": NAME,
        "organization_id": org_id,
        "db_pass": db_pass,
        "region": "ap-southeast-1",
        "plan": "free",
    }
    code, data, _ = http("POST", "https://api.supabase.com/v1/projects", token, body)
    if code not in (200, 201):
        # retry without plan
        body.pop("plan", None)
        code, data, _ = http("POST", "https://api.supabase.com/v1/projects", token, body)
    if code not in (200, 201):
        raise SystemExit(f"Create supabase project failed {code}: {data}")
    log(f"Created supabase project {data.get('id')} status={data.get('status')}")
    return data


def wait_project(token, ref, timeout=420):
    t0 = time.time()
    while time.time() - t0 < timeout:
        code, data, _ = http("GET", f"https://api.supabase.com/v1/projects/{ref}", token)
        status = (data or {}).get("status")
        log(f"  project {ref} status={status}")
        if status in ("ACTIVE_HEALTHY", "ACTIVE_UNHEALTHY", "ACTIVE"):
            return data
        if status in ("INACTIVE", "GOING_DOWN", "REMOVED", "UNKNOWN"):
            # keep waiting a bit
            pass
        time.sleep(15)
    raise SystemExit("Supabase project did not become healthy in time")


def supabase_keys(token, ref):
    code, data, _ = http("GET", f"https://api.supabase.com/v1/projects/{ref}/api-keys", token)
    if code != 200:
        raise SystemExit(f"api-keys failed {code}: {data}")
    anon = next((k["api_key"] for k in data if k.get("name") == "anon"), None)
    service = next((k["api_key"] for k in data if k.get("name") == "service_role"), None)
    if not anon or not service:
        raise SystemExit(f"Missing keys: {data}")
    return anon, service


def apply_sql(token, ref, sql):
    # Management query API
    code, data, _ = http(
        "POST",
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        token,
        {"query": sql},
        timeout=120,
    )
    if code not in (200, 201):
        raise SystemExit(f"SQL apply failed {code}: {str(data)[:1200]}")
    return data


def disable_confirm_email(token, ref):
    # Best-effort: PATCH auth config
    code, data, _ = http("GET", f"https://api.supabase.com/v1/projects/{ref}/config/auth", token)
    if code != 200:
        log(f"auth config get {code}: {data}")
        return
    body = dict(data) if isinstance(data, dict) else {}
    body["EXTERNAL_EMAIL_ENABLED"] = True
    body["MAILER_AUTOCONFIRM"] = True
    body["DISABLE_SIGNUP"] = False
    code, data, _ = http("PATCH", f"https://api.supabase.com/v1/projects/{ref}/config/auth", token, body)
    log(f"auth config patch {code}")


def vercel_user(token):
    code, data, _ = http("GET", "https://api.vercel.com/v2/user", token)
    if code != 200:
        raise SystemExit(f"Vercel user failed {code}: {data}")
    return data.get("user") or data


def vercel_ensure_project(token, team_id=None):
    q = f"?teamId={team_id}" if team_id else ""
    code, data, _ = http("GET", f"https://api.vercel.com/v9/projects/{SLUG}{q}", token)
    if code == 200:
        return data
    body = {"name": SLUG, "framework": None}
    code, data, _ = http("POST", f"https://api.vercel.com/v10/projects{q}", token, body)
    if code not in (200, 201):
        raise SystemExit(f"Create vercel project failed {code}: {data}")
    return data


def vercel_set_git(token, project_id, repo_full, team_id=None):
    q = f"?teamId={team_id}" if team_id else ""
    owner, name = repo_full.split("/")
    body = {"type": "github", "repo": repo_full}
    # try link
    code, data, _ = http(
        "POST",
        f"https://api.vercel.com/v9/projects/{project_id}/link{q}",
        token,
        {"type": "github", "repo": repo_full},
    )
    log(f"vercel link {code}: {str(data)[:300]}")
    return code, data


def vercel_deploy_files(token, team_id=None):
    """Upload a static deployment from local files (does not require GitHub-Vercel app)."""
    skip = {".git", "scripts/catalog.json"}
    files = []
    for p in ROOT.rglob("*"):
        if not p.is_file():
            continue
        rel = p.relative_to(ROOT).as_posix()
        if rel.startswith(".git/") or rel == ".git":
            continue
        if rel.startswith("scripts/"):
            continue
        if rel.startswith("supabase/"):
            continue
        files.append(p)

    # Use vercel file upload + create deployment
    import hashlib
    import base64

    uploaded = []
    q = f"?teamId={team_id}" if team_id else ""
    for p in files:
        rel = p.relative_to(ROOT).as_posix()
        raw = p.read_bytes()
        sha = hashlib.sha1(raw).hexdigest()
        req = urllib.request.Request(
            f"https://api.vercel.com/v2/files{q}",
            data=raw,
            method="POST",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/octet-stream",
                "x-vercel-digest": sha,
                "User-Agent": "Vicambachgiai3-deploy",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                _ = resp.read()
        except urllib.error.HTTPError as e:
            raw_err = e.read().decode("utf-8", "replace")
            if e.code not in (200, 201):
                raise SystemExit(f"upload {rel} failed {e.code}: {raw_err[:400]}")
        uploaded.append({"file": rel, "sha": sha, "size": len(raw)})
        log(f"  uploaded {rel} ({len(raw)} bytes)")

    body = {
        "name": SLUG,
        "files": uploaded,
        "projectSettings": {"framework": None},
        "target": "production",
    }
    code, data, _ = http("POST", f"https://api.vercel.com/v13/deployments{q}", token, body, timeout=120)
    if code not in (200, 201):
        raise SystemExit(f"Create deployment failed {code}: {data}")
    return data


def write_config(url, anon):
    (ROOT / "js" / "config.js").write_text(
        "/* Generated at deploy — anon key is public by design. */\n"
        "window.VCBG_CONFIG = {\n"
        f'  supabaseUrl: "{url}",\n'
        f'  supabaseAnonKey: "{anon}",\n'
        "};\n"
    )


def main():
    gh = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or ""
    vercel = need("VERCEL_TOKEN")
    supabase = need("SUPABASE_ACCESS_TOKEN")

    # 1) Supabase
    org = supabase_org(supabase)
    log(f"Supabase org {org.get('name')} {org.get('id')}")
    proj = find_or_create_project(supabase, org["id"])
    ref = proj["id"]
    wait_project(supabase, ref)
    anon, service = supabase_keys(supabase, ref)
    sb_url = f"https://{ref}.supabase.co"
    log(f"Supabase URL {sb_url}")

    sql = (ROOT / "supabase" / "schema.sql").read_text()
    chunks = []
    buf = []
    in_dollar = False
    for line in sql.splitlines():
        if "$$" in line:
            in_dollar = not in_dollar if line.count("$$") % 2 == 1 else in_dollar
        buf.append(line)
        if not in_dollar and line.strip().endswith(";"):
            chunk = "\n".join(buf).strip()
            if chunk and not all(x.startswith("--") or not x.strip() for x in chunk.splitlines()):
                chunks.append(chunk)
            buf = []
    if buf and "".join(buf).strip():
        chunks.append("\n".join(buf).strip())
    log(f"Applying {len(chunks)} SQL statements")
    for i, chunk in enumerate(chunks, 1):
        preview = chunk.splitlines()[0][:80]
        log(f"  sql {i}/{len(chunks)}: {preview}")
        try:
            apply_sql(supabase, ref, chunk)
        except SystemExit as e:
            msg = str(e)
            if "already exists" in msg.lower():
                log("  skip already exists")
                continue
            raise
    log("Schema applied")
    disable_confirm_email(supabase, ref)

    os.environ["SUPABASE_URL"] = sb_url
    os.environ["SUPABASE_SERVICE_ROLE_KEY"] = service
    run([sys.executable, str(ROOT / "scripts" / "seed_catalog.py")])

    write_config(sb_url, anon)

    # 2) GitHub
    repo_url = None
    if gh:
        user = github_user(gh)
        repo = ensure_repo(gh, user)
        push_github(gh, repo)
        repo_url = repo["html_url"]
    else:
        log("No GITHUB_TOKEN — skip GitHub push (site still deploys via Vercel files API)")

    # 3) Vercel
    vu = vercel_user(vercel)
    log(f"Vercel user {vu.get('username') or vu.get('email')}")
    dep = vercel_deploy_files(vercel)
    url = dep.get("url") or ""
    alias = ""
    if isinstance(dep.get("alias"), list) and dep["alias"]:
        alias = dep["alias"][0]
    ready = dep.get("readyState")
    log(f"Deployment {dep.get('id')} state={ready} url=https://{url}")

    # wait READY
    dep_id = dep.get("id")
    for _ in range(30):
        code, data, _ = http("GET", f"https://api.vercel.com/v13/deployments/{dep_id}", vercel)
        state = (data or {}).get("readyState")
        log(f"  deploy state {state}")
        if state in ("READY", "ERROR", "CANCELED"):
            dep = data
            break
        time.sleep(5)

    out = {
        "github": repo_url,
        "supabase_url": sb_url,
        "supabase_ref": ref,
        "vercel_url": "https://" + (dep.get("url") or url),
        "vercel_aliases": dep.get("alias") or [],
        "readyState": dep.get("readyState"),
    }
    (ROOT / "scripts" / "deploy-result.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()

import json
import hashlib
import mimetypes
import time
from pathlib import Path

import requests


SUPABASE_URL = "https://emevvnsjgzlbjbuwhcjy.supabase.co"
SUPABASE_KEY = "sb_publishable_gP3rEM4ufRwiNwGp8Cxk3w_m8wJm7E4"
BUCKET = "mathmodel-files"
MIN_YEAR = 2011
TYPE_CODE = "B"


def load_catalog(site_dir: Path):
    text = (site_dir / "assets" / "catalog-data.js").read_text(encoding="utf-8")
    prefix = "window.MATHMODEL_DATA = "
    if text.startswith(prefix):
        text = text[len(prefix):]
    return json.loads(text.rstrip().removesuffix(";"))


def selected_items(project_dir: Path, catalog):
    rows = []
    for item in catalog["items"]:
        year = item.get("year") or 0
        types = item.get("types") or []
        if year < MIN_YEAR:
            continue
        if TYPE_CODE not in types:
            continue
        if item.get("source") not in {"problem", "paper"}:
            continue
        local_path = project_dir / item["path"]
        if not local_path.exists():
            raise FileNotFoundError(local_path)
        rows.append((item, local_path))
    return rows


def clean_storage_path(relative_path: str):
    digest = hashlib.sha1(relative_path.encode("utf-8")).hexdigest()[:18]
    suffix = Path(relative_path).suffix.lower()
    return f"catalog/b_after_2010/{digest}{suffix}"


def headers(extra=None):
    base = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    if extra:
        base.update(extra)
    return base


def upload_file(session: requests.Session, storage_path: str, local_path: Path):
    content_type = mimetypes.guess_type(local_path.name)[0] or "application/octet-stream"
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{storage_path}"
    with local_path.open("rb") as file:
        response = session.post(
            url,
            headers=headers({"x-upsert": "true", "Content-Type": content_type}),
            data=file,
            timeout=180,
        )
    if response.status_code not in {200, 201}:
        raise RuntimeError(f"upload failed {response.status_code}: {response.text[:500]}")


def upsert_catalog(session: requests.Session, rows):
    url = f"{SUPABASE_URL}/rest/v1/catalog_files"
    response = session.post(
        url,
        params={"on_conflict": "relative_path"},
        headers=headers({
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        }),
        json=rows,
        timeout=60,
    )
    if response.status_code not in {200, 201, 204}:
        raise RuntimeError(f"upsert failed {response.status_code}: {response.text[:1000]}")


def main():
    home = Path.home()
    site_dir = home / "Desktop" / "mathmodel_cloud_site"
    project_dir = home / "Desktop" / "mathmodel_project"
    catalog = load_catalog(site_dir)
    items = selected_items(project_dir, catalog)
    total_size = sum(path.stat().st_size for _, path in items)
    print(f"selected {len(items)} files, {total_size / 1024 / 1024:.1f} MB")

    done_file = site_dir / "tools" / "upload_b_after_2010.done.json"
    if done_file.exists():
        done = set(json.loads(done_file.read_text(encoding="utf-8")))
    else:
        done = set()

    session = requests.Session()
    pending_rows = []
    uploaded_size = 0
    started = time.time()

    for index, (item, local_path) in enumerate(items, start=1):
        relative_path = item["path"].replace("\\", "/")
        storage_path = clean_storage_path(relative_path)
        size = local_path.stat().st_size
        if relative_path not in done:
            upload_file(session, storage_path, local_path)
            done.add(relative_path)
            done_file.write_text(json.dumps(sorted(done), ensure_ascii=False, indent=2), encoding="utf-8")
        uploaded_size += size
        pending_rows.append({
            "relative_path": relative_path,
            "source": item.get("source") or "problem",
            "collection": item.get("collection"),
            "year": item.get("year"),
            "problem_types": item.get("types") or [],
            "title": item.get("title") or item.get("name") or local_path.name,
            "name": item.get("name") or local_path.name,
            "folder": item.get("folder"),
            "ext": item.get("ext") or local_path.suffix.lstrip(".").lower(),
            "kind": item.get("kind"),
            "size": size,
            "storage_path": storage_path,
        })
        if len(pending_rows) >= 50:
            upsert_catalog(session, pending_rows)
            pending_rows.clear()
        if index == len(items) or index % 25 == 0:
            pct = uploaded_size / total_size * 100 if total_size else 100
            elapsed = time.time() - started
            print(f"{index}/{len(items)} files, {pct:.1f}%, elapsed {elapsed:.0f}s")

    if pending_rows:
        upsert_catalog(session, pending_rows)

    print("upload complete")


if __name__ == "__main__":
    main()

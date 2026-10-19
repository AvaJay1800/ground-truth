"""Upload data/derived (COGs, tiles, JSON) to a Cloudflare R2 bucket and set CORS.

R2 speaks the S3 API, so this uses boto3 with an R2 API token. Nothing is read
from the repo: credentials come from environment variables or a .env file at
the repo root (gitignored):

  R2_ACCOUNT_ID=...
  R2_ACCESS_KEY_ID=...
  R2_SECRET_ACCESS_KEY=...
  R2_BUCKET=ground-truth
  R2_PREFIX=oso          (optional folder inside the bucket)

Only files that changed (by size and modified time, remembered in a manifest)
are uploaded, so re-runs after a pipeline change are cheap. Content types and
long cache headers are set per file; the browser reads GeoTIFFs by HTTP range,
which R2 supports.

Usage:  python pipeline/upload_r2.py [--dry-run] [--cors-only]
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
from pathlib import Path

import boto3
from botocore.config import Config

ROOT = Path(__file__).resolve().parents[1]
DERIVED = ROOT / "data" / "derived"
MANIFEST = DERIVED / ".r2_manifest.json"
SKIP = {".r2_manifest.json"}
SKIP_NAMES_PREFIX = ("preview_", "after_proj_")  # previews and projection COGs are not served

CONTENT_TYPES = {".tif": "image/tiff", ".tiff": "image/tiff", ".png": "image/png", ".json": "application/json"}
CORS = {
    "CORSRules": [{
        "AllowedOrigins": ["https://daviddonnell.com", "https://www.daviddonnell.com", "http://localhost:5173", "http://127.0.0.1:5173"],
        "AllowedMethods": ["GET", "HEAD"],
        "AllowedHeaders": ["Range", "Content-Type"],
        "ExposeHeaders": ["Content-Range", "Content-Length", "Accept-Ranges", "ETag"],
        "MaxAgeSeconds": 86400,
    }],
}


def load_env() -> dict[str, str]:
    env = dict(os.environ)
    dotenv = ROOT / ".env"
    if dotenv.exists():
        for line in dotenv.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    missing = [k for k in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET") if not env.get(k)]
    if missing:
        raise SystemExit(f"missing {', '.join(missing)}; put them in the environment or in {dotenv}")
    return env


def client(env: dict[str, str]):
    return boto3.client(
        "s3",
        endpoint_url=f"https://{env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=env["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
        config=Config(signature_version="s3v4", retries={"max_attempts": 5, "mode": "standard"}),
    )


def files_to_upload() -> list[Path]:
    out = []
    for p in sorted(DERIVED.rglob("*")):
        if not p.is_file() or p.name in SKIP or p.name.startswith(SKIP_NAMES_PREFIX):
            continue
        out.append(p)
    return out


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--cors-only", action="store_true")
    args = ap.parse_args(argv)
    env = load_env()
    s3 = client(env)
    bucket, prefix = env["R2_BUCKET"], env.get("R2_PREFIX", "").strip("/")

    if not args.dry_run:
        # Editing CORS is a bucket setting and needs an Admin token. With an Object Read & Write
        # token this is refused, which is fine: set the same rule once in the dashboard
        # (bucket > Settings > CORS Policy); the JSON is in README.md.
        try:
            s3.put_bucket_cors(Bucket=bucket, CORSConfiguration=CORS)
            print(f"CORS set on {bucket} for daviddonnell.com and localhost")
        except Exception as e:  # botocore ClientError, AccessDenied
            print(f"could not set CORS with this token ({type(e).__name__}); set it in the dashboard instead")
    if args.cors_only:
        return 0

    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    files = files_to_upload()
    total = sum(p.stat().st_size for p in files)
    print(f"{len(files)} files, {total / 1e6:.0f} MB under {DERIVED}")
    done = 0
    for p in files:
        rel = p.relative_to(DERIVED).as_posix()
        key = f"{prefix}/{rel}" if prefix else rel
        st = p.stat()
        stamp = f"{st.st_size}:{int(st.st_mtime)}"
        if manifest.get(key) == stamp:
            continue
        ctype = CONTENT_TYPES.get(p.suffix.lower()) or mimetypes.guess_type(p.name)[0] or "application/octet-stream"
        cache = "public, max-age=31536000, immutable" if p.suffix.lower() == ".png" else "public, max-age=3600"
        if args.dry_run:
            print(f"  would upload {key} ({st.st_size / 1e6:.1f} MB, {ctype})")
        else:
            s3.upload_file(str(p), bucket, key, ExtraArgs={"ContentType": ctype, "CacheControl": cache})
            manifest[key] = stamp
            done += 1
            if done % 100 == 0 or st.st_size > 5e6:
                print(f"  {done} uploaded; {key}")
                MANIFEST.write_text(json.dumps(manifest))
    if not args.dry_run:
        MANIFEST.write_text(json.dumps(manifest))
        print(f"uploaded {done} new or changed files; manifest saved")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

"""
Utility script to generate cryptographically secure secrets for Qissa Cafe.
Run this script to generate or update your production .env credentials.
"""
from __future__ import annotations

import secrets
import sys
from pathlib import Path

ENV_PATH = Path(__file__).resolve().parent / ".env"
ENV_EXAMPLE_PATH = Path(__file__).resolve().parent / ".env.example"


def generate_secrets(update_env: bool = False):
    secret_key = secrets.token_urlsafe(48)
    admin_password = secrets.token_urlsafe(16)

    print("=" * 60)
    print("  QISSA CAFE - PRODUCTION CREDENTIALS GENERATOR  ")
    print("=" * 60)
    print(f"\nGenerated QISSA_SECRET_KEY:\n  {secret_key}")
    print(f"\nGenerated QISSA_ADMIN_PASSWORD:\n  {admin_password}")
    print("\n" + "-" * 60)

    if update_env:
        content = (
            f"QISSA_ADMIN_PASSWORD={admin_password}\n"
            f"QISSA_SECRET_KEY={secret_key}\n"
            f"FLASK_DEBUG=0\n"
            f"PORT=5000\n"
            f"QISSA_COOKIE_SECURE=1\n"
        )
        ENV_PATH.write_text(content, encoding="utf-8")
        print(f"[OK] Successfully wrote production settings to: {ENV_PATH}")
    else:
        print("[INFO] To automatically write these to backend/.env, run:")
        print("   python backend/generate_secrets.py --write")

    print("=" * 60)
    return secret_key, admin_password


if __name__ == "__main__":
    should_write = "--write" in sys.argv
    generate_secrets(update_env=should_write)

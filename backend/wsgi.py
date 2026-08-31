from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

# Ensure environment variables from .env are loaded
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

from app import app, init_db

# Initialize database tables and seeds if not already present
init_db()

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    # In production on Windows, waitress serves multi-threaded requests
    try:
        from waitress import serve
        print(f"Serving Qissa Cafe with Waitress on port {port}...")
        serve(app, host="0.0.0.0", port=port, threads=6)
    except ImportError:
        app.run(host="0.0.0.0", port=port)

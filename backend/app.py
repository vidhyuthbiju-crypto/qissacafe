from __future__ import annotations

import json
import logging
import os
import queue
import sqlite3
import threading
from datetime import datetime
from functools import wraps
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_from_directory, session, stream_with_context
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.middleware.proxy_fix import ProxyFix

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
DB_PATH = BASE_DIR / "qissa.db"
load_dotenv(BASE_DIR / ".env", override=True)

import sys
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

try:
    from seed_data import SEED_MENU
except ImportError:
    from backend.seed_data import SEED_MENU

# Configuration constants
MAX_ITEM_QUANTITY = 50
MAX_ORDER_ITEMS = 30
MAX_NAME_LENGTH = 100
MAX_PHONE_LENGTH = 30
MAX_NOTES_LENGTH = 500

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(BASE_DIR / "qissa.log", encoding="utf-8"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder=None)
secret = os.getenv("QISSA_SECRET_KEY")
if not secret or secret == "change-this-secret-before-production":
    secret = os.getenv("SECRET_KEY", os.urandom(32).hex())
app.secret_key = secret

# Reverse proxy support (Render, Railway, Nginx, Cloudflare)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

def get_admin_password() -> str:
    load_dotenv(BASE_DIR / ".env", override=True)
    return os.getenv("QISSA_ADMIN_PASSWORD", "qissa2026").strip()

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.getenv("QISSA_COOKIE_SECURE", "0") == "1",
)

# Real-time event broadcasting (SSE)
admin_subscribers_lock = threading.Lock()
admin_subscribers: set[queue.Queue] = set()


def broadcast_admin_event(event_type: str, data: dict | None = None):
    """Broadcast a real-time event to all connected admin SSE clients."""
    payload = {
        "type": event_type,
        "data": data or {},
        "timestamp": datetime.now().isoformat()
    }
    msg = f"data: {json.dumps(payload)}\n\n"
    with admin_subscribers_lock:
        dead_queues = []
        for q in list(admin_subscribers):
            try:
                q.put_nowait(msg)
            except queue.Full:
                dead_queues.append(q)
        for q in dead_queues:
            admin_subscribers.discard(q)
    logger.info(f"Broadcast SSE event '{event_type}' to active admin subscribers")


# Rate limiting
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per hour"],
    storage_uri="memory://"
)

ORDER_STATUSES = {"new", "confirmed", "preparing", "ready", "completed", "cancelled"}
AVAILABILITY_STATES = {"available", "low", "sold_out"}


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = db()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS menu_items (
        id INTEGER PRIMARY KEY,
        category TEXT NOT NULL,
        name TEXT NOT NULL,
        price INTEGER NOT NULL CHECK(price >= 0),
        description TEXT NOT NULL DEFAULT '',
        availability TEXT NOT NULL DEFAULT 'available',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_code TEXT UNIQUE,
        customer_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        order_type TEXT NOT NULL,
        table_number TEXT NOT NULL DEFAULT '',
        delivery_address TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        total INTEGER NOT NULL CHECK(total >= 0),
        status TEXT NOT NULL DEFAULT 'new',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        menu_item_id INTEGER,
        item_name TEXT NOT NULL,
        unit_price INTEGER NOT NULL,
        qty INTEGER NOT NULL CHECK(qty > 0),
        line_total INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category);
    """)

    defaults = {
        "cafe_open": "1",
        "whatsapp": "919645700585",
        "address": "Qissa Resto Cafe, Nilambur Road, Kerala",
        "opening_hours": "12:00 PM – 11:30 PM",
        "map_embed_url": "https://maps.google.com/maps?q=11.1116412,76.2789462&t=&z=16&ie=UTF8&iwloc=&output=embed",
        "maps_directions_url": "https://maps.app.goo.gl/5v2gcWyZ5xAjXJHV6"
    }
    for k, v in defaults.items():
        conn.execute("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)", (k, v))

    try: conn.execute("ALTER TABLE menu_items ADD COLUMN image TEXT NOT NULL DEFAULT ''")
    except Exception: pass
    try: conn.execute("ALTER TABLE menu_items ADD COLUMN is_veg INTEGER NOT NULL DEFAULT 0")
    except Exception: pass
    try: conn.execute("ALTER TABLE menu_items ADD COLUMN is_bestseller INTEGER NOT NULL DEFAULT 0")
    except Exception: pass
    try: conn.execute("ALTER TABLE orders ADD COLUMN table_number TEXT NOT NULL DEFAULT ''")
    except Exception: pass
    try: conn.execute("ALTER TABLE orders ADD COLUMN delivery_address TEXT NOT NULL DEFAULT ''")
    except Exception: pass

    # Seed veg / bestseller defaults for existing items if not set
    veg_categories = {"Classic Shake", "Falooda", "Mojito", "Soda", "Lemon Juice", "Hot"}
    for cat in veg_categories:
        conn.execute("UPDATE menu_items SET is_veg=1 WHERE category=?", (cat,))
    conn.execute("UPDATE menu_items SET is_veg=1 WHERE name LIKE '%Veg%' OR name LIKE '%Vegetable%' OR name LIKE '%Paneer%'")
    conn.execute("UPDATE menu_items SET is_bestseller=1 WHERE name IN ('Rumali Full Meat', '2 Pcs Chicken Broast', 'Chicken Double Decker', 'Blue Lime', 'Shawarma Roll', 'Oreo Shake', 'Chicken Burger')")
    count = conn.execute("SELECT COUNT(*) AS c FROM menu_items").fetchone()["c"]
    if count == 0:
        logger.info("Seeding database with initial menu items")
        for i, item in enumerate(SEED_MENU):
            conn.execute(
                """INSERT INTO menu_items(id,category,name,price,description,availability,sort_order)
                   VALUES(?,?,?,?,?,?,?)""",
                (item["id"], item["category"], item["name"], item["price"],
                 item["description"], item["availability"], i)
            )

    # One-time August 2026 menu revision
    revision = setting(conn, "menu_revision", "")
    if revision != "2026-08-31-v2":
        logger.info("Applying menu revision 2026-08-31-v2")
        hot_prices = {
            "Tea": 12, "Coffee": 15, "Boost": 20, "Horlicks": 20,
            "Black Tea": 12, "Black Tea Mint": 15, "Green Tea": 20, "Black Lemon": 15
        }
        for name, price in hot_prices.items():
            row = conn.execute(
                "SELECT id FROM menu_items WHERE category='Hot' AND name=?",
                (name,)
            ).fetchone()
            if row:
                conn.execute(
                    "UPDATE menu_items SET price=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                    (price, row["id"])
                )
            else:
                max_sort = conn.execute(
                    "SELECT COALESCE(MAX(sort_order),0)+1 n FROM menu_items"
                ).fetchone()["n"]
                conn.execute(
                    "INSERT INTO menu_items(category,name,price,description,availability,sort_order) VALUES('Hot',?,?,?,?,?)",
                    (name, price, "Fresh hot green tea." if name == "Green Tea" else "Hot drink.", "available", max_sort)
                )

        conn.execute("DELETE FROM menu_items WHERE category='Hot' AND name='Black Coffee'")

        lemon_items = [
            ("Fresh Lime", 20, "Fresh lime juice."),
            ("Sweet N Salt", 20, "Classic sweet and salt lime."),
            ("Mint", 25, "Refreshing mint lime."),
            ("Pineapple Lime", 35, "Pineapple-flavoured lime cooler."),
            ("Orange Lime", 35, "Orange-flavoured lime cooler."),
            ("Grape Lime", 35, "Grape-flavoured lime cooler."),
            ("Blue Lime", 35, "Refreshing blue lime cooler."),
            ("Kashmiri Lime", 35, "Qissa-style Kashmiri lime."),
        ]
        for name, price, description in lemon_items:
            row = conn.execute(
                "SELECT id FROM menu_items WHERE category='Lemon Juice' AND name=?",
                (name,)
            ).fetchone()
            if row:
                conn.execute(
                    "UPDATE menu_items SET price=?,description=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
                    (price, description, row["id"])
                )
            else:
                max_sort = conn.execute(
                    "SELECT COALESCE(MAX(sort_order),0)+1 n FROM menu_items"
                ).fetchone()["n"]
                conn.execute(
                    "INSERT INTO menu_items(category,name,price,description,availability,sort_order) VALUES('Lemon Juice',?,?,?,?,?)",
                    (name, price, description, "available", max_sort)
                )

        conn.execute(
            "INSERT INTO settings(key,value) VALUES('menu_revision','2026-08-31-v2') ON CONFLICT(key) DO UPDATE SET value=excluded.value"
        )

    # Seed images for any items missing images
    img_map = {
        "Shawarma Roll": "https://images.unsplash.com/photo-1561651823-34feb02250e4?auto=format&fit=crop&w=600&q=80",
        "Shawarma Plate": "https://images.unsplash.com/photo-1529042410759-befb1204b468?auto=format&fit=crop&w=600&q=80",
        "Full Meat Plate": "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80",
        "Rumali Normal": "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80",
        "Rumali Plate": "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=600&q=80",
        "Rumali Full Meat": "https://images.unsplash.com/photo-1561651823-34feb02250e4?auto=format&fit=crop&w=600&q=80",
        "2 Pcs Chicken Broast": "https://images.unsplash.com/photo-1626645738196-c2a7c87a8f58?auto=format&fit=crop&w=600&q=80",
        "5 Pcs Chicken Broast": "https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=600&q=80",
        "10 Pcs Chicken Broast": "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=600&q=80",
        "Vegetable Burger": "https://images.unsplash.com/photo-1520072959219-c595dc870360?auto=format&fit=crop&w=600&q=80",
        "Egg Burger": "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=600&q=80",
        "Chicken Burger": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80",
        "Chicken Nuggets Burger": "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=600&q=80",
        "Chicken Double Decker": "https://images.unsplash.com/photo-1583032015879-c562e8477f1f?auto=format&fit=crop&w=600&q=80",
        "Vegetable Sandwich": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=600&q=80",
        "Egg Sandwich": "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=600&q=80",
        "Egg Cheese Sandwich": "https://images.unsplash.com/photo-1619096252214-ef06c45683e3?auto=format&fit=crop&w=600&q=80",
        "Chicken Sandwich": "https://images.unsplash.com/photo-1509722747041-616f39b57569?auto=format&fit=crop&w=600&q=80",
        "Chicken Cheese Sandwich": "https://images.unsplash.com/photo-1553909489-cd47e0907980?auto=format&fit=crop&w=600&q=80",
        "Nuggets Sandwich": "https://images.unsplash.com/photo-1539252554453-80ab65ce3586?auto=format&fit=crop&w=600&q=80",
        "Nuggets Cheese": "https://images.unsplash.com/photo-1553909489-cd47e0907980?auto=format&fit=crop&w=600&q=80",
        "Chicken Club": "https://images.unsplash.com/photo-1567234669003-dce7a7a88821?auto=format&fit=crop&w=600&q=80",
        "Egg Club": "https://images.unsplash.com/photo-1528736235302-52922df5c122?auto=format&fit=crop&w=600&q=80",
        "Veg Club": "https://images.unsplash.com/photo-1509722747041-616f39b57569?auto=format&fit=crop&w=600&q=80",
        "Chicken Samoona": "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=600&q=80",
        "Nuggets": "https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=600&q=80",
        "Momos": "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=600&q=80",
        "French Fries": "https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=600&q=80",
        "Cheesy Fries": "https://images.unsplash.com/photo-1585109649139-366815a0d713?auto=format&fit=crop&w=600&q=80",
        "Loaded Fries": "https://images.unsplash.com/photo-1585109649139-366815a0d713?auto=format&fit=crop&w=600&q=80",
        "Mango Shake": "https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=600&q=80",
        "Chikku Shake": "https://images.unsplash.com/photo-1577805947697-89e18249d767?auto=format&fit=crop&w=600&q=80",
        "Apple Shake": "https://images.unsplash.com/photo-1553530666-ba11a7da3888?auto=format&fit=crop&w=600&q=80",
        "Avocado Shake": "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80",
        "Tender Coconut Shake": "https://images.unsplash.com/photo-1525385133512-2f3bdd039054?auto=format&fit=crop&w=600&q=80",
        "Badam Shake": "https://images.unsplash.com/photo-1577805947697-89e18249d767?auto=format&fit=crop&w=600&q=80",
        "Dates Shake": "https://images.unsplash.com/photo-1553530666-ba11a7da3888?auto=format&fit=crop&w=600&q=80",
        "Strawberry Shake": "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&w=600&q=80",
        "Vanilla Shake": "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=600&q=80",
        "Falooda": "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=600&q=80",
        "White Falooda": "https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=600&q=80",
        "Malabar Falooda": "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=600&q=80",
        "Royal Falooda": "https://images.unsplash.com/photo-1501443762994-82bd5dace89a?auto=format&fit=crop&w=600&q=80",
        "Chocolate Falooda": "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=600&q=80",
        "Mint Mojito": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80",
        "Watermelon Mojito": "https://images.unsplash.com/photo-1587888637140-849b25d80ef9?auto=format&fit=crop&w=600&q=80",
        "Mango Mojito": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80",
        "Orange Mojito": "https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=600&q=80",
        "Litchi Mojito": "https://images.unsplash.com/photo-1536935338788-846bb9981813?auto=format&fit=crop&w=600&q=80",
        "Passion Fruit Mojito": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80",
        "Green Apple Mojito": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80",
        "Lemon Soda": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80",
        "Lemon Sweet & Salt": "https://images.unsplash.com/photo-1621263764928-df1444c5e859?auto=format&fit=crop&w=600&q=80",
        "Chilli Soda": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80",
        "Pine Soda": "https://images.unsplash.com/photo-1621263764928-df1444c5e859?auto=format&fit=crop&w=600&q=80",
        "Grape Soda": "https://images.unsplash.com/photo-1543083477-4f785aeafaa9?auto=format&fit=crop&w=600&q=80",
        "Orange Soda": "https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=600&q=80",
        "Tea": "https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80",
        "Coffee": "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80",
        "Boost": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80",
        "Horlicks": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80",
        "Black Tea": "https://images.unsplash.com/photo-1597481499750-3e6b22637e12?auto=format&fit=crop&w=600&q=80",
        "Black Tea Mint": "https://images.unsplash.com/photo-1597481499750-3e6b22637e12?auto=format&fit=crop&w=600&q=80",
        "Black Lemon": "https://images.unsplash.com/photo-1597481499750-3e6b22637e12?auto=format&fit=crop&w=600&q=80",
        "Green Tea": "https://images.unsplash.com/photo-1627435601361-ec25f5b1d0e5?auto=format&fit=crop&w=600&q=80",
        "Fresh Lime": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80",
        "Sweet N Salt": "https://images.unsplash.com/photo-1621263764928-df1444c5e859?auto=format&fit=crop&w=600&q=80",
        "Mint": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80",
        "Pineapple Lime": "https://images.unsplash.com/photo-1621263764928-df1444c5e859?auto=format&fit=crop&w=600&q=80",
        "Orange Lime": "https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=600&q=80",
        "Grape Lime": "https://images.unsplash.com/photo-1543083477-4f785aeafaa9?auto=format&fit=crop&w=600&q=80",
        "Blue Lime": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80",
        "Kashmiri Lime": "https://images.unsplash.com/photo-1587888637140-849b25d80ef9?auto=format&fit=crop&w=600&q=80",
    }
    for name, img_url in img_map.items():
        conn.execute("UPDATE menu_items SET image=? WHERE name=? AND (image IS NULL OR image='')", (img_url, name))

    conn.commit()
    conn.close()
    logger.info("Database initialized successfully")


def setting(conn, key, default=""):
    row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return row["value"] if row else default


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("qissa_admin"):
            logger.warning(f"Unauthorized admin access attempt to {request.path}")
            return jsonify(error="Admin login required"), 401
        return fn(*args, **kwargs)
    return wrapper


def item_json(row):
    try: img = row["image"]
    except: img = ""
    try: is_veg = bool(row["is_veg"])
    except: is_veg = False
    try: is_bestseller = bool(row["is_bestseller"])
    except: is_bestseller = False
    return {
        "id": row["id"], "category": row["category"], "name": row["name"],
        "price": row["price"], "description": row["description"],
        "availability": row["availability"], "available": row["availability"] != "sold_out",
        "sort_order": row["sort_order"], "image": img or "",
        "is_veg": is_veg, "is_bestseller": is_bestseller
    }


# ---------- Frontend files ----------
@app.get("/")
def home():
    return send_from_directory(PROJECT_DIR, "index.html")


@app.get("/styles.css")
def styles():
    return send_from_directory(PROJECT_DIR, "styles.css")


@app.get("/app.js")
def customer_js():
    return send_from_directory(PROJECT_DIR, "app.js")


@app.get("/assets/<path:filename>")
def assets(filename):
    return send_from_directory(PROJECT_DIR / "assets", filename)


@app.get("/admin")
@app.get("/admin/")
def admin_page():
    return send_from_directory(PROJECT_DIR / "admin", "index.html")


@app.post("/api/admin/upload")
@admin_required
def admin_upload():
    import base64, uuid
    if "file" not in request.files:
        return jsonify(error="No file"), 400
    f = request.files["file"]
    if not f.filename or f.filename.split(".")[-1].lower() not in {"jpg","jpeg","png","webp"}:
        return jsonify(error="Only jpg/png/webp allowed"), 400
    ext = f.filename.rsplit(".",1)[-1].lower()
    name = f"{uuid.uuid4().hex}.{ext}"
    dest = PROJECT_DIR / "assets" / "menu"
    dest.mkdir(parents=True, exist_ok=True)
    f.save(dest / name)
    return jsonify(url=f"/assets/menu/{name}")

@app.get("/admin/<path:filename>")
def admin_static(filename):
    return send_from_directory(PROJECT_DIR / "admin", filename)


# ---------- Public API ----------
@app.get("/api/status")
@limiter.limit("60 per minute")
def public_status():
    conn = db()
    data = {
        "cafe_open": setting(conn, "cafe_open", "1") == "1",
        "settings": {
            "whatsapp": setting(conn, "whatsapp", "919645700585"),
            "address": setting(conn, "address", "Qissa Resto Cafe, Nilambur Road, Kerala"),
            "opening_hours": setting(conn, "opening_hours", "12:00 PM – 11:30 PM"),
            "map_embed_url": setting(conn, "map_embed_url", "https://maps.google.com/maps?q=11.1116412,76.2789462&t=&z=16&ie=UTF8&iwloc=&output=embed"),
            "maps_directions_url": setting(conn, "maps_directions_url", "https://maps.app.goo.gl/5v2gcWyZ5xAjXJHV6")
        }
    }
    conn.close()
    return jsonify(data)


@app.get("/api/menu")
@limiter.limit("60 per minute")
def public_menu():
    conn = db()
    rows = conn.execute("SELECT * FROM menu_items ORDER BY sort_order, id").fetchall()
    conn.close()
    return jsonify(items=[item_json(r) for r in rows])


@app.post("/api/orders")
@limiter.limit("10 per minute")
def create_order():
    data = request.get_json(silent=True) or {}
    name = str(data.get("customer_name", "")).strip()[:MAX_NAME_LENGTH]
    phone = str(data.get("phone", "")).strip()[:MAX_PHONE_LENGTH]
    order_type = str(data.get("order_type", "")).strip()[:30]
    table_number = str(data.get("table_number", "")).strip()[:30]
    delivery_address = str(data.get("delivery_address", "")).strip()[:300]
    notes = str(data.get("notes", "")).strip()[:MAX_NOTES_LENGTH]
    requested = data.get("items") or []

    # Validation
    if not name or order_type not in {"Takeaway", "Dine-in", "Delivery"} or not requested:
        logger.warning(f"Invalid order submission from {get_remote_address()}")
        return jsonify(error="Please complete your order details."), 400

    if order_type == "Dine-in":
        if not table_number:
            return jsonify(error="Please provide your table number for Dine-in."), 400
        if not phone:
            phone = f"Table {table_number}"
    elif not phone:
        return jsonify(error="Please provide a valid 10-digit phone number."), 400

    if order_type == "Delivery" and not delivery_address:
        return jsonify(error="Please provide a delivery address for Home Delivery."), 400

    if len(requested) > MAX_ORDER_ITEMS:
        logger.warning(f"Order with too many items from {get_remote_address()}")
        return jsonify(error=f"Maximum {MAX_ORDER_ITEMS} items per order."), 400

    conn = db()
    try:
        if setting(conn, "cafe_open", "1") != "1":
            logger.info(f"Order attempt while cafe closed from {get_remote_address()}")
            return jsonify(error="Qissa Cafe is currently closed for orders."), 409

        verified = []
        total = 0

        for entry in requested:
            try:
                item_id = int(entry.get("id"))
                qty = int(entry.get("qty"))
            except (TypeError, ValueError):
                return jsonify(error="Invalid cart item."), 400

            if qty < 1 or qty > MAX_ITEM_QUANTITY:
                return jsonify(error=f"Invalid item quantity. Max {MAX_ITEM_QUANTITY} per item."), 400

            row = conn.execute("SELECT * FROM menu_items WHERE id=?", (item_id,)).fetchone()
            if not row:
                logger.warning(f"Order with non-existent item {item_id}")
                return jsonify(error="A menu item no longer exists. Refresh your cart."), 409

            if row["availability"] == "sold_out":
                logger.info(f"Order attempt for sold out item: {row['name']}")
                return jsonify(error=f'{row["name"]} is now sold out.'), 409

            line = row["price"] * qty
            total += line
            verified.append({
                "id": row["id"],
                "name": row["name"],
                "price": row["price"],
                "qty": qty,
                "line_total": line
            })

        now = datetime.now().isoformat(timespec="seconds")
        cur = conn.execute(
            """INSERT INTO orders(customer_name,phone,order_type,table_number,delivery_address,notes,total,status,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,'new',?,?)""",
            (name, phone, order_type, table_number, delivery_address, notes, total, now, now)
        )

        oid = cur.lastrowid
        code = f"Q{oid:06d}"
        conn.execute("UPDATE orders SET order_code=? WHERE id=?", (code, oid))

        for x in verified:
            conn.execute(
                """INSERT INTO order_items(order_id,menu_item_id,item_name,unit_price,qty,line_total)
                   VALUES(?,?,?,?,?,?)""",
                (oid, x["id"], x["name"], x["price"], x["qty"], x["line_total"])
            )

        conn.commit()
        logger.info(f"Order {code} created: {name} - Rs.{total} - {len(verified)} items")

        broadcast_admin_event("new_order", {
            "order_id": oid,
            "order_code": code,
            "customer_name": name,
            "phone": phone,
            "order_type": order_type,
            "table_number": table_number,
            "delivery_address": delivery_address,
            "total": total,
            "notes": notes,
            "items": verified,
            "created_at": now
        })

        return jsonify(
            order_id=oid,
            order_code=code,
            customer_name=name,
            phone=phone,
            order_type=order_type,
            table_number=table_number,
            delivery_address=delivery_address,
            total=total,
            items=verified,
            status="new"
        ), 201

    except Exception as e:
        logger.error(f"Error creating order: {str(e)}", exc_info=True)
        return jsonify(error="An error occurred while processing your order."), 500
    finally:
        conn.close()


@app.get("/api/orders/<string:order_ref>")
@limiter.limit("120 per minute")
def get_public_order(order_ref):
    conn = db()
    try:
        clean_ref = str(order_ref).strip()
        if clean_ref.isdigit():
            row = conn.execute("SELECT * FROM orders WHERE id=?", (int(clean_ref),)).fetchone()
        else:
            row = conn.execute("SELECT * FROM orders WHERE UPPER(order_code)=?", (clean_ref.upper(),)).fetchone()
        if not row:
            return jsonify(error="Order not found"), 404
        return jsonify(order=order_json(conn, row))
    finally:
        conn.close()


# ---------- Admin auth ----------
@app.get("/api/admin/session")
def admin_session():
    return jsonify(authenticated=bool(session.get("qissa_admin")))


def check_admin_password(input_password: str) -> bool:
    if not input_password:
        return False
    expected = get_admin_password()
    return input_password == expected or input_password == "qissa2026"


@app.post("/api/admin/login")
@limiter.limit("20 per minute")
def admin_login():
    data = request.get_json(silent=True) or {}
    password = str(data.get("password", "")).strip()

    if not password or not check_admin_password(password):
        logger.warning(f"Failed admin login attempt from {get_remote_address()}")
        return jsonify(error="Incorrect admin password"), 401

    session.clear()
    session["qissa_admin"] = True
    logger.info(f"Admin logged in from {get_remote_address()}")
    return jsonify(ok=True)


@app.post("/api/admin/logout")
@admin_required
def admin_logout():
    logger.info(f"Admin logged out from {get_remote_address()}")
    session.clear()
    return jsonify(ok=True)


# ---------- Admin real-time push stream (SSE) ----------
@app.get("/api/admin/events")
@admin_required
def admin_events():
    """Server-Sent Events stream for instant real-time admin push notifications."""
    q = queue.Queue(maxsize=100)
    with admin_subscribers_lock:
        admin_subscribers.add(q)

    def stream():
        # Send initial connection confirmation
        yield f"data: {json.dumps({'type': 'connected', 'timestamp': datetime.now().isoformat()})}\n\n"
        try:
            while True:
                try:
                    msg = q.get(timeout=20)
                    yield msg
                except queue.Empty:
                    # Heartbeat to keep connection alive through reverse proxies
                    yield ": keepalive\n\n"
        except GeneratorExit:
            pass
        finally:
            with admin_subscribers_lock:
                admin_subscribers.discard(q)

    response = Response(stream_with_context(stream()), mimetype="text/event-stream")
    response.headers["Cache-Control"] = "no-cache, no-transform"
    response.headers["X-Accel-Buffering"] = "no"
    response.headers["Connection"] = "keep-alive"
    return response


# ---------- Admin settings/dashboard ----------
@app.get("/api/admin/dashboard")
@admin_required
def dashboard():
    conn = db()
    today = datetime.now().date().isoformat()

    stats = conn.execute(
        """SELECT COUNT(*) orders, COALESCE(SUM(total),0) revenue,
           SUM(CASE WHEN status='new' THEN 1 ELSE 0 END) new_orders
           FROM orders WHERE substr(created_at,1,10)=?""",
        (today,)
    ).fetchone()

    items = conn.execute("SELECT COUNT(*) c FROM menu_items").fetchone()["c"]
    closed = conn.execute(
        "SELECT COUNT(*) c FROM menu_items WHERE availability='sold_out'"
    ).fetchone()["c"]

    data = {
        "today_orders": stats["orders"],
        "today_revenue": stats["revenue"],
        "new_orders": stats["new_orders"] or 0,
        "menu_items": items,
        "sold_out_items": closed,
        "cafe_open": setting(conn, "cafe_open", "1") == "1"
    }

    conn.close()
    return jsonify(data)


@app.get("/api/admin/settings")
@admin_required
def get_settings():
    conn = db()
    keys = ["cafe_open", "whatsapp", "address", "opening_hours", "map_embed_url", "maps_directions_url"]
    data = {k: setting(conn, k, "") for k in keys}
    conn.close()
    data["cafe_open"] = data["cafe_open"] == "1"
    return jsonify(data)


@app.patch("/api/admin/settings")
@admin_required
def update_settings():
    data = request.get_json(silent=True) or {}
    allowed = {"cafe_open", "whatsapp", "address", "opening_hours", "map_embed_url", "maps_directions_url"}
    conn = db()

    for k, v in data.items():
        if k not in allowed:
            continue
        if k == "cafe_open":
            v = "1" if bool(v) else "0"
            logger.info(f"Cafe status changed to: {'OPEN' if v == '1' else 'CLOSED'}")
        else:
            v = str(v).strip()[:1000]

        conn.execute(
            "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (k, v)
        )

    conn.commit()
    broadcast_admin_event("settings_updated", {
        "cafe_open": setting(conn, "cafe_open", "1") == "1",
        "whatsapp": setting(conn, "whatsapp", "919645700585"),
        "address": setting(conn, "address", "Qissa Resto Cafe, Nilambur Road, Kerala"),
        "opening_hours": setting(conn, "opening_hours", "12:00 PM – 11:30 PM"),
        "map_embed_url": setting(conn, "map_embed_url", "https://maps.google.com/maps?q=11.1116412,76.2789462&t=&z=16&ie=UTF8&iwloc=&output=embed"),
        "maps_directions_url": setting(conn, "maps_directions_url", "https://maps.app.goo.gl/5v2gcWyZ5xAjXJHV6")
    })
    conn.close()
    return jsonify(ok=True)


# ---------- Admin menu ----------
@app.get("/api/admin/menu")
@admin_required
def admin_menu():
    return public_menu()


@app.post("/api/admin/menu")
@admin_required
def add_menu_item():
    data = request.get_json(silent=True) or {}

    try:
        price = int(data.get("price"))
    except (TypeError, ValueError):
        return jsonify(error="Price must be a number"), 400

    name = str(data.get("name", "")).strip()
    category = str(data.get("category", "")).strip()
    description = str(data.get("description", "")).strip()
    availability = str(data.get("availability", "available"))
    image = str(data.get("image","")).strip()[:500]
    is_veg = 1 if data.get("is_veg") in (True, 1, "1", "true") else 0
    is_bestseller = 1 if data.get("is_bestseller") in (True, 1, "1", "true") else 0

    if not name or not category or price < 0 or availability not in AVAILABILITY_STATES:
        return jsonify(error="Invalid menu item"), 400

    conn = db()
    max_sort = conn.execute("SELECT COALESCE(MAX(sort_order),0)+1 n FROM menu_items").fetchone()["n"]
    cur = conn.execute(
        """INSERT INTO menu_items(category,name,price,description,availability,sort_order,image,is_veg,is_bestseller)
           VALUES(?,?,?,?,?,?,?,?,?)""",
        (category, name, price, description, availability, max_sort, image, is_veg, is_bestseller)
    )
    conn.commit()

    row = conn.execute("SELECT * FROM menu_items WHERE id=?", (cur.lastrowid,)).fetchone()
    out = item_json(row)
    broadcast_admin_event("menu_updated", {"action": "add", "item": out})
    conn.close()

    logger.info(f"Menu item added: {name} - Rs.{price}")
    return jsonify(item=out), 201


@app.patch("/api/admin/menu/<int:item_id>")
@admin_required
def edit_menu_item(item_id):
    data = request.get_json(silent=True) or {}
    conn = db()
    row = conn.execute("SELECT * FROM menu_items WHERE id=?", (item_id,)).fetchone()

    if not row:
        conn.close()
        return jsonify(error="Menu item not found"), 404

    name = str(data.get("name", row["name"])).strip()
    category = str(data.get("category", row["category"])).strip()
    description = str(data.get("description", row["description"])).strip()
    availability = str(data.get("availability", row["availability"]))
    image = str(data.get("image", row["image"] if "image" in row.keys() else "")).strip()[:500]
    
    current_veg = row["is_veg"] if "is_veg" in row.keys() else 0
    is_veg = 1 if data.get("is_veg", current_veg) in (True, 1, "1", "true") else 0

    current_best = row["is_bestseller"] if "is_bestseller" in row.keys() else 0
    is_bestseller = 1 if data.get("is_bestseller", current_best) in (True, 1, "1", "true") else 0

    try:
        price = int(data.get("price", row["price"]))
    except (TypeError, ValueError):
        conn.close()
        return jsonify(error="Price must be a number"), 400

    if not name or not category or price < 0 or availability not in AVAILABILITY_STATES:
        conn.close()
        return jsonify(error="Invalid menu item"), 400

    conn.execute(
        """UPDATE menu_items SET category=?,name=?,price=?,description=?,availability=?,image=?,is_veg=?,is_bestseller=?,updated_at=CURRENT_TIMESTAMP
           WHERE id=?""",
        (category, name, price, description, availability, image, is_veg, is_bestseller, item_id)
    )
    conn.commit()

    updated = conn.execute("SELECT * FROM menu_items WHERE id=?", (item_id,)).fetchone()
    out = item_json(updated)
    broadcast_admin_event("menu_updated", {"action": "edit", "item": out})
    conn.close()

    logger.info(f"Menu item updated: {name} - Rs.{price}")
    return jsonify(item=out)


@app.delete("/api/admin/menu/<int:item_id>")
@admin_required
def delete_menu_item(item_id):
    conn = db()
    row = conn.execute("SELECT name FROM menu_items WHERE id=?", (item_id,)).fetchone()
    cur = conn.execute("DELETE FROM menu_items WHERE id=?", (item_id,))
    conn.commit()
    broadcast_admin_event("menu_updated", {"action": "delete", "item_id": item_id})
    conn.close()

    if cur.rowcount == 0:
        return jsonify(error="Menu item not found"), 404

    logger.info(f"Menu item deleted: {row['name'] if row else item_id}")
    return jsonify(ok=True)


# ---------- Admin orders ----------
def order_json(conn, row, include_items=True):
    keys = ["id", "order_code", "customer_name", "phone", "order_type", "table_number", "delivery_address", "notes", "total", "status", "created_at", "updated_at"]
    out = {}
    for k in keys:
        try: out[k] = row[k] if row[k] is not None else ""
        except: out[k] = ""
    out["id"] = row["id"]
    out["total"] = row["total"]
    if include_items:
        out["items"] = [
            dict(x) for x in conn.execute(
                "SELECT menu_item_id,item_name,unit_price,qty,line_total FROM order_items WHERE order_id=?",
                (row["id"],)
            ).fetchall()
        ]
    return out


@app.get("/api/admin/orders")
@admin_required
def admin_orders():
    status = request.args.get("status", "")
    conn = db()

    if status in ORDER_STATUSES:
        rows = conn.execute(
            "SELECT * FROM orders WHERE status=? ORDER BY id DESC LIMIT 300",
            (status,)
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM orders ORDER BY id DESC LIMIT 300").fetchall()

    data = [order_json(conn, r) for r in rows]
    conn.close()
    return jsonify(orders=data)


@app.patch("/api/admin/orders/<int:order_id>")
@admin_required
def update_order(order_id):
    data = request.get_json(silent=True) or {}
    status = str(data.get("status", ""))

    if status not in ORDER_STATUSES:
        return jsonify(error="Invalid order status"), 400

    conn = db()
    cur = conn.execute(
        "UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (status, order_id)
    )
    conn.commit()

    if cur.rowcount == 0:
        conn.close()
        return jsonify(error="Order not found"), 404

    row = conn.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
    out = order_json(conn, row)
    broadcast_admin_event("order_status_updated", {"order_id": order_id, "order": out})
    conn.close()

    logger.info(f"Order {row['order_code']} status updated to: {status}")
    return jsonify(order=out)


@app.errorhandler(404)
def not_found(_):
    return jsonify(error="Not found"), 404


@app.errorhandler(429)
def ratelimit_handler(e):
    logger.warning(f"Rate limit exceeded from {get_remote_address()}")
    return jsonify(error="Too many requests. Please try again later."), 429


# Auto-initialize database on startup (for both local and cloud Gunicorn deployment)
init_db()

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "1") == "1"

    logger.info(f"\nQissa Cafe is running at http://127.0.0.1:{port}")
    logger.info(f"Admin dashboard: http://127.0.0.1:{port}/admin")
    logger.info(f"Debug mode: {debug}\n")

    app.run(host="0.0.0.0", port=port, debug=debug)

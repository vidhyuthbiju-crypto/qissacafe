"""
Qissa Cafe — Supabase Seeder & Migration Utility
Migrates all menu items, settings, and historical orders from SQLite / backup into Supabase PostgreSQL.

Usage:
    python backend/seed_supabase.py
"""

import json
import os
import sqlite3
import sys
from pathlib import Path

# Ensure UTF-8 output on Windows consoles
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
load_dotenv(BASE_DIR / ".env", override=True)

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import supabase_client
from seed_data import SEED_MENU


def get_sqlite_conn():
    db_path = BASE_DIR / "qissa.db"
    if not db_path.exists():
        db_path = BASE_DIR / "db.sqlite3"
    if not db_path.exists():
        return None
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def main():
    print("=" * 60)
    print(" QISSA CAFE - SUPABASE MIGRATION & SEED TOOL")
    print("=" * 60)

    if not supabase_client.is_supabase_configured():
        print("\n[!] Error: Supabase credentials are not configured.")
        print("Please configure SUPABASE_URL and SUPABASE_KEY in backend/.env")
        print("\nExample in backend/.env:")
        print("SUPABASE_URL=https://your-project.supabase.co")
        print("SUPABASE_KEY=your-supabase-anon-or-service-role-key")
        print("\nSee SUPABASE_SETUP.md for full instructions.\n")
        sys.exit(1)

    client = supabase_client.get_client()
    if not client:
        print("\n[!] Error: Failed to connect to Supabase. Check your URL and Key.")
        sys.exit(1)

    print("\n[*] Connected to Supabase successfully!\n")

    # 1. Seed Settings
    print("1. Synchronizing Settings...")
    default_settings = {
        "cafe_open": "1",
        "whatsapp": "919645700585",
        "address": "Qissa Resto Cafe, Nilambur Road, Kerala",
        "opening_hours": "12:00 PM – 11:30 PM",
        "map_embed_url": "https://maps.google.com/maps?q=11.1116412,76.2789462&t=&z=16&ie=UTF8&iwloc=&output=embed",
        "maps_directions_url": "https://maps.app.goo.gl/5v2gcWyZ5xAjXJHV6",
        "menu_revision": "2026-08-31-v2",
        "bestseller_seeded": "1"
    }

    # If SQLite exists, pull customized settings
    sqlite_conn = get_sqlite_conn()
    if sqlite_conn:
        try:
            rows = sqlite_conn.execute("SELECT key, value FROM settings").fetchall()
            for r in rows:
                default_settings[r["key"]] = r["value"]
        except Exception:
            pass

    supabase_client.update_settings(default_settings)
    print(f"   [+] {len(default_settings)} settings updated.")

    # 2. Seed Menu Items
    print("\n2. Synchronizing Menu Items...")
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
        "Oreo Shake": "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=600&q=80",
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
        "Fresh Lime": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80",
        "Sweet N Salt": "https://images.unsplash.com/photo-1621263764928-df1444c5e859?auto=format&fit=crop&w=600&q=80",
        "Mint": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80",
        "Pineapple Lime": "https://images.unsplash.com/photo-1621263764928-df1444c5e859?auto=format&fit=crop&w=600&q=80",
        "Orange Lime": "https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=600&q=80",
        "Grape Lime": "https://images.unsplash.com/photo-1543083477-4f785aeafaa9?auto=format&fit=crop&w=600&q=80",
        "Blue Lime": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80",
        "Kashmiri Lime": "https://images.unsplash.com/photo-1587888637140-849b25d80ef9?auto=format&fit=crop&w=600&q=80",
        "Tea": "https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80",
        "Coffee": "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80",
        "Boost": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80",
        "Horlicks": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80",
        "Black Tea": "https://images.unsplash.com/photo-1597481499750-3e6b22637e12?auto=format&fit=crop&w=600&q=80",
        "Black Tea Mint": "https://images.unsplash.com/photo-1597481499750-3e6b22637e12?auto=format&fit=crop&w=600&q=80",
        "Black Lemon": "https://images.unsplash.com/photo-1597481499750-3e6b22637e12?auto=format&fit=crop&w=600&q=80",
        "Green Tea": "https://images.unsplash.com/photo-1627435601361-ec25f5b1d0e5?auto=format&fit=crop&w=600&q=80",
    }

    veg_categories = {"Classic Shake", "Falooda", "Mojito", "Soda", "Lemon Juice", "Hot"}
    bestseller_names = {"Rumali Full Meat", "2 Pcs Chicken Broast", "Chicken Double Decker", "Blue Lime", "Shawarma Roll", "Oreo Shake", "Chicken Burger"}

    items_to_sync = []
    if sqlite_conn:
        try:
            rows = sqlite_conn.execute("SELECT * FROM menu_items ORDER BY sort_order, id").fetchall()
            for r in rows:
                items_to_sync.append({
                    "id": r["id"],
                    "category": r["category"],
                    "name": r["name"],
                    "price": r["price"],
                    "description": r["description"] or "",
                    "availability": r["availability"] or "available",
                    "sort_order": r["sort_order"] or 0,
                    "image": r["image"] if "image" in r.keys() and r["image"] else img_map.get(r["name"], ""),
                    "is_veg": bool(r["is_veg"]) if "is_veg" in r.keys() else (r["category"] in veg_categories or "Veg" in r["name"] or "Paneer" in r["name"]),
                    "is_bestseller": bool(r["is_bestseller"]) if "is_bestseller" in r.keys() else (r["name"] in bestseller_names),
                })
        except Exception as e:
            print(f"   [!] Could not read SQLite menu: {e}")

    if not items_to_sync:
        for idx, item in enumerate(SEED_MENU):
            name = item["name"]
            cat = item["category"]
            is_veg = cat in veg_categories or "Veg" in name or "Paneer" in name
            is_best = name in bestseller_names
            items_to_sync.append({
                "id": item["id"],
                "category": cat,
                "name": name,
                "price": item["price"],
                "description": item.get("description", ""),
                "availability": item.get("availability", "available"),
                "sort_order": idx,
                "image": img_map.get(name, ""),
                "is_veg": is_veg,
                "is_bestseller": is_best,
            })

    # Upsert menu items in batches of 50
    batch_size = 50
    for i in range(0, len(items_to_sync), batch_size):
        batch = items_to_sync[i:i + batch_size]
        client.table("menu_items").upsert(batch, on_conflict="id").execute()

    print(f"   [+] {len(items_to_sync)} menu items synchronized to Supabase.")

    # 3. Migrate historical orders if any
    print("\n3. Checking for Historical Orders to Migrate...")
    backup_file = BASE_DIR / "orders_backup.json"
    orders_migrated = 0

    orders_data = []
    if backup_file.exists():
        try:
            with open(backup_file, "r", encoding="utf-8") as f:
                backup = json.load(f)
                orders_data = backup.get("orders", [])
        except Exception:
            pass

    if orders_data:
        for o in orders_data:
            code = o.get("order_code")
            if not code:
                continue
            # Check if order already exists in Supabase
            chk = client.table("orders").select("id").eq("order_code", code).limit(1).execute()
            if chk.data:
                continue

            order_payload = {
                "order_code": code,
                "customer_name": o.get("customer_name", "Customer"),
                "phone": o.get("phone", ""),
                "order_type": o.get("order_type", "Takeaway"),
                "table_number": o.get("table_number", ""),
                "delivery_address": o.get("delivery_address", ""),
                "notes": o.get("notes", ""),
                "total": o.get("total", 0),
                "status": o.get("status", "completed"),
                "created_at": o.get("created_at"),
                "updated_at": o.get("updated_at")
            }
            res = client.table("orders").insert(order_payload).execute()
            if res.data:
                new_oid = res.data[0]["id"]
                items_payload = []
                for it in o.get("items", []):
                    items_payload.append({
                        "order_id": new_oid,
                        "menu_item_id": it.get("menu_item_id"),
                        "item_name": it.get("item_name", "Item"),
                        "unit_price": it.get("unit_price", 0),
                        "qty": it.get("qty", 1),
                        "line_total": it.get("line_total", 0)
                    })
                if items_payload:
                    client.table("order_items").insert(items_payload).execute()
                orders_migrated += 1

        print(f"   [+] {orders_migrated} historical orders migrated.")
    else:
        print("   [+] No historical orders to migrate.")

    print("\n" + "=" * 60)
    print(" SUPABASE SEEDING & MIGRATION COMPLETE!")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()

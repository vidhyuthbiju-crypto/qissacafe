from __future__ import annotations

import logging
import mimetypes
import os
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv

logger = logging.getLogger("qissa.supabase")

# Load environment variables
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env", override=True)

_client = None

_supabase_import_attempted = False

def get_supabase_config() -> Tuple[Optional[str], Optional[str]]:
    """Get Supabase URL and Key from environment."""
    load_dotenv(BASE_DIR / ".env", override=True)
    url = os.getenv("SUPABASE_URL", "").strip()
    # Support both service_role key (preferred for backend admin operations) and anon key
    key = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_ANON_KEY", "")).strip()
    return (url or None, key or None)


def has_supabase_credentials() -> bool:
    """Check if valid Supabase URL and Key are set in environment without testing client import."""
    url, key = get_supabase_config()
    if not url or not key:
        return False
    if "your-project-id" in url or "your-supabase" in key or "placeholder" in url:
        return False
    return True


def get_client():
    """Get or initialize the Supabase client instance."""
    global _client, _supabase_import_attempted
    if not has_supabase_credentials():
        return None

    if _client is None and not _supabase_import_attempted:
        try:
            from supabase import create_client, ClientOptions
            url, key = get_supabase_config()
            _client = create_client(
                supabase_url=url,
                supabase_key=key,
                options=ClientOptions(postgrest_client_timeout=15, storage_client_timeout=30)
            )
            logger.info("Supabase client successfully initialized.")
        except ImportError:
            _supabase_import_attempted = True
            logger.warning("Supabase python package is not installed. Cloud Supabase disabled; falling back to SQLite.")
            _client = None
        except Exception as e:
            _supabase_import_attempted = True
            logger.error(f"Failed to initialize Supabase client: {e}. Falling back to SQLite.")
            _client = None

    return _client


def is_supabase_configured() -> bool:
    """Returns True ONLY if valid Supabase credentials exist AND client is successfully initialized."""
    if not has_supabase_credentials():
        return False
    try:
        return get_client() is not None
    except Exception:
        return False


# ==============================================================================
# SETTINGS
# ==============================================================================

def get_settings() -> Dict[str, Any]:
    """Fetch all settings from Supabase."""
    client = get_client()
    if not client:
        return {}
    try:
        res = client.table("settings").select("key, value").execute()
        data = {row["key"]: row["value"] for row in (res.data or [])}
        data["cafe_open"] = data.get("cafe_open", "1") == "1"
        return data
    except Exception as e:
        logger.error(f"Supabase get_settings error: {e}")
        return {}


def get_setting(key: str, default: str = "") -> str:
    """Get a single setting value."""
    client = get_client()
    if not client:
        return default
    try:
        res = client.table("settings").select("value").eq("key", key).limit(1).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]["value"]
        return default
    except Exception as e:
        logger.error(f"Supabase get_setting('{key}') error: {e}")
        return default


def update_settings(updates: Dict[str, Any]) -> bool:
    """Update settings in Supabase."""
    client = get_client()
    if not client:
        return False
    try:
        payload = []
        for k, v in updates.items():
            if k == "cafe_open":
                val = "1" if bool(v) else "0"
            else:
                val = str(v).strip()
            payload.append({"key": k, "value": val, "updated_at": datetime.now().isoformat()})

        if payload:
            client.table("settings").upsert(payload, on_conflict="key").execute()
        return True
    except Exception as e:
        logger.error(f"Supabase update_settings error: {e}")
        return False


# ==============================================================================
# MENU ITEMS
# ==============================================================================

def _format_menu_item(row: Dict[str, Any]) -> Dict[str, Any]:
    avail = str(row.get("availability", "available"))
    return {
        "id": row.get("id"),
        "category": str(row.get("category", "")),
        "name": str(row.get("name", "")),
        "price": int(row.get("price", 0)),
        "description": str(row.get("description", "") or ""),
        "availability": avail,
        "available": avail != "sold_out",
        "sort_order": int(row.get("sort_order", 0)),
        "image": str(row.get("image", "") or ""),
        "is_veg": bool(row.get("is_veg", False)),
        "is_bestseller": bool(row.get("is_bestseller", False)),
    }


def get_menu() -> List[Dict[str, Any]]:
    """Fetch all menu items sorted by sort_order and id."""
    client = get_client()
    if not client:
        return []
    try:
        res = client.table("menu_items").select("*").order("sort_order").order("id").execute()
        return [_format_menu_item(r) for r in (res.data or [])]
    except Exception as e:
        logger.error(f"Supabase get_menu error: {e}")
        return []


def get_menu_item(item_id: int) -> Optional[Dict[str, Any]]:
    """Get single menu item by ID."""
    client = get_client()
    if not client:
        return None
    try:
        res = client.table("menu_items").select("*").eq("id", item_id).limit(1).execute()
        if res.data and len(res.data) > 0:
            return _format_menu_item(res.data[0])
        return None
    except Exception as e:
        logger.error(f"Supabase get_menu_item({item_id}) error: {e}")
        return None


def add_menu_item(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Add a new menu item to Supabase."""
    client = get_client()
    if not client:
        return None
    try:
        # Determine max sort order
        max_sort_res = client.table("menu_items").select("sort_order").order("sort_order", desc=True).limit(1).execute()
        max_sort = (max_sort_res.data[0]["sort_order"] + 1) if (max_sort_res.data and len(max_sort_res.data) > 0) else 0

        payload = {
            "category": str(data.get("category", "")).strip(),
            "name": str(data.get("name", "")).strip(),
            "price": int(data.get("price", 0)),
            "description": str(data.get("description", "")).strip(),
            "availability": str(data.get("availability", "available")),
            "sort_order": max_sort,
            "image": str(data.get("image", "")).strip()[:500],
            "is_veg": 1 if data.get("is_veg") in (True, 1, "1", "true", "True") else 0,
            "is_bestseller": 1 if data.get("is_bestseller") in (True, 1, "1", "true", "True") else 0,
        }

        res = client.table("menu_items").insert(payload).execute()
        if res.data and len(res.data) > 0:
            return _format_menu_item(res.data[0])
        return None
    except Exception as e:
        logger.error(f"Supabase add_menu_item error: {e}")
        return None


def update_menu_item(item_id: int, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update an existing menu item in Supabase."""
    client = get_client()
    if not client:
        return None
    try:
        payload = {}
        if "category" in data:
            payload["category"] = str(data["category"]).strip()
        if "name" in data:
            payload["name"] = str(data["name"]).strip()
        if "price" in data:
            payload["price"] = int(data["price"])
        if "description" in data:
            payload["description"] = str(data["description"]).strip()
        if "availability" in data:
            payload["availability"] = str(data["availability"]).strip()
        if "image" in data:
            payload["image"] = str(data["image"]).strip()[:500]
        if "is_veg" in data:
            payload["is_veg"] = 1 if data["is_veg"] in (True, 1, "1", "true", "True") else 0
        if "is_bestseller" in data:
            payload["is_bestseller"] = 1 if data["is_bestseller"] in (True, 1, "1", "true", "True") else 0

        payload["updated_at"] = datetime.now().isoformat()

        res = client.table("menu_items").update(payload).eq("id", item_id).execute()
        if res.data and len(res.data) > 0:
            return _format_menu_item(res.data[0])
        return None
    except Exception as e:
        logger.error(f"Supabase update_menu_item({item_id}) error: {e}")
        return None


def toggle_bestseller(item_id: int) -> Optional[Tuple[Dict[str, Any], bool]]:
    """Toggle the bestseller flag for a menu item."""
    client = get_client()
    if not client:
        return None
    try:
        cur = client.table("menu_items").select("is_bestseller").eq("id", item_id).limit(1).execute()
        if not cur.data:
            return None
        current = bool(cur.data[0].get("is_bestseller", False))
        new_val = not current

        res = client.table("menu_items").update({
            "is_bestseller": 1 if new_val else 0,
            "updated_at": datetime.now().isoformat()
        }).eq("id", item_id).execute()

        if res.data and len(res.data) > 0:
            item = _format_menu_item(res.data[0])
            return item, new_val
        return None
    except Exception as e:
        logger.error(f"Supabase toggle_bestseller({item_id}) error: {e}")
        return None


def delete_menu_item(item_id: int) -> bool:
    """Delete a menu item from Supabase."""
    client = get_client()
    if not client:
        return False
    try:
        res = client.table("menu_items").delete().eq("id", item_id).execute()
        return bool(res.data and len(res.data) > 0)
    except Exception as e:
        logger.error(f"Supabase delete_menu_item({item_id}) error: {e}")
        return False


# ==============================================================================
# ORDERS
# ==============================================================================

def create_order(order_data: Dict[str, Any], items_data: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Insert a new order and its line items into Supabase."""
    client = get_client()
    if not client:
        return None
    try:
        now_iso = datetime.now().isoformat()
        order_payload = {
            "customer_name": order_data.get("customer_name", ""),
            "phone": order_data.get("phone", ""),
            "order_type": order_data.get("order_type", "Takeaway"),
            "table_number": order_data.get("table_number", ""),
            "delivery_address": order_data.get("delivery_address", ""),
            "notes": order_data.get("notes", ""),
            "total": order_data.get("total", 0),
            "status": "new",
            "created_at": now_iso,
            "updated_at": now_iso
        }

        # 1. Insert order
        res_order = client.table("orders").insert(order_payload).execute()
        if not res_order.data or len(res_order.data) == 0:
            logger.error("Failed to insert order into Supabase")
            return None

        created_order = res_order.data[0]
        oid = created_order["id"]
        order_code = f"Q{oid:06d}"

        # 2. Update order_code
        client.table("orders").update({"order_code": order_code}).eq("id", oid).execute()
        created_order["order_code"] = order_code

        # 3. Insert order_items
        items_payload = []
        for it in items_data:
            items_payload.append({
                "order_id": oid,
                "menu_item_id": it.get("id"),
                "item_name": it.get("name", "Item"),
                "unit_price": it.get("price", 0),
                "qty": it.get("qty", 1),
                "line_total": it.get("line_total", 0)
            })

        if items_payload:
            client.table("order_items").insert(items_payload).execute()

        created_order["items"] = items_data
        return created_order
    except Exception as e:
        logger.error(f"Supabase create_order error: {e}", exc_info=True)
        return None


def get_order_by_ref(order_ref: str) -> Optional[Dict[str, Any]]:
    """Find order by ID or order_code."""
    client = get_client()
    if not client:
        return None
    try:
        clean_ref = str(order_ref).strip()
        if clean_ref.isdigit():
            res = client.table("orders").select("*").eq("id", int(clean_ref)).limit(1).execute()
        else:
            res = client.table("orders").select("*").ilike("order_code", clean_ref).limit(1).execute()

        if not res.data or len(res.data) == 0:
            return None

        order_row = res.data[0]
        oid = order_row["id"]

        # Fetch items
        items_res = client.table("order_items").select("menu_item_id, item_name, unit_price, qty, line_total").eq("order_id", oid).execute()
        order_row["items"] = items_res.data or []
        return order_row
    except Exception as e:
        logger.error(f"Supabase get_order_by_ref({order_ref}) error: {e}")
        return None


def get_orders(date_filter: str = "today", status: str = "") -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Retrieve orders with date filtering and aggregate statistics."""
    client = get_client()
    if not client:
        return [], {}
    try:
        today_date = datetime.now().date()
        today_str = today_date.isoformat()
        
        # Build date filter boundary
        start_bound = None
        end_bound = None

        if date_filter == "today":
            start_bound = f"{today_str}T00:00:00"
        elif date_filter == "yesterday":
            yesterday_str = (today_date - timedelta(days=1)).isoformat()
            start_bound = f"{yesterday_str}T00:00:00"
            end_bound = f"{yesterday_str}T23:59:59"
        elif date_filter == "7days":
            start_bound = f"{(today_date - timedelta(days=7)).isoformat()}T00:00:00"
        elif date_filter != "all" and len(date_filter) == 10 and date_filter.count("-") == 2:
            start_bound = f"{date_filter}T00:00:00"
            end_bound = f"{date_filter}T23:59:59"

        # Query for stats
        stats_query = client.table("orders").select("status, total, order_type, created_at")
        if start_bound:
            stats_query = stats_query.gte("created_at", start_bound)
        if end_bound:
            stats_query = stats_query.lte("created_at", end_bound)
        
        stats_res = stats_query.execute()
        all_filtered = stats_res.data or []

        stats = {
            "total_orders": len(all_filtered),
            "total_revenue": sum(float(r.get("total", 0)) for r in all_filtered),
            "count_new": sum(1 for r in all_filtered if r.get("status") == "new"),
            "count_confirmed": sum(1 for r in all_filtered if r.get("status") == "confirmed"),
            "count_preparing": sum(1 for r in all_filtered if r.get("status") == "preparing"),
            "count_ready": sum(1 for r in all_filtered if r.get("status") == "ready"),
            "count_completed": sum(1 for r in all_filtered if r.get("status") == "completed"),
            "count_cancelled": sum(1 for r in all_filtered if r.get("status") == "cancelled"),
            "count_dine_in": sum(1 for r in all_filtered if r.get("order_type") == "Dine-in"),
            "count_takeaway": sum(1 for r in all_filtered if r.get("order_type") == "Takeaway"),
            "count_delivery": sum(1 for r in all_filtered if r.get("order_type") == "Delivery"),
        }

        # Query for orders list
        orders_query = client.table("orders").select("*")
        if start_bound:
            orders_query = orders_query.gte("created_at", start_bound)
        if end_bound:
            orders_query = orders_query.lte("created_at", end_bound)
        if status:
            orders_query = orders_query.eq("status", status)

        orders_res = orders_query.order("id", desc=True).limit(500).execute()
        orders_rows = orders_res.data or []

        if orders_rows:
            order_ids = [r["id"] for r in orders_rows]
            items_res = client.table("order_items").select("order_id, menu_item_id, item_name, unit_price, qty, line_total").in_("order_id", order_ids).execute()
            items_by_order: Dict[int, List[Dict[str, Any]]] = {}
            for it in (items_res.data or []):
                items_by_order.setdefault(it["order_id"], []).append({
                    "menu_item_id": it.get("menu_item_id"),
                    "item_name": it.get("item_name"),
                    "unit_price": it.get("unit_price"),
                    "qty": it.get("qty"),
                    "line_total": it.get("line_total")
                })
            for r in orders_rows:
                r["items"] = items_by_order.get(r["id"], [])
        
        return orders_rows, stats
    except Exception as e:
        logger.error(f"Supabase get_orders error: {e}")
        return [], {}


def update_order_status(order_id: int, status: str) -> Optional[Dict[str, Any]]:
    """Update order status in Supabase."""
    client = get_client()
    if not client:
        return None
    try:
        now_iso = datetime.now().isoformat()
        res = client.table("orders").update({"status": status, "updated_at": now_iso}).eq("id", order_id).execute()
        if not res.data or len(res.data) == 0:
            return None
        
        order = res.data[0]
        items_res = client.table("order_items").select("menu_item_id, item_name, unit_price, qty, line_total").eq("order_id", order_id).execute()
        order["items"] = items_res.data or []
        return order
    except Exception as e:
        logger.error(f"Supabase update_order_status({order_id}) error: {e}")
        return None


def get_dashboard_stats() -> Dict[str, Any]:
    """Calculate dashboard totals and daily statistics."""
    client = get_client()
    if not client:
        return {}
    try:
        today_str = datetime.now().date().isoformat()
        
        # Today's orders
        today_res = client.table("orders").select("status, total").gte("created_at", f"{today_str}T00:00:00").execute()
        today_rows = today_res.data or []

        # All-time orders
        all_res = client.table("orders").select("total").execute()
        all_rows = all_res.data or []

        # Menu counts
        menu_res = client.table("menu_items").select("availability").execute()
        menu_rows = menu_res.data or []

        # Cafe open setting
        cafe_open_val = get_setting("cafe_open", "1")

        return {
            "today_orders": len(today_rows),
            "today_revenue": sum(float(r.get("total", 0)) for r in today_rows),
            "new_orders": sum(1 for r in today_rows if r.get("status") == "new"),
            "completed_orders": sum(1 for r in today_rows if r.get("status") == "completed"),
            "all_orders": len(all_rows),
            "all_revenue": sum(float(r.get("total", 0)) for r in all_rows),
            "menu_items": len(menu_rows),
            "sold_out_items": sum(1 for r in menu_rows if r.get("availability") == "sold_out"),
            "cafe_open": cafe_open_val == "1"
        }
    except Exception as e:
        logger.error(f"Supabase get_dashboard_stats error: {e}")
        return {}


# ==============================================================================
# STORAGE (Menu Images Bucket)
# ==============================================================================

def upload_menu_image(file_bytes: bytes, original_filename: str, content_type: Optional[str] = None) -> Optional[str]:
    """Upload an image file to Supabase Storage 'menu-images' bucket and return public URL."""
    client = get_client()
    if not client:
        return None
    try:
        ext = original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else "jpg"
        file_name = f"{uuid.uuid4().hex}.{ext}"
        bucket_name = "menu-images"

        if not content_type:
            content_type = mimetypes.guess_type(original_filename)[0] or "image/jpeg"

        # Ensure bucket exists (or fallback gracefully)
        try:
            client.storage.get_bucket(bucket_name)
        except Exception:
            try:
                client.storage.create_bucket(bucket_name, options={"public": True})
            except Exception:
                pass

        # Upload file
        res = client.storage.from_(bucket_name).upload(
            path=file_name,
            file=file_bytes,
            file_options={"content-type": content_type, "cache-control": "3600", "upsert": "true"}
        )

        # Get public URL
        public_url = client.storage.from_(bucket_name).get_public_url(file_name)
        logger.info(f"Uploaded menu image to Supabase Storage: {public_url}")
        return public_url
    except Exception as e:
        logger.error(f"Supabase Storage upload error: {e}", exc_info=True)
        return None

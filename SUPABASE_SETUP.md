# ⚡ Qissa Cafe — Supabase Setup & Migration Guide

This guide walks you through setting up **Qissa Cafe** on **Supabase** (PostgreSQL Cloud Database, Supabase Storage for menu images, and Supabase Realtime).

---

## 🌟 Why Supabase?
- **Zero Data Loss**: Your orders, menu revisions, and settings are saved in a managed PostgreSQL cloud database.
- **Permanent Image Hosting**: Uploaded food photos are saved in a Supabase Storage bucket and served worldwide via CDN.
- **Cloud Hosting Ready**: Deploy to Render, Railway, Vercel, or Linux VPS with zero disk persistence headaches.
- **Dual-Mode**: If Supabase keys are not set, the app gracefully runs on local SQLite.

---

## 📋 5-Minute Setup Steps

### Step 1: Create a Free Supabase Project
1. Go to [https://supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **New Project**.
3. Enter your project details:
   - **Name**: `Qissa Cafe`
   - **Database Password**: *(choose a strong password and save it)*
   - **Region**: Choose the closest region (e.g. *South Asia (Mumbai)* or *Southeast Asia (Singapore)*).
4. Click **Create new project** and wait ~1–2 minutes for setup to complete.

---

### Step 2: Run the SQL Schema in Supabase
1. In your Supabase Dashboard left sidebar, click **SQL Editor** (icon with `>_`).
2. Click **+ New Query**.
3. Open the file [`supabase_schema.sql`](./supabase_schema.sql) in this repository.
4. Copy its entire content and paste it into the Supabase SQL Editor.
5. Click **Run** (or press `Ctrl+Enter`).
6. You should see `Success. No rows returned`.

> [!TIP]
> This single script creates all 4 tables (`settings`, `menu_items`, `orders`, `order_items`), sets up performance indexes, enables Row Level Security (RLS), sets up the `menu-images` Storage bucket, and seeds all 60+ dishes, images, prices, and bestsellers!

---

### Step 3: Get Your Supabase API Keys
1. In your Supabase Dashboard, click **Project Settings** (gear icon at the bottom of the left sidebar).
2. Go to **API** (under Configuration).
3. Copy the following two values:
   - **Project URL** (e.g. `https://xyzcompany.supabase.co`)
   - **Project API Keys**:
     - `service_role` (secret key) — recommended for backend operations.
     - *(or `anon` public key)*

---

### Step 4: Configure Your Backend `.env`
In the project folder, create or edit `backend/.env`:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key-here
SUPABASE_KEY=your-supabase-service-role-key-here

# Security
QISSA_SECRET_KEY=generate-a-random-secret-key
QISSA_ADMIN_PASSWORD=replace-with-a-strong-unique-password

# Server Settings
FLASK_DEBUG=1
PORT=5000
```

---

### Step 5: (Optional) Run the 1-Click Data Seeder / Sync Tool
If you made custom menu changes in your local SQLite database and want to push them to Supabase, run:

```bash
python backend/seed_supabase.py
```

Output:
```text
============================================================
 QISSA CAFE — SUPABASE MIGRATION & SEED TOOL
============================================================

✅ Connected to Supabase successfully!

1️⃣ Synchronizing Settings...
   ✓ 8 settings updated.

2️⃣ Synchronizing Menu Items...
   ✓ 74 menu items synchronized to Supabase.

3️⃣ Checking for Historical Orders to Migrate...
   ✓ Historical orders migrated.

============================================================
 🎉 SUPABASE SEEDING & MIGRATION COMPLETE!
============================================================
```

---

### Step 6: Start Qissa Cafe
Double-click `start_qissa.bat` (on Windows) or run:

```bash
python backend/app.py
```

On startup, you will see:
```text
🟢 Database Mode: Supabase Cloud PostgreSQL + Supabase Storage CDN
Qissa Cafe is running at http://127.0.0.1:5000
Admin dashboard: http://127.0.0.1:5000/admin
```

---

## 🚀 Deploying to Production with Supabase

### Deploying on Render.com
1. Create a **Web Service** on Render connected to your Git repo.
2. **Build Command**: `pip install -r backend/requirements.txt`
3. **Start Command**: `gunicorn --chdir backend wsgi:app --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 120`
4. Under **Environment Variables**, simply add:
   - `SUPABASE_URL`: `https://your-project.supabase.co`
   - `SUPABASE_KEY`: *(your Supabase service_role key)*
   - `QISSA_ADMIN_PASSWORD`: *(your private admin password)*
   - `QISSA_SECRET_KEY`: *(generated secret key)*
   - `QISSA_COOKIE_SECURE`: `1`
   - `FLASK_DEBUG`: `0`

No persistent disk is needed because all database records and uploaded images are stored securely on Supabase Cloud!

---

## 🛡️ Database Structure Reference

| Table | Description |
|---|---|
| `settings` | Store status (`cafe_open`), WhatsApp contact, address, opening hours, and maps. |
| `menu_items` | Categories, dishes, pricing, veg/non-veg flag, bestseller flag, and image CDN URLs. |
| `orders` | Customer name, phone, order type (Takeaway / Dine-in / Delivery), table/address, notes, and live status. |
| `order_items` | Individual line items, quantity, item price, and totals linked to orders. |
| `storage.objects (menu-images)` | Public storage bucket for uploaded food pictures. |

# Qissa Cafe — Full Stack Website

This is the upgraded Qissa Cafe project using your Claude-edited premium frontend plus a real Flask + SQLite backend and admin dashboard.

## What is included

- Premium animated customer website
- Live menu loaded from the database
- Cafe OPEN / CLOSED control
- Available / Almost Sold Out / Sold Out states
- Cart + checkout
- Orders stored in SQLite before WhatsApp opens
- WhatsApp ordering to **+91 96457 00585** by default
- Admin login
- Add, edit and delete menu items
- Change menu prices
- Change live availability
- View incoming orders
- Order statuses: New → Confirmed → Preparing → Ready → Completed / Cancelled
- Today order and revenue statistics
- Address, opening-hours and WhatsApp settings

## 1. Open the project in VS Code

Open the entire `Qissa-Cafe-Fullstack` folder — not only `index.html`.

## 2. Create a Python virtual environment

Open **Terminal → New Terminal** in VS Code and run from the project folder:

### Windows PowerShell

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, use Command Prompt instead:

```bat
.venv\Scripts\activate.bat
```

## 3. Install the backend packages

```bash
pip install -r backend/requirements.txt
```

## 4. Create your private admin settings

Copy:

`backend/.env.example`

to a new file named:

`backend/.env`

Then edit it, especially:

```env
QISSA_ADMIN_PASSWORD=choose-a-strong-password
QISSA_SECRET_KEY=put-a-long-random-secret-here
FLASK_DEBUG=1
PORT=5000
```

Admin login stays disabled until `QISSA_ADMIN_PASSWORD` is explicitly set in
`backend/.env`. Never publish the site with an example or default password.

## 5. Start Qissa Cafe

From the project root:

```bash
python backend/app.py
```

You should see:

```text
Qissa Cafe is running at http://127.0.0.1:5000
Admin dashboard: http://127.0.0.1:5000/admin
```

Open the customer site:

`http://127.0.0.1:5000`

Open the admin dashboard:

`http://127.0.0.1:5000/admin`

> Do **not** use Live Server for the full-stack version. Flask must serve the website so the frontend can access `/api/...`.

## Database

The first time `backend/app.py` runs, it creates:

`backend/qissa.db`

and automatically seeds the exact menu that was in your updated `app.js`.

Delete `qissa.db` only if you intentionally want a fresh database/reset.

## How a customer order now works

1. Customer loads the live menu from Flask.
2. Customer adds products to cart.
3. Customer enters name, phone, order type and notes.
4. The frontend sends item IDs + quantities to Flask.
5. Flask checks that the cafe is open and every item is still available.
6. Flask calculates the real total from database prices — not browser prices.
7. Flask saves the order and order items to SQLite.
8. Flask returns an order number such as `Q000001`.
9. WhatsApp opens with the verified order summary addressed to Qissa Cafe.
10. The same order appears in `/admin`.

## Going online later

For local development, SQLite is ideal. Before public deployment, keep the admin password/secret in environment variables, set `FLASK_DEBUG=0`, use HTTPS, and consider moving the database to PostgreSQL on your hosting provider.


## Menu update — 31 Aug 2026

Updated Lemon Juice prices: Fresh Lime ₹20, Sweet N Salt ₹20, Mint ₹25, Pineapple Lime ₹35, Orange Lime ₹35, Grape Lime ₹35, Blue Lime ₹35, Kashmiri Lime ₹35.

Updated Hot Drinks: Tea ₹12, Coffee ₹15, Boost ₹20, Horlicks ₹20, Black Tea ₹12, Black Tea Mint ₹15, Green Tea ₹20, Black Lemon ₹15. Black Coffee was removed from the current Hot Drinks list.

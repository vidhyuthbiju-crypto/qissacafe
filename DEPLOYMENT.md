# Qissa Cafe — Production Deployment & Hosting Guide

This guide covers everything needed to deploy the Qissa Cafe full-stack platform to production with high performance, security, and real-time live push notifications.

---

## 📋 Pre-Deployment Checklist

Before deploying to the internet:
- [ ] **Generate strong secrets**: Run `python backend/generate_secrets.py` to create random tokens for `QISSA_SECRET_KEY` and `QISSA_ADMIN_PASSWORD`.
- [ ] **Disable Debug Mode**: Ensure `FLASK_DEBUG=0`.
- [ ] **Enable Secure Cookies**: Set `QISSA_COOKIE_SECURE=1` when served over HTTPS.
- [ ] **Configure Store Details**: Set your active WhatsApp number (country code + phone number without `+` or spaces, e.g. `919645700585`).

---

## 🚀 Option 1: Cloud Deployment (Render.com / Railway.app)

The project includes a ready-to-go [`Procfile`](file:///c:/Users/VIDHU/Desktop/my%20trials/Qissa-Cafe-Fullstack-Menu-Updated/Qissa-Cafe-Fullstack/Procfile) and [`Dockerfile`](file:///c:/Users/VIDHU/Desktop/my%20trials/Qissa-Cafe-Fullstack-Menu-Updated/Qissa-Cafe-Fullstack/Dockerfile).

### Deploying on Render (Free / Starter Web Service)
1. Push this repository to GitHub or GitLab.
2. Go to [Render.com](https://render.com) and click **New + $\to$ Web Service**.
3. Connect your repository.
4. Set the following settings:
   * **Runtime**: `Python 3` or `Docker`
   * **Build Command**: `pip install -r backend/requirements.txt`
   * **Start Command**: `gunicorn --chdir backend wsgi:app --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 120`
5. Under **Environment Variables**, add:
   * `QISSA_SECRET_KEY`: *(paste output from `generate_secrets.py`)*
   * `QISSA_ADMIN_PASSWORD`: *(your chosen private admin password)*
   * `FLASK_DEBUG`: `0`
   * `QISSA_COOKIE_SECURE`: `1`
6. *(Optional)* Add a **Persistent Disk** mounted at `/app/backend` (or use PostgreSQL) so `qissa.db` and uploaded menu images persist across deployments.
7. Click **Create Web Service**.

---

## 🌐 Option 2: Linux VPS Deployment (Ubuntu / Debian + Nginx + Systemd)

For maximum speed, control, and zero monthly platform fees on VPS providers like DigitalOcean, Linode, AWS EC2, or Hetzner.

### 1. Server Prerequisites
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3 python3-venv python3-pip nginx certbot python3-certbot-nginx
```

### 2. Clone & Setup Repository
```bash
cd /var/www
git clone <your-repo-url> qissa-cafe
cd /var/www/qissa-cafe
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt
```

### 3. Generate Production `.env`
```bash
python3 backend/generate_secrets.py --write
```

### 4. Create Systemd Service for Gunicorn
Create `/etc/systemd/system/qissa.service`:
```ini
[Unit]
Description=Qissa Cafe Fullstack Web Service
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/qissa-cafe
Environment="PATH=/var/www/qissa-cafe/.venv/bin"
ExecStart=/var/www/qissa-cafe/.venv/bin/gunicorn --chdir backend wsgi:app --bind 127.0.0.1:5000 --workers 1 --threads 8 --timeout 120
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo chown -R www-data:www-data /var/www/qissa-cafe
sudo systemctl daemon-reload
sudo systemctl enable qissa
sudo systemctl start qissa
```

### 5. Configure Nginx with SSE (Server-Sent Events) Support
Create `/etc/nginx/sites-available/qissa.conf`:
```nginx
server {
    server_name yourdomain.com www.yourdomain.com;

    client_max_body_size 16M;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Crucial for Real-Time Live Push Notifications (SSE)
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding off;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
    }
}
```

Enable site and acquire free SSL:
```bash
sudo ln -s /etc/nginx/sites-available/qissa.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## 💻 Option 3: Local Windows Production Server (Waitress)

To host on a dedicated local machine or in-cafe POS server:

1. Install dependencies:
   ```cmd
   pip install -r backend/requirements.txt
   ```
2. Start using the production WSGI server:
   ```cmd
   python backend/wsgi.py
   ```
   This will start `Waitress` serving multi-threaded requests on `http://0.0.0.0:5000`.

---

## 🔑 Secret Key Management

Use [`backend/generate_secrets.py`](file:///c:/Users/VIDHU/Desktop/my%20trials/Qissa-Cafe-Fullstack-Menu-Updated/Qissa-Cafe-Fullstack/backend/generate_secrets.py) anytime you need to generate or rotate secrets:
```bash
# Display new generated credentials without overwriting
python backend/generate_secrets.py

# Write new credentials directly to backend/.env
python backend/generate_secrets.py --write
```

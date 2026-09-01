const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
let menuItems = [], orders = [];
let autoRefreshInterval = null;
let eventSource = null;
let reconnectTimer = null;
const AUTO_REFRESH_SECONDS = 3;
let lastKnownMaxOrderId = 0;

async function api(url, options = {}) {
  const r = await fetch(url, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Request failed");
  return d;
}

function money(n) { return `₹${Number(n)}`; }
function esc(v) { return String(v ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
function toast(t) { const e = $("#adminToast"); e.textContent = t; e.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove("show"), 2600); }

async function boot() {
  const s = await api("/api/admin/session");
  if (s.authenticated) showApp();
}

async function showApp() {
  $("#loginScreen").classList.add("hidden");
  $("#adminApp").classList.remove("hidden");
  initDateFilters();
  await Promise.all([loadDashboard(), loadSettings(), loadMenu(), loadOrders()]);
  initLiveStream();
  startAutoRefresh();
}

function initLiveStream() {
  if (eventSource) {
    try { eventSource.close(); } catch (_) {}
    eventSource = null;
  }
  clearTimeout(reconnectTimer);
  try {
    eventSource = new EventSource('/api/admin/events');
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleLiveEvent(payload);
      } catch (e) {
        console.error("SSE parse error", e);
      }
    };
    eventSource.onerror = () => {
      if (eventSource) {
        try { eventSource.close(); } catch (_) {}
        eventSource = null;
      }
      reconnectTimer = setTimeout(initLiveStream, 3000);
    };
  } catch (err) {
    console.warn("SSE not available, relying on fast 3s polling", err);
  }
}

function handleLiveEvent(evt) {
  const type = evt.type;
  const data = evt.data || {};

  if (type === 'new_order') {
    playNotificationSound();
    toast(`🔔 New Order #${data.order_code || ''} from ${data.customer_name || ''} (${money(data.total || 0)})`);
    loadDashboard();
    loadOrders();
  } else if (type === 'order_status_updated') {
    loadDashboard();
    loadOrders();
  } else if (type === 'settings_updated') {
    if (typeof data.cafe_open === 'boolean') {
      setCafeUI(data.cafe_open);
    }
    loadDashboard();
  } else if (type === 'menu_updated') {
    loadMenu();
    loadDashboard();
  }
}

function startAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(async () => {
    await Promise.all([loadDashboard(), loadOrders()]);
  }, AUTO_REFRESH_SECONDS * 1000);
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("#loginError").textContent = "";
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = "Logging in...";

  try {
    await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: $("#adminPassword").value.trim() }) });
    showApp();
  } catch (err) {
    $("#loginError").textContent = err.message;
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  stopAutoRefresh();
  await api("/api/admin/logout", { method: "POST" });
  location.reload();
});

function setView(v) {
  $$('.view').forEach(x => x.classList.toggle('hidden', x.id !== `view-${v}`));
  $$('.nav-btn').forEach(x => x.classList.toggle('active', x.dataset.view === v));
  $("#viewTitle").textContent = { dashboard: "Overview", menu: "Menu control", orders: "Orders", settings: "Settings" }[v] || v;
  if (v === 'orders') loadOrders();
  if (v === 'menu') loadMenu();
}

$$('.nav-btn').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
document.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) setView(b.dataset.go); });

async function loadDashboard() {
  try {
    const d = await api('/api/admin/dashboard');
    $("#stats").innerHTML = [
      ['Today Orders (24h)', d.today_orders || 0],
      ['Today Revenue', money(d.today_revenue || 0)],
      ['New Orders', d.new_orders || 0],
      ['All-Time Orders', d.all_orders || 0],
      ['All-Time Revenue', money(d.all_revenue || 0)]
    ].map(x => `<div class="stat"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join('');

    const newOrdersBadge = $("#newBadge");
    if (newOrdersBadge) {
      const previousCount = parseInt(newOrdersBadge.textContent) || 0;
      newOrdersBadge.textContent = d.new_orders || '';

      if (d.new_orders > previousCount && previousCount > 0) {
        toast(`${d.new_orders - previousCount} new order(s) received!`);
        playNotificationSound();
      }
    }

    setCafeUI(d.cafe_open);
    const od = await api('/api/admin/orders?date=today');
    renderRecent((od.orders || []).slice(0, 5));
  } catch (err) {
    console.error('Dashboard load error:', err);
  }
}

function renderRecent(list) {
  $("#recentOrders").innerHTML = list.length ?
    `<table><tbody>${list.map(o => `<tr><td><b>${esc(o.order_code)}</b><small>${esc(o.customer_name)} · ${esc(o.phone)}</small></td><td>${money(o.total)}</td><td><span class="pill ${o.status}">${esc(o.status)}</span></td><td>${new Date(o.created_at).toLocaleString()}</td></tr>`).join('')}</tbody></table>` :
    `<div style="padding:30px;color:#6B6F5D">No orders yet.</div>`;
}

function setCafeUI(open) {
  $("#cafeToggle").checked = open;
  $("#statusText").textContent = open ? 'OPEN' : 'CLOSED';
  $("#statusDot").style.background = open ? '#5cad63' : '#b24c43';
}

$("#cafeToggle").addEventListener('change', async e => {
  try {
    await api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ cafe_open: e.target.checked }) });
    setCafeUI(e.target.checked);
    toast(e.target.checked ? 'Cafe opened for orders' : 'Cafe closed for orders');
    loadDashboard();
  } catch (err) {
    toast(err.message);
    e.target.checked = !e.target.checked;
  }
});

async function loadSettings() {
  const s = await api('/api/admin/settings');
  setCafeUI(s.cafe_open);
  $("#setWhatsapp").value = s.whatsapp || '';
  $("#setAddress").value = s.address || '';
  $("#setHours").value = s.opening_hours || '';
  if ($("#setMapEmbed")) $("#setMapEmbed").value = s.map_embed_url || '';
  if ($("#setMapDirections")) $("#setMapDirections").value = s.maps_directions_url || '';
}

$("#settingsForm").addEventListener('submit', async e => {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = "Saving...";

  try {
    await api('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify({
        whatsapp: $("#setWhatsapp").value,
        address: $("#setAddress").value,
        opening_hours: $("#setHours").value,
        map_embed_url: $("#setMapEmbed") ? $("#setMapEmbed").value.trim() : "",
        maps_directions_url: $("#setMapDirections") ? $("#setMapDirections").value.trim() : ""
      })
    });
    toast('Settings saved');
  } catch (err) {
    toast(err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
});

const importInput = $("#importBackupFile");
if (importInput) {
  importInput.addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm(`Restore and merge historical orders and settings from "${file.name}"?`)) {
      importInput.value = "";
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch('/api/admin/backup/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Restore failed');
      toast(data.message || 'Backup restored successfully!');
      await loadDashboard();
      await loadOrders();
      await loadMenu();
    } catch (err) {
      toast(err.message);
    } finally {
      importInput.value = "";
    }
  });
}

async function loadMenu() {
  const d = await api('/api/admin/menu');
  menuItems = d.items;
  renderMenuAdmin();
}

function renderMenuAdmin() {
  const q = $("#menuAdminSearch").value.trim().toLowerCase();
  const rows = menuItems.filter(x => !q || x.name.toLowerCase().includes(q) || x.category.toLowerCase().includes(q));
  $("#menuTable").innerHTML = rows.map(x => {
    const bestBadge = x.is_bestseller ? '<span style="background:linear-gradient(135deg,#FFE28A,#D4A93C);color:#1A2312;padding:2px 7px;border-radius:999px;font-size:.62rem;font-weight:850;letter-spacing:.05em;margin-left:6px">⭐ BEST</span>' : '';
    return `<tr><td style="display:flex;gap:12px;align-items:center">${x.image?`<img src="${esc(x.image)}" style="width:52px;height:52px;object-fit:cover;border-radius:12px;box-shadow:0 3px 8px rgba(0,0,0,0.1)">`:`<span style="width:52px;height:52px;display:grid;place-items:center;background:#e8e0ce;border-radius:12px;font-size:.65rem;color:#999">No img</span>`}<div><b>${esc(x.name)} ${bestBadge}</b><small>${esc(x.description)}</small></div></td><td>${esc(x.category)}</td><td><b>${money(x.price)}</b></td><td><span class="pill ${x.availability}">${x.availability === 'low' ? 'Almost sold out' : x.availability.replace('_', ' ')}</span></td><td><div class="row-actions"><button class="icon" onclick="editItem(${x.id})" aria-label="Edit ${esc(x.name)}">Edit</button><button class="icon danger" onclick="deleteItem(${x.id})" aria-label="Delete ${esc(x.name)}">Delete</button></div></td></tr>`;
  }).join('');
}

$("#menuAdminSearch").addEventListener('input', renderMenuAdmin);

function setPreview(url){
  const img=$("#imgPreviewTag"), span=$("#imgPreview span");
  if(url){ img.src=url; img.style.display="block"; span.style.display="none"; }
  else { img.style.display="none"; span.style.display="block"; }
}
function openItem(item = null) {
  $("#itemModal").classList.add('show');
  $("#itemModalTitle").textContent = item ? 'Edit menu item' : 'Add menu item';
  $("#itemId").value = item?.id || '';
  $("#itemName").value = item?.name || '';
  $("#itemCategory").value = item?.category || '';
  $("#itemPrice").value = item?.price ?? '';
  $("#itemAvailability").value = item?.availability || 'available';
  if ($("#itemIsBestseller")) $("#itemIsBestseller").value = item?.is_bestseller ? "1" : "0";
  $("#itemImage").value = item?.image || '';
  $("#itemDescription").value = item?.description || '';
  $("#itemImageFile").value=""; setPreview(item?.image||"");

  const submitBtn = $("#itemForm")?.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = item ? "Save changes" : "Save item";
  }

  setTimeout(() => $("#itemName").focus(), 80);
}
$("#itemImage").addEventListener("input",e=>setPreview(e.target.value.trim()));
$("#itemImageFile").addEventListener("change",async e=>{
  const f=e.target.files[0]; if(!f) return;
  const fd=new FormData(); fd.append("file",f);
  try{ const r=await fetch("/api/admin/upload",{method:"POST",body:fd}); const d=await r.json();
    if(!r.ok) throw new Error(d.error); $("#itemImage").value=d.url; setPreview(d.url); toast("Image uploaded");
  }catch(err){ toast(err.message); }
});

$("#addItemBtn").addEventListener('click', () => openItem());
$("#closeItemModal").addEventListener('click', () => $("#itemModal").classList.remove('show'));
$("#itemModal").addEventListener('click', e => { if (e.target.id === 'itemModal') e.currentTarget.classList.remove('show'); });

window.editItem = id => openItem(menuItems.find(x => x.id === id));

window.deleteItem = async id => {
  const item = menuItems.find(x => x.id === id);
  if (!confirm(`Delete ${item?.name || 'this item'}? This action cannot be undone.`)) return;

  // Optimistic delete
  menuItems = menuItems.filter(x => x.id !== id);
  renderMenuAdmin();
  toast('Item deleted');

  try {
    await api(`/api/admin/menu/${id}`, { method: 'DELETE' });
    loadDashboard();
  } catch (err) {
    toast(err.message);
    await loadMenu();
  }
};

$("#itemForm").addEventListener('submit', async e => {
  e.preventDefault();
  const id = $("#itemId").value;
  const payload = {
    name: $("#itemName").value,
    category: $("#itemCategory").value,
    price: Number($("#itemPrice").value),
    availability: $("#itemAvailability").value,
    is_bestseller: $("#itemIsBestseller") ? Number($("#itemIsBestseller").value) : 0,
    image: $("#itemImage").value.trim(),
    description: $("#itemDescription").value
  };

  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";
  }

  // Instant UI feedback: close modal and update local list immediately
  $("#itemModal").classList.remove('show');
  toast(id ? 'Item updated' : 'Item added');

  if (id) {
    const idx = menuItems.findIndex(x => x.id == id);
    if (idx !== -1) {
      menuItems[idx] = { ...menuItems[idx], ...payload };
      renderMenuAdmin();
    }
  }

  try {
    if (id) await api(`/api/admin/menu/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    else await api('/api/admin/menu', { method: 'POST', body: JSON.stringify(payload) });

    await loadMenu();
    loadDashboard();
  } catch (err) {
    toast(err.message);
    await loadMenu();
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = id ? "Save changes" : "Save item";
    }
  }
});

function playNotificationSound() {
  if (localStorage.getItem("qissaSound") === "off") return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    
    // Pleasant dual-tone bell chime
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.28, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.6);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.12); // A5
    gain2.gain.setValueAtTime(0.32, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.9);
  } catch (e) {}
}

const soundBtn = $("#soundToggleBtn");
if (soundBtn) {
  const isOff = localStorage.getItem("qissaSound") === "off";
  soundBtn.textContent = isOff ? "🔕 Sound: OFF" : "🔔 Sound: ON";
  soundBtn.addEventListener("click", () => {
    const curr = localStorage.getItem("qissaSound") === "off";
    if (curr) {
      localStorage.setItem("qissaSound", "on");
      soundBtn.textContent = "🔔 Sound: ON";
      playNotificationSound();
    } else {
      localStorage.setItem("qissaSound", "off");
      soundBtn.textContent = "🔕 Sound: OFF";
    }
  });
}

let currentDateFilter = "today";
let currentStatusFilter = "";
let orderSearchQuery = "";
let lastLoadedStats = null;

function initDateFilters() {
  $$("#dateFilterPills .date-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      $$("#dateFilterPills .date-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      if ($("#orderDatePicker")) $("#orderDatePicker").value = "";
      currentDateFilter = pill.dataset.date;
      loadOrders();
    });
  });

  const picker = $("#orderDatePicker");
  if (picker) {
    picker.addEventListener("change", (e) => {
      const selected = e.target.value;
      if (selected) {
        $$("#dateFilterPills .date-pill").forEach(p => p.classList.remove("active"));
        currentDateFilter = selected;
        loadOrders();
      }
    });
  }
}

$$("#orderStatusTabs .tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    $$("#orderStatusTabs .tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentStatusFilter = btn.dataset.status;
    loadOrders();
  });
});

$("#orderSearch")?.addEventListener("input", e => {
  orderSearchQuery = e.target.value.trim().toLowerCase();
  renderOrders();
});

function renderDateStatsStrip() {
  const strip = $("#dateStatsStrip");
  if (!strip) return;
  const s = lastLoadedStats;
  if (!s) {
    strip.innerHTML = "";
    return;
  }
  let dateLabel = "Today (Live 24h)";
  if (currentDateFilter === "yesterday") dateLabel = "Yesterday";
  else if (currentDateFilter === "7days") dateLabel = "Last 7 Days";
  else if (currentDateFilter === "all") dateLabel = "All-Time History";
  else if (currentDateFilter !== "today") dateLabel = currentDateFilter;

  strip.innerHTML = `
    <div>
      <strong>📅 ${esc(dateLabel)}:</strong> 
      <span>${s.total_orders} orders (<b style="color:var(--g)">${money(s.total_revenue)}</b>)</span>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <span class="date-stat-chip">🟡 ${s.count_new} New</span>
      <span class="date-stat-chip">👨‍🍳 ${s.count_preparing} Kitchen</span>
      <span class="date-stat-chip">🔔 ${s.count_ready} Ready</span>
      <span class="date-stat-chip">✅ ${s.count_completed} Completed</span>
      <span class="date-stat-chip">🍽️ ${s.count_dine_in} Dine-in</span>
      <span class="date-stat-chip">🛵 ${s.count_delivery} Delivery</span>
    </div>
  `;
}

async function loadOrders() {
  try {
    const url = `/api/admin/orders?date=${encodeURIComponent(currentDateFilter)}${currentStatusFilter ? `&status=${encodeURIComponent(currentStatusFilter)}` : ''}`;
    const d = await api(url);
    const newOrders = d.orders || [];
    lastLoadedStats = d.stats || null;
    
    if (newOrders.length > 0) {
      const maxId = Math.max(...newOrders.map(o => o.id || 0));
      if (lastKnownMaxOrderId > 0 && maxId > lastKnownMaxOrderId) {
        const freshArrivals = newOrders.filter(o => o.id > lastKnownMaxOrderId);
        if (freshArrivals.some(o => o.status === 'new')) {
          playNotificationSound();
          toast(`🔔 ${freshArrivals.length} new incoming order(s)!`);
        }
      }
      lastKnownMaxOrderId = Math.max(lastKnownMaxOrderId, maxId);
    }

    orders = newOrders;
    renderDateStatsStrip();
    renderOrders();
    const fresh = (lastLoadedStats && lastLoadedStats.count_new) || orders.filter(x => x.status === 'new').length;
    if ($("#newBadge")) $("#newBadge").textContent = fresh || '';
    if ($("#countNew")) $("#countNew").textContent = fresh || '0';
  } catch (err) {
    console.error("Orders load error:", err);
  }
}

function renderOrders() {
  const el = $("#ordersGrid");
  let list = orders;
  if (currentStatusFilter) {
    list = list.filter(o => o.status === currentStatusFilter);
  }
  if (orderSearchQuery) {
    list = list.filter(o =>
      (o.order_code || "").toLowerCase().includes(orderSearchQuery) ||
      (o.customer_name || "").toLowerCase().includes(orderSearchQuery) ||
      (o.phone || "").toLowerCase().includes(orderSearchQuery) ||
      (o.table_number || "").toLowerCase().includes(orderSearchQuery) ||
      (o.delivery_address || "").toLowerCase().includes(orderSearchQuery)
    );
  }

  const fresh = orders.filter(x => x.status === 'new').length;
  if ($("#newBadge")) $("#newBadge").textContent = fresh || '';
  if ($("#countNew")) $("#countNew").textContent = fresh;

  el.innerHTML = list.length ? list.map(o => {
    let typeLabel = esc(o.order_type);
    if (o.order_type === 'Dine-in' && o.table_number) {
      typeLabel = `🍽️ Table ${esc(o.table_number)}`;
    } else if (o.order_type === 'Delivery') {
      typeLabel = `🛵 Delivery`;
    }

    const cleanPhone = String(o.phone || "").replace(/\D/g, "");
    const waText = encodeURIComponent(`Hi ${o.customer_name}, regarding your Qissa Cafe order #${o.order_code} (Status: ${o.status.toUpperCase()})...`);
    const waLink = `https://wa.me/${cleanPhone.startsWith('91') ? cleanPhone : '91' + cleanPhone}?text=${waText}`;

    // Quick progressive action buttons
    let actionBtn = "";
    if (o.status === "new") {
      actionBtn = `
        <button class="primary quick-action-btn" onclick="updateOrderStatus(${o.id},'confirmed')">✅ Accept</button>
        <button class="icon danger" title="Cancel Order" onclick="updateOrderStatus(${o.id},'cancelled')">❌</button>
      `;
    } else if (o.status === "confirmed") {
      actionBtn = `
        <button class="primary quick-action-btn" style="background:#d4841d" onclick="updateOrderStatus(${o.id},'preparing')">👨‍🍳 Kitchen</button>
      `;
    } else if (o.status === "preparing") {
      actionBtn = `
        <button class="primary quick-action-btn" style="background:#2c6860" onclick="updateOrderStatus(${o.id},'ready')">🔔 Ready</button>
      `;
    } else if (o.status === "ready") {
      actionBtn = `
        <button class="primary quick-action-btn" style="background:#35603a" onclick="updateOrderStatus(${o.id},'completed')">🎉 Complete</button>
      `;
    }

    return `<article class="order-card">
      <div class="order-top">
        <div>
          <div style="display:flex;align-items:center;gap:8px">
            <h3 style="font-size:1.4rem">${esc(o.order_code)}</h3>
            <span style="background:rgba(58,99,57,0.12);color:var(--g);font-weight:800;font-size:.75rem;padding:3px 9px;border-radius:8px">${typeLabel}</span>
          </div>
          <div class="order-meta">
            <b>${esc(o.customer_name)}</b> · <a href="tel:${esc(o.phone)}" style="color:inherit;text-decoration:underline">${esc(o.phone)}</a><br>
            <small>${new Date(o.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} · ${new Date(o.created_at).toLocaleDateString()}</small>
            ${o.delivery_address ? `<div style="margin-top:4px;color:#787f69;font-size:.8rem">📍 ${esc(o.delivery_address)}</div>` : ''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <span class="pill ${o.status}">${esc(o.status)}</span>
          <div style="display:flex;gap:4px">
            <a href="${waLink}" target="_blank" rel="noopener" class="icon" title="Chat on WhatsApp" style="text-decoration:none;font-size:.85rem">💬</a>
            <a href="tel:${esc(o.phone)}" class="icon" title="Call Customer" style="text-decoration:none;font-size:.85rem">📞</a>
          </div>
        </div>
      </div>
      <div class="order-items">${o.items.map(i => `<div class="order-line"><span>${esc(i.item_name)} × ${i.qty}</span><b>${money(i.line_total)}</b></div>`).join('')}</div>
      ${o.notes ? `<div class="note"><b>Note:</b> ${esc(o.notes)}</div>` : ''}
      <div class="order-bottom" style="flex-wrap:wrap;gap:10px">
        <strong>${money(o.total)}</strong>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          ${actionBtn}
          <button class="soft" onclick="printKOT(${o.id})" title="Print Kitchen Order Ticket" style="padding:7px 10px;font-size:.78rem">👨‍🍳 KOT</button>
          <button class="soft" onclick="printReceipt(${o.id})" title="Print Customer Bill" style="padding:7px 10px;font-size:.78rem">🧾 Bill</button>
          <select onchange="updateOrderStatus(${o.id},this.value)" aria-label="Update order status" style="font-size:.75rem;padding:6px 8px">
            ${['new', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'].map(s => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
          </select>
        </div>
      </div>
    </article>`;
  }).join('') :
  `<div class="panel" style="padding:34px;text-align:center;color:#6B6F5D">No orders in this view.</div>`;
}

window.printKOT = function(id) {
  const order = orders.find(x => x.id === id);
  if (!order) return;

  const typeDetails = order.order_type === 'Dine-in' && order.table_number
    ? `DINE-IN — TABLE ${esc(order.table_number)}`
    : (order.order_type === 'Delivery' ? `HOME DELIVERY` : 'TAKEAWAY');

  const printDoc = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>KOT ${esc(order.order_code)}</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        body {
          font-family: 'Courier New', Courier, monospace;
          font-size: 14px;
          font-weight: bold;
          line-height: 1.4;
          width: 72mm;
          margin: 4mm auto;
          color: #000;
          background: #fff;
        }
        .center { text-align: center; }
        .divider { border-top: 2px dashed #000; margin: 8px 0; }
        .title { font-size: 18px; font-weight: 900; }
        .big-type { font-size: 16px; background: #000; color: #fff; padding: 4px; margin: 4px 0; text-align: center; font-weight: 900; }
        .items { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 15px; }
        .items td { padding: 5px 0; }
        .qty { width: 25%; font-size: 20px; }
        .note-box { font-size: 13px; margin-top: 6px; padding: 6px; border: 1px solid #000; }
      </style>
    </head>
    <body>
      <div class="center">
        <div class="title">*** KITCHEN ORDER TICKET ***</div>
        <div>QISSA RESTO CAFE</div>
      </div>
      <div class="divider"></div>
      <div class="big-type">${typeDetails}</div>
      <div>KOT: <b>${esc(order.order_code)}</b></div>
      <div>Time: ${new Date(order.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
      <div class="divider"></div>
      <table class="items">
        <tbody>
          ${order.items.map(i => `<tr><td class="qty">${i.qty}x</td><td>${esc(i.item_name)}</td></tr>`).join('')}
        </tbody>
      </table>
      ${order.notes ? `<div class="note-box">NOTES: ${esc(order.notes)}</div>` : ''}
      <div class="divider"></div>
      <div class="center" style="font-size:11px">${new Date().toLocaleString()}</div>
    </body>
    </html>
  `;

  const frame = document.getElementById('receiptPrinterFrame');
  if (frame) {
    frame.srcdoc = printDoc;
    frame.onload = () => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    };
  }
};

window.printReceipt = function(id) {
  const order = orders.find(x => x.id === id);
  if (!order) return;

  const typeDetails = order.order_type === 'Dine-in' && order.table_number
    ? `DINE-IN (TABLE: ${esc(order.table_number)})`
    : order.order_type === 'Delivery' && order.delivery_address
    ? `HOME DELIVERY\nAddress: ${esc(order.delivery_address)}`
    : esc(order.order_type).toUpperCase();

  const printDoc = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Receipt ${esc(order.order_code)}</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        body {
          font-family: 'Courier New', Courier, monospace;
          font-size: 13px;
          line-height: 1.35;
          width: 72mm;
          margin: 4mm auto;
          color: #000;
          background: #fff;
        }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .divider { border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; }
        .title { font-size: 16px; margin-bottom: 2px; font-weight: bold; }
        .items { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 12px; }
        .items th, .items td { text-align: left; padding: 3px 0; }
        .items td.right, .items th.right { text-align: right; }
        .total-row { font-size: 15px; font-weight: bold; margin-top: 4px; }
        .note-box { font-style: italic; margin-top: 4px; font-size: 11px; }
        .footer { font-size: 11px; margin-top: 10px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="center">
        <div class="title">QISSA RESTO CAFE</div>
        <div>Every Bite Has a Story</div>
      </div>
      <div class="divider"></div>
      <div class="row"><span>Order: <b>${esc(order.order_code)}</b></span><span>${new Date(order.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div>
      <div>Date: ${new Date(order.created_at).toLocaleDateString()}</div>
      <div>Customer: <b>${esc(order.customer_name)}</b></div>
      <div>Phone: ${esc(order.phone)}</div>
      <div class="bold" style="margin-top:2px;">${typeDetails.replace(/\\n/g, '<br>')}</div>
      <div class="divider"></div>
      <table class="items">
        <thead>
          <tr><th style="width:15%">QTY</th><th style="width:55%">ITEM</th><th class="right" style="width:30%">PRICE</th></tr>
        </thead>
        <tbody>
          ${order.items.map(i => `<tr><td>${i.qty}x</td><td>${esc(i.item_name)}</td><td class="right">₹${i.line_total}</td></tr>`).join('')}
        </tbody>
      </table>
      <div class="divider"></div>
      <div class="row total-row">
        <span>TOTAL:</span>
        <span>${money(order.total)}</span>
      </div>
      ${order.notes ? `<div class="divider"></div><div class="note-box"><b>Notes:</b> ${esc(order.notes)}</div>` : ''}
      <div class="divider"></div>
      <div class="footer">
        *** Thank you! Visit Again ***<br>
        WhatsApp: +91 96457 00585
      </div>
    </body>
    </html>
  `;

  const frame = document.getElementById('receiptPrinterFrame');
  if (frame) {
    frame.srcdoc = printDoc;
    frame.onload = () => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    };
  }
};

window.updateOrderStatus = async (id, status) => {
  try {
    await api(`/api/admin/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    toast('Order status updated');
    await loadOrders();
    await loadDashboard();
  } catch (err) {
    toast(err.message);
  }
};

$("#refreshOrders")?.addEventListener('click', loadOrders);

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if ($("#itemModal").classList.contains('show')) {
      $("#itemModal").classList.remove('show');
    }
  }
});

// Visibility change handling - pause refresh when tab not visible
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopAutoRefresh();
  } else {
    startAutoRefresh();
    const currentView = [...$$('.nav-btn')].find(x => x.classList.contains('active'))?.dataset.view;
    if (currentView === 'dashboard' || currentView === 'orders') {
      loadDashboard();
      if (currentView === 'orders') loadOrders();
    }
  }
});

boot();

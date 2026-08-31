// ============================================================
// QISSA CAFE — LIVE CUSTOMER APP
// Menu, availability, cafe status and orders now come from Flask.
// Enhanced with security, accessibility, and UX improvements
// ============================================================

// Configuration constants
const FALLBACK_WHATSAPP = "919645700585";
const CART_EXPIRY_HOURS = 24;
const API_TIMEOUT_MS = 30000;
const SEARCH_DEBOUNCE_MS = 300;
const ORDER_SUBMISSION_TIMEOUT_MS = 30000;

const CATEGORY_ORDER = ["Shawarma", "Broast", "Burger", "Sandwich", "Fried", "Classic Shake", "Falooda", "Mojito", "Soda", "Lemon Juice", "Hot"];

const CATEGORY_ICONS = {
  "Shawarma": "🌯", "Broast": "🍗", "Burger": "🍔", "Sandwich": "🥪",
  "Fried": "🍟", "Classic Shake": "🥤", "Falooda": "🍨", "Mojito": "🍹",
  "Soda": "🧃", "Lemon Juice": "🍋", "Hot": "☕"
};

let menu = [];
const state = {
  category: "All",
  dietFilter: "all",
  query: "",
  cart: loadCartFromStorage(),
  cafeOpen: true,
  settings: { whatsapp: FALLBACK_WHATSAPP, address: "Qissa Resto Cafe, Nilambur Road, Kerala", opening_hours: "12:00 PM – 11:30 PM" },
  isOnline: navigator.onLine
};

// DOM element caching
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const menuGrid = $("#menuGrid");
const categoryFilters = $("#categoryFilters");
const cartDrawer = $("#cartDrawer");
const cartItems = $("#cartItems");
const cartCount = $("#cartCount");
const cartSubtotal = $("#cartSubtotal");
const backdrop = $("#backdrop");
const checkoutModal = $("#checkoutModal");
const checkoutSummary = $("#checkoutSummary");
const toast = $("#toast");
const toastText = $("#toastText");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Utility functions
function money(n) { return `₹${Number(n)}`; }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}

// Cart storage with expiry
function loadCartFromStorage() {
  try {
    const stored = localStorage.getItem("qissaCart");
    if (!stored) return [];
    const { cart, timestamp } = JSON.parse(stored);
    const ageHours = (Date.now() - timestamp) / (1000 * 60 * 60);
    if (ageHours > CART_EXPIRY_HOURS) {
      localStorage.removeItem("qissaCart");
      return [];
    }
    return cart || [];
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem("qissaCart", JSON.stringify({
    cart: state.cart,
    timestamp: Date.now()
  }));
}

function categories() {
  const menuCats = [...new Set(menu.map(item => item.category))];
  const ordered = CATEGORY_ORDER.filter(cat => menuCats.includes(cat));
  const remaining = menuCats.filter(cat => !CATEGORY_ORDER.includes(cat));
  return ["All", ...ordered, ...remaining];
}

// API with timeout and better error handling
async function api(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || API_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      signal: controller.signal,
      ...options
    });
    clearTimeout(timeout);

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    return data;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error("Request timed out. Please check your connection.");
    }
    throw err;
  }
}

async function loadStore() {
  menuGrid.innerHTML = `<div class="cart-empty" style="grid-column:1/-1"><div><span class="no-results-icon">⌛</span><h3>Loading Qissa menu...</h3></div></div>`;
  try {
    const [menuData, storeData] = await Promise.all([api("/api/menu"), api("/api/status")]);
    menu = menuData.items;
    state.cafeOpen = storeData.cafe_open;
    state.settings = storeData.settings;
    syncCartWithMenu();
    applyStoreStatus();
    renderCategories();
    initDietFilters();
    renderMenu();
    renderCart();
  } catch (err) {
    const offlineMsg = !state.isOnline ? "<p>You appear to be offline. Please check your internet connection.</p>" : "";
    menuGrid.innerHTML = `<div class="cart-empty" style="grid-column:1/-1"><div><span class="no-results-icon">⚠️</span><h3>Could not load the menu</h3>${offlineMsg}<p>${escapeHtml(err.message)}</p><button class="secondary-btn" onclick="location.reload()">Retry</button></div></div>`;
    $("#shopStatus").textContent = "TEMPORARILY UNAVAILABLE";
  }
}

function syncCartWithMenu() {
  const byId = new Map(menu.map(x => [x.id, x]));
  const originalLength = state.cart.length;
  state.cart = state.cart
    .filter(x => byId.has(x.id))
    .map(x => ({ ...x, name: byId.get(x.id).name, price: byId.get(x.id).price }));

  if (state.cart.length < originalLength) {
    showToast("Some items in your cart are no longer available", "ℹ️");
  }
  saveCart();
}

function applyStoreStatus() {
  const status = $("#shopStatus");
  const dot = $(".status-dot");
  status.textContent = state.cafeOpen ? "OPEN FOR ORDERS" : "CLOSED FOR ORDERS";
  document.body.classList.toggle("shop-closed", !state.cafeOpen);
  if (dot) dot.classList.toggle("closed", !state.cafeOpen);
  if ($("#visitAddress")) $("#visitAddress").textContent = state.settings.address || "Qissa Resto Cafe, Nilambur Road, Kerala";
  if ($("#visitHours")) $("#visitHours").textContent = state.settings.opening_hours || "12:00 PM – 11:30 PM";
  if ($("#visitWhatsapp")) $("#visitWhatsapp").textContent = formatWhatsapp(state.settings.whatsapp || FALLBACK_WHATSAPP);
  if ($("#visitMapFrame") && state.settings.map_embed_url) $("#visitMapFrame").src = state.settings.map_embed_url;
  if ($("#visitDirectionsBtn") && state.settings.maps_directions_url) $("#visitDirectionsBtn").href = state.settings.maps_directions_url;
}

function formatWhatsapp(num) {
  const clean = String(num || "").replace(/\D/g, "");
  if (clean.startsWith("91") && clean.length === 12) return `+91 ${clean.slice(2,7)} ${clean.slice(7)}`;
  return clean;
}

function renderCategories() {
  categoryFilters.innerHTML = categories().map(cat => `
    <button class="category-btn ${state.category === cat ? "active" : ""}" data-category="${escapeHtml(cat)}" aria-pressed="${state.category === cat}">${escapeHtml(cat)}</button>
  `).join("");
  $$(".category-btn").forEach(btn => btn.addEventListener("click", () => {
    state.category = btn.dataset.category;
    renderCategories(); renderMenu();
  }));
}

function initDietFilters() {
  $$(".diet-btn").forEach(btn => {
    btn.onclick = () => {
      state.dietFilter = btn.dataset.diet;
      $$(".diet-btn").forEach(b => b.classList.toggle("active", b.dataset.diet === state.dietFilter));
      renderMenu();
    };
  });
}

function filteredMenu() {
  return menu.filter(item => {
    const catMatch = state.category === "All" || item.category === state.category;
    const q = state.query.trim().toLowerCase();
    const searchMatch = !q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
    let dietMatch = true;
    if (state.dietFilter === "bestseller") dietMatch = Boolean(item.is_bestseller);
    return catMatch && searchMatch && dietMatch;
  });
}

function availabilityMeta(item) {
  if (item.availability === "sold_out") return { label: "SOLD OUT", cls: "sold", disabled: true };
  if (item.availability === "low") return { label: "ALMOST SOLD OUT", cls: "low", disabled: false };
  return { label: "AVAILABLE", cls: "", disabled: false };
}

function renderMenu() {
  const items = filteredMenu();
  if (!items.length) {
    menuGrid.innerHTML = `<div class="cart-empty" style="grid-column:1/-1"><div><span class="no-results-icon">🔎</span><h3>No menu items found</h3><p>Try a different category or search.</p></div></div>`;
    return;
  }
  menuGrid.innerHTML = items.map((item, i) => {
    const a = availabilityMeta(item);
    const disabled = a.disabled || !state.cafeOpen;
    const inCart = state.cart.find(x => x.id === item.id);
    
    const actionBtn = (inCart && inCart.qty > 0 && !disabled)
      ? `<div class="card-qty-ctrl">
           <button class="qty-btn dec-btn" onclick="changeQty(${item.id}, -1)" aria-label="Decrease quantity">−</button>
           <span class="card-qty-num">${inCart.qty}</span>
           <button class="qty-btn inc-btn" onclick="changeQty(${item.id}, 1)" aria-label="Increase quantity">+</button>
         </div>`
      : `<button class="add-btn" data-id="${item.id}" ${disabled ? "disabled" : ""} aria-label="Add ${escapeHtml(item.name)} to cart">+</button>`;

    return `
      <article class="menu-card card-in ${a.disabled ? "soldout" : ""} ${a.cls === "low" ? "low-stock" : ""}" style="animation-delay:${reduceMotion ? 0 : (i % 12) * 45}ms">
        <div>
          ${item.image ? `<img class="menu-thumb" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.style.display='none'">` : `<div class="icon-wrap"><span class="menu-icon">${CATEGORY_ICONS[item.category]||"🍽️"}</span></div>`}
          ${item.is_bestseller ? `<div class="card-badges"><span class="bestseller-chip">⭐ Bestseller</span></div>` : ''}
          <div class="menu-card-top">
            <span class="item-category">${escapeHtml(item.category)}</span>
            <span class="availability ${a.cls}">${!state.cafeOpen ? "CAFE CLOSED" : a.label}</span>
          </div>
          <h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description || "")}</p>
        </div>
        <div class="menu-card-bottom">
          <span class="price">${money(item.price)}</span>
          ${actionBtn}
        </div>
      </article>`;
  }).join("");
  $$(".add-btn").forEach(btn => btn.addEventListener("click", () => addToCart(Number(btn.dataset.id), btn)));
}

function addToCart(id, btnEl) {
  const item = menu.find(x => x.id === id);
  if (!item || !state.cafeOpen || item.availability === "sold_out") return;
  const existing = state.cart.find(x => x.id === id);
  if (existing) existing.qty += 1;
  else state.cart.push({ id: item.id, name: item.name, price: item.price, qty: 1 });
  saveCart(); renderCart(); updateMobileBar(); renderMenu(); showToast(`${item.name} added`);
  if (btnEl && !reduceMotion) {
    btnEl.classList.remove("just-added"); void btnEl.offsetWidth; btnEl.classList.add("just-added");
    setTimeout(() => btnEl.classList.remove("just-added"), 450);
  }
}

function changeQty(id, delta) {
  const item = state.cart.find(x => x.id === id); if (!item) return;
  item.qty += delta; if (item.qty <= 0) state.cart = state.cart.filter(x => x.id !== id);
  saveCart(); renderCart(); updateMobileBar(); renderMenu();
}

function removeItem(id) {
  state.cart = state.cart.filter(x => x.id !== id);
  saveCart(); renderCart(); updateMobileBar(); renderMenu();
}

function cartTotal() { return state.cart.reduce((sum, x) => sum + x.price * x.qty, 0); }
function cartQuantity() { return state.cart.reduce((sum, x) => sum + x.qty, 0); }

let currentPage = "home";

function updateMobileBar() {
  const b = document.getElementById("mobileCartBar"),
        tx = document.getElementById("mobileCartText"),
        tt = document.getElementById("mobileCartTotal");
  if (!b) return;
  const n = cartQuantity();
  const isMenuPage = currentPage === "menu" || document.getElementById("page-menu")?.classList.contains("active");
  if (n > 0 && isMenuPage) {
    b.style.display = "flex";
    if (tx) tx.textContent = n + " item" + (n > 1 ? "s" : "");
    if (tt) tt.textContent = money(cartTotal());
  } else {
    b.style.display = "none";
  }
}
document.getElementById("mobileCartBtn")?.addEventListener("click",openCart);
function renderCart() {
  const newCount = cartQuantity();
  const countChanged = cartCount.textContent !== String(newCount);
  cartCount.textContent = newCount; cartSubtotal.textContent = money(cartTotal());
  if (countChanged && !reduceMotion) { cartCount.classList.remove("bump"); void cartCount.offsetWidth; cartCount.classList.add("bump"); }
  if (!state.cart.length) {
    cartItems.innerHTML = `<div class="cart-empty"><div><span class="empty-icon">🛒</span><h3>Your cart is empty</h3><p>Add something delicious from the menu.</p></div></div>`;
    return;
  }
  updateMobileBar();
  cartItems.innerHTML = state.cart.map((item, i) => `
    <div class="cart-line" style="animation-delay:${reduceMotion ? 0 : i * 45}ms">
      <div><h4>${escapeHtml(item.name)}</h4><small>${money(item.price)} each</small>
        <div class="qty" role="group" aria-label="Quantity controls">
          <button onclick="changeQty(${item.id}, -1)" aria-label="Decrease quantity">−</button>
          <strong aria-live="polite">${item.qty}</strong>
          <button onclick="changeQty(${item.id}, 1)" aria-label="Increase quantity">+</button>
        </div>
        <button class="remove-btn" onclick="removeItem(${item.id})" aria-label="Remove ${escapeHtml(item.name)}">Remove</button>
      </div><strong>${money(item.price * item.qty)}</strong>
    </div>`).join("");
}

function openCart() {
  cartDrawer.classList.add("open");
  backdrop.classList.add("show");
  document.body.classList.add("no-scroll");

  // Set focus and trap keyboard
  setTimeout(() => {
    const closeBtn = $("#closeCart");
    if (closeBtn) closeBtn.focus();
  }, 100);
}

function closeOverlays() {
  cartDrawer.classList.remove("open");
  checkoutModal.classList.remove("show");
  if ($("#orderTrackingModal")) $("#orderTrackingModal").classList.remove("show");
  if (trackingPollTimer) {
    clearInterval(trackingPollTimer);
    trackingPollTimer = null;
  }
  backdrop.classList.remove("show");
  document.body.classList.remove("no-scroll");
}

// Validate cart items before checkout
async function validateCartBeforeCheckout() {
  if (!state.cafeOpen) {
    showToast("Qissa is currently closed for orders", "!");
    return false;
  }
  if (!state.cart.length) {
    showToast("Your cart is empty", "!");
    return false;
  }

  // Refresh menu to check current availability
  try {
    const menuData = await api("/api/menu");
    const byId = new Map(menuData.items.map(x => [x.id, x]));

    for (const cartItem of state.cart) {
      const menuItem = byId.get(cartItem.id);
      if (!menuItem) {
        showToast(`${cartItem.name} is no longer available`, "!");
        state.cart = state.cart.filter(x => x.id !== cartItem.id);
        saveCart(); renderCart(); updateMobileBar();
        return false;
      }
      if (menuItem.availability === "sold_out") {
        showToast(`${cartItem.name} is now sold out`, "!");
        state.cart = state.cart.filter(x => x.id !== cartItem.id);
        saveCart(); renderCart(); updateMobileBar();
        return false;
      }
      // Update price if changed
      if (cartItem.price !== menuItem.price) {
        cartItem.price = menuItem.price;
      }
    }
    saveCart(); renderCart(); updateMobileBar();
    return true;
  } catch (err) {
    showToast("Could not verify cart. Please try again.", "!");
    return false;
  }
}

async function openCheckout() {
  if (!await validateCartBeforeCheckout()) return;
  cartDrawer.classList.remove("open");
  renderCheckoutSummary();
  checkoutModal.classList.add("show");
  backdrop.classList.add("show");

  // Focus first input
  setTimeout(() => {
    const nameInput = $("#customerName");
    if (nameInput) nameInput.focus();
  }, 100);
}

function renderCheckoutSummary() {
  checkoutSummary.innerHTML = `${state.cart.map(item => `<div class="row"><span>${escapeHtml(item.name)} × ${item.qty}</span><strong>${money(item.price * item.qty)}</strong></div>`).join("")}<div class="row total"><span>Total</span><strong>${money(cartTotal())}</strong></div>`;
}

function showToast(message, icon = "✓") {
  toastText.textContent = message;
  $("#toastIcon").textContent = icon;
  toast.classList.add("show");
  toast.setAttribute("role", "alert");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

// Phone validation for Indian mobile numbers
function validatePhone(phone) {
  const cleaned = phone.replace(/\D/g, "");
  // Indian mobile: 10 digits starting with 6-9, or 12 digits with country code 91
  if (/^[6-9]\d{9}$/.test(cleaned)) return true;
  if (/^91[6-9]\d{9}$/.test(cleaned)) return true;
  return false;
}

// Debounced search
let searchTimeout;
function debouncedSearch(value) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    state.query = value;
    renderMenu();
  }, SEARCH_DEBOUNCE_MS);
}

// Event listeners
$("#cartBtn").addEventListener("click", openCart);
$("#closeCart").addEventListener("click", closeOverlays);
$("#closeCheckout").addEventListener("click", closeOverlays);
$("#checkoutBtn").addEventListener("click", openCheckout);
backdrop.addEventListener("click", closeOverlays);
$("#menuSearch").addEventListener("input", e => debouncedSearch(e.target.value));


// Keyboard accessibility for modals
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (checkoutModal.classList.contains("show") || cartDrawer.classList.contains("open")) {
      closeOverlays();
    }
  }
});

// Dynamic Order Type toggling
$("#orderType")?.addEventListener("change", (e) => {
  const val = e.target.value;
  const tableGrp = $("#tableGroup");
  const deliveryGrp = $("#deliveryGroup");
  if (tableGrp) tableGrp.style.display = val === "Dine-in" ? "block" : "none";
  if (deliveryGrp) deliveryGrp.style.display = val === "Delivery" ? "block" : "none";
  if (val === "Dine-in") setTimeout(() => $("#tableNumber")?.focus(), 100);
  if (val === "Delivery") setTimeout(() => $("#deliveryAddress")?.focus(), 100);
});

// Order submission with validation and live tracking
let trackingPollTimer = null;
let activeTrackingOrderCode = "";

const STATUS_TITLES = {
  "new": { title: "Order Received", subtitle: "Your order is saved at the cafe counter. Awaiting confirmation.", step: 1 },
  "confirmed": { title: "Order Confirmed", subtitle: "Order accepted by cafe! Preparing ingredients.", step: 2 },
  "preparing": { title: "In Kitchen", subtitle: "Chef is cooking your dishes hot and fresh!", step: 3 },
  "ready": { title: "Order Ready!", subtitle: "Your order is packed & ready for pickup / on the way!", step: 4 },
  "completed": { title: "Order Completed", subtitle: "Thank you for dining with Qissa Cafe. Enjoy your meal!", step: 5 },
  "cancelled": { title: "Order Cancelled", subtitle: "This order was cancelled by the cafe.", step: 0 }
};

function updateTrackingStepper(status) {
  const info = STATUS_TITLES[status] || STATUS_TITLES["new"];
  const currentStep = info.step;

  const subEl = $("#trackingSubtitle");
  const liveEl = $("#liveStatusText");
  if (subEl) subEl.textContent = info.subtitle;
  if (liveEl) liveEl.textContent = `${info.title} — ${info.subtitle}`;

  const steps = $$("#orderStepper .step");
  const lines = $$("#orderStepper .step-line");

  steps.forEach((st, idx) => {
    const stepNum = idx + 1;
    st.classList.remove("active", "completed-step");
    const circle = st.querySelector(".step-circle");
    if (stepNum < currentStep) {
      st.classList.add("completed-step");
      if (circle) circle.innerHTML = "✓";
    } else if (stepNum === currentStep) {
      st.classList.add("active");
      if (circle) circle.textContent = stepNum;
    } else {
      if (circle) circle.textContent = stepNum;
    }
  });

  lines.forEach((ln, idx) => {
    ln.classList.toggle("active", idx < currentStep - 1);
  });
}

function openOrderTracking(order) {
  activeTrackingOrderCode = order.order_code || `Q${order.order_id || order.id}`;
  closeOverlays();

  $("#trackingOrderCode").textContent = `#${activeTrackingOrderCode}`;
  updateTrackingStepper(order.status || "new");

  const items = order.items || [];
  let typeDisplay = order.order_type || "Takeaway";
  if (order.order_type === "Dine-in" && order.table_number) {
    typeDisplay = `Dine-in (Table ${order.table_number})`;
  } else if (order.order_type === "Delivery" && order.delivery_address) {
    typeDisplay = `Home Delivery (${order.delivery_address})`;
  }

  $("#trackingDetails").innerHTML = `
    <div class="tracking-row"><span>Order Type</span><strong>${escapeHtml(typeDisplay)}</strong></div>
    <div class="tracking-row"><span>Customer</span><strong>${escapeHtml(order.customer_name || "")} (${escapeHtml(order.phone || "")})</strong></div>
    <div style="margin:10px 0 6px;padding-top:6px;border-top:1px dashed rgba(58,99,57,0.14)">
      ${items.map(it => `
        <div class="tracking-row" style="border:0;padding:2px 0">
          <span>${escapeHtml(it.name || it.item_name)} × ${it.qty}</span>
          <strong>${money(it.line_total || ((it.price || it.unit_price) * it.qty))}</strong>
        </div>
      `).join("")}
    </div>
    <div class="tracking-row" style="font-weight:850;font-size:1.05rem;border-top:1px solid var(--border);padding-top:10px;margin-top:6px">
      <span>Total Amount</span>
      <strong style="color:var(--green)">${money(order.total)}</strong>
    </div>
  `;

  // WhatsApp Message Generator
  const lines = items.map(item => `• ${item.name || item.item_name} x ${item.qty} — ₹${item.line_total || ((item.price || item.unit_price) * item.qty)}`);
  const message = [
    `*NEW QISSA CAFE ORDER*`, ``,
    `Order: ${activeTrackingOrderCode}`,
    `Customer: ${order.customer_name}`,
    `Phone: ${order.phone}`,
    `Order Type: ${typeDisplay}`, ``,
    `*Items*`, ...lines, ``,
    `*Total: ₹${order.total}*`,
    order.notes ? `Notes: ${order.notes}` : ``, ``,
    `Please confirm this order.`
  ].filter(Boolean).join("\n");

  const whatsapp = (state.settings.whatsapp || FALLBACK_WHATSAPP).replace(/\D/g, "");
  $("#trackingWhatsAppBtn").href = `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`;

  $("#orderTrackingModal").classList.add("show");
  backdrop.classList.add("show");
  document.body.classList.add("no-scroll");

  startTrackingPoll(activeTrackingOrderCode);
}

function startTrackingPoll(orderRef) {
  if (trackingPollTimer) clearInterval(trackingPollTimer);
  trackingPollTimer = setInterval(async () => {
    if (!$("#orderTrackingModal").classList.contains("show")) {
      clearInterval(trackingPollTimer);
      return;
    }
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderRef)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.order) {
          updateTrackingStepper(data.order.status);
          if (data.order.status === "completed" || data.order.status === "cancelled") {
            clearInterval(trackingPollTimer);
          }
        }
      }
    } catch (_) {}
  }, 3500);
}

$("#closeOrderTracking")?.addEventListener("click", closeOverlays);
$("#trackingNewOrderBtn")?.addEventListener("click", closeOverlays);

$("#checkoutForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = $("#checkoutForm button[type='submit']");
  const name = $("#customerName").value.trim();
  const phone = $("#customerPhone").value.trim();
  const orderType = $("#orderType").value;
  const tableNumber = $("#tableNumber") ? $("#tableNumber").value.trim() : "";
  const deliveryAddress = $("#deliveryAddress") ? $("#deliveryAddress").value.trim() : "";
  const notes = $("#orderNotes").value.trim();

  if (!name || !phone || !state.cart.length) return;

  if (!validatePhone(phone)) {
    showToast("Please enter a valid 10-digit mobile number", "!");
    $("#customerPhone").focus();
    return;
  }

  if (orderType === "Delivery" && !deliveryAddress) {
    showToast("Please enter your delivery address & landmark", "!");
    $("#deliveryAddress")?.focus();
    return;
  }

  if (!state.cafeOpen) {
    showToast("Qissa is currently closed", "!");
    return;
  }

  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = "Placing order...";

  try {
    const result = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        customer_name: name,
        phone,
        order_type: orderType,
        table_number: tableNumber,
        delivery_address: deliveryAddress,
        notes,
        items: state.cart.map(x => ({ id: x.id, qty: x.qty }))
      }),
      timeout: ORDER_SUBMISSION_TIMEOUT_MS
    });

    // Save customer info for repeat visits
    localStorage.setItem("qissaCustomerName", name);
    localStorage.setItem("qissaCustomerPhone", phone);
    localStorage.setItem("qissaActiveOrder", JSON.stringify(result));

    // Clear cart
    state.cart = [];
    saveCart();
    renderCart();
    renderMenu();
    updateMobileBar();

    $("#checkoutForm").reset();
    const tableGrp = $("#tableGroup");
    const deliveryGrp = $("#deliveryGroup");
    if (tableGrp) tableGrp.style.display = "none";
    if (deliveryGrp) deliveryGrp.style.display = "none";
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;

    showToast("🎉 Order placed successfully!");
    openOrderTracking(result);

  } catch (err) {
    showToast(err.message, "!");
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
    loadStore();
  }
});

// Auto-fill customer info on load
function populateSavedCustomer() {
  const savedName = localStorage.getItem("qissaCustomerName");
  const savedPhone = localStorage.getItem("qissaCustomerPhone");
  if (savedName && $("#customerName")) $("#customerName").value = savedName;
  if (savedPhone && $("#customerPhone")) $("#customerPhone").value = savedPhone;
}
populateSavedCustomer();

// Network status monitoring
window.addEventListener('online', () => {
  state.isOnline = true;
  showToast("Back online", "✓");
  loadStore();
});

window.addEventListener('offline', () => {
  state.isOnline = false;
  showToast("You are offline", "!");
});

// Global functions for inline handlers
window.changeQty = changeQty;
window.removeItem = removeItem;
window.addEventListener("scroll", () => {
  const navWrap = $("#navWrap");
  if (navWrap) navWrap.classList.toggle("scrolled", window.scrollY > 18);
});

// Mobile menu toggle - set up after DOM is ready
setTimeout(() => {
  const mobileMenuToggle = $("#mobileMenuToggle");
  const navLinksEl = $("#navLinks");

  if (mobileMenuToggle && navLinksEl) {
    mobileMenuToggle.addEventListener("click", () => {
      const isExpanded = mobileMenuToggle.getAttribute("aria-expanded") === "true";
      mobileMenuToggle.setAttribute("aria-expanded", !isExpanded);
      navLinksEl.classList.toggle("mobile-open");
      document.body.classList.toggle("menu-open");
    });

    // Close mobile menu when clicking nav links
    $$(".nav-links a").forEach(link => {
      link.addEventListener("click", () => {
        mobileMenuToggle.setAttribute("aria-expanded", "false");
        navLinksEl.classList.remove("mobile-open");
        document.body.classList.remove("menu-open");
      });
    });

    // Close mobile menu on resize to desktop
    window.addEventListener("resize", () => {
      if (window.innerWidth > 768) {
        mobileMenuToggle.setAttribute("aria-expanded", "false");
        navLinksEl.classList.remove("mobile-open");
        document.body.classList.remove("menu-open");
      }
    });
  }
}, 100);

// ===== Premium motion preserved from the Claude version =====
let parallaxTicking = false;
window.addEventListener("mousemove", (e) => {
  const glow = $("#cursorGlow");
  if (glow) {
    glow.style.left = `${e.clientX}px`;
    glow.style.top = `${e.clientY}px`;
  }
  if (reduceMotion || parallaxTicking) return;
  parallaxTicking = true;
  requestAnimationFrame(() => {
    const nx = (e.clientX / window.innerWidth - 0.5), ny = (e.clientY / window.innerHeight - 0.5);
    const logoStage = $(".logo-stage");
    if (logoStage) logoStage.style.transform = `translate(${nx * -14}px, ${ny * -10}px)`;
    parallaxTicking = false;
  });
});

const observer = new IntersectionObserver(
  entries => entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add("visible");
  }),
  { threshold: .13 }
);
$$(".reveal").forEach(el => observer.observe(el));

const canHover = window.matchMedia("(hover: hover)").matches;
if (canHover && !reduceMotion) {
  menuGrid.addEventListener("mousemove", (e) => {
    const card = e.target.closest(".menu-card");
    if (!card) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX-r.left)/r.width-.5;
    const py = (e.clientY-r.top)/r.height-.5;
    card.style.transform = `translateY(-7px) perspective(1000px) rotateX(${py * -8}deg) rotateY(${px * 10}deg)`;
  });
  menuGrid.addEventListener("mouseout", (e) => {
    const card=e.target.closest(".menu-card");
    if (card && !card.contains(e.relatedTarget)) card.style.transform="";
  });
}

// Page routing
function showPage(p) {
  currentPage = p;
  document.querySelectorAll(".page").forEach(s => s.classList.remove("active"));
  const t = document.getElementById("page-" + p);
  if (t) t.classList.add("active");
  document.querySelectorAll(".nav-links a").forEach(a => a.classList.toggle("active", a.dataset.page === p));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (p === "menu") renderMenu();
  updateMobileBar();
}
document.addEventListener("click",e=>{
  const a=e.target.closest("[data-page]");
  if(a){ e.preventDefault(); showPage(a.dataset.page);
    document.getElementById("navLinks")?.classList.remove("mobile-open");
    document.getElementById("mobileMenuToggle")?.setAttribute("aria-expanded","false");
  }
});
$("#searchBtn")?.addEventListener("click",()=>{showPage("menu");setTimeout(()=>$("#menuSearch")?.focus(),400)});
$("#heroOrderBtn")?.addEventListener("click",()=>showPage("menu"));

loadStore();

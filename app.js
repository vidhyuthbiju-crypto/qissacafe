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

const CATEGORY_ORDER = ["Combos & Deals", "Shawarma", "Lemon Juice", "Broast", "Hot", "Burger", "Sandwich", "Fried", "Classic Shake", "Falooda", "Mojito", "Soda"];

const CATEGORY_ICONS = {
  "Combos & Deals": "🍱", "Shawarma": "🌯", "Broast": "🍗", "Burger": "🍔", "Sandwich": "🥪",
  "Fried": "🍟", "Classic Shake": "🥤", "Falooda": "🍨", "Mojito": "🍹",
  "Soda": "🧃", "Lemon Juice": "🍋", "Hot": "☕"
};

const CUSTOMIZATION_CONFIG = {
  "Shawarma": {
    groups: [
      {
        id: "spice",
        title: "Spice Level",
        subtitle: "Choose 1",
        type: "radio",
        options: [
          { label: "Normal Spicy", price: 0, default: true },
          { label: "Extra Spicy", price: 0 }
        ]
      },
      {
        id: "addons",
        title: "Add-ons",
        subtitle: "Optional",
        type: "checkbox",
        options: [
          { label: "Extra Mayo", price: 15 },
          { label: "Extra Rumali", price: 10 },
          { label: "Add Cheese", price: 20 }
        ]
      }
    ]
  },
  "Broast": {
    groups: [
      {
        id: "dip",
        title: "Choice of Dip",
        subtitle: "Choose 1",
        type: "radio",
        options: [
          { label: "Garlic Mayo", price: 0, default: true },
          { label: "Spicy Dip", price: 0 }
        ]
      },
      {
        id: "addons",
        title: "Extra Dips",
        subtitle: "Optional",
        type: "checkbox",
        options: [
          { label: "Extra Dip", price: 15 }
        ]
      }
    ]
  },
  "Classic Shake": {
    groups: [
      {
        id: "sugar",
        title: "Sweetness",
        subtitle: "Choose 1",
        type: "radio",
        options: [
          { label: "Normal Sugar", price: 0, default: true },
          { label: "Less Sugar", price: 0 },
          { label: "No Sugar", price: 0 }
        ]
      }
    ]
  },
  "Falooda": {
    groups: [
      {
        id: "sugar",
        title: "Sweetness",
        subtitle: "Choose 1",
        type: "radio",
        options: [
          { label: "Normal Sugar", price: 0, default: true },
          { label: "Less Sugar", price: 0 }
        ]
      }
    ]
  },
  "Mojito": {
    groups: [
      {
        id: "sugar",
        title: "Sweetness",
        subtitle: "Choose 1",
        type: "radio",
        options: [
          { label: "Normal Sweetness", price: 0, default: true },
          { label: "Less Sweet", price: 0 }
        ]
      },
      {
        id: "ice",
        title: "Ice Level",
        subtitle: "Choose 1",
        type: "radio",
        options: [
          { label: "Normal Ice", price: 0, default: true },
          { label: "No Ice", price: 0 }
        ]
      }
    ]
  },
  "Lemon Juice": {
    groups: [
      {
        id: "sugar",
        title: "Sweetness",
        subtitle: "Choose 1",
        type: "radio",
        options: [
          { label: "Normal Sugar", price: 0, default: true },
          { label: "Less Sugar", price: 0 },
          { label: "No Sugar", price: 0 }
        ]
      },
      {
        id: "ice",
        title: "Ice Level",
        subtitle: "Choose 1",
        type: "radio",
        options: [
          { label: "Normal Ice", price: 0, default: true },
          { label: "No Ice", price: 0 }
        ]
      }
    ]
  },
  "Hot": {
    groups: [
      {
        id: "sugar",
        title: "Sugar Preference",
        subtitle: "Choose 1",
        type: "radio",
        options: [
          { label: "Normal Sugar", price: 0, default: true },
          { label: "Less Sugar", price: 0 },
          { label: "No Sugar", price: 0 }
        ]
      }
    ]
  }
};

function isItemCustomizable(item) {
  return Boolean(item && item.category && CUSTOMIZATION_CONFIG[item.category]);
}

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
  return ["🔥 Popular", "All", ...ordered, ...remaining];
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

function renderSkeletonGrid() {
  return Array(8).fill(0).map(() => `
    <div class="skeleton-card">
      <div class="skeleton-shimmer"></div>
      <div class="skeleton-thumb"></div>
      <div class="skeleton-cat"></div>
      <div class="skeleton-title"></div>
      <div class="skeleton-desc"></div>
      <div class="skeleton-bottom">
        <div class="skeleton-price"></div>
        <div class="skeleton-btn"></div>
      </div>
    </div>
  `).join("");
}

async function loadStore() {
  menuGrid.innerHTML = renderSkeletonGrid();
  try {
    const [menuData, storeData] = await Promise.all([api("/api/menu"), api("/api/status")]);
    menu = menuData.items;
    state.cafeOpen = storeData.cafe_open;
    state.settings = storeData.settings;
    syncCartWithMenu();
    applyStoreStatus();
    renderCategories();
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

function updateCategoryScrollArrows() {
  const container = document.getElementById("categoryFilters");
  const leftBtn = document.getElementById("catScrollLeft");
  const rightBtn = document.getElementById("catScrollRight");
  if (!container || !leftBtn || !rightBtn) return;

  const maxScroll = container.scrollWidth - container.clientWidth;
  if (maxScroll <= 5) {
    leftBtn.classList.add("dimmed");
    rightBtn.classList.add("dimmed");
    return;
  }
  leftBtn.classList.toggle("dimmed", container.scrollLeft <= 5);
  rightBtn.classList.toggle("dimmed", container.scrollLeft >= maxScroll - 5);
}

function initCategoryScrollControls() {
  const container = document.getElementById("categoryFilters");
  const leftBtn = document.getElementById("catScrollLeft");
  const rightBtn = document.getElementById("catScrollRight");

  if (leftBtn) {
    leftBtn.addEventListener("click", () => {
      if (container) {
        container.scrollBy({ left: -280, behavior: "smooth" });
        setTimeout(updateCategoryScrollArrows, 350);
      }
    });
  }

  if (rightBtn) {
    rightBtn.addEventListener("click", () => {
      if (container) {
        container.scrollBy({ left: 280, behavior: "smooth" });
        setTimeout(updateCategoryScrollArrows, 350);
      }
    });
  }

  if (container) {
    container.addEventListener("scroll", updateCategoryScrollArrows, { passive: true });
    
    // Enable horizontal scrolling with vertical mouse wheel on PC / Desktop
    container.addEventListener("wheel", (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        container.scrollBy({ left: e.deltaY * 1.5, behavior: "auto" });
        updateCategoryScrollArrows();
      }
    }, { passive: false });
  }
}

function renderCategories() {
  categoryFilters.innerHTML = categories().map(cat => `
    <button class="category-btn ${state.category === cat ? "active" : ""}" data-category="${escapeHtml(cat)}" aria-pressed="${state.category === cat}">
      ${escapeHtml(cat)}
    </button>
  `).join("");
  $$(".category-btn").forEach(btn => btn.addEventListener("click", () => {
    state.category = btn.dataset.category;
    renderCategories();
    renderMenu();
    btn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }));
  setTimeout(updateCategoryScrollArrows, 100);
}

function filteredMenu() {
  return menu.filter(item => {
    let catMatch = false;
    if (state.category === "🔥 Popular" || state.category === "Popular") {
      catMatch = Boolean(item.is_bestseller);
    } else if (state.category === "All") {
      catMatch = true;
    } else {
      catMatch = item.category === state.category;
    }
    const q = state.query.trim().toLowerCase();
    const searchMatch = !q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q) || (item.description && item.description.toLowerCase().includes(q));
    return catMatch && searchMatch;
  });
}

function availabilityMeta(item) {
  if (item.availability === "sold_out") return { label: "Sold out", cls: "sold", showBadge: true, disabled: true };
  if (item.availability === "low") return { label: "Few left", cls: "low", showBadge: true, disabled: false };
  return { label: "", cls: "", showBadge: false, disabled: false };
}

let currentCustomItem = null;
let currentCustomSelections = { radio: {}, checkbox: {} };
let currentCustomQty = 1;

function openCustomizationModal(item) {
  currentCustomItem = item;
  currentCustomQty = 1;
  const config = CUSTOMIZATION_CONFIG[item.category] || { groups: [] };

  currentCustomSelections = {
    radio: {},
    checkbox: {}
  };

  config.groups.forEach(g => {
    if (g.type === "radio") {
      const def = g.options.find(o => o.default) || g.options[0];
      if (def) currentCustomSelections.radio[g.id] = def;
    } else if (g.type === "checkbox") {
      currentCustomSelections.checkbox[g.id] = [];
    }
  });

  if ($("#customItemCategory")) $("#customItemCategory").textContent = (item.category || "CUSTOMIZE").toUpperCase();
  if ($("#customItemTitle")) $("#customItemTitle").textContent = item.name;
  if ($("#customItemDesc")) $("#customItemDesc").textContent = item.description || `Base price: ₹${item.price}`;
  if ($("#customQtyNum")) $("#customQtyNum").textContent = "1";

  renderCustomizationOptions();
  updateCustomizationTotal();

  $("#customModal")?.classList.add("show");
  backdrop?.classList.add("show");
  document.body.classList.add("no-scroll");
}

function closeCustomModal() {
  $("#customModal")?.classList.remove("show");
  if (!$("#cartDrawer")?.classList.contains("open") && !$("#checkoutModal")?.classList.contains("show") && !$("#orderTrackingModal")?.classList.contains("show")) {
    backdrop?.classList.remove("show");
    document.body.classList.remove("no-scroll");
  }
}

function renderCustomizationOptions() {
  const container = $("#customOptionsContainer");
  if (!container || !currentCustomItem) return;
  const config = CUSTOMIZATION_CONFIG[currentCustomItem.category];
  if (!config || !config.groups.length) {
    container.innerHTML = `<p style="color:var(--muted);font-size:0.85rem">No extra options required for this item.</p>`;
    return;
  }

  container.innerHTML = config.groups.map(g => {
    if (g.type === "radio") {
      const selected = currentCustomSelections.radio[g.id];
      return `
        <div class="custom-group">
          <div class="custom-group-head">
            <h4 class="custom-group-title">${escapeHtml(g.title)}</h4>
            <span class="custom-group-subtitle">${escapeHtml(g.subtitle)}</span>
          </div>
          <div class="custom-pill-list">
            ${g.options.map(opt => `
              <button type="button" class="custom-pill-btn ${selected && selected.label === opt.label ? 'active' : ''}" onclick="selectCustomRadio('${g.id}', '${escapeHtml(opt.label)}')">
                ${escapeHtml(opt.label)} ${opt.price > 0 ? `(+₹${opt.price})` : ''}
              </button>
            `).join("")}
          </div>
        </div>
      `;
    } else if (g.type === "checkbox") {
      const selectedArr = currentCustomSelections.checkbox[g.id] || [];
      return `
        <div class="custom-group">
          <div class="custom-group-head">
            <h4 class="custom-group-title">${escapeHtml(g.title)}</h4>
            <span class="custom-group-subtitle">${escapeHtml(g.subtitle)}</span>
          </div>
          <div>
            ${g.options.map(opt => {
              const isChecked = selectedArr.some(o => o.label === opt.label);
              return `
                <div class="custom-check-item ${isChecked ? 'checked' : ''}" onclick="toggleCustomCheckbox('${g.id}', '${escapeHtml(opt.label)}')">
                  <div class="custom-check-left">
                    <div class="custom-checkbox-box">${isChecked ? '✓' : ''}</div>
                    <span>${escapeHtml(opt.label)}</span>
                  </div>
                  <span class="custom-addon-price">+₹${opt.price}</span>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `;
    }
    return '';
  }).join("");
}

window.selectCustomRadio = function(groupId, optLabel) {
  if (!currentCustomItem) return;
  const config = CUSTOMIZATION_CONFIG[currentCustomItem.category];
  const group = config?.groups.find(g => g.id === groupId);
  const opt = group?.options.find(o => o.label === optLabel);
  if (opt) {
    currentCustomSelections.radio[groupId] = opt;
    renderCustomizationOptions();
    updateCustomizationTotal();
  }
};

window.toggleCustomCheckbox = function(groupId, optLabel) {
  if (!currentCustomItem) return;
  const config = CUSTOMIZATION_CONFIG[currentCustomItem.category];
  const group = config?.groups.find(g => g.id === groupId);
  const opt = group?.options.find(o => o.label === optLabel);
  if (!opt) return;

  if (!currentCustomSelections.checkbox[groupId]) {
    currentCustomSelections.checkbox[groupId] = [];
  }
  const arr = currentCustomSelections.checkbox[groupId];
  const idx = arr.findIndex(o => o.label === optLabel);
  if (idx >= 0) {
    arr.splice(idx, 1);
  } else {
    arr.push(opt);
  }
  renderCustomizationOptions();
  updateCustomizationTotal();
};

function calculateCustomUnit() {
  if (!currentCustomItem) return { basePrice: 0, addonPrice: 0, unitPrice: 0 };
  let addonTotal = 0;
  Object.values(currentCustomSelections.radio).forEach(opt => {
    if (opt && opt.price) addonTotal += opt.price;
  });
  Object.values(currentCustomSelections.checkbox).forEach(arr => {
    (arr || []).forEach(opt => {
      if (opt && opt.price) addonTotal += opt.price;
    });
  });
  return {
    basePrice: currentCustomItem.price,
    addonPrice: addonTotal,
    unitPrice: currentCustomItem.price + addonTotal
  };
}

function updateCustomizationTotal() {
  const { unitPrice } = calculateCustomUnit();
  const grandTotal = unitPrice * currentCustomQty;
  if ($("#customBtnTotal")) $("#customBtnTotal").textContent = `₹${grandTotal}`;
}

function addCustomizedItemToCart() {
  if (!currentCustomItem) return;
  const { basePrice, addonPrice, unitPrice } = calculateCustomUnit();

  const parts = [];
  Object.values(currentCustomSelections.radio).forEach(opt => {
    if (opt) parts.push(opt.label);
  });
  Object.values(currentCustomSelections.checkbox).forEach(arr => {
    (arr || []).forEach(opt => {
      parts.push(`${opt.label} (+₹${opt.price})`);
    });
  });

  const customText = parts.join(", ");
  const customKey = `${currentCustomItem.id}|${customText}`;

  const existing = state.cart.find(x => x.key === customKey);
  if (existing) {
    existing.qty += currentCustomQty;
  } else {
    state.cart.push({
      id: currentCustomItem.id,
      key: customKey,
      name: currentCustomItem.name,
      basePrice: basePrice,
      addonPrice: addonPrice,
      price: unitPrice,
      customization: customText,
      qty: currentCustomQty
    });
  }

  saveCart();
  syncCardUI(currentCustomItem.id);
  renderCart();
  closeCustomModal();
  showToast(`${currentCustomItem.name} added to cart`);
}

function renderActionBtn(item, inCartQty, disabled) {
  const isCustomizable = isItemCustomizable(item);
  if (inCartQty > 0 && !disabled) {
    if (isCustomizable) {
      return `<button type="button" class="add-btn menu-add-btn customized-active" data-id="${item.id}" onclick="addToCart(${item.id}, event)" style="width:auto;padding:0 14px;font-size:0.8rem;border-radius:12px">${inCartQty} in cart +</button>`;
    }
    return `<div class="card-qty-ctrl">
              <button type="button" class="qty-btn dec-btn" onclick="changeQtyById(${item.id}, -1, event)" aria-label="Decrease quantity">−</button>
              <span class="card-qty-num">${inCartQty}</span>
              <button type="button" class="qty-btn inc-btn" onclick="changeQtyById(${item.id}, 1, event)" aria-label="Increase quantity">+</button>
            </div>`;
  }
  const label = isCustomizable ? "Customize +" : "+";
  const extraStyle = isCustomizable ? 'style="width:auto;padding:0 12px;font-size:0.82rem;border-radius:12px"' : '';
  return `<button type="button" class="add-btn menu-add-btn" ${extraStyle} data-id="${item.id}" onclick="addToCart(${item.id}, event)" ${disabled ? "disabled" : ""} aria-label="Add ${escapeHtml(item.name)} to cart">${disabled ? "Sold" : label}</button>`;
}

function syncCardUI(id) {
  const item = menu.find(x => x.id === id);
  if (!item) return;
  const a = availabilityMeta(item);
  const disabled = a.disabled || !state.cafeOpen;
  const inCartItems = state.cart.filter(x => x.id === item.id);
  const inCartQty = inCartItems.reduce((sum, x) => sum + x.qty, 0);
  const slots = document.querySelectorAll(`.card-action-slot[data-id="${id}"]`);
  slots.forEach(slot => {
    slot.innerHTML = renderActionBtn(item, inCartQty, disabled);
  });
}

window.clearSearch = function() {
  state.query = "";
  const input = $("#menuSearch") || $("#searchInput");
  if (input) input.value = "";
  renderMenu();
};

function renderMenu() {
  const items = filteredMenu();
  if (!items.length) {
    const q = state.query.trim();
    if (q) {
      menuGrid.innerHTML = `
        <div class="empty-search-state">
          <span class="empty-icon">🔍</span>
          <h3>No items found for "${escapeHtml(q)}"</h3>
          <p>Try searching for Shawarma, Burger, Shake, Mojito or browse by category.</p>
          <button type="button" class="secondary-btn" onclick="clearSearch()">Clear Search</button>
        </div>`;
    } else {
      menuGrid.innerHTML = `
        <div class="empty-search-state">
          <span class="empty-icon">🍽️</span>
          <h3>No items in this category</h3>
          <p>Please select another category from the menu bar above.</p>
        </div>`;
    }
    return;
  }
  menuGrid.innerHTML = items.map((item, i) => {
    const a = availabilityMeta(item);
    const disabled = a.disabled || !state.cafeOpen;
    const inCartItems = state.cart.filter(x => x.id === item.id);
    const inCartQty = inCartItems.reduce((sum, x) => sum + x.qty, 0);
    const actionBtn = renderActionBtn(item, inCartQty, disabled);

    const isPopular = Boolean(item.is_bestseller);
    const isCombo = item.category === "Combos & Deals";
    const badgeHtml = a.showBadge
      ? `<span class="availability ${a.cls}">${a.label}</span>`
      : (isCombo ? `<span class="combo-badge-chip">🔥 Value Combo</span>` : (isPopular && state.category !== "🔥 Popular" ? `<span class="bestseller-chip">★ Popular</span>` : (!state.cafeOpen ? `<span class="availability sold">Closed</span>` : '')));

    const customHint = isItemCustomizable(item) ? `<span class="custom-badge-hint">Customisable</span>` : '';

    return `
      <article class="menu-card card-in ${a.disabled ? "soldout" : ""} ${a.cls === "low" ? "low-stock" : ""}" data-id="${item.id}" style="animation-delay:${reduceMotion ? 0 : (i % 8) * 25}ms">
        <div class="menu-card-top-content">
          ${item.image ? `<img class="menu-thumb" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.style.display='none'">` : `<div class="icon-wrap"><span class="menu-icon">${CATEGORY_ICONS[item.category]||"🍽️"}</span></div>`}
          <div class="menu-card-header">
            ${badgeHtml}
            <span class="item-category">${escapeHtml(item.category)}${customHint}</span>
          </div>
          <h3>${escapeHtml(item.name)}</h3>
          ${item.description ? `<p class="menu-desc">${escapeHtml(item.description)}</p>` : ''}
        </div>
        <div class="menu-card-bottom">
          <span class="price">${money(item.price)}</span>
          <div class="card-action-slot" data-id="${item.id}">
            ${actionBtn}
          </div>
        </div>
      </article>`;
  }).join("");
}

function addToCart(id, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const item = menu.find(x => x.id === id);
  if (!item || !state.cafeOpen || item.availability === "sold_out") return;

  if (isItemCustomizable(item)) {
    openCustomizationModal(item);
    return;
  }

  const existing = state.cart.find(x => x.id === id && !x.customization);
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({ id: item.id, key: String(item.id), name: item.name, price: item.price, basePrice: item.price, addonPrice: 0, qty: 1 });
  }
  saveCart();

  syncCardUI(id);
  renderCart();

  showToast(`${item.name} added`);

  const btnEl = event?.currentTarget || document.querySelector(`.menu-add-btn[data-id="${id}"]`);
  if (btnEl && !reduceMotion) {
    btnEl.classList.remove("just-added");
    void btnEl.offsetWidth;
    btnEl.classList.add("just-added");
    setTimeout(() => btnEl.classList.remove("just-added"), 450);
  }
}

function changeCartKeyQty(key, delta, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const item = state.cart.find(x => String(x.key || x.id) === String(key));
  if (!item) return;

  item.qty += delta;
  if (item.qty <= 0) {
    state.cart = state.cart.filter(x => String(x.key || x.id) !== String(key));
  }
  saveCart();
  syncCardUI(item.id);
  renderCart();
}

function removeCartKeyItem(key, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const item = state.cart.find(x => String(x.key || x.id) === String(key));
  const itemId = item ? item.id : null;
  state.cart = state.cart.filter(x => String(x.key || x.id) !== String(key));
  saveCart();
  if (itemId) syncCardUI(itemId);
  renderCart();
}

function changeQtyById(id, delta, event) {
  const item = state.cart.find(x => x.id === id);
  if (item) changeCartKeyQty(item.key || item.id, delta, event);
}

function changeQty(id, delta, event) {
  changeCartKeyQty(id, delta, event);
}

function removeItem(id, event) {
  removeCartKeyItem(id, event);
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
  const menuSection = document.getElementById("page-menu");
  const isMenuPage = currentPage === "menu" && menuSection && menuSection.classList.contains("active");
  
  if (n > 0 && isMenuPage) {
    const wasHidden = !b.classList.contains("bar-visible");
    b.classList.add("bar-visible");
    b.style.display = "flex";
    if (wasHidden && !reduceMotion) {
      b.classList.add("bar-entering");
      setTimeout(() => b.classList.remove("bar-entering"), 450);
    }
    if (tx) tx.textContent = n + " item" + (n > 1 ? "s" : "");
    if (tt) tt.textContent = money(cartTotal());
  } else {
    b.classList.remove("bar-visible");
    b.style.display = "none";
  }
}
document.getElementById("mobileCartBar")?.addEventListener("click", openCart);
document.getElementById("mobileCartBtn")?.addEventListener("click", (e) => { e.stopPropagation(); openCart(); });

function renderCartBadgeAndBar() {
  const newCount = cartQuantity();
  const countChanged = cartCount.textContent !== String(newCount);
  cartCount.textContent = newCount;
  cartSubtotal.textContent = money(cartTotal());
  if (countChanged && !reduceMotion) {
    cartCount.classList.remove("bump");
    void cartCount.offsetWidth;
    cartCount.classList.add("bump");
  }
  updateMobileBar();
}

function renderCartItems() {
  const itemsContainer = document.getElementById("cartItems");
  if (!itemsContainer) return;
  if (!state.cart.length) {
    itemsContainer.innerHTML = `<div class="cart-empty"><div><span class="empty-icon">🛒</span><h3>Your cart is empty</h3><p>Add something delicious from the menu.</p></div></div>`;
    return;
  }
  itemsContainer.innerHTML = state.cart.map((item, i) => {
    const itemKey = escapeHtml(item.key || item.id);
    return `
    <div class="cart-line" style="animation-delay:${reduceMotion ? 0 : i * 35}ms">
      <div>
        <h4>${escapeHtml(item.name)}</h4>
        <small>${money(item.price)} each</small>
        ${item.customization ? `<div class="cart-item-custom-notes">${escapeHtml(item.customization)}</div>` : ''}
        <div class="qty" role="group" aria-label="Quantity controls">
          <button type="button" onclick="changeCartKeyQty('${itemKey}', -1, event)" aria-label="Decrease quantity">−</button>
          <strong aria-live="polite">${item.qty}</strong>
          <button type="button" onclick="changeCartKeyQty('${itemKey}', 1, event)" aria-label="Increase quantity">+</button>
        </div>
        <button type="button" class="remove-btn" onclick="removeCartKeyItem('${itemKey}', event)" aria-label="Remove ${escapeHtml(item.name)}">Remove</button>
      </div><strong>${money(item.price * item.qty)}</strong>
    </div>`;
  }).join("");
}

function renderCart() {
  renderCartBadgeAndBar();
  renderCartItems();
}

function openCart() {
  renderCart();
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
  closeCustomModal();
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

  const savedName = localStorage.getItem("qissaCustomerName") || "";
  const savedPhone = localStorage.getItem("qissaCustomerPhone") || "";
  if (savedName && $("#customerName")) $("#customerName").value = savedName;
  if (savedPhone && $("#customerPhone")) $("#customerPhone").value = savedPhone;

  setOrderType($("#orderType")?.value || "Delivery");

  checkoutModal.classList.add("show");
  backdrop.classList.add("show");

  // Focus first appropriate input
  setTimeout(() => {
    const nameInput = $("#customerName");
    if (nameInput && !nameInput.value) nameInput.focus();
    else $("#customerPhone")?.focus();
  }, 120);
}

function renderCheckoutSummary() {
  const isDelivery = ($("#orderType")?.value || "Delivery") === "Delivery";
  const deliveryRow = isDelivery ? `<div class="row" style="color:var(--green);font-weight:700"><span>🛵 Delivery Fee</span><span class="free-pill" style="font-size:0.7rem;padding:2px 8px">FREE (₹0)</span></div>` : '';
  checkoutSummary.innerHTML = `
    ${state.cart.map(item => `
      <div class="row">
        <div>
          <span>${escapeHtml(item.name)} × ${item.qty}</span>
          ${item.customization ? `<div style="font-size:0.74rem;color:var(--muted);margin-top:2px">${escapeHtml(item.customization)}</div>` : ''}
        </div>
        <strong>${money(item.price * item.qty)}</strong>
      </div>
    `).join("")}
    ${deliveryRow}
    <div class="row total"><span>Total Amount</span><strong>${money(cartTotal())}</strong></div>
  `;
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

// Customization Modal listeners
$("#closeCustomModal")?.addEventListener("click", closeCustomModal);
$("#customDecQty")?.addEventListener("click", () => {
  if (currentCustomQty > 1) {
    currentCustomQty -= 1;
    if ($("#customQtyNum")) $("#customQtyNum").textContent = currentCustomQty;
    updateCustomizationTotal();
  }
});
$("#customIncQty")?.addEventListener("click", () => {
  if (currentCustomQty < 50) {
    currentCustomQty += 1;
    if ($("#customQtyNum")) $("#customQtyNum").textContent = currentCustomQty;
    updateCustomizationTotal();
  }
});
$("#customAddToCartBtn")?.addEventListener("click", addCustomizedItemToCart);


// Order Type Tabs switching
function setOrderType(type) {
  const hiddenInput = $("#orderType");
  if (hiddenInput) hiddenInput.value = type;

  $$("#orderTypeTabs .order-type-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.type === type);
  });

  const dineInGrp = $("#dineInFields");
  const phoneGrp = $("#phoneFields");
  const deliveryGrp = $("#deliveryFields");
  const freeDeliveryCallout = $("#freeDeliveryCallout");

  if (freeDeliveryCallout) {
    freeDeliveryCallout.style.display = type === "Delivery" ? "flex" : "none";
  }

  if (type === "Dine-in") {
    if (dineInGrp) dineInGrp.style.display = "block";
    if (phoneGrp) phoneGrp.style.display = "none";
    if (deliveryGrp) deliveryGrp.style.display = "none";
    setTimeout(() => $("#tableNumber")?.focus(), 80);
  } else if (type === "Takeaway") {
    if (dineInGrp) dineInGrp.style.display = "none";
    if (phoneGrp) phoneGrp.style.display = "block";
    if (deliveryGrp) deliveryGrp.style.display = "none";
    setTimeout(() => $("#customerPhone")?.focus(), 80);
  } else if (type === "Delivery") {
    if (dineInGrp) dineInGrp.style.display = "none";
    if (phoneGrp) phoneGrp.style.display = "block";
    if (deliveryGrp) deliveryGrp.style.display = "block";
    setTimeout(() => $("#customerPhone")?.focus(), 80);
  }

  renderCheckoutSummary();
}

$$("#orderTypeTabs .order-type-tab").forEach(tab => {
  tab.addEventListener("click", () => setOrderType(tab.dataset.type));
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

let currentTrackingOrderData = null;
let orderNotificationEnabled = false;
let lastKnownOrderStatus = "";

function setupNotificationButton() {
  const btn = $("#enableNotifyBtn");
  const card = $("#notifyPromptCard");
  if (!btn || !card) return;

  if (!("Notification" in window)) {
    card.style.display = "none";
    return;
  }

  if (Notification.permission === "granted") {
    orderNotificationEnabled = true;
    btn.textContent = "✓ Alerts Active";
    btn.classList.add("active");
  } else if (Notification.permission === "denied") {
    card.style.display = "none";
  }

  btn.onclick = async () => {
    if (Notification.permission === "granted") {
      orderNotificationEnabled = true;
      btn.textContent = "✓ Alerts Active";
      btn.classList.add("active");
      showToast("🔔 Order notifications are enabled!");
      return;
    }

    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        orderNotificationEnabled = true;
        btn.textContent = "✓ Alerts Active";
        btn.classList.add("active");
        showToast("🔔 You will be alerted when food is ready!");
        try {
          new Notification("🔔 Qissa Live Tracking Active", {
            body: `We will notify you the second your order #${activeTrackingOrderCode} is ready!`,
            icon: "assets/qissa-logo.jpeg"
          });
        } catch (_) {}
      } else {
        card.style.display = "none";
      }
    } catch (_) {}
  };
}

function checkOrderNotificationTrigger(orderCode, newStatus) {
  if (newStatus === lastKnownOrderStatus) return;
  lastKnownOrderStatus = newStatus;

  if (orderNotificationEnabled && ("Notification" in window) && Notification.permission === "granted") {
    try {
      if (newStatus === "ready") {
        new Notification("🍲 Your Qissa Order is Ready!", {
          body: `Order #${orderCode} is packed hot & ready for you!`,
          icon: "assets/qissa-logo.jpeg"
        });
      } else if (newStatus === "completed") {
        new Notification("🎉 Order Delivered / Completed", {
          body: `Thank you for dining with Qissa Resto Cafe! Enjoy your food!`,
          icon: "assets/qissa-logo.jpeg"
        });
      }
    } catch (_) {}
  }
}

function generatePrintableReceipt(order) {
  if (!order) return;
  const items = order.items || [];
  const orderCode = order.order_code || `Q${order.order_id || order.id || "0000"}`;
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  let typeDisplay = order.order_type || "Takeaway";
  if (order.order_type === "Dine-in" && order.table_number) {
    typeDisplay = `Dine-in (Table ${order.table_number})`;
  } else if (order.order_type === "Delivery" && order.delivery_address) {
    typeDisplay = `Delivery: ${order.delivery_address}`;
  }

  const receiptHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receipt - #${orderCode} - Qissa Cafe</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #111;
      width: 100%;
      max-width: 300px;
      margin: 0 auto;
      padding: 8px;
      font-size: 13px;
      line-height: 1.4;
    }
    .header { text-align: center; border-bottom: 1.5px dashed #333; padding-bottom: 10px; margin-bottom: 10px; }
    .header h1 { margin: 0; font-size: 19px; font-weight: 850; letter-spacing: 1.5px; }
    .header p { margin: 2px 0; font-size: 11px; color: #555; }
    .order-info { margin-bottom: 10px; font-size: 12px; }
    .order-info div { display: flex; justify-content: space-between; margin-bottom: 3px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 12px; }
    th { text-align: left; border-bottom: 1px solid #333; padding: 4px 0; font-weight: 700; }
    th.r, td.r { text-align: right; }
    td { padding: 4px 0; vertical-align: top; }
    .totals { border-top: 1.5px dashed #333; padding-top: 8px; margin-bottom: 12px; }
    .totals div { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 3px; }
    .totals .grand-total { font-size: 16px; font-weight: 850; border-top: 1px solid #111; padding-top: 4px; margin-top: 4px; }
    .footer { text-align: center; border-top: 1.5px dashed #333; padding-top: 10px; font-size: 11px; color: #555; }
    .footer strong { color: #111; display: block; margin-bottom: 3px; }
    @media print {
      body { width: 100%; max-width: 100%; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>QISSA RESTO CAFE</h1>
    <p>Nilambur Road, Kerala • +91 96457 00585</p>
    <p>Every Bite Has a Story</p>
  </div>
  
  <div class="order-info">
    <div><span>Order:</span><strong>#${orderCode}</strong></div>
    <div><span>Date:</span><span>${dateStr} ${timeStr}</span></div>
    <div><span>Type:</span><strong>${escapeHtml(typeDisplay)}</strong></div>
    <div><span>Customer:</span><span>${escapeHtml(order.customer_name || "Guest")} (${escapeHtml(order.phone || "")})</span></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th class="r">Qty</th>
        <th class="r">Amt (₹)</th>
      </tr>
    </thead>
    <tbody>
      ${items.map(it => `
        <tr>
          <td>${escapeHtml(it.name || it.item_name)}</td>
          <td class="r">${it.qty}</td>
          <td class="r">${(it.line_total || ((it.price || it.unit_price) * it.qty)).toFixed(2)}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>

  <div class="totals">
    <div><span>Subtotal:</span><span>₹${Number(order.total).toFixed(2)}</span></div>
    <div><span>Tax / GST:</span><span>₹0.00</span></div>
    <div class="grand-total"><span>Total Amount:</span><span>₹${Number(order.total).toFixed(2)}</span></div>
  </div>

  <div class="footer">
    <strong>✨ Thank You for Ordering! ✨</strong>
    <p>Follow us on Instagram: @qissacafe</p>
    <p>Visit again!</p>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 250);
    };
  </script>
</body>
</html>`;

  const frame = document.getElementById("customerReceiptFrame");
  if (frame) {
    frame.srcdoc = receiptHtml;
  } else {
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(receiptHtml);
      win.document.close();
    }
  }
}

$("#downloadReceiptBtn")?.addEventListener("click", () => {
  if (currentTrackingOrderData) {
    generatePrintableReceipt(currentTrackingOrderData);
  }
});

function openOrderTracking(order) {
  currentTrackingOrderData = order;
  activeTrackingOrderCode = order.order_code || `Q${order.order_id || order.id}`;
  lastKnownOrderStatus = order.status || "new";
  closeOverlays();

  $("#trackingOrderCode").textContent = `#${activeTrackingOrderCode}`;
  updateTrackingStepper(order.status || "new");
  setupNotificationButton();

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
    ${order.order_type === "Delivery" ? '<div class="tracking-row" style="color:var(--green);font-weight:700"><span>Delivery Fee</span><span>FREE (₹0)</span></div>' : ''}
    <div class="tracking-row" style="font-weight:850;font-size:1.05rem;border-top:1px solid var(--border);padding-top:10px;margin-top:6px">
      <span>Total Amount</span>
      <strong style="color:var(--green)">${money(order.total)}</strong>
    </div>
  `;

  // WhatsApp Message Generator
  const lines = items.map(item => `• ${item.name || item.item_name} x ${item.qty} — ₹${item.line_total || ((item.price || item.unit_price) * item.qty)}`);
  const deliveryLine = order.order_type === "Delivery" ? `Delivery Fee: FREE (₹0)` : ``;
  const message = [
    `*NEW QISSA CAFE ORDER*`, ``,
    `Order: ${activeTrackingOrderCode}`,
    `Customer: ${order.customer_name}`,
    `Phone: ${order.phone}`,
    `Order Type: ${typeDisplay}`, ``,
    `*Items*`, ...lines, ``,
    deliveryLine,
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
          // Polling intentionally returns status-only data. Preserve the private
          // receipt details that were returned directly after order creation.
          currentTrackingOrderData = currentTrackingOrderData
            ? { ...currentTrackingOrderData, ...data.order }
            : data.order;
          updateTrackingStepper(data.order.status);
          checkOrderNotificationTrigger(orderRef, data.order.status);
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

function showFieldError(fieldId, errorMsg) {
  const wrap = $(`#wrap-${fieldId}`);
  const errEl = $(`#err-${fieldId}`);
  if (wrap) wrap.classList.add("has-error");
  if (errEl) {
    errEl.textContent = errorMsg;
    errEl.style.display = "flex";
  }
}

function clearFieldError(fieldId) {
  const wrap = $(`#wrap-${fieldId}`);
  const errEl = $(`#err-${fieldId}`);
  if (wrap) wrap.classList.remove("has-error");
  if (errEl) {
    errEl.textContent = "";
    errEl.style.display = "none";
  }
}

function clearAllErrors() {
  ["customerName", "tableNumber", "customerPhone", "deliveryAddress"].forEach(clearFieldError);
}

// Live real-time error clearing when customer starts typing
["customerName", "tableNumber", "customerPhone", "deliveryAddress"].forEach(id => {
  $(`#${id}`)?.addEventListener("input", () => clearFieldError(id));
});

$("#checkoutForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAllErrors();
  
  const submitBtn = $("#confirmOrderBtn");
  const name = $("#customerName").value.trim();
  const orderType = $("#orderType").value || "Dine-in";
  const phone = $("#customerPhone") ? $("#customerPhone").value.trim() : "";
  const tableNumber = $("#tableNumber") ? $("#tableNumber").value.trim() : "";
  const deliveryAddress = $("#deliveryAddress") ? $("#deliveryAddress").value.trim() : "";
  const landmark = $("#deliveryLandmark") ? $("#deliveryLandmark").value.trim() : "";
  const notes = $("#orderNotes") ? $("#orderNotes").value.trim() : "";

  if (!name || name.length < 2) {
    showFieldError("customerName", "Please enter your name (min 2 letters)");
    $("#customerName")?.focus();
    return;
  }

  if (!state.cart.length) {
    showToast("Your cart is empty!", "🛒");
    return;
  }

  if (orderType === "Dine-in") {
    if (!tableNumber) {
      showFieldError("tableNumber", "Please enter your table number");
      $("#tableNumber")?.focus();
      return;
    }
  } else {
    if (!phone || !validatePhone(phone)) {
      showFieldError("customerPhone", "Please enter a valid 10-digit mobile number");
      $("#customerPhone")?.focus();
      return;
    }
  }

  if (orderType === "Delivery" && !deliveryAddress) {
    showFieldError("deliveryAddress", "Please enter your delivery address");
    $("#deliveryAddress")?.focus();
    return;
  }

  if (!state.cafeOpen) {
    showToast("Qissa is currently closed for orders", "⚠️");
    return;
  }

  const fullDeliveryAddress = landmark ? `${deliveryAddress} (Landmark: ${landmark})` : deliveryAddress;
  const effectivePhone = (orderType === "Dine-in" && !phone) ? `Table ${tableNumber}` : phone;

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="btn-spinner"></span> Placing order...';

  try {
    const result = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        customer_name: name,
        phone: effectivePhone,
        order_type: orderType,
        table_number: tableNumber,
        delivery_address: fullDeliveryAddress,
        notes,
        items: state.cart.map(x => ({
          id: x.id,
          qty: x.qty,
          price: x.price,
          customization: x.customization || "",
          addon_price: x.addonPrice || 0
        }))
      }),
      timeout: ORDER_SUBMISSION_TIMEOUT_MS
    });

    localStorage.setItem("qissaCustomerName", name);
    if (phone) localStorage.setItem("qissaCustomerPhone", phone);
    localStorage.setItem("qissaActiveOrder", JSON.stringify(result));

    state.cart = [];
    saveCart();
    renderCart();
    renderMenu();
    updateMobileBar();

    $("#checkoutForm").reset();
    clearAllErrors();
    setOrderType("Dine-in");
    submitBtn.innerHTML = "Place Order";
    submitBtn.disabled = false;

    showToast("🎉 Order #" + (result.order_code || "") + " Placed Successfully!", "🎉", 2800);
    closeOverlays();
    openOrderTracking(result);

  } catch (err) {
    showToast(err.message || "Failed to place order. Please try again.", "⚠️");
    submitBtn.innerHTML = "Place Order";
    submitBtn.disabled = false;
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
  if (t) {
    t.classList.add("active");
    t.querySelectorAll(".reveal").forEach((el, idx) => {
      observer.observe(el);
      setTimeout(() => el.classList.add("visible"), 80 + (idx * 60));
    });
  }
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
try {
  document.documentElement.removeAttribute("data-theme");
  localStorage.removeItem("qissaTheme");
} catch (_) {}

loadStore();
initCategoryScrollControls();

// Live background store & menu synchronization (8-second interval)
setInterval(async () => {
  if (document.hidden) return;
  try {
    const [st, m] = await Promise.all([api("/api/status"), api("/api/menu")]);
    state.cafeOpen = st.cafe_open;
    state.settings = st.settings;
    applyStoreStatus();
    if (m && m.items && JSON.stringify(menu.map(x=>({id:x.id,p:x.price,a:x.availability}))) !== JSON.stringify(m.items.map(x=>({id:x.id,p:x.price,a:x.availability})))) {
      menu = m.items;
      syncCartWithMenu();
      renderMenu();
    }
  } catch (_) {}
}, 8000);

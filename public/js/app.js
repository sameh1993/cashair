/* ===================== Shared Utilities ===================== */

// Toast notifications
function showToast(msg, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2900);
}

// Format currency
let _settings = null;
async function getSettings() {
  if (_settings) return _settings;
  try {
    const r = await fetch('/api/settings');
    const d = await r.json();
    _settings = d.data || {};
  } catch { _settings = {}; }
  return _settings;
}

async function formatMoney(amount) {
  const s = await getSettings();
  const cur = s.currency || 'ج.م';
  const pos = s.currency_position || 'after';
  const val = parseFloat(amount || 0).toFixed(2);
  return pos === 'before' ? `${cur} ${val}` : `${val} ${cur}`;
}

function formatMoneySync(amount, currency = 'ج.م', pos = 'after') {
  const val = parseFloat(amount || 0).toFixed(2);
  return pos === 'before' ? `${currency} ${val}` : `${val} ${currency}`;
}

// API helper
async function api(url, opts = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) { window.location.href = '/'; return null; }
    return await res.json();
  } catch (e) {
    showToast('خطأ في الاتصال بالخادم', 'error');
    return null;
  }
}

// Get current user
async function getCurrentUser() {
  const r = await api('/api/auth/me');
  if (!r?.success) { window.location.href = '/'; return null; }
  return r.user;
}

// Logout
async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

// Confirm dialog
function confirmDialog(msg) {
  return confirm(msg);
}

// Debounce
function debounce(fn, delay = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

// Format date
function formatDate(str) {
  if (!str) return '-';
  const d = new Date(str);
  return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })
       + ' ' + d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

// Set active nav
function setActiveNav(path) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('href') === path);
  });
}

// Init sidebar user info
async function initSidebar() {
  const user = await getCurrentUser();
  if (!user) return;
  const nameEl = document.getElementById('sidebar-username');
  const avatarEl = document.getElementById('sidebar-avatar');
  if (nameEl) nameEl.textContent = user.full_name || user.username;
  if (avatarEl) avatarEl.textContent = (user.full_name || user.username)[0].toUpperCase();
  setActiveNav(window.location.pathname);
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('.sidebar')) initSidebar();
});

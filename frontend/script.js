/**
 * FarmMarket AI — MVP Frontend Script
 * All JavaScript in one file. Talks to FastAPI backend at localhost:8000.
 */

const API = "http://192.168.1.15:8000";

// ── Auth State & Helper Functions ─────────────────────────────────────────────
function getAuthToken() { return localStorage.getItem('auth_token'); }
function getAuthUser() {
  try { return JSON.parse(localStorage.getItem('auth_user')); } catch(e) { return null; }
}
function setAuth(token, user) {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('auth_user', JSON.stringify(user));
  updateAuthUI();
}
function logout() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  updateAuthUI();
  showSection('sec-home');
}

function updateAuthUI() {
  const user = getAuthUser();
  const navAuth = document.getElementById('nav-auth');
  if (!navAuth) return;

  if (user) {
    const roleLabel = user.role === 'farmer' ? 'Farmer/Seller' : 'Buyer';
    navAuth.innerHTML = `
      <span class="user-badge">👤 ${user.name} (${roleLabel})</span>
      <button class="btn btn-secondary btn-sm" onclick="logout()">Logout</button>
    `;

    // Pre-fill user name in forms if empty
    if (user.role === 'farmer') {
      const flName = document.getElementById('fl-name');
      if (flName && !flName.value) flName.value = user.name;
    } else if (user.role === 'buyer') {
      const brName = document.getElementById('br-name');
      if (brName && !brName.value) brName.value = user.name;
    }
  } else {
    navAuth.innerHTML = `
      <button class="btn btn-outline btn-sm" onclick="showSection('sec-signin')">Sign In</button>
      <button class="btn btn-primary btn-sm" onclick="showSection('sec-signup')">Sign Up</button>
    `;
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────
function showSection(id) {
  let targetId = id;
  let sec = document.getElementById(targetId);
  
  // Fallback to home if section ID doesn't exist
  if (!sec) {
    targetId = 'sec-home';
    sec = document.getElementById(targetId);
  }

  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));

  if (sec) sec.classList.add('active');

  const navLink = document.querySelector(`.nav-links a[data-section="${targetId}"]`);
  if (navLink) navLink.classList.add('active');

  // Load section data safely without crashing the UI
  try {
    if (targetId === 'sec-prices')          loadPrices();
    if (targetId === 'sec-matches')         loadMatchSection();
    if (targetId === 'sec-recommend')       loadRecommendSection();
    if (targetId === 'sec-buyer-listings') loadBuyerListings();
  } catch (err) {
    console.error('Section data load error:', err);
  }

  // Scroll to top when section changes
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── API helper ────────────────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  try {
    const res = await fetch(API + url, {
      ...options,
      headers,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || `Error ${res.status}`);
    return data;
  } catch (err) {
    if (err.message && (err.message.includes('fetch') || err.message.includes('NetworkError') || err.name === 'TypeError')) {
      throw new Error('Backend server offline. Run `cd backend` then `uvicorn main:app --reload --port 8000`.');
    }
    throw err;
  }
}



// ── Formatters ────────────────────────────────────────────────────────────────
const fmt = (n) => n != null ? '₹' + Number(n).toLocaleString('en-IN') : '—';

function scoreColor(s) {
  if (s >= 70) return '#15803d';
  if (s >= 45) return '#d97706';
  return '#dc2626';
}

function qualityBadge(q) {
  const map = { A: 'badge-green', B: 'badge-amber', C: 'badge-red', Any: 'badge-blue' };
  return `<span class="badge ${map[q] || 'badge-gray'}">${q}</span>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Market Prices
// ══════════════════════════════════════════════════════════════════════════════

let priceChart = null;

async function loadPrices() {
  const crop   = document.getElementById('filter-crop').value;
  const market = document.getElementById('filter-market').value;

  const params = new URLSearchParams();
  if (crop)   params.append('crop', crop);
  if (market) params.append('market', market);

  document.getElementById('prices-table-body').innerHTML =
    '<tr><td colspan="6" class="loading">Loading prices...</td></tr>';

  try {
    const data = await apiFetch(`/market-prices/latest`);
    let rows = data.data;

    if (crop)   rows = rows.filter(r => r.crop.toLowerCase()   === crop.toLowerCase());
    if (market) rows = rows.filter(r => r.market.toLowerCase() === market.toLowerCase());

    if (!rows.length) {
      document.getElementById('prices-table-body').innerHTML =
        '<tr><td colspan="6" class="empty">No prices found for this filter.</td></tr>';
      return;
    }

    document.getElementById('prices-table-body').innerHTML = rows.map(r => `
      <tr>
        <td><strong>${r.crop}</strong></td>
        <td>${r.market}</td>
        <td>${r.district || '—'}</td>
        <td>${String(r.date).slice(0,10)}</td>
        <td>${fmt(r.min_price)} – ${fmt(r.max_price)}</td>
        <td><strong style="color:#15803d;font-size:1rem;">${fmt(r.modal_price)}</strong></td>
      </tr>`).join('');
  } catch (e) {
    document.getElementById('prices-table-body').innerHTML =
      `<tr><td colspan="6"><div class="alert alert-error">Error: ${e.message}</div></td></tr>`;
  }

  // Load trend chart for selected crop
  loadTrendChart(
    document.getElementById('chart-crop').value,
    document.getElementById('chart-market').value
  );
}

async function loadTrendChart(crop, market) {
  try {
    const data = await apiFetch(`/market-prices/trend?crop=${encodeURIComponent(crop)}&market=${encodeURIComponent(market)}`);
    const pts = data.data;

    const labels = pts.map(p => String(p.date).slice(5));
    const prices = pts.map(p => p.modal_price);

    const ctx = document.getElementById('priceChart').getContext('2d');
    if (priceChart) priceChart.destroy();
    priceChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: `${crop} Modal Price (₹) at ${market}`,
          data: prices,
          borderColor: '#16a34a',
          backgroundColor: 'rgba(22,163,74,.1)',
          fill: true, tension: 0.4, pointRadius: 3,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: { y: { ticks: { callback: v => '₹' + v } } },
      },
    });
  } catch (e) { console.error('Chart error:', e); }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Farmer Listing Form
// ══════════════════════════════════════════════════════════════════════════════

async function submitFarmerListing(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-farmer-submit');
  const msg = document.getElementById('farmer-msg');
  btn.textContent = 'Submitting...'; btn.disabled = true;
  msg.className = 'alert hidden'; msg.textContent = '';

  const payload = {
    farmer_name:    document.getElementById('fl-name').value,
    crop:           document.getElementById('fl-crop').value,
    quantity:       parseFloat(document.getElementById('fl-qty').value),
    quality:        document.getElementById('fl-quality').value,
    expected_price: parseFloat(document.getElementById('fl-price').value),
    location:       document.getElementById('fl-location').value || null,
  };

  try {
    const data = await apiFetch('/farmer-listing', {
      method: 'POST', body: JSON.stringify(payload),
    });
    msg.textContent = `✅ Listing created! Your ID is #${data.id}. Save this to check matches.`;
    msg.className = 'alert alert-success';
    // Store last created listing ID
    localStorage.setItem('last_farmer_id', data.id);
    localStorage.setItem('last_farmer_name', data.farmer_name);
    localStorage.setItem('last_farmer_crop', data.crop);
    e.target.reset();
  } catch (err) {
    msg.textContent = '❌ Error: ' + err.message;
    msg.className = 'alert alert-error';
  } finally {
    btn.textContent = 'Submit Listing'; btn.disabled = false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — Buyer Request Form
// ══════════════════════════════════════════════════════════════════════════════

async function submitBuyerRequest(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-buyer-submit');
  const msg = document.getElementById('buyer-msg');
  btn.textContent = 'Submitting...'; btn.disabled = true;
  msg.className = 'alert hidden'; msg.textContent = '';

  const payload = {
    buyer_name:       document.getElementById('br-name').value,
    crop:             document.getElementById('br-crop').value,
    required_quantity: parseFloat(document.getElementById('br-qty').value),
    required_quality: document.getElementById('br-quality').value,
    offered_price:    parseFloat(document.getElementById('br-price').value),
    location:         document.getElementById('br-location').value || null,
  };

  try {
    const data = await apiFetch('/buyer-request', {
      method: 'POST', body: JSON.stringify(payload),
    });
    msg.textContent = `✅ Buyer request submitted! Request ID #${data.id}`;
    msg.className = 'alert alert-success';
    e.target.reset();
  } catch (err) {
    msg.textContent = '❌ Error: ' + err.message;
    msg.className = 'alert alert-error';
  } finally {
    btn.textContent = 'Submit Request'; btn.disabled = false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — Matching Results
// ══════════════════════════════════════════════════════════════════════════════

async function loadMatchSection() {
  const elem = document.getElementById('match-farmer-id');
  const lastId = localStorage.getItem('last_farmer_id');
  if (elem && lastId) elem.value = lastId;
}

async function findMatches() {
  const elem = document.getElementById('match-farmer-id');
  const farmerId = elem ? elem.value.trim() : '';
  if (!farmerId) { alert('Please enter a Farmer Listing ID.'); return; }

  const container = document.getElementById('matches-container');
  if (container) container.innerHTML = '<div class="loading">🔍 Finding matches...</div>';

  try {
    const data = await apiFetch(`/matches/${farmerId}`);
    const matches = data.matches;

    if (!matches.length) {
      if (container) container.innerHTML = `
        <div class="empty">
          <div class="empty-icon">🤝</div>
          <p>No buyer matches found for <strong>${data.crop}</strong>.</p>
          <p class="text-secondary mt-1">Ask buyers to post demand requests for this crop.</p>
        </div>`;
      return;
    }

    const html = `
      <div class="alert alert-info mb-2">
        Found <strong>${matches.length}</strong> buyer match(es) for
        <strong>${data.farmer_name}</strong>'s <strong>${data.crop}</strong> listing.
        Sorted by match score.
      </div>
      ${matches.map((m, i) => `
        <div class="score-box" style="border-color: ${i === 0 ? '#22c55e' : '#e5e7eb'};">
          <div>
            <div style="font-size:1.5rem;font-weight:800;color:${scoreColor(m.match_score)};">${m.match_score}<span style="font-size:.8rem;font-weight:400;color:#6b7280;">/100</span></div>
            <div style="font-size:.7rem;color:#6b7280;text-align:center;">Match</div>
          </div>
          <div class="score-details">
            <div class="score-name">
              ${i === 0 ? '🏆 ' : ''}${m.buyer_name}
              ${i === 0 ? '<span class="badge badge-green" style="margin-left:.5rem;">Best Match</span>' : ''}
            </div>
            <div style="font-size:.8rem;color:#6b7280;margin-bottom:.4rem;">
              ${m.crop} · ${m.required_quantity} Q needed · ${qualityBadge(m.required_quality)} quality · 
              <strong style="color:#15803d;">${fmt(m.offered_price)}/Q offered</strong>
              ${m.location ? ` · 📍 ${m.location}` : ''}
            </div>
            <ul class="score-reasons">
              ${m.reasons.map(r => `<li>${r}</li>`).join('')}
            </ul>
          </div>
        </div>`).join('')}`;

    if (container) container.innerHTML = html;
  } catch (e) {
    if (container) container.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — Smart Recommendation
// ══════════════════════════════════════════════════════════════════════════════

async function loadRecommendSection() {
  const elem = document.getElementById('rec-farmer-id');
  const lastId = localStorage.getItem('last_farmer_id');
  if (elem && lastId) elem.value = lastId;
}


async function getRecommendation() {
  const elem = document.getElementById('rec-farmer-id');
  const farmerId = elem ? elem.value.trim() : '';
  if (!farmerId) { alert('Please enter a Farmer Listing ID.'); return; }

  const container = document.getElementById('rec-container');
  if (container) container.innerHTML = '<div class="loading">🧠 Analyzing best opportunity...</div>';

  try {
    const r = await apiFetch(`/recommendation/${farmerId}`);

    const buyerCard = r.best_buyer ? `
      <div class="rec-box ${r.winner === 'buyer' ? 'rec-winner' : 'rec-runner'}">
        ${r.winner === 'buyer' ? '<div class="rec-title">🏆 Recommended Option</div>' : '<div class="rec-title">Option B</div>'}
        <div class="rec-name">🤝 ${r.best_buyer.name}</div>
        <div class="rec-price">${fmt(r.best_buyer.offered_price)}<small>/quintal</small></div>
        ${r.best_buyer.location ? `<div class="text-secondary mt-1">📍 ${r.best_buyer.location}</div>` : ''}
        <div style="margin-top:.5rem;">
          <span class="badge badge-green">Match Score: ${r.best_buyer.match_score}/100</span>
        </div>
      </div>` : '';

    const mandiCard = r.best_mandi ? `
      <div class="rec-box ${r.winner === 'mandi' ? 'rec-winner' : 'rec-runner'}">
        ${r.winner === 'mandi' ? '<div class="rec-title">🏆 Recommended Option</div>' : '<div class="rec-title">Option A</div>'}
        <div class="rec-name">🏛️ ${r.best_mandi.name} Mandi</div>
        <div class="rec-price">${fmt(r.best_mandi.modal_price)}<small>/quintal</small></div>
        <div class="text-secondary mt-1">Government market price</div>
      </div>` : '';

    if (container) {
      container.innerHTML = `
        <div style="margin-bottom:1.25rem;">
          <div style="font-size:.8rem;font-weight:600;text-transform:uppercase;color:#6b7280;margin-bottom:.25rem;">Crop</div>
          <div style="font-size:1.1rem;font-weight:700;">${r.crop}</div>
          <div class="text-secondary">Your expected price: ${fmt(r.expected_price)}/quintal</div>
        </div>

        ${r.winner === 'buyer' ? buyerCard + mandiCard : mandiCard + buyerCard}

        <div class="alert alert-info">
          <strong>💡 Recommendation: ${r.recommendation}</strong><br>
          <span style="font-size:.875rem;margin-top:.5rem;display:block;">${r.explanation}</span>
        </div>`;
    }
  } catch (e) {
    if (container) container.innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION HANDLERS
// ══════════════════════════════════════════════════════════════════════════════

async function handleSignIn(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-signin-submit');
  const msg = document.getElementById('signin-msg');
  btn.textContent = 'Signing in...'; btn.disabled = true;
  msg.className = 'alert hidden'; msg.textContent = '';

  const email = document.getElementById('signin-email').value;
  const password = document.getElementById('signin-password').value;

  try {
    const data = await apiFetch('/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    setAuth(data.token, data.user);
    msg.textContent = '✅ Sign in successful! Redirecting...';
    msg.className = 'alert alert-success';
    e.target.reset();
    setTimeout(() => {
      msg.className = 'alert hidden';
      if (data.user.role === 'farmer') showSection('sec-farmer');
      else showSection('sec-buyer-listings');
    }, 600);
  } catch (err) {
    msg.textContent = '❌ ' + err.message;
    msg.className = 'alert alert-error';
  } finally {
    btn.textContent = 'Sign In'; btn.disabled = false;
  }
}

async function handleSignUp(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-signup-submit');
  const msg = document.getElementById('signup-msg');
  btn.textContent = 'Creating account...'; btn.disabled = true;
  msg.className = 'alert hidden'; msg.textContent = '';

  const name = document.getElementById('signup-name').value;
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const role = document.getElementById('signup-role').value;

  try {
    const data = await apiFetch('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role })
    });
    setAuth(data.token, data.user);
    msg.textContent = '✅ Account created successfully! Redirecting...';
    msg.className = 'alert alert-success';
    e.target.reset();
    setTimeout(() => {
      msg.className = 'alert hidden';
      if (data.user.role === 'farmer') showSection('sec-farmer');
      else showSection('sec-buyer-listings');
    }, 600);
  } catch (err) {
    msg.textContent = '❌ ' + err.message;
    msg.className = 'alert alert-error';
  } finally {
    btn.textContent = 'Sign Up'; btn.disabled = false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// BUYER VIEW — AVAILABLE FARMER LISTINGS
// ══════════════════════════════════════════════════════════════════════════════

async function loadBuyerListings() {
  const tbody = document.getElementById('buyer-listings-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" class="loading">Loading listings...</td></tr>';

  const filterCropElem = document.getElementById('filter-buyer-listings-crop');
  const cropFilter = filterCropElem ? filterCropElem.value : '';

  try {
    let listings = await apiFetch('/farmer-listing');
    if (cropFilter) {
      listings = listings.filter(l => l.crop.toLowerCase() === cropFilter.toLowerCase());
    }

    if (!listings || !listings.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty">No farmer listings found.</td></tr>';
      return;
    }

    tbody.innerHTML = listings.map(l => `
      <tr>
        <td><strong>#${l.id}</strong></td>
        <td>${l.farmer_name}</td>
        <td><strong>${l.crop}</strong></td>
        <td>${l.quantity} Q</td>
        <td>${qualityBadge(l.quality)}</td>
        <td><strong style="color:#15803d;font-size:1rem;">${fmt(l.expected_price)}</strong></td>
        <td>${l.location || '—'}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="alert alert-error">Error loading listings: ${err.message}</div></td></tr>`;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Attach nav clicks
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      showSection(a.dataset.section);
    });
  });

  // Attach forms
  const farmerForm = document.getElementById('farmer-form');
  if (farmerForm) farmerForm.addEventListener('submit', submitFarmerListing);

  const buyerForm = document.getElementById('buyer-form');
  if (buyerForm) buyerForm.addEventListener('submit', submitBuyerRequest);

  const signinForm = document.getElementById('signin-form');
  if (signinForm) signinForm.addEventListener('submit', handleSignIn);

  const signupForm = document.getElementById('signup-form');
  if (signupForm) signupForm.addEventListener('submit', handleSignUp);

  // Chart controls
  const chartCrop = document.getElementById('chart-crop');
  const chartMarket = document.getElementById('chart-market');
  if (chartCrop && chartMarket) {
    chartCrop.addEventListener('change', () => loadTrendChart(chartCrop.value, chartMarket.value));
    chartMarket.addEventListener('change', () => loadTrendChart(chartCrop.value, chartMarket.value));
  }

  // Initialize Auth UI state
  updateAuthUI();

  // Start on home
  showSection('sec-home');
});


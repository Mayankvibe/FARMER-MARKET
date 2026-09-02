/**
 * Smart Mandi — MVP Frontend Script
 * All JavaScript in one file. Dynamic API base URL resolution.
 */

const API = (function() {
  if (window.location.port === "8000") return window.location.origin;
  const host = window.location.hostname || "localhost";
  return `${window.location.protocol}//${host}:8000`;
})();

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
    contact_number: document.getElementById('fl-phone').value || null,
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
    contact_number:   document.getElementById('br-phone').value || null,
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
        ${data.farmer_contact ? `(Your Contact: 📞 ${data.farmer_contact})` : ''}
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
            <div style="font-size:.85rem;color:#475569;margin-bottom:.4rem;">
              ${m.crop} · ${m.required_quantity} Q needed · ${qualityBadge(m.required_quality)} quality · 
              <strong style="color:#15803d;">${fmt(m.offered_price)}/Q offered</strong>
              ${m.location ? ` · 📍 ${m.location}` : ''}
              ${m.contact_number ? ` · <a href="tel:${m.contact_number}" style="color:#15803d;font-weight:700;text-decoration:none;">📞 ${m.contact_number}</a>` : ''}
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
// SECTION 6 — Smart Recommendation (Intelligent Detailed UI)
// ══════════════════════════════════════════════════════════════════════════════

async function loadRecommendSection() {
  const elem = document.getElementById('rec-farmer-id');
  const container = document.getElementById('rec-container');
  const user = getAuthUser();

  if (!user) {
    if (container) {
      container.innerHTML = `
        <div class="card text-center" style="padding: 2.5rem; text-align: center; background: white; border-radius: 14px;">
          <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">🔒</div>
          <h3 style="margin-bottom: 0.5rem; font-weight: 800; color: #0f172a;">Sign In Required for Recommendations</h3>
          <p class="text-secondary mb-3" style="max-width: 520px; margin: 0 auto 1.25rem; line-height: 1.5;">
            Please sign in or create an account to view AI-powered crop selling recommendations and buyer matches tailored to your crop listings.
          </p>
          <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="showSection('sec-signin')">🔑 Sign In</button>
            <button class="btn btn-outline" onclick="showSection('sec-signup')">🌱 Create Account</button>
          </div>
        </div>`;
    }
    return;
  }

  let lastId = localStorage.getItem('last_farmer_id');

  if (elem && lastId) {
    elem.value = lastId;
    getRecommendation();
    return;
  }

  // Attempt auto-loading latest farmer listing ID if no last_farmer_id in localStorage
  try {
    const listings = await apiFetch('/farmer-listing');
    if (listings && listings.length > 0) {
      const firstListing = listings[0];
      if (elem) elem.value = firstListing.id;
      localStorage.setItem('last_farmer_id', firstListing.id);
      getRecommendation();
      return;
    }
  } catch (err) {
    console.error('Info: Auto-fetching farmer listings for recommendation:', err);
  }

  // Initial fallback card if no listings exist
  if (container) {
    container.innerHTML = `
      <div class="card text-center" style="padding: 2.5rem; text-align: center; background: white; border-radius: 14px;">
        <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">🏆</div>
        <h3 style="margin-bottom: 0.5rem; font-weight: 800; color: #0f172a;">Smart Selling Recommendation</h3>
        <p class="text-secondary mb-3" style="max-width: 520px; margin: 0 auto 1.25rem; line-height: 1.5;">
          Enter your Farmer Listing ID above and click <strong>"Get Recommendation"</strong> to view AI-powered price analysis, Mandi comparisons, and buyer opportunities.
        </p>
        <button class="btn btn-primary" onclick="showSection('sec-farmer')">🌱 Sell Crop / Create Listing</button>
      </div>`;
  }
}

async function getRecommendation() {
  const user = getAuthUser();
  const container = document.getElementById('rec-container');

  if (!user) {
    if (container) {
      container.innerHTML = `
        <div class="card text-center" style="padding: 2.5rem; text-align: center; background: white; border-radius: 14px;">
          <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">🔒</div>
          <h3 style="margin-bottom: 0.5rem; font-weight: 800; color: #0f172a;">Sign In Required for Recommendations</h3>
          <p class="text-secondary mb-3" style="max-width: 520px; margin: 0 auto 1.25rem; line-height: 1.5;">
            Please sign in or create an account to view AI-powered crop selling recommendations.
          </p>
          <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="showSection('sec-signin')">🔑 Sign In</button>
            <button class="btn btn-outline" onclick="showSection('sec-signup')">🌱 Create Account</button>
          </div>
        </div>`;
    }
    return;
  }

  const elem = document.getElementById('rec-farmer-id');
  const farmerId = elem ? elem.value.trim() : '';
  if (!farmerId) { alert('Please enter a Farmer Listing ID.'); return; }

  if (container) container.innerHTML = '<div class="loading">🧠 Computing intelligent recommendation...</div>';

  try {
    const r = await apiFetch(`/recommendation/${farmerId}`);

    const isWinnerBuyer = r.winner === 'buyer';
    const isWinnerMandi = r.winner === 'mandi';

    const winnerPrice = r.winner_price || (isWinnerBuyer ? r.best_buyer?.offered_price : r.best_mandi?.modal_price) || 0;
    const totalPayout = r.total_payout || (winnerPrice * r.quantity);
    const avgPrice = r.market_avg_price || 0;
    const matchScore = r.best_buyer?.match_score || 85;
    const matchStatus = r.match_status || (matchScore >= 75 ? 'Strong Match' : (matchScore >= 50 ? 'Good Match' : 'Possible Match'));

    // Build "Why this is recommended" bullet points derived strictly from real data
    const whyReasons = [];
    if (r.best_buyer && isWinnerBuyer) {
      if (r.best_buyer.offered_price >= r.expected_price) {
        whyReasons.push(`Offered price (${fmt(r.best_buyer.offered_price)}/Q) meets or exceeds your expectation (${fmt(r.expected_price)}/Q).`);
      }
      if (avgPrice > 0 && r.best_buyer.offered_price > avgPrice) {
        whyReasons.push(`Buyer offer is ${fmt(Math.round(r.best_buyer.offered_price - avgPrice))}/Q higher than state market average (${fmt(avgPrice)}/Q).`);
      }
      whyReasons.push(`Buyer demand matches your exact crop (${r.crop}) and quality specification (Grade ${r.quality}).`);
      if (r.best_buyer.required_quantity >= r.quantity * 0.8) {
        whyReasons.push(`Buyer quantity demand (${r.best_buyer.required_quantity} Q) aligns with your available listing (${r.quantity} Q).`);
      }
    } else if (r.best_mandi && isWinnerMandi) {
      whyReasons.push(`Highest modal market price reported at ${r.best_mandi.name} Mandi (${fmt(r.best_mandi.modal_price)}/Q).`);
      if (r.best_mandi.modal_price >= r.expected_price) {
        whyReasons.push(`Mandi price exceeds your expected price by ${fmt(Math.round(r.best_mandi.modal_price - r.expected_price))}/Q.`);
      }
      whyReasons.push(`Active government market trading with reported price range ${fmt(r.best_mandi.min_price)} - ${fmt(r.best_mandi.max_price)}/Q.`);
    } else {
      whyReasons.push(`Recommended option provides the highest net payout based on available Chhattisgarh market data.`);
    }

    const html = `
      <!-- TOP: Recommendation Header Card -->
      <div class="card mb-3" style="background: linear-gradient(135deg, #064e3b, #047857); color: white; border-radius: 16px; padding: 1.75rem;">
        <div class="flex-between" style="flex-wrap:wrap;gap:.75rem;">
          <div>
            <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem;flex-wrap:wrap;">
              <span class="badge" style="background:#4ade80;color:#064e3b;font-weight:800;padding:.3rem .7rem;font-size:.75rem;">
                🌟 ${matchStatus} (${matchScore}/100)
              </span>
              <span class="badge" style="background:rgba(255,255,255,.2);color:white;font-weight:600;padding:.3rem .7rem;font-size:.75rem;">
                ✔ Verified Crop Listing #${r.farmer_id}
              </span>
            </div>
            <h2 style="font-size:1.6rem;font-weight:800;margin-bottom:.2rem;color:white;">🌾 ${r.crop} (Grade ${r.quality})</h2>
            <p style="opacity:.9;font-size:.9rem;color:white;">
              Listing by <strong>${r.farmer_name}</strong> · 📍 ${r.location || 'Chhattisgarh'} · 📦 ${r.quantity} Quintals
            </p>
          </div>
          <div style="text-align:right;background:rgba(255,255,255,.12);padding:1rem 1.25rem;border-radius:12px;backdrop-filter:blur(8px);">
            <div style="font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;opacity:.85;">Recommended Payout</div>
            <div style="font-size:1.8rem;font-weight:800;color:#86efac;">${fmt(winnerPrice)}<small style="font-weight:400;font-size:.8rem;color:white;">/Q</small></div>
            <div style="font-size:.8rem;opacity:.95;font-weight:600;">Est. Total: ${fmt(totalPayout)}</div>
          </div>
        </div>
      </div>

      <!-- MIDDLE: Comparison & Detailed Payout Grid -->
      <div class="grid-2 mb-3">
        <!-- Recommended Winner Card -->
        <div class="card" style="border: 2px solid #22c55e; background: #f0fdf4; border-radius: 14px; padding: 1.5rem;">
          <div class="flex-between mb-2">
            <span class="badge badge-green" style="font-size:.75rem;padding:.3rem .6rem;">🏆 Recommended Winner</span>
            <span style="font-size:.8rem;font-weight:700;color:#15803d;">Top Payout Channel</span>
          </div>

          ${isWinnerBuyer && r.best_buyer ? `
            <h3 style="font-size:1.25rem;font-weight:800;color:#0f172a;margin-bottom:.25rem;">🤝 ${r.best_buyer.name}</h3>
            <div class="price-tag mb-2">${fmt(r.best_buyer.offered_price)} <small style="font-size:.8rem;font-weight:500;color:#64748b;">per quintal</small></div>

            <div class="rec-details-grid mb-2">
              <div><strong>Buyer Role:</strong> Commodity Buyer</div>
              <div><strong>Offered Price:</strong> ${fmt(r.best_buyer.offered_price)}/Q</div>
              <div><strong>Required Qty:</strong> ${r.best_buyer.required_quantity} Quintals</div>
              <div><strong>Quality Grade:</strong> Grade ${r.best_buyer.required_quality}</div>
              <div><strong>Location:</strong> 📍 ${r.best_buyer.location || 'Chhattisgarh'}</div>
              <div><strong>Match Score:</strong> ${r.best_buyer.match_score}/100</div>
            </div>

            ${r.best_buyer.contact_number ? `
              <div style="background:#dcfce7;border:1px solid #86efac;border-radius:10px;padding:.75rem;margin-top:.75rem;">
                <div style="font-size:.78rem;font-weight:700;color:#166534;text-transform:uppercase;margin-bottom:.2rem;">Direct Buyer Contact</div>
                <div style="font-size:1rem;font-weight:800;color:#14532d;">
                  📱 <a href="tel:${r.best_buyer.contact_number}" style="color:#15803d;text-decoration:none;">${r.best_buyer.contact_number}</a>
                </div>
              </div>
            ` : ''}
          ` : `
            <h3 style="font-size:1.25rem;font-weight:800;color:#0f172a;margin-bottom:.25rem;">🏪 ${r.best_mandi?.name || 'Local'} Mandi</h3>
            <div class="price-tag mb-2">${fmt(r.best_mandi?.modal_price)} <small style="font-size:.8rem;font-weight:500;color:#64748b;">per quintal</small></div>

            <div class="rec-details-grid mb-2">
              <div><strong>Market Type:</strong> Government Mandi</div>
              <div><strong>Modal Price:</strong> ${fmt(r.best_mandi?.modal_price)}/Q</div>
              <div><strong>Price Range:</strong> ${fmt(r.best_mandi?.min_price)} - ${fmt(r.best_mandi?.max_price)}</div>
              <div><strong>District:</strong> ${r.best_mandi?.district || 'Chhattisgarh'}</div>
              <div><strong>Reported Date:</strong> ${r.best_mandi?.date || 'Latest'}</div>
            </div>
          `}
        </div>

        <!-- Alternative Payout & Market Benchmark Card -->
        <div class="card" style="border-radius: 14px; padding: 1.5rem;">
          <div class="flex-between mb-2">
            <span class="badge badge-gray" style="font-size:.75rem;padding:.3rem .6rem;">Alternative Channel</span>
            <span style="font-size:.8rem;color:#64748b;font-weight:600;">Benchmark Comparison</span>
          </div>

          ${isWinnerBuyer && r.best_mandi ? `
            <h3 style="font-size:1.15rem;font-weight:700;color:#334155;margin-bottom:.25rem;">🏪 ${r.best_mandi.name} Mandi</h3>
            <div style="font-size:1.4rem;font-weight:800;color:#475569;margin-bottom:.75rem;">${fmt(r.best_mandi.modal_price)} <small style="font-size:.8rem;font-weight:400;">/quintal</small></div>
            <div class="rec-details-grid">
              <div><strong>District:</strong> ${r.best_mandi.district || r.best_mandi.name}</div>
              <div><strong>Price Range:</strong> ${fmt(r.best_mandi.min_price)} - ${fmt(r.best_mandi.max_price)}</div>
              <div><strong>State Avg Price:</strong> ${fmt(avgPrice)}</div>
              <div><strong>Buyer Premium:</strong> +${fmt(r.best_buyer?.offered_price - r.best_mandi.modal_price)}/Q</div>
            </div>
          ` : r.best_buyer ? `
            <h3 style="font-size:1.15rem;font-weight:700;color:#334155;margin-bottom:.25rem;">🤝 ${r.best_buyer.name}</h3>
            <div style="font-size:1.4rem;font-weight:800;color:#475569;margin-bottom:.75rem;">${fmt(r.best_buyer.offered_price)} <small style="font-size:.8rem;font-weight:400;">/quintal</small></div>
            <div class="rec-details-grid">
              <div><strong>Buyer Requirement:</strong> ${r.best_buyer.required_quantity} Quintals</div>
              <div><strong>Buyer Contact:</strong> ${r.best_buyer.contact_number ? '📱 ' + r.best_buyer.contact_number : 'Not provided'}</div>
              <div><strong>State Avg Price:</strong> ${fmt(avgPrice)}</div>
            </div>
          ` : `
            <h3 style="font-size:1.15rem;font-weight:700;color:#334155;margin-bottom:.25rem;">📊 State Mandi Benchmark</h3>
            <div style="font-size:1.4rem;font-weight:800;color:#475569;margin-bottom:.75rem;">${fmt(avgPrice)} <small style="font-size:.8rem;font-weight:400;">/quintal avg</small></div>
            <p class="text-secondary">Average modal price across all major Chhattisgarh mandis.</p>
          `}
        </div>
      </div>

      <!-- USER DETAILS SECTION -->
      <div class="card mb-3" style="background:#f8fafc;border-radius:14px;">
        <div class="card-title mb-2" style="font-size:1.05rem;color:#0f172a;">📋 Marketplace User & Listing Details</div>
        <div class="grid-2">
          <div>
            <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;color:#16a34a;margin-bottom:.35rem;">👤 Recommended Farmer Profile</div>
            <div style="font-size:.9rem;line-height:1.7;color:#334155;">
              <strong>Farmer Name:</strong> ${r.farmer_name}<br>
              <strong>Mobile Number:</strong> ${r.contact_number ? `<a href="tel:${r.contact_number}" style="color:#15803d;font-weight:700;">📱 ${r.contact_number}</a>` : 'Not provided'}<br>
              <strong>Location:</strong> 📍 ${r.location || 'Chhattisgarh'}<br>
              <strong>Crop & Quality:</strong> 🌾 ${r.crop} (Grade ${r.quality})<br>
              <strong>Available Quantity:</strong> 📦 ${r.quantity} Quintals<br>
              <strong>Expected Price:</strong> 💰 ${fmt(r.expected_price)}/quintal
            </div>
          </div>
          <div>
            <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;color:#0284c7;margin-bottom:.35rem;">👤 Recommended Buyer Profile</div>
            <div style="font-size:.9rem;line-height:1.7;color:#334155;">
              ${r.best_buyer ? `
                <strong>Buyer Name:</strong> ${r.best_buyer.name}<br>
                <strong>Mobile Number:</strong> ${r.best_buyer.contact_number ? `<a href="tel:${r.best_buyer.contact_number}" style="color:#0284c7;font-weight:700;">📱 ${r.best_buyer.contact_number}</a>` : 'Not provided'}<br>
                <strong>Location:</strong> 📍 ${r.best_buyer.location || 'Chhattisgarh'}<br>
                <strong>Required Crop:</strong> 🌾 ${r.best_buyer.crop} (Grade ${r.best_buyer.required_quality})<br>
                <strong>Required Quantity:</strong> 📦 ${r.best_buyer.required_quantity} Quintals<br>
                <strong>Offered Price:</strong> 💰 ${fmt(r.best_buyer.offered_price)}/quintal
              ` : `
                <em>No direct buyer offer. Best channel is ${r.best_mandi?.name || 'Local'} Mandi Market.</em>
              `}
            </div>
          </div>
        </div>
      </div>

      <!-- WHY THIS IS RECOMMENDED -->
      <div class="card mb-3" style="border-left: 5px solid #22c55e; border-radius: 12px; background: white;">
        <div style="font-size:1.1rem;font-weight:800;color:#14532d;margin-bottom:.6rem;">
          🤖 Why This Is Recommended
        </div>
        <ul style="list-style:none;padding-left:0;">
          ${whyReasons.map(reason => `
            <li style="font-size:.9rem;color:#1e293b;padding:.4rem 0;display:flex;align-items:flex-start;gap:.5rem;">
              <span style="color:#16a34a;font-weight:800;">✓</span>
              <span>${reason}</span>
            </li>
          `).join('')}
        </ul>
        <p style="font-size:.875rem;color:#475569;margin-top:.75rem;padding-top:.75rem;border-top:1px solid #f1f5f9;line-height:1.5;">
          <strong>Summary Verdict:</strong> ${r.explanation}
        </p>
      </div>

      <!-- ACTIONS -->
      <div style="display:flex;gap:1rem;flex-wrap:wrap;">
        ${(r.best_buyer?.contact_number || r.contact_number) ? `
          <a href="tel:${r.best_buyer?.contact_number || r.contact_number}" class="btn btn-primary btn-lg" style="text-decoration:none;">
            📱 Contact ${r.best_buyer ? 'Buyer (' + r.best_buyer.name + ')' : 'Farmer (' + r.farmer_name + ')'}
          </a>
        ` : ''}
        <button class="btn btn-secondary btn-lg" onclick="showSection('sec-prices')">
          📊 View Mandi Prices
        </button>
      </div>
    `;

    if (container) container.innerHTML = html;
  } catch (e) {
    if (container) {
      container.innerHTML = `
        <div class="card" style="padding: 1.5rem; border-left: 5px solid #ef4444;">
          <div style="font-weight: 700; color: #dc2626; font-size: 1.1rem; margin-bottom: 0.5rem;">⚠️ Unable to retrieve recommendation</div>
          <p style="color: #4b5563; font-size: 0.9rem;">${e.message || 'Please check your listing ID and ensure the backend server is active.'}</p>
        </div>`;
    }
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
  const phone_number = document.getElementById('signup-phone').value;
  const password = document.getElementById('signup-password').value;
  const role = document.getElementById('signup-role').value;

  try {
    const data = await apiFetch('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, email, phone_number, password, role })
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
  tbody.innerHTML = '<tr><td colspan="8" class="loading">Loading listings...</td></tr>';

  const filterCropElem = document.getElementById('filter-buyer-listings-crop');
  const cropFilter = filterCropElem ? filterCropElem.value : '';

  try {
    let listings = await apiFetch('/farmer-listing');
    if (cropFilter) {
      listings = listings.filter(l => l.crop.toLowerCase() === cropFilter.toLowerCase());
    }

    if (!listings || !listings.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty">No farmer listings found.</td></tr>';
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
        <td>${l.contact_number ? `<a href="tel:${l.contact_number}" style="color:#15803d;font-weight:700;text-decoration:none;">📞 ${l.contact_number}</a>` : '—'}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="alert alert-error">Error loading listings: ${err.message}</div></td></tr>`;
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



/**
 * FarmMarket AI — MVP Frontend Script
 * All JavaScript in one file. Talks to FastAPI backend at localhost:8000.
 */

const API = 'http://localhost:8000';

// ── Navigation ────────────────────────────────────────────────────────────────
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelector(`.nav-links a[data-section="${id}"]`).classList.add('active');

  // Load section data on first visit
  if (id === 'sec-prices')      loadPrices();
  if (id === 'sec-matches')     loadMatchSection();
  if (id === 'sec-recommend')   loadRecommendSection();
}

// ── API helper ────────────────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const res = await fetch(API + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `Error ${res.status}`);
  return data;
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
  const lastId = localStorage.getItem('last_farmer_id');
  if (lastId) document.getElementById('match-farmer-id').value = lastId;
}

async function findMatches() {
  const farmerId = document.getElementById('match-farmer-id').value.trim();
  if (!farmerId) { alert('Please enter a Farmer Listing ID.'); return; }

  document.getElementById('matches-container').innerHTML =
    '<div class="loading">🔍 Finding matches...</div>';

  try {
    const data = await apiFetch(`/matches/${farmerId}`);
    const matches = data.matches;

    if (!matches.length) {
      document.getElementById('matches-container').innerHTML = `
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

    document.getElementById('matches-container').innerHTML = html;
  } catch (e) {
    document.getElementById('matches-container').innerHTML =
      `<div class="alert alert-error">Error: ${e.message}</div>`;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — Smart Recommendation
// ══════════════════════════════════════════════════════════════════════════════

async function loadRecommendSection() {
  const lastId = localStorage.getItem('last_farmer_id');
  if (lastId) document.getElementById('rec-farmer-id').value = lastId;
}

async function getRecommendation() {
  const farmerId = document.getElementById('rec-farmer-id').value.trim();
  if (!farmerId) { alert('Please enter a Farmer Listing ID.'); return; }

  document.getElementById('rec-container').innerHTML =
    '<div class="loading">🧠 Analyzing best opportunity...</div>';

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

    document.getElementById('rec-container').innerHTML = `
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
  } catch (e) {
    document.getElementById('rec-container').innerHTML =
      `<div class="alert alert-error">Error: ${e.message}</div>`;
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
  document.getElementById('farmer-form').addEventListener('submit', submitFarmerListing);
  document.getElementById('buyer-form').addEventListener('submit', submitBuyerRequest);

  // Chart controls
  document.getElementById('chart-crop').addEventListener('change', () =>
    loadTrendChart(document.getElementById('chart-crop').value, document.getElementById('chart-market').value));
  document.getElementById('chart-market').addEventListener('change', () =>
    loadTrendChart(document.getElementById('chart-crop').value, document.getElementById('chart-market').value));

  // Start on home
  showSection('sec-home');
});

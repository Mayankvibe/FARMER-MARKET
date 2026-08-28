# FarmMarket AI — MVP

> **"Know when, where, and to whom to sell."**

A simple college-level SIH prototype. Single-page frontend + single-file FastAPI backend.

---

## Project Structure

```
mvp/
  backend/
    main.py              ← All API routes and logic
    requirements.txt     ← Python dependencies
  frontend/
    index.html           ← Single-page application (6 sections)
    style.css            ← Styling
    script.js            ← All frontend logic
  data/
    market_prices.csv    ← Demo mandi price data
  README.md
```

---

## Prerequisites

- Python 3.10+
- PostgreSQL installed and running
- pip

---

## Setup Instructions

### Step 1 — Create the PostgreSQL database

Open your PostgreSQL client (pgAdmin or psql) and run:

```sql
CREATE DATABASE farmmarket_mvp;
```

> The default connection uses `postgres` user with password `postgres`.  
> If yours is different, edit `DATABASE_URL` in Step 3.

---

### Step 2 — Install Python dependencies

```bash
cd mvp/backend
pip install -r requirements.txt
```

---

### Step 3 — Configure database connection (if needed)

The default URL is:
```
postgresql://postgres:postgres@localhost:5432/farmmarket_mvp
```

To use a different username/password, set an environment variable before running:

**Windows (PowerShell):**
```powershell
$env:DATABASE_URL = "postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/farmmarket_mvp"
```

**Linux/Mac:**
```bash
export DATABASE_URL="postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/farmmarket_mvp"
```

---

### Step 4 — Start the backend

```bash
cd mvp/backend
uvicorn main:app --reload --port 8000
```

The backend will:
- Auto-create the two tables (`farmer_listings`, `buyer_requests`) on first run
- Serve the API at `http://localhost:8000`
- Show interactive docs at `http://localhost:8000/docs`

---

### Step 5 — Open the frontend

Simply open `mvp/frontend/index.html` in your browser.

> No server needed for the frontend. Just open the HTML file directly.

```
File → Open → mvp/frontend/index.html
```

Or use a simple static server (optional):
```bash
cd mvp/frontend
python -m http.server 3000
# Then open http://localhost:3000
```

---

## Demo Flow

Follow these steps to demonstrate the complete flow:

1. **Market Prices** → View current mandi prices. Filter by crop or market. See price trend chart.

2. **Sell Crop** → Fill farmer form (e.g., Tomato, 50 quintals, Grade A, ₹1300/Q, Durg). Submit → **Note your Listing ID**.

3. **Buy Crop** → Fill buyer form (e.g., Tomato, 100 quintals, Grade A, ₹1500/Q offered, Raipur). Submit.

4. **Match Results** → Enter your Listing ID → See all matching buyers scored out of 100 with reasons.

5. **Recommendation** → Enter your Listing ID → System compares best buyer (₹1500) vs best mandi (₹1350) → Recommends selling to buyer.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| GET | `/market-prices/latest` | Latest price per crop+market |
| GET | `/market-prices/trend?crop=Tomato&market=Raipur` | Price history for chart |
| GET | `/market-prices?crop=Tomato` | Filtered prices |
| POST | `/farmer-listing` | Create farmer listing |
| GET | `/farmer-listing` | Get all listings |
| POST | `/buyer-request` | Create buyer request |
| GET | `/buyer-request` | Get all requests |
| GET | `/matches/{farmer_id}` | Matched buyers for a listing |
| GET | `/recommendation/{farmer_id}` | Best selling recommendation |

---

## Matching Score Formula

| Factor | Points |
|--------|--------|
| Same crop | Mandatory |
| Quantity compatibility | 30 pts |
| Quality match | 20 pts |
| Price advantage | 50 pts |
| **Total** | **100 pts** |

---

## Demo Credentials

No authentication required for the MVP.

---

## Troubleshooting

**"Connection refused" error:**  
Make sure PostgreSQL is running and the `DATABASE_URL` is correct.

**"CSV file not found" error:**  
Make sure you're running `uvicorn` from inside `mvp/backend/`, not from the root.

**CORS error in browser:**  
Make sure the backend is running at `http://localhost:8000`.

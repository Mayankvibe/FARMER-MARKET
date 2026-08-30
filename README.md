# FarmMarket AI — MVP

A simple smart crop selling platform prototype connecting farmers with local buyers and government mandi price insights.

## Project Structure

```text
mvp/
│
├── backend/
│   ├── main.py            ← Full FastAPI backend
│   ├── requirements.txt   ← Dependencies
│   └── .env               ← Local environment configuration
│
├── frontend/
│   ├── index.html         ← Web interface
│   ├── style.css          ← Stylesheet
│   └── script.js          ← Application logic
│
├── data/
│   └── market_prices.csv  ← Mandi price dataset
│
├── .env.example
├── .gitignore
└── README.md
```

---

## Quick Start Guide

### 1. Activate Virtual Environment

**Windows (PowerShell):**
```powershell
cd mvp/backend
.\venv\Scripts\activate
```

**Linux / macOS:**
```bash
cd mvp/backend
source venv/bin/activate
```

*(If creating a new venv: `python -m venv venv` then `pip install -r requirements.txt`)*

---

### 2. Start PostgreSQL Database

Ensure PostgreSQL service is running on your machine:

**Windows:** Start PostgreSQL via `pgAdmin` or Windows Services.  
**Linux / macOS:**
```bash
sudo service postgresql start
```

Ensure the database specified in your `DATABASE_URL` (e.g. `SIH` or `farmmarket_db`) exists in PostgreSQL.

---

### 3. Start FastAPI Backend

From inside the `mvp/backend` directory:

```bash
cd backend
uvicorn main:app --reload --port 8000
```

The backend server will run at:
- **API URL**: `http://localhost:8000`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`

---

### 4. Open Frontend

Open `mvp/frontend/index.html` using VS Code **Live Server** extension or open directly in your web browser:

- **VS Code**: Right-click `mvp/frontend/index.html` → **Open with Live Server** (runs at `http://127.0.0.1:5500`).
- **Direct Browser**: Double-click `mvp/frontend/index.html` in file explorer.

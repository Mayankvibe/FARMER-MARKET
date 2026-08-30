
import os
import hashlib
import hmac
import jwt
import pandas as pd
from pathlib import Path
from typing import Optional, List
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, text
from sqlalchemy.orm import declarative_base, sessionmaker


load_dotenv()


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:Password123@localhost:5432/SIH"
)
CSV_PATH = Path(__file__).parent.parent / "data" / "market_prices.csv"
JWT_SECRET = os.getenv("JWT_SECRET", "farmmarket_ai_secret_key_2026_super_secure_mvp")

JWT_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    """Hash password using PBKDF2-HMAC-SHA256 with random 16-byte salt."""
    salt = os.urandom(16).hex()
    pwd_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100000
    ).hex()
    return f"{salt}${pwd_hash}"


def verify_password(plain_password: str, stored_password: str) -> bool:
    """Verify plain password against stored salt$hash string."""
    try:
        salt, pwd_hash = stored_password.split("$")
        computed_hash = hashlib.pbkdf2_hmac(
            "sha256",
            plain_password.encode("utf-8"),
            salt.encode("utf-8"),
            100000
        ).hex()
        return hmac.compare_digest(computed_hash, pwd_hash)
    except Exception:
        return False


def create_access_token(data: dict) -> str:
    """Create JWT access token with 7-day expiration."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Decode JWT token and return payload if valid."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except Exception:
        return None


engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()



class User(Base):
    __tablename__ = "users"
    id            = Column(Integer, primary_key=True, index=True)
    name          = Column(String, nullable=False)
    email         = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role          = Column(String, nullable=False)  # "farmer" or "buyer"
    created_at    = Column(DateTime, default=datetime.utcnow)


class FarmerListing(Base):
    __tablename__ = "farmer_listings"
    id            = Column(Integer, primary_key=True, index=True)
    farmer_name   = Column(String, nullable=False)
    crop          = Column(String, nullable=False)
    quantity      = Column(Float, nullable=False)   # in quintals
    quality       = Column(String, nullable=False)  # A / B / C
    expected_price= Column(Float, nullable=False)   # ₹ per quintal
    location      = Column(String, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)


class BuyerRequest(Base):
    __tablename__ = "buyer_requests"
    id               = Column(Integer, primary_key=True, index=True)
    buyer_name       = Column(String, nullable=False)
    crop             = Column(String, nullable=False)
    required_quantity= Column(Float, nullable=False)
    required_quality = Column(String, nullable=False)  # A / B / C / Any
    offered_price    = Column(Float, nullable=False)   # ₹ per quintal
    location         = Column(String, nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow)



Base.metadata.create_all(bind=engine)


app = FastAPI(title="FarmMarket AI MVP", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)



class UserSignUpIn(BaseModel):
    name:     str
    email:    str
    password: str
    role:     str  # "farmer" or "buyer"


class UserSignInIn(BaseModel):
    email:    str
    password: str


class FarmerListingIn(BaseModel):
    farmer_name:    str
    crop:           str
    quantity:       float
    quality:        str
    expected_price: float
    location:       Optional[str] = None


class BuyerRequestIn(BaseModel):
    buyer_name:       str
    crop:             str
    required_quantity: float
    required_quality: str
    offered_price:    float
    location:         Optional[str] = None


def signup(data: UserSignUpIn):
    role_clean = data.role.lower().strip()
    if role_clean not in ["farmer", "buyer"]:
        raise HTTPException(status_code=400, detail="Invalid role. Select Farmer/Seller or Buyer.")

    email_clean = data.email.lower().strip()
    if not email_clean or "@" not in email_clean:
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")

    if len(data.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters long.")

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email_clean).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered. Please sign in instead.")

        user = User(
            name=data.name.strip(),
            email=email_clean,
            hashed_password=hash_password(data.password),
            role=role_clean
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        user_info = {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role
        }
        token = create_access_token(user_info)
        return {
            "message": "User registered successfully",
            "token": token,
            "user": user_info
        }
    finally:
        db.close()


@app.post("/auth/signin")
def signin(data: UserSignInIn):
    email_clean = data.email.lower().strip()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email_clean).first()
        if not user or not verify_password(data.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        user_info = {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role
        }
        token = create_access_token(user_info)
        return {
            "message": "Sign in successful",
            "token": token,
            "user": user_info
        }
    finally:
        db.close()


@app.get("/auth/me")
def get_current_user_profile(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token header")

    token = authorization.split(" ")[1]
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token invalid or expired")

    return {"user": payload}




def load_prices() -> pd.DataFrame:
    df = pd.read_csv(CSV_PATH, parse_dates=["date"])
    df.columns = df.columns.str.strip()
    return df


QUALITY_RANK = {"A": 3, "B": 2, "C": 1, "Any": 0}

def compute_match_score(listing: FarmerListing, req: BuyerRequest) -> dict:
    """
    Simple match score out of 100.
      Crop match:   mandatory (0 if not same)
      Quantity:     30 pts
      Quality:      20 pts
      Price:        50 pts
    """
    # Crop must match
    if listing.crop.lower() != req.crop.lower():
        return {"score": 0, "reasons": ["Different crop"]}

    reasons = [f"Same crop: {listing.crop}"]
    score = 0


    ratio = listing.quantity / req.required_quantity if req.required_quantity > 0 else 0
    if 0.9 <= ratio <= 1.5:
        score += 30
        reasons.append(f"Quantity is compatible ({listing.quantity} Q vs {req.required_quantity} Q required)")
    elif ratio >= 0.6:
        score += 18
        reasons.append(f"Quantity partially meets requirement ({listing.quantity} Q vs {req.required_quantity} Q)")
    else:
        score += 5
        reasons.append(f"Quantity below requirement ({listing.quantity} Q vs {req.required_quantity} Q needed)")


    if req.required_quality == "Any":
        score += 20
        reasons.append("Buyer accepts any quality grade")
    elif listing.quality == req.required_quality:
        score += 20
        reasons.append(f"Quality matches exactly (Grade {listing.quality})")
    elif QUALITY_RANK.get(listing.quality, 0) > QUALITY_RANK.get(req.required_quality, 0):
        score += 15
        reasons.append(f"Your quality (Grade {listing.quality}) exceeds buyer requirement (Grade {req.required_quality})")
    else:
        reasons.append(f"Quality mismatch: you have Grade {listing.quality}, buyer needs Grade {req.required_quality}")

    # Price (50 pts)
    if req.offered_price >= listing.expected_price * 1.1:
        score += 50
        reasons.append(f"Excellent price! Buyer offers ₹{req.offered_price} vs your expectation ₹{listing.expected_price}")
    elif req.offered_price >= listing.expected_price:
        score += 40
        reasons.append(f"Good price: Buyer offers ₹{req.offered_price} (meets your expectation)")
    elif req.offered_price >= listing.expected_price * 0.95:
        score += 25
        reasons.append(f"Price slightly below expectation (₹{req.offered_price} vs ₹{listing.expected_price})")
    elif req.offered_price >= listing.expected_price * 0.85:
        score += 10
        reasons.append(f"Price below expectation by ₹{round(listing.expected_price - req.offered_price)}/quintal")
    else:
        reasons.append(f"Price too low: Buyer offers ₹{req.offered_price}, you expect ₹{listing.expected_price}")

    return {"score": round(score), "reasons": reasons}




@app.get("/")
def root():
    return {"message": "FarmMarket AI MVP is running!", "docs": "/docs"}


@app.get("/market-prices")
def get_market_prices(crop: Optional[str] = None, market: Optional[str] = None):
    """
    Returns market price data from the CSV file.
    Optionally filter by crop or market.
    """
    try:
        df = load_prices()
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail=f"CSV file not found at {CSV_PATH}")

    if crop:
        df = df[df["crop"].str.lower() == crop.lower()]
    if market:
        df = df[df["market"].str.lower() == market.lower()]

    # Sort by date descending
    df = df.sort_values("date", ascending=False)

    return {
        "count": len(df),
        "data": df.to_dict(orient="records"),
        "crops": sorted(df["crop"].unique().tolist()) if not crop else None,
        "markets": sorted(df["market"].unique().tolist()) if not market else None,
    }


@app.get("/market-prices/latest")
def get_latest_prices():
    """Returns the latest price per crop per market."""
    try:
        df = load_prices()
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="CSV file not found")

    # Latest price per crop+market
    latest = df.sort_values("date", ascending=False).groupby(["crop", "market"]).first().reset_index()
    latest["date"] = latest["date"].astype(str)
    return {"count": len(latest), "data": latest.to_dict(orient="records")}


@app.get("/market-prices/trend")
def get_price_trend(crop: str, market: str):
    """Returns price history for a crop+market pair (for chart)."""
    try:
        df = load_prices()
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="CSV file not found")

    filtered = df[
        (df["crop"].str.lower() == crop.lower()) &
        (df["market"].str.lower() == market.lower())
    ].sort_values("date")

    filtered["date"] = filtered["date"].astype(str)
    return {"crop": crop, "market": market, "data": filtered.to_dict(orient="records")}


@app.post("/farmer-listing", status_code=201)
def create_farmer_listing(data: FarmerListingIn):
    """Create a new farmer crop listing."""
    db = SessionLocal()
    try:
        listing = FarmerListing(**data.model_dump())
        db.add(listing)
        db.commit()
        db.refresh(listing)
        return {
            "message": "Listing created successfully",
            "id": listing.id,
            "farmer_name": listing.farmer_name,
            "crop": listing.crop,
            "quantity": listing.quantity,
            "quality": listing.quality,
            "expected_price": listing.expected_price,
            "location": listing.location,
        }
    finally:
        db.close()


@app.get("/farmer-listing")
def get_farmer_listings():
    """Get all farmer listings."""
    db = SessionLocal()
    try:
        listings = db.query(FarmerListing).order_by(FarmerListing.created_at.desc()).all()
        return [
            {
                "id": l.id, "farmer_name": l.farmer_name, "crop": l.crop,
                "quantity": l.quantity, "quality": l.quality,
                "expected_price": l.expected_price, "location": l.location,
            }
            for l in listings
        ]
    finally:
        db.close()


@app.post("/buyer-request", status_code=201)
def create_buyer_request(data: BuyerRequestIn):
    """Create a new buyer demand request."""
    db = SessionLocal()
    try:
        req = BuyerRequest(**data.model_dump())
        db.add(req)
        db.commit()
        db.refresh(req)
        return {
            "message": "Buyer request created successfully",
            "id": req.id,
            "buyer_name": req.buyer_name,
            "crop": req.crop,
            "required_quantity": req.required_quantity,
            "required_quality": req.required_quality,
            "offered_price": req.offered_price,
            "location": req.location,
        }
    finally:
        db.close()


@app.get("/buyer-request")
def get_buyer_requests():
    """Get all buyer requests."""
    db = SessionLocal()
    try:
        reqs = db.query(BuyerRequest).order_by(BuyerRequest.created_at.desc()).all()
        return [
            {
                "id": r.id, "buyer_name": r.buyer_name, "crop": r.crop,
                "required_quantity": r.required_quantity,
                "required_quality": r.required_quality,
                "offered_price": r.offered_price, "location": r.location,
            }
            for r in reqs
        ]
    finally:
        db.close()


@app.get("/matches/{farmer_id}")
def get_matches(farmer_id: int):
    """
    Find all buyer requests that match a farmer's listing.
    Returns scored matches sorted by score (highest first).
    """
    db = SessionLocal()
    try:
        listing = db.query(FarmerListing).filter(FarmerListing.id == farmer_id).first()
        if not listing:
            raise HTTPException(status_code=404, detail=f"Farmer listing {farmer_id} not found")

        buyers = db.query(BuyerRequest).filter(
            BuyerRequest.crop.ilike(listing.crop)
        ).all()

        results = []
        for b in buyers:
            match = compute_match_score(listing, b)
            if match["score"] > 0:
                results.append({
                    "buyer_id": b.id,
                    "buyer_name": b.buyer_name,
                    "crop": b.crop,
                    "required_quantity": b.required_quantity,
                    "required_quality": b.required_quality,
                    "offered_price": b.offered_price,
                    "location": b.location,
                    "match_score": match["score"],
                    "reasons": match["reasons"],
                })

        results.sort(key=lambda x: x["match_score"], reverse=True)
        return {
            "farmer_id": farmer_id,
            "farmer_name": listing.farmer_name,
            "crop": listing.crop,
            "matches": results,
            "total_matches": len(results),
        }
    finally:
        db.close()


@app.get("/recommendation/{farmer_id}")
def get_recommendation(farmer_id: int):
    """
    Smart selling recommendation:
    Compares best buyer offer vs best mandi (market) price for the crop.
    Returns a clear recommendation with explanation.
    """
    db = SessionLocal()
    try:
        listing = db.query(FarmerListing).filter(FarmerListing.id == farmer_id).first()
        if not listing:
            raise HTTPException(status_code=404, detail=f"Farmer listing {farmer_id} not found")

        
        buyers = db.query(BuyerRequest).filter(
            BuyerRequest.crop.ilike(listing.crop)
        ).all()

        best_buyer = None
        best_buyer_score = 0
        for b in buyers:
            match = compute_match_score(listing, b)
            if match["score"] > best_buyer_score:
                best_buyer_score = match["score"]
                best_buyer = b

        
        try:
            df = load_prices()
            crop_prices = df[df["crop"].str.lower() == listing.crop.lower()]
            latest_crop = crop_prices.sort_values("date", ascending=False).groupby("market").first().reset_index()

            best_mandi = None
            best_mandi_price = 0
            if not latest_crop.empty:
                best_row = latest_crop.loc[latest_crop["modal_price"].idxmax()]
                best_mandi = best_row["market"]
                best_mandi_price = float(best_row["modal_price"])
        except Exception:
            best_mandi = None
            best_mandi_price = 0

        
        buyer_price  = best_buyer.offered_price if best_buyer else 0
        mandi_price  = best_mandi_price

        if buyer_price == 0 and mandi_price == 0:
            return {
                "farmer_id": farmer_id,
                "crop": listing.crop,
                "recommendation": "No data available",
                "explanation": "No buyer requests or market price data found for this crop.",
                "best_buyer": None,
                "best_mandi": None,
            }

        if buyer_price >= mandi_price and best_buyer:
            recommendation = f"Sell to {best_buyer.buyer_name}"
            explanation = (
                f"{best_buyer.buyer_name} offers ₹{buyer_price}/quintal, "
                f"which is ₹{round(buyer_price - mandi_price)} more than the best mandi price "
                f"(₹{mandi_price} at {best_mandi}). "
                f"Match Score: {best_buyer_score}/100."
            )
            winner = "buyer"
        elif mandi_price > 0:
            recommendation = f"Sell at {best_mandi} Mandi"
            explanation = (
                f"{best_mandi} Mandi offers ₹{mandi_price}/quintal, "
                f"which is better than the best buyer offer "
                f"(₹{buyer_price}{' from ' + best_buyer.buyer_name if best_buyer else ''})."
            )
            winner = "mandi"
        else:
            recommendation = f"Sell to {best_buyer.buyer_name}"
            explanation = f"No mandi data found. Best buyer offers ₹{buyer_price}/quintal."
            winner = "buyer"

        return {
            "farmer_id": farmer_id,
            "crop": listing.crop,
            "expected_price": listing.expected_price,
            "recommendation": recommendation,
            "winner": winner,
            "explanation": explanation,
            "best_buyer": {
                "name": best_buyer.buyer_name,
                "offered_price": buyer_price,
                "location": best_buyer.location,
                "match_score": best_buyer_score,
            } if best_buyer else None,
            "best_mandi": {
                "name": best_mandi,
                "modal_price": mandi_price,
            } if best_mandi else None,
        }
    finally:
        db.close()

"""
Rivan Reality LLP - Customer App Backend
FastAPI + MongoDB customer platform with production auth flows.
"""
import asyncio
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Query
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, timezone
from pathlib import Path
import os
import uuid
import logging
import time
import json
import requests
from pymongo.errors import OperationFailure

from auth_service import (
    JWT_ALGORITHM,
    auth_methods_union,
    create_access_token,
    decode_token,
    hash_password,
    normalize_email,
    normalize_phone,
    now_utc,
    validate_password_strength,
    verify_google_id_token,
    verify_firebase_id_token,
    verify_password,
)

ROOT_DIR = Path(__file__).parent
LOCAL_STORE_PATH = ROOT_DIR / "local_auth_store.json"
load_dotenv(ROOT_DIR / '.env')


def get_env_value(*keys: str, default: str = "") -> str:
    for key in keys:
        value = os.environ.get(key, "").strip().strip("\"'")
        if value:
            return value
    return default


def get_env_bool(key: str, default: bool = False) -> bool:
    raw = os.environ.get(key)
    if raw is None:
        return default
    return raw.strip().strip("\"'").lower() in {"1", "true", "yes", "on"}


# ---------- Config ----------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "rivaan")
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_EXPIRES_MIN = int(os.environ.get("JWT_EXPIRE_MINUTES", "10080"))
ALLOW_LOCAL_AUTH_FALLBACK = get_env_bool("ALLOW_LOCAL_AUTH_FALLBACK", True)
GOOGLE_WEB_CLIENT_ID = get_env_value("GOOGLE_WEB_CLIENT_ID", "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID")
GOOGLE_ANDROID_CLIENT_ID = get_env_value("GOOGLE_ANDROID_CLIENT_ID", "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID")
GOOGLE_IOS_CLIENT_ID = get_env_value("GOOGLE_IOS_CLIENT_ID", "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID")
GOOGLE_ALLOWED_CLIENT_IDS = [
    value.strip()
    for value in get_env_value("GOOGLE_ALLOWED_CLIENT_IDS").split(",")
    if value.strip()
]
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
def get_firebase_project_id() -> str:
    return os.environ.get("FIREBASE_PROJECT_ID", "")


def get_google_client_ids() -> List[str]:
    return [
        client_id
        for client_id in (
            GOOGLE_WEB_CLIENT_ID,
            GOOGLE_ANDROID_CLIENT_ID,
            GOOGLE_IOS_CLIENT_ID,
            *GOOGLE_ALLOWED_CLIENT_IDS,
        )
        if client_id
    ]


VILLA_VIDEO_URL = "https://res.cloudinary.com/dzisksq78/video/upload/v1780939161/villa_1_ltxt2q.mp4"
CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,http://127.0.0.1:19006,https://rivan-auth-live.web.app,https://rivan-auth-live.firebaseapp.com",
    ).split(",")
    if origin.strip()
]
CORS_ORIGIN_REGEX = os.environ.get("CORS_ORIGIN_REGEX") or None

client = AsyncIOMotorClient(
    MONGO_URL,
    serverSelectionTimeoutMS=2000,
    connectTimeoutMS=2000,
    socketTimeoutMS=5000,
    appname="rivaan-backend",
)
db = client[DB_NAME]

app = FastAPI(title="Rivan Reality API")
api_router = APIRouter(prefix="/api")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("rivan")
DB_AVAILABILITY_TTL_SECONDS = float(os.environ.get("DB_AVAILABILITY_TTL_SECONDS", "4"))
DB_AVAILABILITY_TIMEOUT_SECONDS = float(
    os.environ.get(
        "DB_AVAILABILITY_TIMEOUT_SECONDS",
        "0.15" if ALLOW_LOCAL_AUTH_FALLBACK else "0.75",
    )
)
_db_availability_cache: Dict[str, Any] = {"value": None, "checked_at": 0.0}


def iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def load_local_store() -> Dict[str, Any]:
    if not LOCAL_STORE_PATH.exists():
        return {
            "users": [],
            "bookings": [],
            "plot_overrides": {},
            "otps": [],
            "visits": [],
            "leads": [],
            "opportunities": [],
            "tasks": [],
            "activities": [],
        }

    try:
        store = json.loads(LOCAL_STORE_PATH.read_text(encoding="utf-8"))
        store.setdefault("otps", [])
        store.setdefault("visits", [])
        store.setdefault("leads", [])
        store.setdefault("opportunities", [])
        store.setdefault("tasks", [])
        store.setdefault("activities", [])
        return store
    except (json.JSONDecodeError, OSError):
        return {
            "users": [],
            "bookings": [],
            "plot_overrides": {},
            "otps": [],
            "visits": [],
            "leads": [],
            "opportunities": [],
            "tasks": [],
            "activities": [],
        }


def save_local_store(store: Dict[str, Any]) -> None:
    LOCAL_STORE_PATH.write_text(json.dumps(store, indent=2), encoding="utf-8")


def phone_identity_variants(phone: Optional[str]) -> List[str]:
    if not phone:
        return []
    digits = "".join(ch for ch in phone if ch.isdigit())
    variants = {phone}
    if len(digits) >= 10:
        variants.add(digits[-10:])
    if digits.startswith("91") and len(digits) >= 12:
        variants.add(digits[-10:])
        variants.add(f"+{digits}")
    elif len(digits) == 10:
        variants.add(f"+91{digits}")
    return [value for value in variants if value]


def local_find_user(*, user_id: Optional[str] = None, email: Optional[str] = None, phone: Optional[str] = None, google_sub: Optional[str] = None) -> Optional[Dict[str, Any]]:
    store = load_local_store()
    phone_variants = set(phone_identity_variants(phone))
    for user in store.get("users", []):
        if user_id and user.get("id") == user_id:
            return user
        if email and user.get("email") == email:
            return user
        if phone and user.get("phone") in phone_variants:
            return user
        if google_sub and user.get("google_sub") == google_sub:
            return user
    return None


def local_save_user(user: Dict[str, Any]) -> Dict[str, Any]:
    store = load_local_store()
    users = store.setdefault("users", [])
    for index, existing in enumerate(users):
        if existing.get("id") == user.get("id"):
            users[index] = user
            save_local_store(store)
            return user
    users.append(user)
    save_local_store(store)
    return user


def local_upsert_otp(phone: str, code: str, expires_at: str) -> None:
    store = load_local_store()
    otps = [item for item in store.get("otps", []) if item.get("phone") != phone]
    otps.append({
        "phone": phone,
        "code": code,
        "expires_at": expires_at,
        "created_at": now_utc().isoformat(),
    })
    store["otps"] = otps
    save_local_store(store)


def local_get_otp(phone: str) -> Optional[Dict[str, Any]]:
    store = load_local_store()
    for item in reversed(store.get("otps", [])):
        if item.get("phone") == phone:
            return item
    return None


def local_delete_otp(phone: str) -> None:
    store = load_local_store()
    store["otps"] = [item for item in store.get("otps", []) if item.get("phone") != phone]
    save_local_store(store)


def ensure_local_demo_users() -> None:
    if not ALLOW_LOCAL_AUTH_FALLBACK:
        return

    demo_users = [
        {
            "id": "admin-user-001",
            "name": "Rivan Admin",
            "email": "admin@rivanreality.com",
            "phone": "+919000000000",
            "role": "admin",
            "auth_methods": ["email"],
            "address": "Rivan HQ, Hyderabad",
            "kyc_status": "verified",
            "is_admin": True,
            "email_verified": True,
            "phone_verified": True,
            "password_hash": hash_password("Admin@123"),
            "created_at": now_utc().isoformat(),
            "updated_at": now_utc().isoformat(),
            "last_login_at": now_utc().isoformat(),
        },
        {
            "id": "agent-main-001",
            "name": "Arjun Reddy",
            "email": "agent@rivaan.com",
            "phone": "+919900001111",
            "role": "agent",
            "age": 34,
            "aadhaar_number": "5555 6666 7777",
            "bank_details": "HDFC Bank · A/C XXXX1298 · IFSC HDFC0000456",
            "manager_name": "Regional Sales Director",
            "manager_id": None,
            "agent_brand_name": "Rivan Crest Partners",
            "sub_agent_ids": ["agent-sub-001"],
            "approval_status": "approved",
            "approved_by_manager": "Rivan Admin",
            "auth_methods": ["email"],
            "address": "Banjara Hills, Hyderabad",
            "kyc_status": "verified",
            "is_admin": False,
            "email_verified": True,
            "phone_verified": True,
            "password_hash": hash_password("Agent@123"),
            "created_at": now_utc().isoformat(),
            "updated_at": now_utc().isoformat(),
            "last_login_at": now_utc().isoformat(),
        },
        {
            "id": "agent-sub-001",
            "name": "Meghana Rao",
            "email": "subagent@rivaan.com",
            "phone": "+919911112222",
            "role": "sub_agent",
            "age": 28,
            "aadhaar_number": "8888 9999 0000",
            "bank_details": "ICICI Bank · A/C XXXX4432 · IFSC ICIC0000789",
            "manager_name": "Arjun Reddy",
            "manager_id": "agent-main-001",
            "agent_brand_name": "Rivan Crest Partners",
            "sub_agent_ids": [],
            "approval_status": "approved",
            "approved_by_manager": "Arjun Reddy",
            "auth_methods": ["email"],
            "address": "Gachibowli, Hyderabad",
            "kyc_status": "verified",
            "is_admin": False,
            "email_verified": True,
            "phone_verified": True,
            "password_hash": hash_password("Agent@123"),
            "created_at": now_utc().isoformat(),
            "updated_at": now_utc().isoformat(),
            "last_login_at": now_utc().isoformat(),
        },
        {
            "id": "agent-pending-001",
            "name": "Sandeep Kumar",
            "email": "pendingagent@rivaan.com",
            "phone": "+919922223333",
            "role": "agent",
            "age": 31,
            "aadhaar_number": "1111 2222 3333",
            "bank_details": "SBI Bank · A/C XXXX7821 · IFSC SBIN0001234",
            "manager_name": "Regional Sales Director",
            "manager_id": None,
            "agent_brand_name": "Rivan Crest Partners",
            "sub_agent_ids": [],
            "approval_status": "pending",
            "approved_by_manager": None,
            "auth_methods": ["email"],
            "address": "Kukatpally, Hyderabad",
            "kyc_status": "pending",
            "is_admin": False,
            "email_verified": True,
            "phone_verified": True,
            "password_hash": hash_password("Agent@123"),
            "created_at": now_utc().isoformat(),
            "updated_at": now_utc().isoformat(),
            "last_login_at": now_utc().isoformat(),
        },
        {
            "id": "customer-demo-001",
            "name": "Rahul Verma",
            "email": "rahul@example.com",
            "phone": "+919876543210",
            "role": "customer",
            "address": "Madhapur, Hyderabad",
            "kyc_status": "verified",
            "is_admin": False,
            "email_verified": True,
            "phone_verified": True,
            "auth_methods": ["phone"],
            "created_at": now_utc().isoformat(),
            "updated_at": now_utc().isoformat(),
            "last_login_at": now_utc().isoformat(),
        },
        {
            "id": "customer-demo-002",
            "name": "Sneha Iyer",
            "email": "sneha@example.com",
            "phone": "+919955443322",
            "role": "customer",
            "address": "Kondapur, Hyderabad",
            "kyc_status": "verified",
            "is_admin": False,
            "email_verified": True,
            "phone_verified": True,
            "auth_methods": ["phone"],
            "created_at": now_utc().isoformat(),
            "updated_at": now_utc().isoformat(),
            "last_login_at": now_utc().isoformat(),
        },
    ]

    for demo_user in demo_users:
        existing = local_find_user(user_id=demo_user["id"])
        if existing:
            merged = {**existing, **demo_user, "password_hash": existing.get("password_hash") or demo_user.get("password_hash")}
            local_save_user(merged)
        else:
            local_save_user(demo_user)

    store = load_local_store()
    bookings = store.setdefault("bookings", [])
    if not bookings:
        bookings.extend([
            {
                "id": "booking-agent-demo-1",
                "user_id": "customer-demo-001",
                "customer_id": "customer-demo-001",
                "plot_id": "plot-1-4",
                "property_id": "prop-1",
                "agent_id": "agent-main-001",
                "name": "Rahul Verma",
                "mobile": "+919876543210",
                "whatsapp": "+919876543210",
                "message": "Ready to close this week.",
                "status": "closed",
                "created_at": now_utc().isoformat(),
                "closed_at": now_utc().isoformat(),
            },
            {
                "id": "booking-agent-demo-2",
                "user_id": "customer-demo-002",
                "customer_id": "customer-demo-002",
                "plot_id": "villa-2-2",
                "property_id": "prop-2",
                "agent_id": "agent-sub-001",
                "name": "Sneha Iyer",
                "mobile": "+919955443322",
                "whatsapp": "+919955443322",
                "message": "Needs a weekend site visit before final confirmation.",
                "status": "pending",
                "created_at": now_utc().isoformat(),
            },
        ])
        plot_overrides = store.setdefault("plot_overrides", {})
        plot_overrides["plot-1-4"] = {"status": "booked", "owner_id": "customer-demo-001"}
        plot_overrides["villa-2-2"] = {"status": "reserved"}
        save_local_store(store)


LOCAL_FALLBACK_PROPERTIES: List[Dict[str, Any]] = [
    {
        "id": "prop-1",
        "name": "Rivan Greens",
        "category": "Open Plots",
        "location": "Shadnagar, Hyderabad",
        "starting_price": 1850000,
        "size": "200-360 sq yards",
        "image": "https://images.unsplash.com/photo-1677137263546-8695fb895a9d",
        "images": [
            "https://images.unsplash.com/photo-1677137263546-8695fb895a9d",
            "https://images.pexels.com/photos/15422584/pexels-photo-15422584.jpeg",
            "https://images.unsplash.com/photo-1500382017468-9049fed747ef",
        ],
        "description": "Premium gated community plots with landscaped avenues, modern amenities, and strong access to growth corridors.",
        "survey_number": "SY-No 234/3",
        "facing": "East / West / Corner",
        "road_width": "60 ft",
        "availability": "Available",
        "featured": True,
        "amenities": ["Clubhouse", "Avenue Plantation", "Children's Play Area", "Street Lighting"],
        "approvals": ["HMDA Approved", "RERA Registered", "Clear Title"],
        "nearby": ["ORR Exit 15 min", "Airport 35 min", "Pharma City 20 min"],
        "highlights": "Premium plots · Gated community · High growth corridor",
        "created_at": now_utc().isoformat(),
    },
    {
        "id": "prop-2",
        "name": "Rivan Heritage Villas",
        "category": "Villas",
        "location": "Kompally, Hyderabad",
        "starting_price": 14500000,
        "size": "2400-3800 sq ft",
        "image": "https://images.pexels.com/photos/29334668/pexels-photo-29334668.png",
        "videoUrl": VILLA_VIDEO_URL,
        "images": [
            "https://images.pexels.com/photos/29334668/pexels-photo-29334668.png",
            "https://images.unsplash.com/photo-1626249893783-cc4a9f66880a",
            "https://images.unsplash.com/photo-1564013799919-ab600027ffc6",
        ],
        "description": "Elegant villas with private courtyards, modern planning, and resort-like common spaces for family living.",
        "survey_number": "SY-No 89/2",
        "facing": "East / North-East / West",
        "road_width": "50 ft",
        "availability": "Available",
        "featured": True,
        "amenities": ["Clubhouse", "Swimming Pool", "Landscaped Courts", "Security"],
        "approvals": ["GHMC Approved", "RERA Registered", "Bank Loan Approved"],
        "nearby": ["Kompally IT belt 20 min", "Schools 10 min", "ORR 15 min"],
        "highlights": "Signature villas · Family-first layout · Lifestyle community",
        "created_at": now_utc().isoformat(),
    },
    {
        "id": "prop-3",
        "name": "Rivan Skyline Towers",
        "category": "Flats",
        "location": "Gachibowli, Hyderabad",
        "starting_price": 8500000,
        "size": "1450-2200 sq ft",
        "image": "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00",
        "images": [
            "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00",
            "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688",
            "https://images.unsplash.com/photo-1493809842364-78817add7ffb",
        ],
        "description": "Contemporary apartment towers with skyline views, premium amenities, and efficient family layouts.",
        "survey_number": "SY-No 11/1",
        "facing": "East / West / Corner",
        "road_width": "80 ft",
        "availability": "Available",
        "featured": True,
        "amenities": ["Swimming Pool", "Gym", "Multipurpose Hall", "Children's Play Area"],
        "approvals": ["GHMC Approved", "RERA Registered"],
        "nearby": ["Financial District 12 min", "Metro 15 min", "Schools 8 min"],
        "highlights": "City skyline · Premium flats · Rental potential",
        "created_at": now_utc().isoformat(),
    },
]

LOCAL_FALLBACK_PLOTS: List[Dict[str, Any]] = [
    {"id": "plot-1-1", "property_id": "prop-1", "agent_id": "agent-main-001", "unit_type": "plot", "plot_number": "P-001", "survey_number": "SY-No 234/3", "size": "200 sq yards", "size_sqy": 200, "facing": "East", "price": 1850000, "status": "available", "row": 0, "col": 0},
    {"id": "plot-1-2", "property_id": "prop-1", "agent_id": "agent-main-001", "unit_type": "plot", "plot_number": "P-002", "survey_number": "SY-No 234/3", "size": "240 sq yards", "size_sqy": 240, "facing": "West", "price": 2220000, "status": "reserved", "row": 0, "col": 1},
    {"id": "plot-1-3", "property_id": "prop-1", "agent_id": "agent-main-001", "unit_type": "plot", "plot_number": "P-003", "survey_number": "SY-No 234/3", "size": "300 sq yards", "size_sqy": 300, "facing": "North", "price": 2775000, "status": "available", "row": 0, "col": 2},
    {"id": "plot-1-4", "property_id": "prop-1", "agent_id": "agent-main-001", "unit_type": "plot", "plot_number": "P-004", "survey_number": "SY-No 234/3", "size": "260 sq yards", "size_sqy": 260, "facing": "South", "price": 2405000, "status": "available", "row": 1, "col": 0},
    {"id": "plot-1-5", "property_id": "prop-1", "agent_id": "agent-sub-001", "unit_type": "plot", "plot_number": "P-005", "survey_number": "SY-No 234/3", "size": "320 sq yards", "size_sqy": 320, "facing": "East", "price": 2960000, "status": "booked", "row": 1, "col": 1},
    {"id": "plot-1-6", "property_id": "prop-1", "agent_id": "agent-sub-001", "unit_type": "plot", "plot_number": "P-006", "survey_number": "SY-No 234/3", "size": "360 sq yards", "size_sqy": 360, "facing": "North-East", "price": 3330000, "status": "available", "row": 1, "col": 2},
    {"id": "villa-2-1", "property_id": "prop-2", "agent_id": "agent-main-001", "unit_type": "villa", "plot_number": "V-01", "survey_number": "SY-No 89/2", "villa_type": "4 BHK Courtyard", "size": "2400 sq ft", "facing": "East", "price": 14500000, "status": "available", "row": 0, "col": 0},
    {"id": "villa-2-2", "property_id": "prop-2", "agent_id": "agent-sub-001", "unit_type": "villa", "plot_number": "V-02", "survey_number": "SY-No 89/2", "villa_type": "4 BHK Corner", "size": "2850 sq ft", "facing": "North-East", "price": 16800000, "status": "reserved", "row": 0, "col": 1},
    {"id": "villa-2-3", "property_id": "prop-2", "agent_id": "agent-main-001", "unit_type": "villa", "plot_number": "V-03", "survey_number": "SY-No 89/2", "villa_type": "5 BHK Signature", "size": "3200 sq ft", "facing": "West", "price": 18900000, "status": "available", "row": 0, "col": 2},
    {"id": "flat-3-T1-F08-01", "property_id": "prop-3", "agent_id": "agent-main-001", "unit_type": "flat", "tower": "T1", "floor": 8, "plot_number": "T1-801", "flat_number": "T1-801", "bhk": "3 BHK", "survey_number": "SY-No 11/1", "size": "1450 sq ft", "size_sqft": 1450, "facing": "East", "price": 8500000, "status": "available", "row": 8, "col": 1},
    {"id": "flat-3-T1-F08-02", "property_id": "prop-3", "agent_id": "agent-main-001", "unit_type": "flat", "tower": "T1", "floor": 8, "plot_number": "T1-802", "flat_number": "T1-802", "bhk": "3.5 BHK", "survey_number": "SY-No 11/1", "size": "1750 sq ft", "size_sqft": 1750, "facing": "West", "price": 9300000, "status": "available", "row": 8, "col": 2},
    {"id": "flat-3-T2-F10-01", "property_id": "prop-3", "agent_id": "agent-sub-001", "unit_type": "flat", "tower": "T2", "floor": 10, "plot_number": "T2-1001", "flat_number": "T2-1001", "bhk": "4 BHK", "survey_number": "SY-No 11/1", "size": "2200 sq ft", "size_sqft": 2200, "facing": "North-East", "price": 12400000, "status": "sold", "row": 10, "col": 1},
]


def local_get_properties() -> List[Dict[str, Any]]:
    return [dict(item) for item in LOCAL_FALLBACK_PROPERTIES]


def local_get_property(property_id: str) -> Optional[Dict[str, Any]]:
    for item in LOCAL_FALLBACK_PROPERTIES:
        if item["id"] == property_id:
            return dict(item)
    return None


def local_get_plot_overrides() -> Dict[str, Any]:
    return load_local_store().setdefault("plot_overrides", {})


def local_save_plot_override(plot_id: str, override: Dict[str, Any]) -> None:
    store = load_local_store()
    plot_overrides = store.setdefault("plot_overrides", {})
    existing = plot_overrides.get(plot_id, {})
    plot_overrides[plot_id] = {**existing, **override}
    save_local_store(store)


def local_get_plots(property_id: Optional[str] = None) -> List[Dict[str, Any]]:
    overrides = local_get_plot_overrides()
    plots: List[Dict[str, Any]] = []
    for plot in LOCAL_FALLBACK_PLOTS:
        if property_id and plot["property_id"] != property_id:
            continue
        merged = {**plot, **overrides.get(plot["id"], {})}
        plots.append(merged)
    return plots


def local_get_plot(plot_id: str) -> Optional[Dict[str, Any]]:
    for plot in local_get_plots():
        if plot["id"] == plot_id:
            return plot
    return None


def local_list_bookings() -> List[Dict[str, Any]]:
    return load_local_store().setdefault("bookings", [])


def local_save_booking(booking: Dict[str, Any]) -> Dict[str, Any]:
    store = load_local_store()
    bookings = store.setdefault("bookings", [])
    for index, existing in enumerate(bookings):
        if existing.get("id") == booking.get("id"):
            bookings[index] = booking
            save_local_store(store)
            return booking
    bookings.append(booking)
    save_local_store(store)
    return booking


def local_update_booking(booking_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    store = load_local_store()
    bookings = store.setdefault("bookings", [])
    for index, existing in enumerate(bookings):
        if existing.get("id") == booking_id:
            bookings[index] = {**existing, **updates}
            save_local_store(store)
            return bookings[index]
    return None

def local_list_visits() -> List[Dict[str, Any]]:
    return load_local_store().setdefault("visits", [])

def local_save_visit(visit: Dict[str, Any]) -> Dict[str, Any]:
    store = load_local_store()
    visits = store.setdefault("visits", [])
    for index, existing in enumerate(visits):
        if existing.get("id") == visit.get("id"):
            visits[index] = visit
            save_local_store(store)
            return visit
    visits.append(visit)
    save_local_store(store)
    return visit

def local_update_visit(visit_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    store = load_local_store()
    visits = store.setdefault("visits", [])
    for index, existing in enumerate(visits):
        if existing.get("id") == visit_id:
            visits[index] = {**existing, **updates}
            save_local_store(store)
            return visits[index]
    return None


def local_list_collection(name: str) -> List[Dict[str, Any]]:
    return load_local_store().setdefault(name, [])


def local_get_collection_item(name: str, item_id: str) -> Optional[Dict[str, Any]]:
    for item in local_list_collection(name):
        if item.get("id") == item_id:
            return item
    return None


def local_save_collection_item(name: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    store = load_local_store()
    items = store.setdefault(name, [])
    for index, existing in enumerate(items):
        if existing.get("id") == payload.get("id"):
            items[index] = payload
            save_local_store(store)
            return payload
    items.append(payload)
    save_local_store(store)
    return payload


def local_delete_collection_item(name: str, item_id: str) -> None:
    store = load_local_store()
    store[name] = [item for item in store.setdefault(name, []) if item.get("id") != item_id]
    save_local_store(store)

def agent_accessible_ids(user: Dict[str, Any]) -> List[str]:
    sub_agent_ids = user.get("sub_agent_ids", []) if user.get("role") == "agent" else []
    return [user["id"], *sub_agent_ids]


async def is_database_available(timeout_seconds: Optional[float] = None, force_refresh: bool = False) -> bool:
    now = time.monotonic()
    cached_value = _db_availability_cache["value"]
    if (
        not force_refresh
        and cached_value is not None
        and (now - float(_db_availability_cache["checked_at"])) < DB_AVAILABILITY_TTL_SECONDS
    ):
        return bool(cached_value)

    try:
        await asyncio.wait_for(db.command("ping"), timeout=timeout_seconds or DB_AVAILABILITY_TIMEOUT_SECONDS)
        available = True
    except Exception:
        available = False

    _db_availability_cache["value"] = available
    _db_availability_cache["checked_at"] = now
    return available


async def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> Dict[str, Any]:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token, JWT_SECRET)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token subject")
    if await is_database_available():
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
    elif ALLOW_LOCAL_AUTH_FALLBACK:
        user = local_find_user(user_id=user_id)
    else:
        raise HTTPException(status_code=503, detail="Authentication database is unavailable")
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_admin_user(token: Optional[str] = Depends(oauth2_scheme)) -> Dict[str, Any]:
    user = await get_current_user(token)
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def is_agent_role(role: Optional[str]) -> bool:
    return role in {"agent", "sub_agent"}


async def get_agent_user(token: Optional[str] = Depends(oauth2_scheme)) -> Dict[str, Any]:
    user = await get_current_user(token)
    if not is_agent_role(user.get("role")):
        raise HTTPException(status_code=403, detail="Agent access required")
    if user.get("approval_status") != "approved":
        raise HTTPException(status_code=403, detail="Agent approval is still pending")
    return user


# ---------- Models ----------
class FirebaseAuthReq(BaseModel):
    id_token: str
    phone: str
    name: Optional[str] = None

class SendOtpReq(BaseModel):
    phone: str

class VerifyOtpReq(BaseModel):
    phone: str
    otp: str = Field(min_length=4, max_length=8)
    name: Optional[str] = None

class RegisterReq(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

class LoginReq(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

class GoogleAuthReq(BaseModel):
    id_token: str = Field(min_length=20)

class TokenResp(BaseModel):
    access_token: str
    user: Dict[str, Any]

class UpdateProfileReq(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    age: Optional[int] = None
    aadhaar_number: Optional[str] = None
    bank_details: Optional[str] = None

class BookingReq(BaseModel):
    plot_id: str
    name: str
    mobile: str
    whatsapp: Optional[str] = None
    message: Optional[str] = None

class ServiceReq(BaseModel):
    service_type: str
    property_id: Optional[str] = None
    preferred_date: str
    description: str
    contact: str

class VisitBookingReq(BaseModel):
    centre_id: str
    visit_date: str
    visit_time: str
    name: str
    mobile: str

class SiteVisitReq(BaseModel):
    property_id: str
    visit_date: str
    name: str
    mobile: str

class AgentBookingCreateReq(BaseModel):
    plot_id: str = Field(min_length=2)
    customer_name: str = Field(min_length=2, max_length=120)
    customer_phone: str = Field(min_length=8, max_length=20)
    customer_email: Optional[EmailStr] = None
    visit_date: Optional[str] = None
    visit_time: Optional[str] = None
    notes: Optional[str] = None

class AgentBookingStatusReq(BaseModel):
    status: str

class AgentUpsertReq(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    age: Optional[int] = None
    aadhaar_number: Optional[str] = None
    bank_details: Optional[str] = None
    status: Optional[str] = "active"

class AgentStatusReq(BaseModel):
    status: str

class AgentAssignReq(BaseModel):
    plot_ids: List[str] = Field(default_factory=list)

class AgentVisitReq(BaseModel):
    property_id: str
    plot_id: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: str = Field(min_length=2, max_length=120)
    customer_phone: str = Field(min_length=8, max_length=20)
    customer_email: Optional[EmailStr] = None
    visit_date: str
    visit_time: str
    assigned_agent_id: Optional[str] = None
    notes: Optional[str] = None

class AgentVisitUpdateReq(BaseModel):
    customer_id: Optional[str] = None
    customer_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    customer_phone: Optional[str] = Field(default=None, min_length=8, max_length=20)
    customer_email: Optional[EmailStr] = None
    status: Optional[str] = None
    visit_date: Optional[str] = None
    visit_time: Optional[str] = None
    assigned_agent_id: Optional[str] = None
    notes: Optional[str] = None
    feedback: Optional[str] = None

class WishlistReq(BaseModel):
    property_id: str

class PayInstallmentReq(BaseModel):
    installment_id: str

class AdminPropertyReq(BaseModel):
    name: str
    category: str
    location: str
    starting_price: float
    size: str
    image: str
    description: Optional[str] = ""
    survey_number: Optional[str] = ""
    facing: Optional[str] = ""
    road_width: Optional[str] = ""
    amenities: Optional[List[str]] = []
    approvals: Optional[List[str]] = []


CRM_STAGES = [
    "new",
    "contacted",
    "qualified",
    "site_visit_scheduled",
    "site_visit_completed",
    "negotiation",
    "booking_requested",
    "booked",
    "closed_won",
    "closed_lost",
]
CRM_CLOSED_STAGES = {"booked", "closed_won", "closed_lost"}
CRM_LOST_REASONS = {
    "budget",
    "location mismatch",
    "timing",
    "competitor",
    "unreachable",
    "not interested",
    "inventory unavailable",
    "duplicate",
    "other",
}
CRM_TASK_STATUSES = {"open", "completed"}
CRM_TASK_PRIORITIES = {"low", "medium", "high"}


class CRMLeadUpsertReq(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    source: Optional[str] = "manual"
    status: Optional[str] = "new"
    assigned_agent_id: Optional[str] = None
    assigned_sub_agent_id: Optional[str] = None
    customer_preferences: Optional[Dict[str, Any]] = {}
    tags: Optional[List[str]] = []
    notes_summary: Optional[str] = None
    next_follow_up_at: Optional[str] = None


class CRMLeadMergeReq(BaseModel):
    source_lead_id: str
    target_lead_id: str


class CRMOpportunityCreateReq(BaseModel):
    lead_id: str
    property_id: str
    plot_id: Optional[str] = None
    assigned_agent_id: Optional[str] = None
    stage: Optional[str] = "new"
    expected_value: Optional[float] = None
    interest_notes: Optional[str] = None
    priority: Optional[str] = "medium"


class CRMOpportunityUpdateReq(BaseModel):
    property_id: Optional[str] = None
    plot_id: Optional[str] = None
    assigned_agent_id: Optional[str] = None
    expected_value: Optional[float] = None
    interest_notes: Optional[str] = None
    priority: Optional[str] = None


class CRMOpportunityStageReq(BaseModel):
    stage: str
    lost_reason: Optional[str] = None


class CRMTaskCreateReq(BaseModel):
    lead_id: Optional[str] = None
    opportunity_id: Optional[str] = None
    assigned_to_user_id: Optional[str] = None
    task_type: str = Field(min_length=2, max_length=80)
    title: str = Field(min_length=2, max_length=140)
    description: Optional[str] = None
    due_at: Optional[str] = None
    priority: Optional[str] = "medium"


class CRMTaskUpdateReq(BaseModel):
    assigned_to_user_id: Optional[str] = None
    task_type: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    due_at: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None


class CRMTaskCompleteReq(BaseModel):
    completion_note: Optional[str] = None


class CRMReassignReq(BaseModel):
    lead_id: Optional[str] = None
    opportunity_id: Optional[str] = None
    task_id: Optional[str] = None
    assigned_agent_id: str
    assigned_sub_agent_id: Optional[str] = None


def crm_accessible_agent_ids(user: Dict[str, Any]) -> Optional[List[str]]:
    if user.get("is_admin"):
        return None
    if is_agent_role(user.get("role")):
        return agent_accessible_ids(user)
    return []


def crm_is_record_visible_to_user(user: Dict[str, Any], record: Dict[str, Any]) -> bool:
    if user.get("is_admin"):
        return True
    accessible_ids = crm_accessible_agent_ids(user)
    if accessible_ids is None:
        return True
    if not accessible_ids:
        return False
    owner_candidates = [
        record.get("assigned_agent_id"),
        record.get("assigned_sub_agent_id"),
        record.get("assigned_to_user_id"),
        record.get("agent_id"),
    ]
    return any(owner in accessible_ids for owner in owner_candidates if owner)


def crm_normalize_tags(tags: Optional[List[str]]) -> List[str]:
    return sorted({tag.strip() for tag in (tags or []) if tag and tag.strip()})


def crm_validate_stage(stage: str) -> str:
    value = stage.strip().lower()
    if value not in CRM_STAGES:
        raise HTTPException(status_code=400, detail="Invalid CRM stage")
    return value


def crm_validate_priority(priority: Optional[str]) -> str:
    value = (priority or "medium").strip().lower()
    if value not in CRM_TASK_PRIORITIES:
        raise HTTPException(status_code=400, detail="Invalid CRM priority")
    return value


def crm_validate_task_status(status_value: Optional[str]) -> str:
    value = (status_value or "open").strip().lower()
    if value not in CRM_TASK_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid CRM task status")
    return value


def crm_stage_allows_transition(current_stage: str, next_stage: str) -> bool:
    if current_stage == next_stage:
        return True
    if current_stage == "closed_lost" and next_stage not in {"contacted", "qualified", "new"}:
        return False
    if current_stage in {"booked", "closed_won"} and next_stage != current_stage:
        return False
    return next_stage in CRM_STAGES


def crm_is_overdue(due_at: Optional[str], status: str) -> bool:
    if status == "completed" or not due_at:
        return False
    try:
        return datetime.fromisoformat(due_at) < now_utc()
    except ValueError:
        return False


async def crm_find_agent_for_property(*, property_id: Optional[str] = None, plot_id: Optional[str] = None) -> Optional[str]:
    if plot_id:
        plot = local_get_plot(plot_id) if not await is_database_available() else await db.plots.find_one({"id": plot_id}, {"_id": 0})
        if plot and plot.get("agent_id"):
            return plot.get("agent_id")
    if property_id:
        plots = local_get_plots(property_id) if not await is_database_available() else await db.plots.find({"property_id": property_id}, {"_id": 0}).to_list(50)
        for plot in plots:
            if plot.get("agent_id"):
                return plot.get("agent_id")
    return None


async def crm_get_lead_by_identity(*, phone: Optional[str] = None, email: Optional[str] = None, lead_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    use_db = await is_database_available()
    normalized_email = normalize_email(email) if email else None
    phone_variants = set(phone_identity_variants(phone))
    if use_db:
        if lead_id:
            lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
            if lead:
                return lead
        if normalized_email:
            lead = await db.leads.find_one({"normalized_email": normalized_email}, {"_id": 0})
            if lead:
                return lead
        if phone_variants:
            lead = await db.leads.find_one({"normalized_phone": {"$in": list(phone_variants)}}, {"_id": 0})
            if lead:
                return lead
        return None

    for lead in local_list_collection("leads"):
        if lead_id and lead.get("id") == lead_id:
            return lead
        if normalized_email and lead.get("normalized_email") == normalized_email:
            return lead
        if phone_variants and lead.get("normalized_phone") in phone_variants:
            return lead
    return None


async def crm_save_lead(payload: Dict[str, Any]) -> Dict[str, Any]:
    use_db = await is_database_available()
    payload["normalized_email"] = normalize_email(payload.get("email")) if payload.get("email") else None
    phone_variants = phone_identity_variants(payload.get("phone"))
    payload["normalized_phone"] = phone_variants[0] if phone_variants else None
    payload["updated_at"] = now_utc().isoformat()
    if use_db:
        await db.leads.update_one({"id": payload["id"]}, {"$set": payload}, upsert=True)
        return await db.leads.find_one({"id": payload["id"]}, {"_id": 0})
    local_save_collection_item("leads", payload)
    return payload


async def crm_create_activity(
    *,
    lead_id: str,
    actor_user_id: str,
    activity_type: str,
    message: str,
    opportunity_id: Optional[str] = None,
    booking_id: Optional[str] = None,
    visit_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    payload = {
        "id": str(uuid.uuid4()),
        "lead_id": lead_id,
        "opportunity_id": opportunity_id,
        "booking_id": booking_id,
        "visit_id": visit_id,
        "actor_user_id": actor_user_id,
        "activity_type": activity_type,
        "message": message,
        "metadata": metadata or {},
        "created_at": now_utc().isoformat(),
    }
    if await is_database_available():
        await db.activities.insert_one(payload.copy())
    else:
        local_save_collection_item("activities", payload)
    return payload


async def crm_upsert_lead(
    *,
    name: str,
    phone: Optional[str],
    email: Optional[str],
    source: str,
    created_by_user_id: str,
    assigned_agent_id: Optional[str] = None,
    assigned_sub_agent_id: Optional[str] = None,
    status: str = "new",
    customer_preferences: Optional[Dict[str, Any]] = None,
    tags: Optional[List[str]] = None,
    notes_summary: Optional[str] = None,
    next_follow_up_at: Optional[str] = None,
) -> Dict[str, Any]:
    existing = await crm_get_lead_by_identity(phone=phone, email=email)
    timestamp = now_utc().isoformat()
    if existing:
        existing.update({
            "name": existing.get("name") or name,
            "phone": existing.get("phone") or phone,
            "email": existing.get("email") or (normalize_email(email) if email else None),
            "source": existing.get("source") or source,
            "assigned_agent_id": assigned_agent_id or existing.get("assigned_agent_id"),
            "assigned_sub_agent_id": assigned_sub_agent_id or existing.get("assigned_sub_agent_id"),
            "customer_preferences": {**existing.get("customer_preferences", {}), **(customer_preferences or {})},
            "tags": crm_normalize_tags([*(existing.get("tags", [])), *(tags or [])]),
            "notes_summary": notes_summary or existing.get("notes_summary"),
            "next_follow_up_at": next_follow_up_at or existing.get("next_follow_up_at"),
            "status": existing.get("status") or status,
            "last_contacted_at": timestamp if source in {"site_visit", "agent_booking", "customer_booking"} else existing.get("last_contacted_at"),
            "updated_at": timestamp,
        })
        return await crm_save_lead(existing)

    lead = {
        "id": str(uuid.uuid4()),
        "name": name,
        "phone": phone,
        "email": normalize_email(email) if email else None,
        "source": source,
        "status": status,
        "assigned_agent_id": assigned_agent_id,
        "assigned_sub_agent_id": assigned_sub_agent_id,
        "customer_preferences": customer_preferences or {},
        "tags": crm_normalize_tags(tags),
        "notes_summary": notes_summary,
        "last_contacted_at": None,
        "next_follow_up_at": next_follow_up_at,
        "created_by_user_id": created_by_user_id,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    saved = await crm_save_lead(lead)
    await crm_create_activity(
        lead_id=saved["id"],
        actor_user_id=created_by_user_id,
        activity_type="lead_created",
        message=f"Lead created from {source}.",
        metadata={"source": source},
    )
    return saved


async def crm_find_open_opportunity(lead_id: str, property_id: str, plot_id: Optional[str]) -> Optional[Dict[str, Any]]:
    use_db = await is_database_available()
    query = {"lead_id": lead_id, "property_id": property_id, "stage": {"$nin": list(CRM_CLOSED_STAGES)}}
    if plot_id:
        query["plot_id"] = plot_id
    if use_db:
        return await db.opportunities.find_one(query, {"_id": 0})
    for item in local_list_collection("opportunities"):
        if item.get("lead_id") != lead_id or item.get("property_id") != property_id:
            continue
        if plot_id and item.get("plot_id") != plot_id:
            continue
        if item.get("stage") in CRM_CLOSED_STAGES:
            continue
        return item
    return None


async def crm_save_opportunity(payload: Dict[str, Any]) -> Dict[str, Any]:
    payload["updated_at"] = now_utc().isoformat()
    if await is_database_available():
        await db.opportunities.update_one({"id": payload["id"]}, {"$set": payload}, upsert=True)
        return await db.opportunities.find_one({"id": payload["id"]}, {"_id": 0})
    local_save_collection_item("opportunities", payload)
    return payload


async def crm_create_or_update_opportunity(
    *,
    lead: Dict[str, Any],
    property_id: str,
    plot_id: Optional[str],
    assigned_agent_id: Optional[str],
    actor_user_id: str,
    stage: str,
    expected_value: Optional[float],
    interest_notes: Optional[str] = None,
    booking_id: Optional[str] = None,
    visit_id: Optional[str] = None,
    lost_reason: Optional[str] = None,
) -> Dict[str, Any]:
    stage_value = crm_validate_stage(stage)
    existing = await crm_find_open_opportunity(lead["id"], property_id, plot_id)
    if existing:
        current_stage = existing.get("stage", "new")
        if crm_stage_allows_transition(current_stage, stage_value):
            existing["stage"] = stage_value
        existing["assigned_agent_id"] = assigned_agent_id or existing.get("assigned_agent_id")
        existing["expected_value"] = expected_value or existing.get("expected_value")
        existing["interest_notes"] = interest_notes or existing.get("interest_notes")
        existing["booking_id"] = booking_id or existing.get("booking_id")
        existing["visit_ids"] = sorted({*(existing.get("visit_ids", [])), *([visit_id] if visit_id else [])})
        if lost_reason:
            existing["lost_reason"] = lost_reason
        if stage_value in CRM_CLOSED_STAGES:
            existing["closed_at"] = now_utc().isoformat()
        saved_existing = await crm_save_opportunity(existing)
        await crm_create_activity(
            lead_id=lead["id"],
            opportunity_id=saved_existing["id"],
            booking_id=booking_id,
            visit_id=visit_id,
            actor_user_id=actor_user_id,
            activity_type="opportunity_updated",
            message=f"Opportunity moved to {stage_value.replace('_', ' ')}.",
            metadata={"stage": stage_value},
        )
        return saved_existing

    payload = {
        "id": str(uuid.uuid4()),
        "lead_id": lead["id"],
        "property_id": property_id,
        "plot_id": plot_id,
        "assigned_agent_id": assigned_agent_id,
        "stage": stage_value,
        "expected_value": expected_value,
        "interest_notes": interest_notes,
        "visit_ids": [visit_id] if visit_id else [],
        "booking_id": booking_id,
        "priority": "medium",
        "lost_reason": lost_reason,
        "closed_at": now_utc().isoformat() if stage_value in CRM_CLOSED_STAGES else None,
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    saved = await crm_save_opportunity(payload)
    await crm_create_activity(
        lead_id=lead["id"],
        opportunity_id=saved["id"],
        booking_id=booking_id,
        visit_id=visit_id,
        actor_user_id=actor_user_id,
        activity_type="opportunity_created",
        message=f"Opportunity created for property {property_id}.",
        metadata={"stage": stage_value, "property_id": property_id, "plot_id": plot_id},
    )
    return saved


async def crm_create_task(
    *,
    title: str,
    task_type: str,
    assigned_to_user_id: str,
    actor_user_id: str,
    lead_id: Optional[str] = None,
    opportunity_id: Optional[str] = None,
    description: Optional[str] = None,
    due_at: Optional[str] = None,
    priority: Optional[str] = "medium",
) -> Dict[str, Any]:
    payload = {
        "id": str(uuid.uuid4()),
        "lead_id": lead_id,
        "opportunity_id": opportunity_id,
        "assigned_to_user_id": assigned_to_user_id,
        "task_type": task_type,
        "title": title,
        "description": description,
        "due_at": due_at,
        "priority": crm_validate_priority(priority),
        "status": "open",
        "completed_at": None,
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    if await is_database_available():
        await db.tasks.insert_one(payload.copy())
    else:
        local_save_collection_item("tasks", payload)
    if lead_id:
        await crm_create_activity(
            lead_id=lead_id,
            opportunity_id=opportunity_id,
            actor_user_id=actor_user_id,
            activity_type="task_created",
            message=f"Task created: {title}.",
            metadata={"task_id": payload["id"], "due_at": due_at},
        )
    return payload


async def crm_sync_booking(
    *,
    booking: Dict[str, Any],
    customer: Dict[str, Any],
    actor_user_id: str,
    source: str,
) -> Dict[str, Any]:
    assigned_agent_id = booking.get("agent_id") or await crm_find_agent_for_property(property_id=booking.get("property_id"), plot_id=booking.get("plot_id"))
    plot = local_get_plot(booking.get("plot_id")) if not await is_database_available() else await db.plots.find_one({"id": booking.get("plot_id")}, {"_id": 0})
    expected_value = float((plot or {}).get("price") or 0) or None
    lead = await crm_upsert_lead(
        name=customer.get("name") or booking.get("name") or "Customer",
        phone=customer.get("phone") or booking.get("mobile"),
        email=customer.get("email") or booking.get("customer_email"),
        source=source,
        created_by_user_id=actor_user_id,
        assigned_agent_id=assigned_agent_id,
        notes_summary=booking.get("message") or booking.get("notes"),
        tags=["booking"],
    )
    stage_map = {
        "pending": "booking_requested",
        "approval requested": "booking_requested",
        "approved": "booking_requested",
        "confirmed": "booking_requested",
        "completed": "booked",
        "closed": "closed_won",
        "cancelled": "closed_lost",
    }
    opportunity = await crm_create_or_update_opportunity(
        lead=lead,
        property_id=booking["property_id"],
        plot_id=booking.get("plot_id"),
        assigned_agent_id=assigned_agent_id,
        actor_user_id=actor_user_id,
        stage=stage_map.get(str(booking.get("status", "pending")).lower(), "booking_requested"),
        expected_value=expected_value,
        interest_notes=booking.get("message") or booking.get("notes"),
        booking_id=booking["id"],
        lost_reason="other" if str(booking.get("status", "")).lower() == "cancelled" else None,
    )
    await crm_create_activity(
        lead_id=lead["id"],
        opportunity_id=opportunity["id"],
        booking_id=booking["id"],
        actor_user_id=actor_user_id,
        activity_type="booking_synced",
        message=f"Booking {booking['id']} synced to CRM as {opportunity['stage'].replace('_', ' ')}.",
        metadata={"booking_status": booking.get("status")},
    )
    if source == "agent_booking":
        follow_up_due = (now_utc() + timedelta(days=1)).isoformat()
        await crm_create_task(
            title="Follow up on booking request",
            task_type="follow_up",
            assigned_to_user_id=assigned_agent_id or actor_user_id,
            actor_user_id=actor_user_id,
            lead_id=lead["id"],
            opportunity_id=opportunity["id"],
            description="Check customer intent and move the deal to the next stage.",
            due_at=follow_up_due,
            priority="high",
        )
    return {"lead": lead, "opportunity": opportunity}


async def crm_sync_site_visit(
    *,
    visit: Dict[str, Any],
    customer: Dict[str, Any],
    actor_user_id: str,
) -> Dict[str, Any]:
    assigned_agent_id = await crm_find_agent_for_property(property_id=visit.get("property_id"), plot_id=visit.get("plot_id"))
    lead = await crm_upsert_lead(
        name=customer.get("name") or visit.get("name") or "Customer",
        phone=customer.get("phone") or visit.get("mobile"),
        email=customer.get("email"),
        source="site_visit",
        created_by_user_id=actor_user_id,
        assigned_agent_id=assigned_agent_id,
        tags=["site visit"],
        next_follow_up_at=(now_utc() + timedelta(days=2)).isoformat(),
    )
    opportunity = await crm_create_or_update_opportunity(
        lead=lead,
        property_id=visit["property_id"],
        plot_id=visit.get("plot_id"),
        assigned_agent_id=assigned_agent_id,
        actor_user_id=actor_user_id,
        stage="site_visit_scheduled" if str(visit.get("status", "confirmed")).lower() != "completed" else "site_visit_completed",
        expected_value=None,
        visit_id=visit["id"],
        interest_notes=f"Visit scheduled for {visit.get('visit_date')}.",
    )
    await crm_create_task(
        title="Post-visit follow-up",
        task_type="follow_up",
        assigned_to_user_id=assigned_agent_id or actor_user_id,
        actor_user_id=actor_user_id,
        lead_id=lead["id"],
        opportunity_id=opportunity["id"],
        description="Reach out after the site visit and capture interest level.",
        due_at=(now_utc() + timedelta(days=1)).isoformat(),
        priority="medium",
    )
    await crm_create_activity(
        lead_id=lead["id"],
        opportunity_id=opportunity["id"],
        visit_id=visit["id"],
        actor_user_id=actor_user_id,
        activity_type="visit_synced",
        message=f"Site visit scheduled for {visit.get('visit_date')}.",
        metadata={"property_id": visit.get("property_id")},
    )
    return {"lead": lead, "opportunity": opportunity}


async def crm_get_visible_records(collection_name: str, user: Dict[str, Any]) -> List[Dict[str, Any]]:
    use_db = await is_database_available()
    if use_db:
        items = await db[collection_name].find({}, {"_id": 0}).to_list(1000)
    else:
        await crm_ensure_materialized()
        items = [dict(item) for item in local_list_collection(collection_name)]
    if user.get("is_admin"):
        return items
    return [item for item in items if crm_is_record_visible_to_user(user, item)]


async def crm_build_agent_dashboard(user: Dict[str, Any]) -> Dict[str, Any]:
    leads = await crm_get_visible_records("leads", user)
    opportunities = await crm_get_visible_records("opportunities", user)
    tasks = await crm_get_visible_records("tasks", user)
    activities = await crm_get_visible_records("activities", user)
    now = now_utc()
    today_str = now.date().isoformat()
    stage_counts = {stage: 0 for stage in CRM_STAGES}
    for opportunity in opportunities:
        stage_counts[opportunity.get("stage", "new")] = stage_counts.get(opportunity.get("stage", "new"), 0) + 1
    overdue_tasks = [task for task in tasks if crm_is_overdue(task.get("due_at"), task.get("status", "open"))]
    due_today = [
        task for task in tasks
        if task.get("status") != "completed" and task.get("due_at") and str(task.get("due_at", "")).startswith(today_str)
    ]
    lost_reasons: Dict[str, int] = {}
    for opportunity in opportunities:
        if opportunity.get("stage") == "closed_lost" and opportunity.get("lost_reason"):
            lost_reasons[opportunity["lost_reason"]] = lost_reasons.get(opportunity["lost_reason"], 0) + 1
    activities.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    tasks.sort(key=lambda item: (item.get("status") == "completed", item.get("due_at") or "9999"))
    leads.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
    opportunities.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
    return {
        "profile": clean_user(user),
        "leads": leads,
        "opportunities": opportunities,
        "tasks": tasks,
        "activities": activities[:50],
        "metrics": {
            "lead_count": len(leads),
            "active_deals": len([item for item in opportunities if item.get("stage") not in CRM_CLOSED_STAGES]),
            "overdue_tasks": len(overdue_tasks),
            "due_today": len(due_today),
        },
        "stage_counts": stage_counts,
        "lost_reasons": lost_reasons,
    }


async def crm_build_admin_dashboard(user: Dict[str, Any]) -> Dict[str, Any]:
    dashboard = await crm_build_agent_dashboard(user)
    opportunities = dashboard["opportunities"]
    by_agent: Dict[str, int] = {}
    by_property: Dict[str, int] = {}
    for opportunity in opportunities:
        by_agent[opportunity.get("assigned_agent_id") or "unassigned"] = by_agent.get(opportunity.get("assigned_agent_id") or "unassigned", 0) + 1
        by_property[opportunity.get("property_id") or "unassigned"] = by_property.get(opportunity.get("property_id") or "unassigned", 0) + 1
    dashboard["reports"] = {
        "by_agent": by_agent,
        "by_property": by_property,
        "lost_reasons": dashboard["lost_reasons"],
    }
    return dashboard


async def crm_backfill_existing_records() -> None:
    if not ALLOW_LOCAL_AUTH_FALLBACK and not await is_database_available():
        return

    if await is_database_available():
        bookings = await db.bookings.find({}, {"_id": 0}).to_list(500)
        for booking in bookings:
            customer = await db.users.find_one({"id": booking.get("user_id")}, {"_id": 0}) or {"id": booking.get("user_id"), "name": booking.get("name"), "phone": booking.get("mobile"), "email": booking.get("customer_email")}
            await crm_sync_booking(
                booking=booking,
                customer=customer,
                actor_user_id=booking.get("created_by_agent_id") or booking.get("user_id") or booking.get("agent_id") or "system",
                source="backfill",
            )
        visits = await db.visits.find({"type": "site"}, {"_id": 0}).to_list(500)
        for visit in visits:
            customer = await db.users.find_one({"id": visit.get("user_id")}, {"_id": 0}) or {"name": visit.get("customer_name") or visit.get("name"), "phone": visit.get("customer_phone") or visit.get("mobile")}
            await crm_sync_site_visit(
                visit=visit,
                customer=customer,
                actor_user_id=visit.get("created_by_agent_id") or visit.get("user_id") or visit.get("assigned_agent_id") or "system",
            )
        return

    for booking in local_list_bookings():
        customer = local_find_user(user_id=booking.get("user_id")) or {"id": booking.get("user_id"), "name": booking.get("name"), "phone": booking.get("mobile"), "email": booking.get("customer_email")}
        await crm_sync_booking(
            booking=booking,
            customer=customer,
            actor_user_id=booking.get("created_by_agent_id") or booking.get("user_id") or booking.get("agent_id") or "system",
            source="backfill",
        )
    for visit in [item for item in local_list_visits() if item.get("type") == "site"]:
        await crm_sync_site_visit(
            visit=visit,
            customer={"name": visit.get("customer_name") or visit.get("name"), "phone": visit.get("customer_phone") or visit.get("mobile")},
            actor_user_id=visit.get("created_by_agent_id") or visit.get("user_id") or visit.get("assigned_agent_id") or "system",
        )


async def crm_ensure_materialized() -> None:
    if await is_database_available():
        return
    store = load_local_store()
    if any(store.get(name) for name in ("leads", "opportunities", "tasks", "activities")):
        return
    if store.get("bookings") or any(item.get("type") == "site" for item in store.get("visits", [])):
        await crm_backfill_existing_records()


def clean_user(doc: Dict[str, Any]) -> Dict[str, Any]:
    user = dict(doc)
    user.pop("_id", None)
    user.pop("password_hash", None)
    return user


async def create_notification(user_id: str, title: str, body: str, type_: str = "welcome") -> None:
    if await is_database_available():
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "title": title,
            "body": body,
            "type": type_,
            "read": False,
            "created_at": now_utc().isoformat(),
        })


def build_local_agent_dashboard(user: Dict[str, Any]) -> Dict[str, Any]:
    ensure_local_demo_users()
    all_sub_agent_ids = user.get("sub_agent_ids", []) if user.get("role") == "agent" else []
    accessible_agent_ids = [user["id"], *all_sub_agent_ids]

    sub_agents = [
        clean_user(local_find_user(user_id=sub_agent_id))
        for sub_agent_id in all_sub_agent_ids
        if local_find_user(user_id=sub_agent_id)
    ]

    property_map = {item["id"]: item for item in local_get_properties()}
    assets = []
    for plot in local_get_plots():
        if plot["agent_id"] not in accessible_agent_ids:
            continue
        property_doc = property_map.get(plot["property_id"], {})
        agent_doc = local_find_user(user_id=plot.get("agent_id")) or {}
        assets.append({
            **plot,
            "property_name": property_doc.get("name", plot["property_id"]),
            "property_image": property_doc.get("image"),
            "property_images": property_doc.get("images", []),
            "property_video_url": property_doc.get("videoUrl"),
            "agent_name": agent_doc.get("name"),
        })

    bookings = []
    for booking in local_list_bookings():
        if booking.get("agent_id") not in accessible_agent_ids:
            continue
        plot = local_get_plot(booking["plot_id"]) or {}
        property_doc = property_map.get(booking["property_id"], {})
        customer = local_find_user(user_id=booking.get("user_id")) or {}
        bookings.append({
            **booking,
            "plot_number": plot.get("plot_number"),
            "property_name": property_doc.get("name", booking["property_id"]),
            "customer": clean_user(customer) if customer else None,
        })

    return {
        "profile": clean_user(user),
        "sub_agents": [sub for sub in sub_agents if sub],
        "assets": [asset for asset in assets if asset["agent_id"] in accessible_agent_ids],
        "bookings": [booking for booking in bookings if booking["agent_id"] in accessible_agent_ids],
    }


async def upsert_user_identity(
    *,
    name: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    google_sub: Optional[str] = None,
    password_hash: Optional[str] = None,
    auth_method: str,
) -> Dict[str, Any]:
    use_db = await is_database_available()
    if not use_db and not ALLOW_LOCAL_AUTH_FALLBACK:
        raise HTTPException(status_code=503, detail="Authentication database is unavailable")
    phone_variants = phone_identity_variants(phone)
    query: Dict[str, Any] = {}
    if google_sub:
        query["google_sub"] = google_sub
    elif email:
        query["email"] = normalize_email(email)
    elif phone:
        query["phone"] = phone
    else:
        raise HTTPException(status_code=400, detail="No identity provided")

    if use_db:
        existing = await db.users.find_one(query)
        if not existing and email:
            existing = await db.users.find_one({"email": normalize_email(email)})
        if not existing and phone_variants:
            existing = await db.users.find_one({"phone": {"$in": phone_variants}})
    else:
        existing = local_find_user(
            google_sub=google_sub,
            email=normalize_email(email) if email else None,
            phone=phone,
        )

    timestamp = now_utc().isoformat()
    if existing:
        updates: Dict[str, Any] = {
            "updated_at": timestamp,
            "auth_methods": auth_methods_union(existing.get("auth_methods"), auth_method),
            "last_login_at": timestamp,
        }
        if name and (not existing.get("name") or existing.get("name", "").startswith("User-")):
            updates["name"] = name
        if email:
            updates["email"] = normalize_email(email)
            updates["email_verified"] = True
        if phone:
            updates["phone"] = phone
            updates["phone_verified"] = True
        if google_sub:
            updates["google_sub"] = google_sub
        if password_hash:
            updates["password_hash"] = password_hash
        if use_db:
            await db.users.update_one({"_id": existing["_id"]}, {"$set": updates})
            refreshed = await db.users.find_one({"_id": existing["_id"]}, {"_id": 0})
            return clean_user(refreshed)
        existing.update(updates)
        local_save_user(existing)
        return clean_user(existing)

    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "name": name or (email.split("@")[0] if email else f"User-{(phone or user_id)[-4:]}"),
        "auth_methods": [auth_method],
        "address": "",
        "kyc_status": "pending",
        "is_admin": False,
        "email_verified": bool(email),
        "phone_verified": bool(phone),
        "created_at": timestamp,
        "updated_at": timestamp,
        "last_login_at": timestamp,
    }
    if email:
        user["email"] = normalize_email(email)
    if phone:
        user["phone"] = phone
    if google_sub:
        user["google_sub"] = google_sub
    if password_hash:
        user["password_hash"] = password_hash
    if use_db:
        await db.users.insert_one(user)
    else:
        local_save_user(user)
    await create_notification(
        user_id,
        "Welcome to Rivan Reality",
        "Your account is ready. Explore premium properties and track your journey in one place.",
    )
    return clean_user(user)


async def issue_token_response(user: Dict[str, Any]) -> TokenResp:
    token = create_access_token(user["id"], JWT_SECRET, JWT_EXPIRES_MIN)
    return TokenResp(access_token=token, user=clean_user(user))


def require_supabase_phone_auth() -> None:
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(
            status_code=503,
            detail="Phone OTP is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to backend/.env.",
        )


def supabase_auth_headers() -> Dict[str, str]:
    return {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
    }


def supabase_error_detail(response: requests.Response) -> str:
    try:
        payload = response.json()
        if isinstance(payload, dict):
            return (
                payload.get("msg")
                or payload.get("message")
                or payload.get("error_description")
                or payload.get("error")
                or response.text
            )
    except ValueError:
        pass
    return response.text or "Supabase phone OTP request failed"


async def supabase_send_phone_otp(phone: str) -> None:
    require_supabase_phone_auth()

    def post_otp() -> requests.Response:
        return requests.post(
            f"{SUPABASE_URL}/auth/v1/otp",
            headers=supabase_auth_headers(),
            json={"phone": phone, "create_user": True},
            timeout=15,
        )

    response = await asyncio.to_thread(post_otp)
    if response.status_code >= 400:
        status_code = status.HTTP_429_TOO_MANY_REQUESTS if response.status_code == 429 else status.HTTP_502_BAD_GATEWAY
        raise HTTPException(status_code=status_code, detail=supabase_error_detail(response))


async def supabase_verify_phone_otp(phone: str, otp_value: str) -> Dict[str, Any]:
    require_supabase_phone_auth()

    def verify_otp_request() -> requests.Response:
        return requests.post(
            f"{SUPABASE_URL}/auth/v1/verify",
            headers=supabase_auth_headers(),
            json={"phone": phone, "token": otp_value, "type": "sms"},
            timeout=15,
        )

    response = await asyncio.to_thread(verify_otp_request)
    if response.status_code >= 400:
        status_code = status.HTTP_429_TOO_MANY_REQUESTS if response.status_code == 429 else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=status_code, detail=supabase_error_detail(response))

    try:
        payload = response.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Supabase returned an invalid OTP verification response")
    if not isinstance(payload, dict) or not payload.get("user"):
        raise HTTPException(status_code=400, detail="OTP verification failed")
    return payload


async def store_phone_otp(phone: str, code: str, expires_at: datetime) -> None:
    expires_at_iso = expires_at.isoformat()
    if await is_database_available():
        await db.otps.delete_many({"phone": phone})
        await db.otps.insert_one({
            "phone": phone,
            "code": code,
            "expires_at": expires_at_iso,
            "created_at": now_utc().isoformat(),
        })
        return
    if not ALLOW_LOCAL_AUTH_FALLBACK:
        raise HTTPException(status_code=503, detail="Authentication database is unavailable")
    local_upsert_otp(phone, code, expires_at_iso)


async def fetch_phone_otp(phone: str) -> Optional[Dict[str, Any]]:
    if await is_database_available():
        record = await db.otps.find_one({"phone": phone}, {"_id": 0})
        return record
    if not ALLOW_LOCAL_AUTH_FALLBACK:
        raise HTTPException(status_code=503, detail="Authentication database is unavailable")
    return local_get_otp(phone)


async def clear_phone_otp(phone: str) -> None:
    if await is_database_available():
        await db.otps.delete_many({"phone": phone})
        return
    if not ALLOW_LOCAL_AUTH_FALLBACK:
        raise HTTPException(status_code=503, detail="Authentication database is unavailable")
    local_delete_otp(phone)


async def ensure_property_media_defaults() -> None:
    await db.properties.update_one(
        {"id": "prop-2", "videoUrl": {"$exists": False}},
        {"$set": {"videoUrl": VILLA_VIDEO_URL, "updated_at": now_utc().isoformat()}},
    )


@app.on_event("startup")
async def ensure_indexes() -> None:
    ensure_local_demo_users()

    if not await is_database_available():
        if ALLOW_LOCAL_AUTH_FALLBACK:
            logger.warning("MongoDB unavailable at startup; skipping index sync and using local auth fallback.")
            await crm_backfill_existing_records()
        else:
            logger.warning("MongoDB unavailable at startup; skipping index sync until the database is reachable.")
        return

    try:
        await db.users.update_many({"email": ""}, {"$unset": {"email": ""}})
        await db.users.update_many({"phone": ""}, {"$unset": {"phone": ""}})
        await db.users.update_many({"google_sub": ""}, {"$unset": {"google_sub": ""}})
        await db.users.update_many({"password_hash": ""}, {"$unset": {"password_hash": ""}})
        await db.users.update_many({"phone": "9999900001"}, {"$set": {"phone": "+919999900001"}})
        await db.users.update_many({"phone": "9000000000"}, {"$set": {"phone": "+919000000000"}})
        await db.users.update_many({"phone": "9900001111"}, {"$set": {"phone": "+919900001111"}})
        await db.users.update_many({"phone": "9911112222"}, {"$set": {"phone": "+919911112222"}})

        for index_name in ("email_1", "phone_1", "google_sub_1"):
            try:
                await db.users.drop_index(index_name)
            except OperationFailure:
                pass

        await db.users.create_index("id", unique=True)
        await db.users.create_index("email", unique=True, sparse=True)
        await db.users.create_index("phone", unique=True, sparse=True)
        await db.users.create_index("google_sub", unique=True, sparse=True)
        await db.leads.create_index("id", unique=True)
        await db.leads.create_index("normalized_email", sparse=True)
        await db.leads.create_index("normalized_phone", sparse=True)
        await db.opportunities.create_index("id", unique=True)
        await db.opportunities.create_index([("lead_id", 1), ("property_id", 1), ("plot_id", 1)])
        await db.tasks.create_index("id", unique=True)
        await db.tasks.create_index([("assigned_to_user_id", 1), ("due_at", 1)])
        await db.activities.create_index([("lead_id", 1), ("created_at", -1)])
        await ensure_property_media_defaults()
        await crm_backfill_existing_records()
    except Exception as exc:
        if ALLOW_LOCAL_AUTH_FALLBACK:
            logger.warning("MongoDB unavailable at startup; falling back to local auth store: %s", exc)
        else:
            logger.warning("MongoDB unavailable at startup: %s", exc)


# ---------- Auth Routes ----------
@api_router.post("/auth/register", response_model=TokenResp)
async def register(req: RegisterReq):
    email = normalize_email(req.email)
    validate_password_strength(req.password)
    if await is_database_available():
        existing = await db.users.find_one({"email": email})
    elif ALLOW_LOCAL_AUTH_FALLBACK:
        existing = local_find_user(email=email)
    else:
        raise HTTPException(status_code=503, detail="Authentication database is unavailable")
    if existing and existing.get("password_hash"):
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    user = await upsert_user_identity(
        name=req.name.strip(),
        email=email,
        password_hash=hash_password(req.password),
        auth_method="email",
    )
    return await issue_token_response(user)


@api_router.post("/auth/login", response_model=TokenResp)
async def login(req: LoginReq):
    email = normalize_email(req.email)
    if await is_database_available():
        user = await db.users.find_one({"email": email})
    elif ALLOW_LOCAL_AUTH_FALLBACK:
        user = local_find_user(email=email)
    else:
        raise HTTPException(status_code=503, detail="Authentication database is unavailable")
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if is_agent_role(user.get("role")) and user.get("approval_status") != "approved":
        raise HTTPException(status_code=403, detail="Your agent account is pending manager approval")

    if await is_database_available():
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"updated_at": now_utc().isoformat(), "last_login_at": now_utc().isoformat()}},
        )
        refreshed = await db.users.find_one({"_id": user["_id"]}, {"_id": 0})
        return await issue_token_response(refreshed)
    if not ALLOW_LOCAL_AUTH_FALLBACK:
        raise HTTPException(status_code=503, detail="Authentication database is unavailable")
    user["updated_at"] = now_utc().isoformat()
    user["last_login_at"] = now_utc().isoformat()
    local_save_user(user)
    return await issue_token_response(user)


@api_router.post("/auth/send-otp")
async def send_otp(req: SendOtpReq):
    phone = normalize_phone(req.phone)
    await supabase_send_phone_otp(phone)
    return {
        "success": True,
        "phone": phone,
        "message": "OTP sent successfully",
    }


@api_router.post("/auth/verify-otp", response_model=TokenResp)
async def verify_otp(req: VerifyOtpReq):
    phone = normalize_phone(req.phone)
    otp_value = (req.otp or "").strip()
    await supabase_verify_phone_otp(phone, otp_value)
    user = await upsert_user_identity(
        name=req.name.strip() if req.name else phone[-10:],
        phone=phone,
        auth_method="phone",
    )
    return await issue_token_response(user)


@api_router.post("/auth/google", response_model=TokenResp)
async def google_auth(req: GoogleAuthReq):
    google_client_ids = get_google_client_ids()
    if not google_client_ids:
        logger.error("Google auth failed: Google OAuth client IDs are not configured on the backend")
        raise HTTPException(status_code=503, detail="Google sign-in is not configured on the backend")

    payload = verify_google_id_token(
        req.id_token,
        google_client_ids,
    )
    user = await upsert_user_identity(
        name=payload.get("name") or payload.get("given_name") or payload["email"].split("@")[0],
        email=payload["email"],
        google_sub=payload["sub"],
        auth_method="google",
    )
    return await issue_token_response(user)


@api_router.post("/auth/firebase", response_model=TokenResp)
async def firebase_auth(req: FirebaseAuthReq):
    project_id = get_firebase_project_id()
    if not project_id:
        logger.error("Firebase auth failed: FIREBASE project id is not configured")
        raise HTTPException(status_code=500, detail="Firebase project is not configured")

    try:
        payload = verify_firebase_id_token(req.id_token, project_id)
    except HTTPException as exc:
        logger.warning("Firebase auth token verification failed: %s", exc.detail)
        raise

    phone = normalize_phone(req.phone or payload.get("phone_number") or "")
    token_phone = normalize_phone(payload.get("phone_number") or "")
    if not phone:
        logger.warning("Firebase auth failed: token did not include a phone number")
        raise HTTPException(status_code=400, detail="Firebase phone number is missing")
    if token_phone and token_phone != phone:
        logger.warning("Firebase auth failed: request phone does not match token phone")
        raise HTTPException(status_code=401, detail="Firebase phone token does not match requested phone")

    user = await upsert_user_identity(
        name=req.name.strip() if req.name else payload.get("name") or phone[-10:],
        phone=phone,
        auth_method="phone",
    )
    if await is_database_available():
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"firebase_uid": payload.get("user_id") or payload.get("sub"), "updated_at": now_utc().isoformat(), "last_login_at": now_utc().isoformat()}},
        )
        refreshed = await db.users.find_one({"id": user["id"]}, {"_id": 0})
        logger.info("Firebase phone auth succeeded for user_id=%s", refreshed.get("id") if refreshed else user.get("id"))
        return await issue_token_response(refreshed)
    if not ALLOW_LOCAL_AUTH_FALLBACK:
        raise HTTPException(status_code=503, detail="Authentication database is unavailable")
    user["firebase_uid"] = payload.get("user_id") or payload.get("sub")
    user["updated_at"] = now_utc().isoformat()
    user["last_login_at"] = now_utc().isoformat()
    local_save_user(user)
    logger.info("Firebase phone auth succeeded for user_id=%s", user.get("id"))
    return await issue_token_response(user)


@api_router.get("/auth/me")
async def me(user: Dict[str, Any] = Depends(get_current_user)):
    return clean_user(user)


@api_router.get("/auth/protected")
async def protected_example(user: Dict[str, Any] = Depends(get_current_user)):
    return {"authenticated": True, "user_id": user["id"], "auth_methods": user.get("auth_methods", [])}


@api_router.put("/auth/profile")
async def update_profile(req: UpdateProfileReq, user: Dict[str, Any] = Depends(get_current_user)):
    update = {k: v for k, v in req.dict().items() if v is not None}
    if "email" in update:
        update["email"] = normalize_email(update["email"])
    update["updated_at"] = now_utc().isoformat()
    if update and await is_database_available():
        await db.users.update_one({"id": user["id"]}, {"$set": update})
        updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
        return clean_user(updated)
    if not ALLOW_LOCAL_AUTH_FALLBACK:
        raise HTTPException(status_code=503, detail="Authentication database is unavailable")
    user.update(update)
    local_save_user(user)
    updated = local_find_user(user_id=user["id"])
    return clean_user(updated)


# ---------- CRM ----------
@api_router.post("/crm/leads")
async def crm_create_lead(req: CRMLeadUpsertReq, user: Dict[str, Any] = Depends(get_agent_user)):
    assigned_agent_id = req.assigned_agent_id or user["id"]
    if assigned_agent_id not in agent_accessible_ids(user):
        raise HTTPException(status_code=403, detail="You cannot assign this lead to that agent")
    lead = await crm_upsert_lead(
        name=req.name.strip(),
        phone=normalize_phone(req.phone) if req.phone else None,
        email=req.email,
        source=req.source or "manual",
        created_by_user_id=user["id"],
        assigned_agent_id=assigned_agent_id,
        assigned_sub_agent_id=req.assigned_sub_agent_id,
        status=req.status or "new",
        customer_preferences=req.customer_preferences or {},
        tags=req.tags or [],
        notes_summary=req.notes_summary,
        next_follow_up_at=req.next_follow_up_at,
    )
    return lead


@api_router.get("/crm/leads")
async def crm_list_leads(
    user: Dict[str, Any] = Depends(get_agent_user),
    assigned_agent_id: Optional[str] = None,
    source: Optional[str] = None,
    status: Optional[str] = None,
):
    dashboard = await crm_build_agent_dashboard(user)
    items = dashboard["leads"]
    if assigned_agent_id:
        items = [item for item in items if item.get("assigned_agent_id") == assigned_agent_id]
    if source:
        items = [item for item in items if item.get("source") == source]
    if status:
        items = [item for item in items if item.get("status") == status]
    return items


@api_router.get("/crm/leads/{lead_id}")
async def crm_get_lead(lead_id: str, user: Dict[str, Any] = Depends(get_agent_user)):
    lead = await crm_get_lead_by_identity(lead_id=lead_id)
    if not lead or not crm_is_record_visible_to_user(user, lead):
        raise HTTPException(status_code=404, detail="Lead not found")
    opportunities = [item for item in await crm_get_visible_records("opportunities", user) if item.get("lead_id") == lead_id]
    tasks = [item for item in await crm_get_visible_records("tasks", user) if item.get("lead_id") == lead_id]
    activities = [item for item in await crm_get_visible_records("activities", user) if item.get("lead_id") == lead_id]
    activities.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    return {
        **lead,
        "opportunities": opportunities,
        "tasks": tasks,
        "activities": activities,
    }


@api_router.put("/crm/leads/{lead_id}")
async def crm_update_lead(lead_id: str, req: CRMLeadUpsertReq, user: Dict[str, Any] = Depends(get_agent_user)):
    lead = await crm_get_lead_by_identity(lead_id=lead_id)
    if not lead or not crm_is_record_visible_to_user(user, lead):
        raise HTTPException(status_code=404, detail="Lead not found")
    assigned_agent_id = req.assigned_agent_id or lead.get("assigned_agent_id")
    if assigned_agent_id and assigned_agent_id not in agent_accessible_ids(user):
        raise HTTPException(status_code=403, detail="You cannot assign this lead to that agent")
    lead.update({
        "name": req.name.strip(),
        "phone": normalize_phone(req.phone) if req.phone else lead.get("phone"),
        "email": normalize_email(req.email) if req.email else lead.get("email"),
        "source": req.source or lead.get("source"),
        "status": req.status or lead.get("status"),
        "assigned_agent_id": assigned_agent_id,
        "assigned_sub_agent_id": req.assigned_sub_agent_id,
        "customer_preferences": req.customer_preferences or lead.get("customer_preferences", {}),
        "tags": crm_normalize_tags(req.tags or lead.get("tags", [])),
        "notes_summary": req.notes_summary if req.notes_summary is not None else lead.get("notes_summary"),
        "next_follow_up_at": req.next_follow_up_at if req.next_follow_up_at is not None else lead.get("next_follow_up_at"),
    })
    saved = await crm_save_lead(lead)
    await crm_create_activity(
        lead_id=saved["id"],
        actor_user_id=user["id"],
        activity_type="lead_updated",
        message=f"Lead {saved['name']} updated.",
    )
    return saved


@api_router.post("/crm/leads/{lead_id}/merge")
async def crm_merge_leads(lead_id: str, req: CRMLeadMergeReq, user: Dict[str, Any] = Depends(get_admin_user)):
    source = await crm_get_lead_by_identity(lead_id=req.source_lead_id)
    target = await crm_get_lead_by_identity(lead_id=req.target_lead_id)
    if not source or not target:
        raise HTTPException(status_code=404, detail="Lead not found")
    if source["id"] == target["id"]:
        raise HTTPException(status_code=400, detail="Cannot merge the same lead")
    use_db = await is_database_available()
    if use_db:
        await db.opportunities.update_many({"lead_id": source["id"]}, {"$set": {"lead_id": target["id"]}})
        await db.tasks.update_many({"lead_id": source["id"]}, {"$set": {"lead_id": target["id"]}})
        await db.activities.update_many({"lead_id": source["id"]}, {"$set": {"lead_id": target["id"]}})
        await db.leads.delete_one({"id": source["id"]})
    else:
        for name in ("opportunities", "tasks", "activities"):
            for item in local_list_collection(name):
                if item.get("lead_id") == source["id"]:
                    item["lead_id"] = target["id"]
                    local_save_collection_item(name, item)
        local_delete_collection_item("leads", source["id"])
    await crm_create_activity(
        lead_id=target["id"],
        actor_user_id=user["id"],
        activity_type="lead_merged",
        message=f"Lead {source['name']} merged into {target['name']}.",
        metadata={"source_lead_id": source["id"]},
    )
    return {"success": True}


@api_router.post("/crm/opportunities")
async def crm_create_opportunity(req: CRMOpportunityCreateReq, user: Dict[str, Any] = Depends(get_agent_user)):
    lead = await crm_get_lead_by_identity(lead_id=req.lead_id)
    if not lead or not crm_is_record_visible_to_user(user, lead):
        raise HTTPException(status_code=404, detail="Lead not found")
    assigned_agent_id = req.assigned_agent_id or lead.get("assigned_agent_id") or user["id"]
    if assigned_agent_id not in agent_accessible_ids(user):
        raise HTTPException(status_code=403, detail="You cannot assign this opportunity to that agent")
    opportunity = await crm_create_or_update_opportunity(
        lead=lead,
        property_id=req.property_id,
        plot_id=req.plot_id,
        assigned_agent_id=assigned_agent_id,
        actor_user_id=user["id"],
        stage=req.stage or "new",
        expected_value=req.expected_value,
        interest_notes=req.interest_notes,
    )
    return opportunity


@api_router.get("/crm/opportunities")
async def crm_list_opportunities(
    user: Dict[str, Any] = Depends(get_agent_user),
    stage: Optional[str] = None,
    property_id: Optional[str] = None,
    assigned_agent_id: Optional[str] = None,
    lost_reason: Optional[str] = None,
):
    items = await crm_get_visible_records("opportunities", user)
    if stage:
        items = [item for item in items if item.get("stage") == stage]
    if property_id:
        items = [item for item in items if item.get("property_id") == property_id]
    if assigned_agent_id:
        items = [item for item in items if item.get("assigned_agent_id") == assigned_agent_id]
    if lost_reason:
        items = [item for item in items if item.get("lost_reason") == lost_reason]
    items.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
    return items


@api_router.get("/crm/opportunities/{opportunity_id}")
async def crm_get_opportunity(opportunity_id: str, user: Dict[str, Any] = Depends(get_agent_user)):
    items = await crm_get_visible_records("opportunities", user)
    opportunity = next((item for item in items if item.get("id") == opportunity_id), None)
    if not opportunity:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    tasks = [item for item in await crm_get_visible_records("tasks", user) if item.get("opportunity_id") == opportunity_id]
    activities = [item for item in await crm_get_visible_records("activities", user) if item.get("opportunity_id") == opportunity_id]
    return {**opportunity, "tasks": tasks, "activities": activities}


@api_router.put("/crm/opportunities/{opportunity_id}")
async def crm_update_opportunity(opportunity_id: str, req: CRMOpportunityUpdateReq, user: Dict[str, Any] = Depends(get_agent_user)):
    items = await crm_get_visible_records("opportunities", user)
    opportunity = next((item for item in items if item.get("id") == opportunity_id), None)
    if not opportunity:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    if req.assigned_agent_id and req.assigned_agent_id not in agent_accessible_ids(user):
        raise HTTPException(status_code=403, detail="You cannot assign this opportunity to that agent")
    for key, value in req.dict(exclude_unset=True).items():
        opportunity[key] = value
    saved = await crm_save_opportunity(opportunity)
    lead_id = saved.get("lead_id")
    if lead_id:
        await crm_create_activity(
            lead_id=lead_id,
            opportunity_id=saved["id"],
            actor_user_id=user["id"],
            activity_type="opportunity_updated",
            message=f"Opportunity {saved['id']} updated.",
        )
    return saved


@api_router.post("/crm/opportunities/{opportunity_id}/stage")
async def crm_update_opportunity_stage(opportunity_id: str, req: CRMOpportunityStageReq, user: Dict[str, Any] = Depends(get_agent_user)):
    items = await crm_get_visible_records("opportunities", user)
    opportunity = next((item for item in items if item.get("id") == opportunity_id), None)
    if not opportunity:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    next_stage = crm_validate_stage(req.stage)
    current_stage = opportunity.get("stage", "new")
    if not crm_stage_allows_transition(current_stage, next_stage):
        raise HTTPException(status_code=400, detail="This stage transition is not allowed")
    if next_stage == "closed_lost":
        lost_reason = (req.lost_reason or "").strip().lower()
        if not lost_reason or lost_reason not in CRM_LOST_REASONS:
            raise HTTPException(status_code=400, detail="A valid lost reason is required")
        opportunity["lost_reason"] = lost_reason
    opportunity["stage"] = next_stage
    if next_stage in CRM_CLOSED_STAGES:
        opportunity["closed_at"] = now_utc().isoformat()
    saved = await crm_save_opportunity(opportunity)
    await crm_create_activity(
        lead_id=saved["lead_id"],
        opportunity_id=saved["id"],
        actor_user_id=user["id"],
        activity_type="opportunity_stage_changed",
        message=f"Opportunity moved from {current_stage.replace('_', ' ')} to {next_stage.replace('_', ' ')}.",
        metadata={"from": current_stage, "to": next_stage, "lost_reason": req.lost_reason},
    )
    return saved


@api_router.post("/crm/tasks")
async def crm_create_task_route(req: CRMTaskCreateReq, user: Dict[str, Any] = Depends(get_agent_user)):
    assigned_to_user_id = req.assigned_to_user_id or user["id"]
    if assigned_to_user_id not in agent_accessible_ids(user):
        raise HTTPException(status_code=403, detail="You cannot assign this task to that agent")
    task = await crm_create_task(
        title=req.title,
        task_type=req.task_type,
        assigned_to_user_id=assigned_to_user_id,
        actor_user_id=user["id"],
        lead_id=req.lead_id,
        opportunity_id=req.opportunity_id,
        description=req.description,
        due_at=req.due_at,
        priority=req.priority,
    )
    return task


@api_router.get("/crm/tasks")
async def crm_list_tasks(
    user: Dict[str, Any] = Depends(get_agent_user),
    overdue: Optional[bool] = None,
    assigned_to_user_id: Optional[str] = None,
    status: Optional[str] = None,
):
    items = await crm_get_visible_records("tasks", user)
    if assigned_to_user_id:
        items = [item for item in items if item.get("assigned_to_user_id") == assigned_to_user_id]
    if status:
        items = [item for item in items if item.get("status") == status]
    if overdue is True:
        items = [item for item in items if crm_is_overdue(item.get("due_at"), item.get("status", "open"))]
    items.sort(key=lambda item: (item.get("status") == "completed", item.get("due_at") or "9999"))
    return items


@api_router.get("/crm/tasks/{task_id}")
async def crm_get_task(task_id: str, user: Dict[str, Any] = Depends(get_agent_user)):
    items = await crm_get_visible_records("tasks", user)
    task = next((item for item in items if item.get("id") == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@api_router.put("/crm/tasks/{task_id}")
async def crm_update_task(task_id: str, req: CRMTaskUpdateReq, user: Dict[str, Any] = Depends(get_agent_user)):
    items = await crm_get_visible_records("tasks", user)
    task = next((item for item in items if item.get("id") == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    updates = req.dict(exclude_unset=True)
    if "assigned_to_user_id" in updates and updates["assigned_to_user_id"] not in agent_accessible_ids(user):
        raise HTTPException(status_code=403, detail="You cannot assign this task to that agent")
    if "priority" in updates:
        updates["priority"] = crm_validate_priority(updates["priority"])
    if "status" in updates:
        updates["status"] = crm_validate_task_status(updates["status"])
    task.update(updates)
    task["updated_at"] = now_utc().isoformat()
    if await is_database_available():
        await db.tasks.update_one({"id": task_id}, {"$set": task})
    else:
        local_save_collection_item("tasks", task)
    return task


@api_router.post("/crm/tasks/{task_id}/complete")
async def crm_complete_task(task_id: str, req: CRMTaskCompleteReq, user: Dict[str, Any] = Depends(get_agent_user)):
    items = await crm_get_visible_records("tasks", user)
    task = next((item for item in items if item.get("id") == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task["status"] = "completed"
    task["completed_at"] = now_utc().isoformat()
    task["updated_at"] = now_utc().isoformat()
    if req.completion_note:
        task["completion_note"] = req.completion_note
    if await is_database_available():
        await db.tasks.update_one({"id": task_id}, {"$set": task})
    else:
        local_save_collection_item("tasks", task)
    if task.get("lead_id"):
        await crm_create_activity(
            lead_id=task["lead_id"],
            opportunity_id=task.get("opportunity_id"),
            actor_user_id=user["id"],
            activity_type="task_completed",
            message=f"Task completed: {task.get('title')}.",
            metadata={"task_id": task["id"]},
        )
    return task


@api_router.get("/crm/activities")
async def crm_list_activities(
    user: Dict[str, Any] = Depends(get_agent_user),
    lead_id: Optional[str] = None,
    opportunity_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    items = await crm_get_visible_records("activities", user)
    if lead_id:
        items = [item for item in items if item.get("lead_id") == lead_id]
    if opportunity_id:
        items = [item for item in items if item.get("opportunity_id") == opportunity_id]
    if date_from:
        items = [item for item in items if item.get("created_at", "") >= date_from]
    if date_to:
        items = [item for item in items if item.get("created_at", "") <= date_to]
    items.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    return items


@api_router.post("/crm/reassign")
async def crm_reassign(req: CRMReassignReq, user: Dict[str, Any] = Depends(get_admin_user)):
    target_ids = [value for value in [req.lead_id, req.opportunity_id, req.task_id] if value]
    if len(target_ids) != 1:
        raise HTTPException(status_code=400, detail="Provide exactly one CRM record to reassign")
    updates = {
        "assigned_agent_id": req.assigned_agent_id,
        "assigned_sub_agent_id": req.assigned_sub_agent_id,
        "updated_at": now_utc().isoformat(),
    }
    if req.lead_id:
        lead = await crm_get_lead_by_identity(lead_id=req.lead_id)
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        lead.update(updates)
        saved = await crm_save_lead(lead)
        await crm_create_activity(
            lead_id=saved["id"],
            actor_user_id=user["id"],
            activity_type="lead_reassigned",
            message=f"Lead reassigned to {req.assigned_agent_id}.",
        )
        return {"success": True, "lead": saved}
    if req.opportunity_id:
        opportunity = local_get_collection_item("opportunities", req.opportunity_id) if not await is_database_available() else await db.opportunities.find_one({"id": req.opportunity_id}, {"_id": 0})
        if not opportunity:
            raise HTTPException(status_code=404, detail="Opportunity not found")
        opportunity["assigned_agent_id"] = req.assigned_agent_id
        saved = await crm_save_opportunity(opportunity)
        await crm_create_activity(
            lead_id=saved["lead_id"],
            opportunity_id=saved["id"],
            actor_user_id=user["id"],
            activity_type="opportunity_reassigned",
            message=f"Opportunity reassigned to {req.assigned_agent_id}.",
        )
        return {"success": True, "opportunity": saved}
    task = local_get_collection_item("tasks", req.task_id) if not await is_database_available() else await db.tasks.find_one({"id": req.task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task["assigned_to_user_id"] = req.assigned_agent_id
    task["updated_at"] = now_utc().isoformat()
    if await is_database_available():
        await db.tasks.update_one({"id": task["id"]}, {"$set": task})
    else:
        local_save_collection_item("tasks", task)
    return {"success": True, "task": task}


@api_router.get("/crm/dashboard/agent")
async def crm_agent_dashboard(user: Dict[str, Any] = Depends(get_agent_user)):
    return await crm_build_agent_dashboard(user)


@api_router.get("/crm/dashboard/admin")
async def crm_admin_dashboard(user: Dict[str, Any] = Depends(get_admin_user)):
    return await crm_build_admin_dashboard(user)


# ---------- Properties ----------
@api_router.get("/properties")
async def list_properties(
    category: Optional[str] = None,
    location: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    search: Optional[str] = None,
):
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Property database is unavailable")

        items = local_get_properties()
        if category and category.lower() != "all":
            items = [item for item in items if item.get("category") == category]
        if location and location.lower() != "all":
            items = [item for item in items if location.lower() in item.get("location", "").lower()]
        if min_price is not None:
            items = [item for item in items if item.get("starting_price", 0) >= min_price]
        if max_price is not None:
            items = [item for item in items if item.get("starting_price", 0) <= max_price]
        if search:
            term = search.lower()
            items = [
                item for item in items
                if term in item.get("name", "").lower()
                or term in item.get("location", "").lower()
                or term in item.get("description", "").lower()
            ]
        return items

    q: Dict[str, Any] = {}
    if category and category.lower() != "all":
        q["category"] = category
    if location and location.lower() != "all":
        q["location"] = {"$regex": location, "$options": "i"}
    if min_price is not None:
        q["starting_price"] = {"$gte": min_price}
    if max_price is not None:
        q.setdefault("starting_price", {})
        q["starting_price"]["$lte"] = max_price
    if search:
        q["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"location": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
        ]
    items = await db.properties.find(q, {"_id": 0}).to_list(200)
    return items


@api_router.get("/health")
async def health_check():
    if await is_database_available():
        return {"ok": True, "database": "connected", "mode": "mongo"}
    if ALLOW_LOCAL_AUTH_FALLBACK:
        return {"ok": True, "database": "offline", "mode": "local-auth-fallback"}
    raise HTTPException(status_code=503, detail="Database unavailable")


@api_router.get("/properties/featured")
async def featured_properties():
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Property database is unavailable")
        return [item for item in local_get_properties() if item.get("featured")]
    items = await db.properties.find({"featured": True}, {"_id": 0}).to_list(20)
    return items


@api_router.get("/properties/{property_id}")
async def get_property(property_id: str):
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Property database is unavailable")
        prop = local_get_property(property_id)
        if not prop:
            raise HTTPException(status_code=404, detail="Property not found")
        return prop
    prop = await db.properties.find_one({"id": property_id}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop


@api_router.get("/properties/{property_id}/plots")
async def get_property_plots(property_id: str):
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Property database is unavailable")
        return local_get_plots(property_id)
    plots = await db.plots.find({"property_id": property_id}, {"_id": 0}).to_list(500)
    return plots


@api_router.get("/plots/{plot_id}")
async def get_plot(plot_id: str):
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Property database is unavailable")
        plot = local_get_plot(plot_id)
        if not plot:
            raise HTTPException(status_code=404, detail="Plot not found")
        return plot
    plot = await db.plots.find_one({"id": plot_id}, {"_id": 0})
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
    return plot


# ---------- Bookings ----------
@api_router.post("/bookings")
async def create_booking(req: BookingReq, user: Dict[str, Any] = Depends(get_current_user)):
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Booking database is unavailable")
        plot = local_get_plot(req.plot_id)
        if not plot:
            raise HTTPException(status_code=404, detail="Plot not found")
        if plot.get("status") not in ("available", "reserved"):
            raise HTTPException(status_code=400, detail="Plot is not available for booking")

        booking = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "plot_id": req.plot_id,
            "property_id": plot["property_id"],
            "agent_id": plot.get("agent_id"),
            "name": req.name,
            "mobile": req.mobile,
            "whatsapp": req.whatsapp or req.mobile,
            "message": req.message or "",
            "status": "pending",
            "customer_id": user["id"],
            "created_at": now_utc().isoformat(),
        }
        local_save_booking(booking)
        local_save_plot_override(req.plot_id, {"status": "reserved"})
        await crm_sync_booking(
            booking=booking,
            customer=user,
            actor_user_id=user["id"],
            source="customer_booking",
        )
        return {"success": True, "booking": booking, "message": "Thank you. Our Rivan team will contact you shortly."}

    plot = await db.plots.find_one({"id": req.plot_id}, {"_id": 0})
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
    if plot.get("status") not in ("available", "reserved"):
        raise HTTPException(status_code=400, detail="Plot is not available for booking")

    booking_id = str(uuid.uuid4())
    booking = {
        "id": booking_id,
        "user_id": user["id"],
        "plot_id": req.plot_id,
        "property_id": plot["property_id"],
        "agent_id": plot.get("agent_id"),
        "name": req.name,
        "mobile": req.mobile,
        "whatsapp": req.whatsapp or req.mobile,
        "message": req.message or "",
        "status": "pending",
        "created_at": now_utc().isoformat(),
    }
    await db.bookings.insert_one(booking.copy())
    booking.pop("_id", None)
    # Mark plot as reserved
    await db.plots.update_one({"id": req.plot_id}, {"$set": {"status": "reserved"}})

    # Notification
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "title": "Booking Request Received",
        "body": f"Your booking for plot {plot.get('plot_number')} has been received. Our team will contact you shortly.",
        "type": "booking",
        "read": False,
        "created_at": now_utc().isoformat(),
    })
    await crm_sync_booking(
        booking=booking,
        customer=user,
        actor_user_id=user["id"],
        source="customer_booking",
    )
    return {"success": True, "booking": booking, "message": "Thank you. Our Rivan team will contact you shortly."}


@api_router.get("/bookings/mine")
async def my_bookings(user: Dict[str, Any] = Depends(get_current_user)):
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Booking database is unavailable")
        items = [booking for booking in local_list_bookings() if booking.get("user_id") == user["id"]]
        items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return items
    items = await db.bookings.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


# ---------- My Land ----------
@api_router.get("/myland")
async def my_land(user: Dict[str, Any] = Depends(get_current_user)):
    """Return units owned/booked by this user with purchase progress"""
    plots = await db.plots.find(
        {"owner_id": user["id"]}, {"_id": 0}
    ).to_list(100)
    enriched = []
    for plot in plots:
        prop = await db.properties.find_one({"id": plot["property_id"]}, {"_id": 0})
        # Compute progress for this plot
        installments = await db.installments.find(
            {"user_id": user["id"], "plot_id": plot["id"]}, {"_id": 0}
        ).to_list(100)
        total_amt = sum(i["amount"] for i in installments) or plot.get("price", 0)
        paid_amt = sum(i["amount"] for i in installments if i["status"] == "paid")
        # For sold plots without installment records (legacy), treat as fully paid
        if plot.get("status") == "sold" and not installments:
            paid_amt = total_amt
        progress = (paid_amt / total_amt) if total_amt > 0 else 0
        # Purchase completion: status sold OR all installments paid
        purchase_complete = plot.get("status") == "sold" or progress >= 1.0
        # Compute registration timeline
        timeline = [
            {"step": "Booking Confirmed", "done": True, "date": plot.get("created_at", "")[:10]},
            {"step": "Token Paid", "done": paid_amt > 0, "date": ""},
            {"step": "Agreement Signed", "done": progress >= 0.25, "date": ""},
            {"step": "Installments Complete", "done": progress >= 1.0, "date": ""},
            {"step": "Registration Done", "done": purchase_complete and plot.get("status") == "sold", "date": ""},
            {"step": "Possession Handed Over", "done": plot.get("status") == "sold" and purchase_complete, "date": ""},
        ]
        enriched.append({
            **plot,
            "property": prop,
            "payment_progress": progress,
            "total_amount": total_amt,
            "paid_amount": paid_amt,
            "balance_amount": total_amt - paid_amt,
            "purchase_complete": purchase_complete,
            "registration_timeline": timeline,
            "next_due": next((i for i in installments if i["status"] != "paid"), None),
        })
    return enriched


@api_router.get("/myland/can-request-services")
async def can_request_services(user: Dict[str, Any] = Depends(get_current_user)):
    """Returns whether user is eligible to request property services (owns at least one plot with sufficient progress)"""
    plots = await db.plots.find({"owner_id": user["id"]}, {"_id": 0}).to_list(100)
    if not plots:
        return {"eligible": False, "reason": "No properties purchased yet", "owned_plots": []}
    return {
        "eligible": True,
        "reason": None,
        "owned_plots": [{"id": p["id"], "plot_number": p["plot_number"], "property_id": p["property_id"]} for p in plots],
    }


# ---------- Payments ----------
@api_router.get("/payments/summary")
async def payments_summary(user: Dict[str, Any] = Depends(get_current_user)):
    installments = await db.installments.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
    total = sum(i["amount"] for i in installments)
    paid = sum(i["amount"] for i in installments if i["status"] == "paid")
    balance = total - paid
    today_iso = now_utc().date().isoformat()
    upcoming = [i for i in installments if i["status"] != "paid" and i["due_date"] >= today_iso]
    upcoming.sort(key=lambda x: x["due_date"])
    overdue = [i for i in installments if i["status"] != "paid" and i["due_date"] < today_iso]
    return {
        "total_cost": total,
        "amount_paid": paid,
        "balance": balance,
        "upcoming_installment": upcoming[0] if upcoming else None,
        "overdue_count": len(overdue),
        "total_installments": len(installments),
        "paid_count": len([i for i in installments if i["status"] == "paid"]),
    }


@api_router.get("/payments/installments")
async def list_installments(user: Dict[str, Any] = Depends(get_current_user)):
    items = await db.installments.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
    today_iso = now_utc().date().isoformat()
    # Auto-mark overdue
    for it in items:
        if it["status"] == "upcoming" and it["due_date"] < today_iso:
            it["status"] = "overdue"
    items.sort(key=lambda x: x["due_date"])
    return items


@api_router.get("/payments/history")
async def payment_history(user: Dict[str, Any] = Depends(get_current_user)):
    items = await db.payments.find({"user_id": user["id"]}, {"_id": 0}).sort("paid_at", -1).to_list(200)
    return items


@api_router.post("/payments/pay")
async def pay_installment(req: PayInstallmentReq, user: Dict[str, Any] = Depends(get_current_user)):
    inst = await db.installments.find_one({"id": req.installment_id, "user_id": user["id"]}, {"_id": 0})
    if not inst:
        raise HTTPException(status_code=404, detail="Installment not found")
    if inst["status"] == "paid":
        raise HTTPException(status_code=400, detail="Installment already paid")

    # Mock payment
    receipt_id = f"RCPT-{uuid.uuid4().hex[:8].upper()}"
    payment = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "installment_id": req.installment_id,
        "amount": inst["amount"],
        "receipt_id": receipt_id,
        "method": "Mock Online",
        "paid_at": now_utc().isoformat(),
        "installment_number": inst["installment_number"],
        "property_id": inst.get("property_id"),
    }
    await db.payments.insert_one(payment.copy())
    payment.pop("_id", None)
    await db.installments.update_one(
        {"id": req.installment_id},
        {"$set": {"status": "paid", "paid_at": now_utc().isoformat(), "receipt_id": receipt_id}}
    )

    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "title": "Payment Successful",
        "body": f"Installment #{inst['installment_number']} of ₹{inst['amount']:,.0f} paid. Receipt: {receipt_id}",
        "type": "payment",
        "read": False,
        "created_at": now_utc().isoformat(),
    })
    return {"success": True, "payment": payment}


# ---------- Documents ----------
@api_router.get("/documents")
async def list_documents(user: Dict[str, Any] = Depends(get_current_user)):
    items = await db.documents.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


# ---------- Property Services ----------
SERVICE_CATALOG = [
    {"type": "Cleaning", "icon": "feather", "description": "Professional property cleaning"},
    {"type": "CCTV Installation", "icon": "video", "description": "Security camera setup"},
    {"type": "Compound Wall", "icon": "grid", "description": "Boundary wall construction"},
    {"type": "Villa/House", "icon": "home", "description": "Villa and house construction services"},
    {"type": "Borewell", "icon": "droplet", "description": "Borewell drilling"},
    {"type": "Fencing", "icon": "shield", "description": "Property fencing"},
    {"type": "Electricity Connection", "icon": "zap", "description": "New connection setup"},
    {"type": "Water Connection", "icon": "droplet", "description": "Water connection setup"},
    {"type": "Property Maintenance", "icon": "settings", "description": "Routine maintenance"},
    {"type": "Legal Documentation", "icon": "file-text", "description": "Legal paperwork support"},
]


@api_router.get("/services/catalog")
async def services_catalog():
    return SERVICE_CATALOG


@api_router.post("/services/request")
async def request_service(req: ServiceReq, user: Dict[str, Any] = Depends(get_current_user)):
    # Gate: only owners (have at least one booked/sold plot) can request services
    owned = await db.plots.count_documents({"owner_id": user["id"]})
    if owned == 0:
        raise HTTPException(
            status_code=403,
            detail="Property services are available only after purchase. Please book a property first.",
        )
    sr = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "service_type": req.service_type,
        "property_id": req.property_id,
        "preferred_date": req.preferred_date,
        "description": req.description,
        "contact": req.contact,
        "status": "pending",
        "created_at": now_utc().isoformat(),
    }
    await db.service_requests.insert_one(sr.copy())
    sr.pop("_id", None)
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "title": "Service Requested",
        "body": f"Your {req.service_type} request has been received. Our team will contact you within 24 hours.",
        "type": "service",
        "read": False,
        "created_at": now_utc().isoformat(),
    })
    return {"success": True, "request": sr}


@api_router.get("/services/mine")
async def my_services(user: Dict[str, Any] = Depends(get_current_user)):
    items = await db.service_requests.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


# ---------- Experience Centres & Visits ----------
@api_router.get("/centres")
async def list_centres():
    items = await db.centres.find({}, {"_id": 0}).to_list(50)
    return items


@api_router.get("/centres/{centre_id}")
async def get_centre(centre_id: str):
    c = await db.centres.find_one({"id": centre_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Centre not found")
    return c


@api_router.post("/visits/centre")
async def book_centre_visit(req: VisitBookingReq, user: Dict[str, Any] = Depends(get_current_user)):
    centre = await db.centres.find_one({"id": req.centre_id}, {"_id": 0})
    if not centre:
        raise HTTPException(status_code=404, detail="Centre not found")
    visit = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": "centre",
        "centre_id": req.centre_id,
        "centre_name": centre.get("name"),
        "visit_date": req.visit_date,
        "visit_time": req.visit_time,
        "name": req.name,
        "mobile": req.mobile,
        "status": "confirmed",
        "created_at": now_utc().isoformat(),
    }
    await db.visits.insert_one(visit.copy())
    visit.pop("_id", None)
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "title": "Centre Visit Confirmed",
        "body": f"Your visit to {centre.get('name')} on {req.visit_date} at {req.visit_time} is confirmed.",
        "type": "visit",
        "read": False,
        "created_at": now_utc().isoformat(),
    })
    return {"success": True, "visit": visit}


@api_router.post("/visits/site")
async def book_site_visit(req: SiteVisitReq, user: Dict[str, Any] = Depends(get_current_user)):
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Visit database is unavailable")
        prop = local_get_property(req.property_id)
        if not prop:
            raise HTTPException(status_code=404, detail="Property not found")
        visit = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "type": "site",
            "property_id": req.property_id,
            "property_name": prop.get("name"),
            "visit_date": req.visit_date,
            "name": req.name,
            "mobile": req.mobile,
            "status": "confirmed",
            "created_at": now_utc().isoformat(),
        }
        local_save_visit(visit)
        await crm_sync_site_visit(
            visit=visit,
            customer=user,
            actor_user_id=user["id"],
        )
        return {"success": True, "visit": visit}

    prop = await db.properties.find_one({"id": req.property_id}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    visit = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": "site",
        "property_id": req.property_id,
        "property_name": prop.get("name"),
        "visit_date": req.visit_date,
        "name": req.name,
        "mobile": req.mobile,
        "status": "confirmed",
        "created_at": now_utc().isoformat(),
    }
    await db.visits.insert_one(visit.copy())
    visit.pop("_id", None)
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "title": "Site Visit Scheduled",
        "body": f"Your visit to {prop.get('name')} on {req.visit_date} is scheduled.",
        "type": "visit",
        "read": False,
        "created_at": now_utc().isoformat(),
    })
    await crm_sync_site_visit(
        visit=visit,
        customer=user,
        actor_user_id=user["id"],
    )
    return {"success": True, "visit": visit}


@api_router.get("/visits/mine")
async def my_visits(user: Dict[str, Any] = Depends(get_current_user)):
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Visit database is unavailable")
        items = [visit for visit in local_list_visits() if visit.get("user_id") == user["id"]]
        items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return items
    items = await db.visits.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


# ---------- Wishlist ----------
@api_router.post("/wishlist/toggle")
async def toggle_wishlist(req: WishlistReq, user: Dict[str, Any] = Depends(get_current_user)):
    existing = await db.wishlist.find_one({"user_id": user["id"], "property_id": req.property_id})
    if existing:
        await db.wishlist.delete_one({"user_id": user["id"], "property_id": req.property_id})
        return {"wishlisted": False}
    await db.wishlist.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "property_id": req.property_id,
        "created_at": now_utc().isoformat(),
    })
    return {"wishlisted": True}


@api_router.get("/wishlist")
async def get_wishlist(user: Dict[str, Any] = Depends(get_current_user)):
    items = await db.wishlist.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    pids = [i["property_id"] for i in items]
    props = await db.properties.find({"id": {"$in": pids}}, {"_id": 0}).to_list(100)
    return props


# ---------- Notifications ----------
@api_router.get("/notifications")
async def list_notifications(user: Dict[str, Any] = Depends(get_current_user)):
    items = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


@api_router.post("/notifications/{notif_id}/read")
async def read_notification(notif_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    await db.notifications.update_one(
        {"id": notif_id, "user_id": user["id"]},
        {"$set": {"read": True}}
    )
    return {"success": True}


@api_router.post("/notifications/read-all")
async def read_all_notifications(user: Dict[str, Any] = Depends(get_current_user)):
    await db.notifications.update_many(
        {"user_id": user["id"], "read": False},
        {"$set": {"read": True}}
    )
    return {"success": True}


# ---------- Admin ----------
@api_router.get("/admin/stats")
async def admin_stats(user: Dict[str, Any] = Depends(get_admin_user)):
    return {
        "users": await db.users.count_documents({}),
        "properties": await db.properties.count_documents({}),
        "plots": await db.plots.count_documents({}),
        "plots_sold": await db.plots.count_documents({"status": "sold"}),
        "plots_booked": await db.plots.count_documents({"status": "booked"}),
        "plots_reserved": await db.plots.count_documents({"status": "reserved"}),
        "plots_available": await db.plots.count_documents({"status": "available"}),
        "bookings": await db.bookings.count_documents({}),
        "service_requests": await db.service_requests.count_documents({}),
        "visits": await db.visits.count_documents({}),
    }


@api_router.get("/admin/users")
async def admin_users(user: Dict[str, Any] = Depends(get_admin_user)):
    return await db.users.find({}, {"_id": 0}).to_list(500)


@api_router.get("/admin/bookings")
async def admin_bookings(user: Dict[str, Any] = Depends(get_admin_user)):
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Booking database is unavailable")
        items = local_list_bookings()
        items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return items
    items = await db.bookings.find({}, {"_id": 0}).to_list(500)
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


@api_router.post("/admin/bookings/{booking_id}/confirm")
async def admin_confirm_booking(booking_id: str, user: Dict[str, Any] = Depends(get_admin_user)):
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Booking database is unavailable")
        booking = next((item for item in local_list_bookings() if item.get("id") == booking_id), None)
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        updated_booking = local_update_booking(booking_id, {"status": "closed", "closed_at": now_utc().isoformat()})
        local_save_plot_override(booking["plot_id"], {"status": "booked", "owner_id": booking["user_id"]})
        customer = local_find_user(user_id=booking.get("user_id")) or {"id": booking.get("user_id"), "name": booking.get("name"), "phone": booking.get("mobile"), "email": booking.get("customer_email")}
        await crm_sync_booking(
            booking=updated_booking or booking,
            customer=customer,
            actor_user_id=user["id"],
            source="admin_confirm",
        )
        return {"success": True, "booking": updated_booking}

    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": "closed", "closed_at": now_utc().isoformat()}}
    )
    await db.plots.update_one(
        {"id": booking["plot_id"]},
        {"$set": {"status": "booked", "owner_id": booking["user_id"]}}
    )
    customer = await db.users.find_one({"id": booking["user_id"]}, {"_id": 0}) or {"id": booking.get("user_id"), "name": booking.get("name"), "phone": booking.get("mobile"), "email": booking.get("customer_email")}
    refreshed_booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0}) or booking
    await crm_sync_booking(
        booking=refreshed_booking,
        customer=customer,
        actor_user_id=user["id"],
        source="admin_confirm",
    )
    return {"success": True}


@api_router.get("/admin/agents")
async def admin_agents(user: Dict[str, Any] = Depends(get_admin_user)):
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Authentication database is unavailable")
        agents = [
            clean_user(agent)
            for agent in load_local_store().get("users", [])
            if is_agent_role(agent.get("role"))
        ]
        agents.sort(key=lambda x: (x.get("approval_status") != "pending", x.get("name", "")))
        return agents

    agents = await db.users.find({"role": {"$in": ["agent", "sub_agent"]}}, {"_id": 0}).to_list(500)
    agents = [clean_user(agent) for agent in agents]
    agents.sort(key=lambda x: (x.get("approval_status") != "pending", x.get("name", "")))
    return agents


@api_router.post("/admin/agents/{agent_id}/approve")
async def admin_approve_agent(agent_id: str, user: Dict[str, Any] = Depends(get_admin_user)):
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Authentication database is unavailable")
        agent = local_find_user(user_id=agent_id)
        if not agent or not is_agent_role(agent.get("role")):
            raise HTTPException(status_code=404, detail="Agent not found")
        agent["approval_status"] = "approved"
        agent["approved_by_manager"] = user.get("name", "Manager")
        agent["updated_at"] = now_utc().isoformat()
        local_save_user(agent)
        return {"success": True, "agent": clean_user(agent)}

    agent = await db.users.find_one({"id": agent_id}, {"_id": 0})
    if not agent or not is_agent_role(agent.get("role")):
        raise HTTPException(status_code=404, detail="Agent not found")
    await db.users.update_one(
        {"id": agent_id},
        {"$set": {"approval_status": "approved", "approved_by_manager": user.get("name", "Manager"), "updated_at": now_utc().isoformat()}}
    )
    updated = await db.users.find_one({"id": agent_id}, {"_id": 0})
    return {"success": True, "agent": clean_user(updated)}


@api_router.get("/admin/service-requests")
async def admin_services(user: Dict[str, Any] = Depends(get_admin_user)):
    items = await db.service_requests.find({}, {"_id": 0}).to_list(500)
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


@api_router.get("/agent/dashboard")
async def agent_dashboard(user: Dict[str, Any] = Depends(get_agent_user)):
    if not await is_database_available():
        return build_local_agent_dashboard(user)

    sub_agent_ids = user.get("sub_agent_ids", []) if user.get("role") == "agent" else []
    accessible_agent_ids = [user["id"], *sub_agent_ids]

    sub_agents = await db.users.find(
        {"id": {"$in": sub_agent_ids}},
        {"_id": 0}
    ).to_list(100)

    plots = await db.plots.find({"agent_id": {"$in": accessible_agent_ids}}, {"_id": 0}).to_list(300)
    property_ids = sorted({plot["property_id"] for plot in plots})
    properties = await db.properties.find({"id": {"$in": property_ids}}, {"_id": 0}).to_list(100)
    property_map = {prop["id"]: prop for prop in properties}

    assets = []
    for plot in plots:
        property_doc = property_map.get(plot["property_id"], {})
        assets.append({
            **plot,
            "property_name": property_doc.get("name", plot["property_id"]),
        })

    bookings_raw = await db.bookings.find({"agent_id": {"$in": accessible_agent_ids}}, {"_id": 0}).to_list(300)
    user_ids = sorted({booking["user_id"] for booking in bookings_raw if booking.get("user_id")})
    customer_docs = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0}).to_list(300)
    customer_map = {customer["id"]: customer for customer in customer_docs}
    asset_map = {asset["id"]: asset for asset in assets}

    bookings = []
    for booking in bookings_raw:
        customer = clean_user(customer_map.get(booking.get("user_id"), {})) if customer_map.get(booking.get("user_id")) else None
        asset = asset_map.get(booking["plot_id"], {})
        bookings.append({
            **booking,
            "plot_number": asset.get("plot_number"),
            "property_name": asset.get("property_name"),
            "customer": customer,
        })

    bookings.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    assets.sort(key=lambda x: (x.get("status") != "available", x.get("plot_number", "")))

    return {
        "profile": clean_user(user),
        "sub_agents": [clean_user(sub_agent) for sub_agent in sub_agents],
        "assets": assets,
        "bookings": bookings,
    }

@api_router.post("/agent/bookings")
async def agent_create_booking(req: AgentBookingCreateReq, user: Dict[str, Any] = Depends(get_agent_user)):
    allowed_statuses = {"available", "reserved"}
    initial_status = "approval requested" if req.visit_date else "pending"
    if not await is_database_available():
        plot = local_get_plot(req.plot_id)
        if not plot:
            raise HTTPException(status_code=404, detail="Plot not found")
        if plot.get("agent_id") not in agent_accessible_ids(user):
            raise HTTPException(status_code=403, detail="You do not have access to this asset")
        if plot.get("status") not in allowed_statuses:
            raise HTTPException(status_code=400, detail="Asset is not available for booking")
        customer = await upsert_user_identity(
            name=req.customer_name,
            email=req.customer_email,
            phone=req.customer_phone,
            auth_method="agent_booking",
        )
        booking = {
            "id": str(uuid.uuid4()),
            "plot_id": req.plot_id,
            "property_id": plot["property_id"],
            "agent_id": plot.get("agent_id") or user["id"],
            "user_id": customer["id"],
            "customer_id": customer["id"],
            "name": req.customer_name,
            "mobile": req.customer_phone,
            "customer_email": req.customer_email,
            "status": initial_status,
            "visit_date": req.visit_date,
            "visit_time": req.visit_time,
            "notes": req.notes,
            "created_by_agent_id": user["id"],
            "created_at": now_utc().isoformat(),
            "updated_at": now_utc().isoformat(),
        }
        local_save_booking(booking)
        local_save_plot_override(req.plot_id, {"status": "reserved"})
        await crm_sync_booking(
            booking=booking,
            customer=customer,
            actor_user_id=user["id"],
            source="agent_booking",
        )
        return {"success": True, "booking": booking}

    plot = await db.plots.find_one({"id": req.plot_id}, {"_id": 0})
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
    if plot.get("agent_id") not in agent_accessible_ids(user):
        raise HTTPException(status_code=403, detail="You do not have access to this asset")
    if plot.get("status") not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Asset is not available for booking")
    customer = await upsert_user_identity(
        name=req.customer_name,
        email=req.customer_email,
        phone=req.customer_phone,
        auth_method="agent_booking",
    )
    booking = {
        "id": str(uuid.uuid4()),
        "plot_id": req.plot_id,
        "property_id": plot["property_id"],
        "agent_id": plot.get("agent_id") or user["id"],
        "user_id": customer["id"],
        "customer_id": customer["id"],
        "name": req.customer_name,
        "mobile": req.customer_phone,
        "customer_email": req.customer_email,
        "status": initial_status,
        "visit_date": req.visit_date,
        "visit_time": req.visit_time,
        "notes": req.notes,
        "created_by_agent_id": user["id"],
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    await db.bookings.insert_one(booking.copy())
    await db.plots.update_one({"id": req.plot_id}, {"$set": {"status": "reserved"}})
    await crm_sync_booking(
        booking=booking,
        customer=customer,
        actor_user_id=user["id"],
        source="agent_booking",
    )
    return {"success": True, "booking": booking}

@api_router.put("/agent/bookings/{booking_id}/status")
async def agent_update_booking_status(booking_id: str, req: AgentBookingStatusReq, user: Dict[str, Any] = Depends(get_agent_user)):
    allowed_statuses = {"pending", "approval requested", "approved", "confirmed", "ongoing", "site visit scheduled", "completed", "cancelled", "closed"}
    status_value = req.status.strip().lower()
    if status_value not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Invalid booking status")
    updates = {"status": status_value, "updated_at": now_utc().isoformat()}
    if status_value == "closed":
        updates["closed_at"] = now_utc().isoformat()

    if not await is_database_available():
        booking = next((item for item in local_list_bookings() if item.get("id") == booking_id), None)
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        if booking.get("agent_id") not in agent_accessible_ids(user):
            raise HTTPException(status_code=403, detail="You do not have access to this booking")
        updated_booking = local_update_booking(booking_id, updates)
        if status_value == "closed":
            local_save_plot_override(booking["plot_id"], {"status": "booked", "owner_id": booking["user_id"]})
        if status_value == "cancelled":
            local_save_plot_override(booking["plot_id"], {"status": "available", "owner_id": None})
        customer = local_find_user(user_id=booking.get("user_id")) or {"id": booking.get("user_id"), "name": booking.get("name"), "phone": booking.get("mobile"), "email": booking.get("customer_email")}
        await crm_sync_booking(
            booking=updated_booking or booking,
            customer=customer,
            actor_user_id=user["id"],
            source="agent_booking",
        )
        return {"success": True, "booking": updated_booking}

    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.get("agent_id") not in agent_accessible_ids(user):
        raise HTTPException(status_code=403, detail="You do not have access to this booking")
    await db.bookings.update_one({"id": booking_id}, {"$set": updates})
    if status_value == "closed":
        await db.plots.update_one({"id": booking["plot_id"]}, {"$set": {"status": "booked", "owner_id": booking["user_id"]}})
    if status_value == "cancelled":
        await db.plots.update_one({"id": booking["plot_id"]}, {"$set": {"status": "available"}, "$unset": {"owner_id": ""}})
    updated = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    customer = await db.users.find_one({"id": booking["user_id"]}, {"_id": 0}) or {"id": booking.get("user_id"), "name": booking.get("name"), "phone": booking.get("mobile"), "email": booking.get("customer_email")}
    await crm_sync_booking(
        booking=updated or booking,
        customer=customer,
        actor_user_id=user["id"],
        source="agent_booking",
    )
    return {"success": True, "booking": updated}

@api_router.post("/agent/agents")
async def agent_create_sub_agent(req: AgentUpsertReq, user: Dict[str, Any] = Depends(get_agent_user)):
    if user.get("role") != "agent":
        raise HTTPException(status_code=403, detail="Only primary agents can create sub-agents")
    sub_agent = {
        "id": str(uuid.uuid4()),
        "name": req.name,
        "phone": req.phone,
        "email": normalize_email(req.email) if req.email else "",
        "age": req.age,
        "aadhaar_number": req.aadhaar_number,
        "bank_details": req.bank_details,
        "role": "sub_agent",
        "status": req.status or "active",
        "approval_status": "approved",
        "manager_id": user["id"],
        "manager_name": user.get("name"),
        "auth_methods": ["manager_created"],
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    if not await is_database_available():
        local_save_user(sub_agent)
        user["sub_agent_ids"] = sorted(set([*user.get("sub_agent_ids", []), sub_agent["id"]]))
        local_save_user(user)
        return {"success": True, "agent": clean_user(sub_agent)}
    await db.users.insert_one(sub_agent.copy())
    await db.users.update_one({"id": user["id"]}, {"$addToSet": {"sub_agent_ids": sub_agent["id"]}})
    return {"success": True, "agent": clean_user(sub_agent)}

@api_router.put("/agent/agents/{agent_id}")
async def agent_update_sub_agent(agent_id: str, req: AgentUpsertReq, user: Dict[str, Any] = Depends(get_agent_user)):
    if agent_id not in user.get("sub_agent_ids", []):
        raise HTTPException(status_code=403, detail="You do not manage this agent")
    updates = {
        "name": req.name,
        "phone": req.phone,
        "email": normalize_email(req.email) if req.email else "",
        "age": req.age,
        "aadhaar_number": req.aadhaar_number,
        "bank_details": req.bank_details,
        "status": req.status or "active",
        "updated_at": now_utc().isoformat(),
    }
    if not await is_database_available():
        agent = local_find_user(user_id=agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        agent.update(updates)
        local_save_user(agent)
        return {"success": True, "agent": clean_user(agent)}
    result = await db.users.update_one({"id": agent_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent = await db.users.find_one({"id": agent_id}, {"_id": 0})
    return {"success": True, "agent": clean_user(agent)}

@api_router.put("/agent/agents/{agent_id}/status")
async def agent_update_sub_agent_status(agent_id: str, req: AgentStatusReq, user: Dict[str, Any] = Depends(get_agent_user)):
    allowed_statuses = {"active", "pending", "suspended"}
    status_value = req.status.strip().lower()
    if status_value not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Invalid agent status")
    if agent_id not in user.get("sub_agent_ids", []):
        raise HTTPException(status_code=403, detail="You do not manage this agent")
    updates = {"status": status_value, "updated_at": now_utc().isoformat()}
    if not await is_database_available():
        agent = local_find_user(user_id=agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        agent.update(updates)
        local_save_user(agent)
        return {"success": True, "agent": clean_user(agent)}
    await db.users.update_one({"id": agent_id}, {"$set": updates})
    agent = await db.users.find_one({"id": agent_id}, {"_id": 0})
    return {"success": True, "agent": clean_user(agent)}

@api_router.post("/agent/agents/{agent_id}/assign")
async def agent_assign_properties(agent_id: str, req: AgentAssignReq, user: Dict[str, Any] = Depends(get_agent_user)):
    if agent_id not in user.get("sub_agent_ids", []):
        raise HTTPException(status_code=403, detail="You do not manage this agent")
    if not req.plot_ids:
        raise HTTPException(status_code=400, detail="Select at least one asset")
    if not await is_database_available():
        for plot_id in req.plot_ids:
            plot = local_get_plot(plot_id)
            if not plot or plot.get("agent_id") not in agent_accessible_ids(user):
                raise HTTPException(status_code=403, detail="One or more assets are outside your access")
            local_save_plot_override(plot_id, {"agent_id": agent_id})
        return {"success": True, "assigned_plot_ids": req.plot_ids}
    plots = await db.plots.find({"id": {"$in": req.plot_ids}}, {"_id": 0}).to_list(500)
    if len(plots) != len(req.plot_ids) or any(plot.get("agent_id") not in agent_accessible_ids(user) for plot in plots):
        raise HTTPException(status_code=403, detail="One or more assets are outside your access")
    await db.plots.update_many({"id": {"$in": req.plot_ids}}, {"$set": {"agent_id": agent_id, "updated_at": now_utc().isoformat()}})
    return {"success": True, "assigned_plot_ids": req.plot_ids}

@api_router.get("/agent/site-visits")
async def agent_site_visits(user: Dict[str, Any] = Depends(get_agent_user)):
    if not await is_database_available():
        return [visit for visit in local_list_visits() if visit.get("assigned_agent_id") in agent_accessible_ids(user)]
    return await db.visits.find({"assigned_agent_id": {"$in": agent_accessible_ids(user)}}, {"_id": 0}).to_list(300)

@api_router.post("/agent/site-visits")
async def agent_create_site_visit(req: AgentVisitReq, user: Dict[str, Any] = Depends(get_agent_user)):
    assigned_agent_id = req.assigned_agent_id or user["id"]
    if assigned_agent_id not in agent_accessible_ids(user):
        raise HTTPException(status_code=403, detail="You cannot assign this visit to that agent")
    visit = {
        "id": str(uuid.uuid4()),
        "type": "site",
        "property_id": req.property_id,
        "plot_id": req.plot_id,
        "customer_id": req.customer_id,
        "customer_name": req.customer_name,
        "customer_phone": req.customer_phone,
        "customer_email": req.customer_email,
        "visit_date": req.visit_date,
        "visit_time": req.visit_time,
        "assigned_agent_id": assigned_agent_id,
        "created_by_agent_id": user["id"],
        "notes": req.notes,
        "status": "upcoming",
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    if not await is_database_available():
        local_save_visit(visit)
        await crm_sync_site_visit(
            visit=visit,
            customer={"id": req.customer_id, "name": req.customer_name, "phone": req.customer_phone, "email": req.customer_email},
            actor_user_id=user["id"],
        )
        return {"success": True, "visit": visit}
    await db.visits.insert_one(visit.copy())
    await crm_sync_site_visit(
        visit=visit,
        customer={"id": req.customer_id, "name": req.customer_name, "phone": req.customer_phone, "email": req.customer_email},
        actor_user_id=user["id"],
    )
    return {"success": True, "visit": visit}

@api_router.put("/agent/site-visits/{visit_id}")
async def agent_update_site_visit(visit_id: str, req: AgentVisitUpdateReq, user: Dict[str, Any] = Depends(get_agent_user)):
    allowed_statuses = {"upcoming", "completed", "cancelled", "rescheduled"}
    updates = req.model_dump(exclude_none=True)
    if "status" in updates:
        updates["status"] = updates["status"].strip().lower()
        if updates["status"] not in allowed_statuses:
            raise HTTPException(status_code=400, detail="Invalid visit status")
    if updates.get("assigned_agent_id") and updates["assigned_agent_id"] not in agent_accessible_ids(user):
        raise HTTPException(status_code=403, detail="You cannot assign this visit to that agent")
    updates["updated_at"] = now_utc().isoformat()
    if not await is_database_available():
        visit = next((item for item in local_list_visits() if item.get("id") == visit_id), None)
        if not visit:
            raise HTTPException(status_code=404, detail="Visit not found")
        if visit.get("assigned_agent_id") not in agent_accessible_ids(user):
            raise HTTPException(status_code=403, detail="You do not have access to this visit")
        updated = local_update_visit(visit_id, updates)
        if updated:
            await crm_sync_site_visit(
                visit=updated,
                customer={
                    "id": updated.get("customer_id"),
                    "name": updated.get("customer_name") or "Customer",
                    "phone": updated.get("customer_phone"),
                    "email": updated.get("customer_email"),
                },
                actor_user_id=user["id"],
            )
        return {"success": True, "visit": updated}
    visit = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")
    if visit.get("assigned_agent_id") not in agent_accessible_ids(user):
        raise HTTPException(status_code=403, detail="You do not have access to this visit")
    await db.visits.update_one({"id": visit_id}, {"$set": updates})
    updated = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if updated:
        await crm_sync_site_visit(
            visit=updated,
            customer={
                "id": updated.get("customer_id"),
                "name": updated.get("customer_name") or "Customer",
                "phone": updated.get("customer_phone"),
                "email": updated.get("customer_email"),
            },
            actor_user_id=user["id"],
        )
    return {"success": True, "visit": updated}


@api_router.post("/agent/bookings/{booking_id}/close")
async def agent_close_booking(booking_id: str, user: Dict[str, Any] = Depends(get_agent_user)):
    if not await is_database_available():
        booking = next((item for item in local_list_bookings() if item.get("id") == booking_id), None)
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        sub_agent_ids = user.get("sub_agent_ids", []) if user.get("role") == "agent" else []
        accessible_agent_ids = [user["id"], *sub_agent_ids]
        if booking.get("agent_id") not in accessible_agent_ids:
            raise HTTPException(status_code=403, detail="You do not have access to this booking")
        updated_booking = local_update_booking(booking_id, {"status": "closed", "closed_at": now_utc().isoformat()})
        local_save_plot_override(booking["plot_id"], {"status": "booked", "owner_id": booking["user_id"]})
        customer = local_find_user(user_id=booking.get("user_id")) or {"id": booking.get("user_id"), "name": booking.get("name"), "phone": booking.get("mobile"), "email": booking.get("customer_email")}
        await crm_sync_booking(
            booking=updated_booking or booking,
            customer=customer,
            actor_user_id=user["id"],
            source="agent_booking",
        )
        return {"success": True, "status": "closed", "booking": updated_booking}

    sub_agent_ids = user.get("sub_agent_ids", []) if user.get("role") == "agent" else []
    accessible_agent_ids = [user["id"], *sub_agent_ids]
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.get("agent_id") not in accessible_agent_ids:
        raise HTTPException(status_code=403, detail="You do not have access to this booking")

    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": "closed", "closed_at": now_utc().isoformat()}}
    )
    await db.plots.update_one(
        {"id": booking["plot_id"]},
        {"$set": {"status": "booked", "owner_id": booking["user_id"]}}
    )
    customer = await db.users.find_one({"id": booking["user_id"]}, {"_id": 0}) or {"id": booking.get("user_id"), "name": booking.get("name"), "phone": booking.get("mobile"), "email": booking.get("customer_email")}
    refreshed_booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0}) or booking
    await crm_sync_booking(
        booking=refreshed_booking,
        customer=customer,
        actor_user_id=user["id"],
        source="agent_booking",
    )
    return {"success": True, "status": "closed"}


@api_router.post("/admin/service-requests/{req_id}/status")
async def admin_update_service_status(req_id: str, status_val: str = Query(...), user: Dict[str, Any] = Depends(get_admin_user)):
    if status_val not in ("pending", "in_progress", "completed"):
        raise HTTPException(status_code=400, detail="Invalid status")
    await db.service_requests.update_one({"id": req_id}, {"$set": {"status": status_val}})
    return {"success": True}


@api_router.post("/admin/properties")
async def admin_create_property(req: AdminPropertyReq, user: Dict[str, Any] = Depends(get_admin_user)):
    prop = {
        "id": str(uuid.uuid4()),
        **req.dict(),
        "images": [req.image],
        "featured": False,
        "availability": "Available",
        "created_at": now_utc().isoformat(),
    }
    await db.properties.insert_one(prop.copy())
    prop.pop("_id", None)
    return prop


# ---------- Seed Data ----------
async def seed_data():
    if not await is_database_available():
        logger.warning("Skipping seed data because MongoDB is unavailable during startup.")
        return

    # Only seed if empty
    if await db.properties.count_documents({}) > 0:
        logger.info("Database already seeded, skipping.")
        return

    logger.info("Seeding initial data...")

    # ---- Properties ----
    properties = [
        {
            "id": "prop-1",
            "name": "Rivan Greens",
            "category": "Open Plots",
            "location": "Shadnagar, Hyderabad",
            "starting_price": 1850000,
            "size": "200-600 sq yards",
            "image": "https://images.unsplash.com/photo-1677137263546-8695fb895a9d",
            "images": [
                "https://images.unsplash.com/photo-1677137263546-8695fb895a9d",
                "https://images.pexels.com/photos/15422584/pexels-photo-15422584.jpeg",
                "https://images.unsplash.com/photo-1500382017468-9049fed747ef",
            ],
            "description": "Premium gated community plots with lush greenery, world-class amenities, and excellent connectivity to ORR.",
            "survey_number": "SY-No 234/3, 235/1",
            "facing": "East / North",
            "road_width": "40 ft black-top",
            "availability": "Available",
            "featured": True,
            "amenities": ["Clubhouse", "Swimming Pool", "Gym", "Children's Park", "24/7 Security", "Underground Drainage", "Avenue Plantation"],
            "approvals": ["HMDA Approved", "RERA Registered", "Clear Title", "Vasthu Compliant"],
            "nearby": ["ORR - 2km", "International Airport - 25min", "Schools - 5min", "Hospitals - 7min"],
            "highlights": "HMDA approved · Gated community · Investment grade",
            "created_at": now_utc().isoformat(),
        },
        {
            "id": "prop-2",
            "name": "Rivan Heritage Villas",
            "category": "Villas",
            "location": "Kompally, Hyderabad",
            "starting_price": 14500000,
            "size": "2400-3800 sq ft",
            "image": "https://images.pexels.com/photos/29334668/pexels-photo-29334668.png",
            "videoUrl": VILLA_VIDEO_URL,
            "images": [
                "https://images.pexels.com/photos/29334668/pexels-photo-29334668.png",
                "https://images.unsplash.com/photo-1626249893783-cc4a9f66880a",
                "https://images.unsplash.com/photo-1564013799919-ab600027ffc6",
            ],
            "description": "Luxury 4 BHK villas with private gardens, swimming pools and premium finishes. A legacy worth investing in.",
            "survey_number": "SY-No 89/2, 90",
            "facing": "East",
            "road_width": "60 ft",
            "availability": "Available",
            "featured": True,
            "amenities": ["Private Pool", "Garden", "Servant Quarter", "Italian Marble", "Modular Kitchen", "Smart Home"],
            "approvals": ["GHMC Approved", "RERA Registered", "Bank Loan Approved"],
            "nearby": ["Outer Ring Road - 3km", "Metro - 10min", "Schools - 5min"],
            "highlights": "Premium 4 BHK · Private pool · Smart home",
            "created_at": now_utc().isoformat(),
        },
        {
            "id": "prop-3",
            "name": "Rivan Skyline Towers",
            "category": "Apartments",
            "location": "Gachibowli, Hyderabad",
            "starting_price": 8500000,
            "size": "1450-2200 sq ft",
            "image": "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00",
            "images": [
                "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00",
                "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688",
                "https://images.unsplash.com/photo-1493809842364-78817add7ffb",
            ],
            "description": "Premium 3 BHK apartments in the heart of IT corridor. Sky lounges, infinity pool, and panoramic city views.",
            "survey_number": "SY-No 11/1",
            "facing": "North-East",
            "road_width": "100 ft main road",
            "availability": "Available",
            "featured": True,
            "amenities": ["Infinity Pool", "Sky Lounge", "Gym", "Co-working Space", "Pet Park", "EV Charging"],
            "approvals": ["GHMC Approved", "RERA Registered"],
            "nearby": ["Wipro Circle - 2km", "Financial District - 4km", "International Schools - 3km"],
            "highlights": "3 BHK · IT corridor · Sky lounge",
            "created_at": now_utc().isoformat(),
        },
        {
            "id": "prop-4",
            "name": "Rivan Farms",
            "category": "Farm Lands",
            "location": "Moinabad, Hyderabad",
            "starting_price": 3500000,
            "size": "1-5 acres",
            "image": "https://images.unsplash.com/photo-1500382017468-9049fed747ef",
            "images": [
                "https://images.unsplash.com/photo-1500382017468-9049fed747ef",
                "https://images.unsplash.com/photo-1444858345236-d791f5d20245",
            ],
            "description": "Premium managed farm lands. Own a piece of nature with mango and teak plantations. Returns guaranteed.",
            "survey_number": "SY-No 156, 157",
            "facing": "Multiple",
            "road_width": "30 ft",
            "availability": "Available",
            "featured": False,
            "amenities": ["Managed Farming", "Cottage", "Borewell", "Drip Irrigation", "Solar Power"],
            "approvals": ["Agriculture Clearance", "Clear Title"],
            "nearby": ["Outer Ring Road - 15min", "Chevella - 8km"],
            "highlights": "Managed farm · Cottage included · Plantations",
            "created_at": now_utc().isoformat(),
        },
        {
            "id": "prop-5",
            "name": "Rivan Commercial Hub",
            "category": "Commercial Properties",
            "location": "Madhapur, Hyderabad",
            "starting_price": 12000000,
            "size": "800-3500 sq ft",
            "image": "https://images.unsplash.com/photo-1486325212027-8081e485255e",
            "images": [
                "https://images.unsplash.com/photo-1486325212027-8081e485255e",
                "https://images.unsplash.com/photo-1497366216548-37526070297c",
            ],
            "description": "Grade A commercial spaces in the heart of HITEC City. Designed for premium retail and office tenants.",
            "survey_number": "SY-No 22/1",
            "facing": "South-West",
            "road_width": "100 ft",
            "availability": "Available",
            "featured": False,
            "amenities": ["High-speed Elevators", "100% Power Backup", "Centralized AC", "Smart Parking"],
            "approvals": ["GHMC Approved", "RERA Registered"],
            "nearby": ["Cyber Towers - 1km", "Metro - 500m"],
            "highlights": "Grade A · HITEC City · Premium tenants",
            "created_at": now_utc().isoformat(),
        },
        {
            "id": "prop-6",
            "name": "Rivan Lakeside Layout",
            "category": "Layouts",
            "location": "Tukkuguda, Hyderabad",
            "starting_price": 2200000,
            "size": "150-500 sq yards",
            "image": "https://images.pexels.com/photos/15422584/pexels-photo-15422584.jpeg",
            "images": [
                "https://images.pexels.com/photos/15422584/pexels-photo-15422584.jpeg",
                "https://images.unsplash.com/photo-1500382017468-9049fed747ef",
            ],
            "description": "Lakeside layouts with HMDA approval. Tree-lined boulevards, lake-view plots, and serene surroundings.",
            "survey_number": "SY-No 78/2, 79",
            "facing": "Multiple",
            "road_width": "40 ft",
            "availability": "Available",
            "featured": True,
            "amenities": ["Lake View", "Avenue Plantation", "Underground Drainage", "Street Lights"],
            "approvals": ["HMDA Approved", "RERA Registered"],
            "nearby": ["Airport - 20min", "ORR - 5min"],
            "highlights": "HMDA · Lakeside · Premium layout",
            "created_at": now_utc().isoformat(),
        },
        {
            "id": "prop-7",
            "name": "Rivan Premium Flats",
            "category": "Flats",
            "location": "Kukatpally, Hyderabad",
            "starting_price": 5800000,
            "size": "1100-1650 sq ft",
            "image": "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688",
            "images": [
                "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688",
                "https://images.unsplash.com/photo-1493809842364-78817add7ffb",
            ],
            "description": "2 & 3 BHK premium flats with modern amenities. Excellent rental yield potential.",
            "survey_number": "SY-No 45/1",
            "facing": "East / West",
            "road_width": "60 ft",
            "availability": "Available",
            "featured": False,
            "amenities": ["Swimming Pool", "Gym", "Kids Play Area", "Yoga Deck", "Visitor Parking"],
            "approvals": ["GHMC Approved", "RERA Registered"],
            "nearby": ["JNTU - 1km", "Metro - 2km"],
            "highlights": "2/3 BHK · Premium amenities · Investment",
            "created_at": now_utc().isoformat(),
        },
    ]
    await db.properties.insert_many([p.copy() for p in properties])

    # ---- Plots for Rivan Greens (interactive layout) ----
    plot_statuses = ["available"] * 10 + ["reserved"] * 4 + ["booked"] * 4 + ["sold"] * 6
    facings = ["East", "West", "North", "South", "North-East", "South-East"]
    plots = []
    plot_num = 1
    for row in range(6):
        for col in range(4):
            idx = row * 4 + col
            if idx >= 24:
                break
            size_sqy = [200, 240, 300, 360][col]
            price = size_sqy * 9250
            plots.append({
                "id": f"plot-1-{plot_num}",
                "property_id": "prop-1",
                "agent_id": "agent-main-001" if plot_num <= 12 else "agent-sub-001",
                "unit_type": "plot",
                "plot_number": f"P-{plot_num:03d}",
                "survey_number": "SY-No 234/3",
                "size": f"{size_sqy} sq yards",
                "size_sqy": size_sqy,
                "facing": facings[idx % len(facings)],
                "price": price,
                "status": plot_statuses[idx % len(plot_statuses)],
                "row": row,
                "col": col,
                "owner_id": None,
                "created_at": now_utc().isoformat(),
            })
            plot_num += 1
    await db.plots.insert_many([p.copy() for p in plots])

    # ---- Plots for Rivan Lakeside Layout ----
    plots2 = []
    plot_num = 1
    for row in range(5):
        for col in range(4):
            idx = row * 4 + col
            size_sqy = [150, 200, 300, 500][col]
            price = size_sqy * 11000
            status_choice = ["available", "available", "available", "reserved", "booked", "sold"][idx % 6]
            plots2.append({
                "id": f"plot-6-{plot_num}",
                "property_id": "prop-6",
                "agent_id": "agent-main-001" if plot_num <= 10 else "agent-sub-001",
                "unit_type": "plot",
                "plot_number": f"L-{plot_num:03d}",
                "survey_number": "SY-No 78/2",
                "size": f"{size_sqy} sq yards",
                "size_sqy": size_sqy,
                "facing": facings[idx % len(facings)],
                "price": price,
                "status": status_choice,
                "row": row,
                "col": col,
                "owner_id": None,
                "created_at": now_utc().isoformat(),
            })
            plot_num += 1
    await db.plots.insert_many([p.copy() for p in plots2])

    # ---- Apartment Units for Rivan Skyline Towers (prop-3) ----
    # 2 towers × 8 floors × 4 flats per floor = 64 units
    apt_units = []
    flat_status_pool = ["available"] * 5 + ["reserved", "booked", "sold"]
    for tower_idx, tower in enumerate(["T1", "T2"]):
        for floor in range(1, 9):
            for flat in range(1, 5):
                size_sqft = [1450, 1750, 1950, 2200][flat - 1]
                bhk = ["3 BHK", "3 BHK", "3.5 BHK", "4 BHK"][flat - 1]
                price = size_sqft * 5862  # ~₹85L starting
                idx_local = tower_idx * 32 + (floor - 1) * 4 + (flat - 1)
                apt_units.append({
                    "id": f"flat-3-{tower}-F{floor:02d}-{flat:02d}",
                    "property_id": "prop-3",
                    "agent_id": "agent-main-001" if tower == "T1" else "agent-sub-001",
                    "unit_type": "flat",
                    "plot_number": f"{tower}-{floor:02d}0{flat}",
                    "survey_number": "SY-No 11/1",
                    "tower": tower,
                    "floor": floor,
                    "flat_number": f"{tower}-{floor:02d}0{flat}",
                    "bhk": bhk,
                    "size": f"{size_sqft} sq ft",
                    "size_sqft": size_sqft,
                    "facing": ["North-East", "South-East", "North-West", "South-West"][flat - 1],
                    "price": price,
                    "status": flat_status_pool[idx_local % len(flat_status_pool)],
                    "row": floor,
                    "col": flat,
                    "owner_id": None,
                    "created_at": now_utc().isoformat(),
                })
    await db.plots.insert_many([u.copy() for u in apt_units])

    # ---- Villa Units for Rivan Heritage Villas (prop-2) ----
    villa_units = []
    villa_status_pool = ["available", "available", "available", "reserved", "booked", "sold"]
    for i in range(1, 13):
        size_sqft = [2400, 2800, 3200, 3800][((i - 1) % 4)]
        villa_type = ["Classic 4 BHK", "Premium 4 BHK", "Luxury 4.5 BHK", "Signature 5 BHK"][((i - 1) % 4)]
        price = size_sqft * 6041  # ~₹1.45 Cr starting
        villa_units.append({
            "id": f"villa-2-{i:02d}",
            "property_id": "prop-2",
            "agent_id": "agent-main-001" if i <= 6 else "agent-sub-001",
            "unit_type": "villa",
            "plot_number": f"V-{i:02d}",
            "survey_number": "SY-No 89/2",
            "villa_type": villa_type,
            "size": f"{size_sqft} sq ft",
            "size_sqft": size_sqft,
            "facing": facings[i % len(facings)],
            "price": price,
            "status": villa_status_pool[i % len(villa_status_pool)],
            "row": (i - 1) // 4,
            "col": (i - 1) % 4,
            "owner_id": None,
            "created_at": now_utc().isoformat(),
        })
    await db.plots.insert_many([v.copy() for v in villa_units])

    # ---- Commercial Units for Rivan Commercial Hub (prop-5) ----
    commercial_units = []
    cm_status_pool = ["available", "available", "reserved", "booked", "sold"]
    for floor in range(1, 6):
        for shop in range(1, 5):
            idx_c = (floor - 1) * 4 + (shop - 1)
            size_sqft = [800, 1200, 2000, 3500][shop - 1]
            shop_type = ["Retail", "Retail", "Office", "Office"][shop - 1]
            price = size_sqft * 14400  # ~₹1.15 Cr starting
            commercial_units.append({
                "id": f"shop-5-F{floor:02d}-{shop:02d}",
                "property_id": "prop-5",
                "agent_id": "agent-main-001" if floor <= 2 else "agent-sub-001",
                "unit_type": "shop",
                "plot_number": f"F{floor}-S{shop:02d}",
                "survey_number": "SY-No 22/1",
                "floor": floor,
                "shop_type": shop_type,
                "size": f"{size_sqft} sq ft",
                "size_sqft": size_sqft,
                "facing": ["East", "West", "North", "South"][shop - 1],
                "price": price,
                "status": cm_status_pool[idx_c % len(cm_status_pool)],
                "row": floor,
                "col": shop,
                "owner_id": None,
                "created_at": now_utc().isoformat(),
            })
    await db.plots.insert_many([c.copy() for c in commercial_units])

    # ---- Farm Land Parcels for Rivan Farms (prop-4) ----
    farm_units = []
    farm_status_pool = ["available", "available", "reserved", "booked", "sold"]
    for i in range(1, 9):
        acres = [1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 5.0][i - 1]
        price = int(acres * 3500000)
        farm_units.append({
            "id": f"farm-4-{i:02d}",
            "property_id": "prop-4",
            "agent_id": "agent-main-001" if i <= 4 else "agent-sub-001",
            "unit_type": "farm",
            "plot_number": f"FL-{i:02d}",
            "survey_number": "SY-No 156",
            "acres": acres,
            "size": f"{acres} acres",
            "facing": facings[i % len(facings)],
            "price": price,
            "status": farm_status_pool[i % len(farm_status_pool)],
            "row": (i - 1) // 4,
            "col": (i - 1) % 4,
            "owner_id": None,
            "created_at": now_utc().isoformat(),
        })
    await db.plots.insert_many([f.copy() for f in farm_units])

    # ---- Flats for Rivan Premium Flats (prop-7) ----
    pflat_units = []
    pf_status_pool = ["available"] * 4 + ["reserved", "booked", "sold"]
    for tower_idx, tower in enumerate(["A", "B"]):
        for floor in range(1, 7):
            for flat in range(1, 4):
                size_sqft = [1100, 1350, 1650][flat - 1]
                bhk = ["2 BHK", "3 BHK", "3 BHK"][flat - 1]
                price = size_sqft * 5273
                idx_pf = tower_idx * 18 + (floor - 1) * 3 + (flat - 1)
                pflat_units.append({
                    "id": f"flat-7-{tower}-F{floor:02d}-{flat:02d}",
                    "property_id": "prop-7",
                    "agent_id": "agent-main-001" if tower == "A" else "agent-sub-001",
                    "unit_type": "flat",
                    "plot_number": f"{tower}-{floor:02d}0{flat}",
                    "survey_number": "SY-No 45/1",
                    "tower": tower,
                    "floor": floor,
                    "flat_number": f"{tower}-{floor:02d}0{flat}",
                    "bhk": bhk,
                    "size": f"{size_sqft} sq ft",
                    "size_sqft": size_sqft,
                    "facing": ["East", "West", "North"][flat - 1],
                    "price": price,
                    "status": pf_status_pool[idx_pf % len(pf_status_pool)],
                    "row": floor,
                    "col": flat,
                    "owner_id": None,
                    "created_at": now_utc().isoformat(),
                })
    await db.plots.insert_many([u.copy() for u in pflat_units])

    # ---- Experience Centres ----
    centres = [
        {
            "id": "centre-1",
            "name": "Rivan Banjara Hills Experience Centre",
            "address": "Road No 12, Banjara Hills, Hyderabad - 500034",
            "phone": "+91-9876543210",
            "whatsapp": "+91-9876543210",
            "timings": "10:00 AM - 7:00 PM (Mon-Sun)",
            "manager": "Mr. Karthik Reddy",
            "image": "https://images.pexels.com/photos/7534173/pexels-photo-7534173.jpeg",
            "latitude": 17.4172,
            "longitude": 78.4506,
            "directions_url": "https://maps.google.com/?q=Banjara+Hills+Hyderabad",
        },
        {
            "id": "centre-2",
            "name": "Rivan Gachibowli Experience Centre",
            "address": "DLF Cyber City, Gachibowli, Hyderabad - 500032",
            "phone": "+91-9876543211",
            "whatsapp": "+91-9876543211",
            "timings": "10:00 AM - 8:00 PM (Mon-Sun)",
            "manager": "Mrs. Priya Sharma",
            "image": "https://images.unsplash.com/photo-1497366216548-37526070297c",
            "latitude": 17.4399,
            "longitude": 78.3489,
            "directions_url": "https://maps.google.com/?q=Gachibowli+Hyderabad",
        },
        {
            "id": "centre-3",
            "name": "Rivan Kompally Site Office",
            "address": "Medchal Road, Kompally, Hyderabad - 500100",
            "phone": "+91-9876543212",
            "whatsapp": "+91-9876543212",
            "timings": "9:00 AM - 6:00 PM (Mon-Sat)",
            "manager": "Mr. Suresh Babu",
            "image": "https://images.unsplash.com/photo-1497366811353-6870744d04b2",
            "latitude": 17.5354,
            "longitude": 78.4895,
            "directions_url": "https://maps.google.com/?q=Kompally+Hyderabad",
        },
    ]
    await db.centres.insert_many([c.copy() for c in centres])

    # ---- Demo user with land + installments + documents ----
    demo_user_id = "demo-user-001"
    await db.users.insert_one({
        "id": demo_user_id,
        "phone": "+919999900001",
        "name": "Rajesh Kumar",
        "email": "rajesh.demo@rivanreality.com",
        "address": "Plot 22, Jubilee Hills, Hyderabad",
        "kyc_status": "verified",
        "is_admin": False,
        "role": "customer",
        "created_at": now_utc().isoformat(),
    })

    # Assign a plot to demo user
    demo_plot_id = "plot-1-5"
    await db.plots.update_one(
        {"id": demo_plot_id},
        {"$set": {"status": "booked", "owner_id": demo_user_id}}
    )

    # Assign a SECOND plot to demo user — fully purchased (for "Purchase Completed" demo state)
    completed_plot_id = "villa-2-03"
    await db.plots.update_one(
        {"id": completed_plot_id},
        {"$set": {"status": "sold", "owner_id": demo_user_id}}
    )

    # Installments for demo
    total_property = 2775000  # 300 sqy * 9250
    installment_amount = total_property / 12
    base_date = now_utc().date()
    installments = []
    for i in range(1, 13):
        due = base_date + timedelta(days=30 * (i - 4))  # 3 past, 9 future
        status_val = "paid" if i <= 3 else "upcoming"
        installments.append({
            "id": f"inst-demo-{i}",
            "user_id": demo_user_id,
            "property_id": "prop-1",
            "plot_id": demo_plot_id,
            "installment_number": i,
            "amount": installment_amount,
            "due_date": due.isoformat(),
            "status": status_val,
            "paid_at": (now_utc() - timedelta(days=30 * (4 - i))).isoformat() if i <= 3 else None,
            "receipt_id": f"RCPT-DEMO{i:03d}" if i <= 3 else None,
            "created_at": now_utc().isoformat(),
        })
    await db.installments.insert_many([i.copy() for i in installments])

    # Past payments for demo
    for i in range(1, 4):
        await db.payments.insert_one({
            "id": f"pay-demo-{i}",
            "user_id": demo_user_id,
            "installment_id": f"inst-demo-{i}",
            "amount": installment_amount,
            "receipt_id": f"RCPT-DEMO{i:03d}",
            "method": "Online (UPI)",
            "paid_at": (now_utc() - timedelta(days=30 * (4 - i))).isoformat(),
            "installment_number": i,
            "property_id": "prop-1",
        })

    # Documents for demo
    demo_docs = [
        {"name": "Sale Agreement", "type": "Agreement", "size": "1.2 MB"},
        {"name": "Plot Allocation Letter", "type": "Letter", "size": "320 KB"},
        {"name": "Payment Receipt #1", "type": "Receipt", "size": "180 KB"},
        {"name": "Payment Receipt #2", "type": "Receipt", "size": "180 KB"},
        {"name": "Payment Receipt #3", "type": "Receipt", "size": "180 KB"},
        {"name": "KYC - PAN Card", "type": "KYC", "size": "220 KB"},
        {"name": "KYC - Aadhaar", "type": "KYC", "size": "340 KB"},
        {"name": "HMDA Approval Copy", "type": "Approval", "size": "2.1 MB"},
        {"name": "Sale Deed Draft", "type": "Deed", "size": "850 KB"},
    ]
    for d in demo_docs:
        await db.documents.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": demo_user_id,
            "name": d["name"],
            "type": d["type"],
            "size": d["size"],
            "url": "https://www.africau.edu/images/default/sample.pdf",
            "created_at": now_utc().isoformat(),
        })

    # Notifications for demo
    demo_notifs = [
        ("Welcome to Rivan Reality", "Legacy of trust, legacy of wealth.", "welcome"),
        ("Installment Due Reminder", f"Your next installment of ₹{installment_amount:,.0f} is due soon.", "payment"),
        ("New Layout Launched", "Rivan Lakeside Layout — bookings open now!", "project"),
        ("Document Uploaded", "Your sale deed draft has been uploaded to the document locker.", "document"),
    ]
    for title, body, ntype in demo_notifs:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": demo_user_id,
            "title": title,
            "body": body,
            "type": ntype,
            "read": False,
            "created_at": now_utc().isoformat(),
        })

    # ---- Admin user ----
    await db.users.insert_one({
        "id": "admin-user-001",
        "phone": "+919000000000",
        "name": "Rivan Admin",
        "email": "admin@rivanreality.com",
        "address": "Rivan HQ, Hyderabad",
        "kyc_status": "verified",
        "is_admin": True,
        "role": "admin",
        "created_at": now_utc().isoformat(),
    })

    await db.users.insert_one({
        "id": "agent-main-001",
        "phone": "+919900001111",
        "name": "Arjun Reddy",
        "email": "agent@rivaan.com",
        "address": "Banjara Hills, Hyderabad",
        "kyc_status": "verified",
        "is_admin": False,
        "role": "agent",
        "age": 34,
        "aadhaar_number": "5555 6666 7777",
        "bank_details": "HDFC Bank · A/C XXXX1298 · IFSC HDFC0000456",
        "manager_name": "Regional Sales Director",
        "agent_brand_name": "Rivan Crest Partners",
        "sub_agent_ids": ["agent-sub-001"],
        "auth_methods": ["email"],
        "email_verified": True,
        "phone_verified": True,
        "password_hash": hash_password("Agent@123"),
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
        "last_login_at": now_utc().isoformat(),
    })

    await db.users.insert_one({
        "id": "agent-sub-001",
        "phone": "+919911112222",
        "name": "Meghana Rao",
        "email": "subagent@rivaan.com",
        "address": "Gachibowli, Hyderabad",
        "kyc_status": "verified",
        "is_admin": False,
        "role": "sub_agent",
        "age": 28,
        "aadhaar_number": "8888 9999 0000",
        "bank_details": "ICICI Bank · A/C XXXX4432 · IFSC ICIC0000789",
        "manager_name": "Arjun Reddy",
        "manager_id": "agent-main-001",
        "agent_brand_name": "Rivan Crest Partners",
        "sub_agent_ids": [],
        "auth_methods": ["email"],
        "email_verified": True,
        "phone_verified": True,
        "password_hash": hash_password("Agent@123"),
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
        "last_login_at": now_utc().isoformat(),
    })

    logger.info("Seed data inserted successfully.")


# ---------- Lifecycle ----------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await seed_data()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

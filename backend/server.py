"""
Rivan Reality LLP - Customer App Backend
FastAPI + MongoDB customer platform with production auth flows.
"""
import asyncio
import base64
from collections import defaultdict, deque
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Query, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
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
import hashlib
import re
import requests
from pymongo.errors import DuplicateKeyError, OperationFailure

from auth_service import (
    JWT_ALGORITHM,
    auth_methods_union,
    create_access_token,
    create_refresh_token,
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


def require_env(key: str) -> str:
    value = os.environ.get(key, "").strip().strip("\"'")
    if not value:
        raise RuntimeError(
            f"Missing required environment variable '{key}'. Add it to backend/.env before starting the backend."
        )
    return value


# ---------- Config ----------
MONGO_URL = require_env("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "rivaan")
JWT_SECRET = require_env("JWT_SECRET")
JWT_EXPIRES_MIN = int(os.environ.get("JWT_EXPIRE_MINUTES", "10080"))
REFRESH_TOKEN_EXPIRES_MIN = int(os.environ.get("REFRESH_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 30)))
ALLOW_LOCAL_AUTH_FALLBACK = False
ENABLE_DEMO_DATA = False
DEMO_AUTH_USER_IDS = (
    "admin-user-001",
    "agent-main-001",
    "agent-sub-001",
    "agent-pending-001",
    "customer-demo-001",
    "customer-demo-002",
)
ADMIN_DISPLAY_NAME = "Kollu Sravani"
PRIMARY_ADMIN_PHONE = normalize_phone("9491348973")
SECONDARY_ADMIN_PHONE = normalize_phone("9848129637")
ADMIN_LOGIN_PHONES = (PRIMARY_ADMIN_PHONE, SECONDARY_ADMIN_PHONE)
PRIMARY_ADMIN_EMAIL = "admin@rivanrealty.com"
PRIMARY_ADMIN_USER_ID = "admin-user-001"
SECONDARY_ADMIN_EMAIL = "admin.secondary@rivanrealty.com"
SECONDARY_ADMIN_USER_ID = "admin-user-002"
PRIMARY_AGENT_PHONE = normalize_phone("9052644345")
PRIMARY_AGENT_EMAIL = ""
PRIMARY_AGENT_USER_ID = "agent-main-001"
ROLE_CUSTOMER = "customer"
ROLE_AGENT = "agent"
ROLE_ADMIN = "admin"
APPROVAL_NOT_REQUIRED = "not_required"
APPROVAL_PENDING = "pending"
APPROVAL_APPROVED = "approved"
APPROVAL_REJECTED = "rejected"
STATUS_ACTIVE = "active"
STATUS_SUSPENDED = "suspended"
STATUS_INACTIVE = "inactive"
MONGO_SERVER_SELECTION_TIMEOUT_MS = int(os.environ.get("MONGO_SERVER_SELECTION_TIMEOUT_MS", "15000"))
MONGO_CONNECT_TIMEOUT_MS = int(os.environ.get("MONGO_CONNECT_TIMEOUT_MS", "15000"))
MONGO_SOCKET_TIMEOUT_MS = int(os.environ.get("MONGO_SOCKET_TIMEOUT_MS", "20000"))
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


def peek_jwt_payload(token: str) -> Dict[str, Any]:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return {}
        payload_segment = parts[1]
        padding = "=" * (-len(payload_segment) % 4)
        decoded = base64.urlsafe_b64decode(payload_segment + padding)
        payload = json.loads(decoded.decode("utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def looks_like_firebase_google_token(token: str, project_id: str) -> bool:
    payload = peek_jwt_payload(token)
    issuer = str(payload.get("iss") or "")
    sign_in_provider = str(payload.get("firebase", {}).get("sign_in_provider") or "")
    audience = str(payload.get("aud") or "")
    expected_issuer = f"https://securetoken.google.com/{project_id}" if project_id else ""
    return bool(
        project_id
        and (
            issuer == expected_issuer
            or audience == project_id
            or sign_in_provider == "google.com"
        )
    )


VILLA_VIDEO_URL = "https://res.cloudinary.com/dzisksq78/video/upload/v1780939161/villa_1_ltxt2q.mp4"
DEFAULT_CORS_ORIGINS = [
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:19006",
    "http://127.0.0.1:19006",
    "https://rivan-auth-live.web.app",
    "https://rivan-auth-live.firebaseapp.com",
    "https://rivan.onrender.com",
    "https://rivanrealty.com",
    "https://www.rivanrealty.com",
]


def build_cors_origins(raw_value: str) -> List[str]:
    merged: List[str] = []
    seen: set[str] = set()
    for origin in [*DEFAULT_CORS_ORIGINS, *raw_value.split(",")]:
        normalized = origin.strip().rstrip("/")
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        merged.append(normalized)
    return merged


CORS_ORIGINS = build_cors_origins(
    os.environ.get(
        "CORS_ORIGINS",
        ",".join(DEFAULT_CORS_ORIGINS),
    )
)
CORS_ORIGIN_REGEX = os.environ.get("CORS_ORIGIN_REGEX") or None

client = AsyncIOMotorClient(
    MONGO_URL,
    serverSelectionTimeoutMS=MONGO_SERVER_SELECTION_TIMEOUT_MS,
    connectTimeoutMS=MONGO_CONNECT_TIMEOUT_MS,
    socketTimeoutMS=MONGO_SOCKET_TIMEOUT_MS,
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
        "10",
    )
)
_db_availability_cache: Dict[str, Any] = {"value": None, "checked_at": 0.0}
_rate_limit_store: Dict[str, deque[float]] = defaultdict(deque)
FEATURED_PROPERTIES_CACHE_TTL_SECONDS = int(os.environ.get("FEATURED_PROPERTIES_CACHE_TTL_SECONDS", "90"))
_featured_properties_cache: Dict[str, Any] = {"value": None, "expires_at": 0.0}
ACCESS_TOKEN_COOKIE_NAME = "rivan_access_token"
REFRESH_TOKEN_COOKIE_NAME = "rivan_refresh_token"
COOKIE_SECURE = get_env_bool("COOKIE_SECURE", True)
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "none").strip().lower() or "none"
COOKIE_DOMAIN = os.environ.get("COOKIE_DOMAIN", "").strip() or None


class LiveUpdateManager:
    def __init__(self) -> None:
        self.connections: Dict[str, Dict[str, Any]] = {}

    async def connect(self, websocket: WebSocket, *, user_id: Optional[str], role: Optional[str]) -> str:
        await websocket.accept()
        connection_id = str(uuid.uuid4())
        self.connections[connection_id] = {
            "websocket": websocket,
            "user_id": str(user_id or "").strip() or None,
            "role": str(role or "").strip().lower() or "guest",
            "connected_at": now_utc().isoformat(),
        }
        return connection_id

    def disconnect(self, connection_id: str) -> None:
        self.connections.pop(connection_id, None)

    async def publish(
        self,
        *,
        event: str,
        payload: Dict[str, Any],
        user_ids: Optional[List[str]] = None,
        roles: Optional[List[str]] = None,
    ) -> None:
        normalized_user_ids = {str(item).strip() for item in (user_ids or []) if str(item).strip()}
        normalized_roles = {str(item).strip().lower() for item in (roles or []) if str(item).strip()}
        stale_ids: List[str] = []
        message = {
            "event": event,
            "payload": payload,
            "sent_at": now_utc().isoformat(),
        }
        for connection_id, connection in list(self.connections.items()):
            connection_user_id = connection.get("user_id")
            connection_role = str(connection.get("role") or "").strip().lower()
            if normalized_user_ids and connection_user_id not in normalized_user_ids:
                continue
            if normalized_roles and connection_role not in normalized_roles:
                continue
            try:
                await connection["websocket"].send_json(message)
            except Exception:
                stale_ids.append(connection_id)
        for connection_id in stale_ids:
            self.disconnect(connection_id)


live_updates = LiveUpdateManager()


def iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


LEGACY_DEMO_PROPERTY_NAMES = {
    "rivan greens",
    "rivan heritage villas",
    "rivan skyline towers",
    "rivan farms",
    "rivan commercial hub",
    "rivan lakeside layout",
    "rivan premium flats",
}
LEGACY_DEMO_PROPERTY_LOCATIONS = {
    "shadnagar, hyderabad",
    "kompally, hyderabad",
    "gachibowli, hyderabad",
    "moinabad, hyderabad",
    "madhapur, hyderabad",
    "tukkuguda, hyderabad",
    "kukatpally, hyderabad",
}
LEGACY_DEMO_DOCUMENT_URLS = {
    "https://www.africau.edu/images/default/sample.pdf",
}
LIVE_PROPERTY_NAME_OVERRIDES = {
    "prop-1": "Siripuram Gardens Independent House",
}
LIVE_PROPERTY_LOCATION_OVERRIDES = {
    "prop-1": "Achutapuram, Visakhapatnam",
}


def is_legacy_demo_property_reference(*values: Any) -> bool:
    for value in values:
        normalized = str(value or "").strip().lower()
        if not normalized:
            continue
        if normalized in LEGACY_DEMO_PROPERTY_NAMES or normalized in LEGACY_DEMO_PROPERTY_LOCATIONS:
            return True
    return False


def is_legacy_demo_document(item: Dict[str, Any]) -> bool:
    normalized_url = str(item.get("url") or "").strip().lower()
    return normalized_url in LEGACY_DEMO_DOCUMENT_URLS


def canonical_live_property_id(
    property_id: Optional[str] = None,
    *reference_values: Any,
) -> str:
    normalized_property_id = str(property_id or "").strip()
    if normalized_property_id:
        return normalized_property_id
    reference_blob = " ".join(str(value or "").strip().lower() for value in reference_values if str(value or "").strip())
    if not reference_blob:
        return ""
    if any(token in reference_blob for token in ("siripuram gardens", "achutapuram", "rivan greens", "shadnagar")):
        return "prop-1"
    return ""


def live_property_name(property_id: Optional[str], fallback_name: Optional[str] = None) -> str:
    override = LIVE_PROPERTY_NAME_OVERRIDES.get(str(property_id or "").strip())
    return override or str(fallback_name or "").strip()


def live_property_location(property_id: Optional[str], fallback_location: Optional[str] = None) -> str:
    override = LIVE_PROPERTY_LOCATION_OVERRIDES.get(str(property_id or "").strip())
    return override or str(fallback_location or "").strip()


def replace_live_property_labels(value: Optional[str]) -> str:
    text = str(value or "")
    if not text:
        return ""
    replacements = {
        "Rivan Greens": LIVE_PROPERTY_NAME_OVERRIDES["prop-1"],
        "rivan greens": LIVE_PROPERTY_NAME_OVERRIDES["prop-1"],
        "Shadnagar, Hyderabad": LIVE_PROPERTY_LOCATION_OVERRIDES["prop-1"],
        "shadnagar, hyderabad": LIVE_PROPERTY_LOCATION_OVERRIDES["prop-1"],
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return text


def property_city_code(*candidates: Optional[str]) -> str:
    text = " ".join(str(candidate or "") for candidate in candidates).lower()
    if "visakhapatnam" in text or "vizag" in text:
        return "VZG"
    if "hyderabad" in text:
        return "HYD"
    if "bengaluru" in text or "bangalore" in text:
        return "BLR"
    if "vijayawada" in text:
        return "VJA"
    tokens = [token for token in re.split(r"[^a-z0-9]+", text) if token]
    if not tokens:
        return "RIV"
    return (tokens[0][:3]).upper().ljust(3, "X")


def property_locality_code(*candidates: Optional[str]) -> str:
    for candidate in candidates:
        text = str(candidate or "").strip()
        if not text:
            continue
        primary = text.split(",")[0].strip()
        token = re.sub(r"[^A-Za-z0-9]", "", primary).upper()
        if token:
            return token[:3].ljust(3, "X")
    return "GEN"


def property_sequence_code(identifier: Optional[str]) -> str:
    raw = str(identifier or "").strip()
    match = re.search(r"(\d+)$", raw)
    if match:
        return f"{int(match.group(1)):03d}"
    checksum = abs(hash(raw)) % 1000 if raw else 0
    return f"{checksum:03d}"


def property_code_for_record(item: Dict[str, Any]) -> str:
    existing = str(item.get("property_code") or "").strip().upper()
    if existing and not re.fullmatch(r"PR-[A-F0-9]{5}", existing):
        return existing
    identifier = str(item.get("id") or item.get("property_id") or uuid.uuid4())
    property_id = str(item.get("property_id") or item.get("id") or "").strip()
    if property_id == "prop-1":
        return "ATC-001"

    locality = property_locality_code(
        item.get("location"),
        item.get("address"),
        item.get("property_name"),
        item.get("name"),
    )
    return f"{locality}-{property_sequence_code(identifier)}"


def normalize_live_property_record(item: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(item)
    property_id = canonical_live_property_id(
        normalized.get("id") or normalized.get("property_id"),
        normalized.get("name"),
        normalized.get("property_name"),
        normalized.get("location"),
        normalized.get("address"),
        normalized.get("description"),
    )
    if property_id:
        if normalized.get("property_id") is not None:
            normalized["property_id"] = property_id
        else:
            normalized["id"] = property_id
        normalized["name"] = live_property_name(property_id, normalized.get("name"))
        normalized["property_name"] = live_property_name(property_id, normalized.get("property_name") or normalized.get("name"))
        normalized["location"] = live_property_location(property_id, normalized.get("location"))
        normalized["address"] = live_property_location(property_id, normalized.get("address"))
        normalized["highlights"] = replace_live_property_labels(normalized.get("highlights"))
        normalized["description"] = replace_live_property_labels(normalized.get("description"))
    normalized["property_code"] = property_code_for_record(normalized)
    return normalized


def normalize_live_visit_record(item: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(item)
    normalized["status"] = normalize_visit_status_value(normalized.get("status"))
    property_id = canonical_live_property_id(
        normalized.get("property_id"),
        normalized.get("property_name"),
        normalized.get("project_name"),
        normalized.get("title"),
        normalized.get("body"),
        normalized.get("message"),
        normalized.get("location"),
    )
    if property_id:
        normalized["property_id"] = property_id
        normalized["property_name"] = live_property_name(
            property_id,
            normalized.get("property_name") or normalized.get("project_name"),
        )
        if normalized.get("project_name"):
            normalized["project_name"] = live_property_name(property_id, normalized.get("project_name"))
        normalized["location"] = live_property_location(property_id, normalized.get("location"))
    normalized["title"] = replace_live_property_labels(normalized.get("title"))
    normalized["body"] = replace_live_property_labels(normalized.get("body"))
    normalized["message"] = replace_live_property_labels(normalized.get("message"))
    normalized["property_code"] = property_code_for_record(normalized)
    return normalized


def has_invalid_demo_visit_date(value: Optional[str]) -> bool:
    raw = str(value or "").strip()
    if not raw:
        return False
    try:
        year = datetime.fromisoformat(raw).year
    except ValueError:
        return False
    return year < 2025


def is_actionable_visit_for_admin(item: Dict[str, Any]) -> bool:
    status_value = normalize_visit_status_value(item.get("status"))
    if status_value in {"agent_approved", "admin_approved"}:
        return True
    if status_value in {"pending", "approval_requested"}:
        return True
    if status_value not in {"scheduled", "rescheduled"}:
        return False
    raw = str(item.get("visit_date") or "").strip()
    if not raw:
        return False
    try:
        visit_day = datetime.fromisoformat(raw).date()
    except ValueError:
        return False
    return visit_day >= now_utc().date()


def should_hide_demo_item(item: Dict[str, Any]) -> bool:
    if str(item.get("user_id") or "") in DEMO_AUTH_USER_IDS:
        return True
    if str(item.get("customer_id") or "") in DEMO_AUTH_USER_IDS:
        return True
    if str(item.get("owner_id") or "") in DEMO_AUTH_USER_IDS:
        return True
    if is_legacy_demo_property_reference(
        item.get("property_name"),
        item.get("project_name"),
        item.get("name"),
        item.get("location"),
        item.get("title"),
        item.get("body"),
        item.get("message"),
    ):
        return True
    if has_invalid_demo_visit_date(item.get("visit_date")):
        return True
    if is_legacy_demo_document(item):
        return True
    return False


def filter_live_customer_items(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [item for item in items if not should_hide_demo_item(item)]


VISIT_STATUS_ALIASES = {
    "pending": "pending_agent_approval",
    "approval requested": "pending_agent_approval",
    "confirmed": "scheduled",
    "upcoming": "scheduled",
}
VISIT_STATUSES_FOR_AGENT = {
    "pending_agent_approval",
    "agent_approved",
    "admin_approved",
    "scheduled",
    "rescheduled",
    "completed",
    "rejected",
    "cancelled",
}
BOOKING_STATUS_ALIASES = {
    "approval requested": "pending",
    "approved": "agent_approved",
    "confirmed": "reserved",
    "closed": "completed",
    "ongoing": "reserved",
    "site visit scheduled": "agent_approved",
}
BOOKING_STATUSES_FOR_AGENT = {
    "pending",
    "agent_approved",
    "admin_approved",
    "reserved",
    "completed",
    "rejected",
    "cancelled",
}


def normalize_visit_status_value(value: Optional[str]) -> str:
    normalized = str(value or "pending_agent_approval").strip().lower().replace("-", "_").replace(" ", "_")
    return VISIT_STATUS_ALIASES.get(normalized.replace("_", " "), VISIT_STATUS_ALIASES.get(normalized, normalized))


def normalize_booking_status_value(value: Optional[str]) -> str:
    normalized = str(value or "pending").strip().lower().replace("-", "_").replace(" ", "_")
    return BOOKING_STATUS_ALIASES.get(normalized.replace("_", " "), BOOKING_STATUS_ALIASES.get(normalized, normalized))


def normalize_booking_record(item: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(item)
    normalized["status"] = normalize_booking_status_value(normalized.get("status"))
    normalized["property_code"] = property_code_for_record(normalized)
    return normalized


def normalize_plot_record(item: Dict[str, Any], property_doc: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    normalized = dict(item)
    prop = normalize_live_property_record(property_doc or {}) if property_doc else {}
    normalized["property_name"] = normalized.get("property_name") or prop.get("name") or normalized.get("property_id")
    normalized["property_code"] = normalized.get("property_code") or prop.get("property_code") or property_code_for_record(prop or normalized)
    normalized["location"] = normalized.get("location") or prop.get("location")
    normalized["size_sqy"] = normalized.get("size_sqy") or normalized.get("sq_yards") or normalized.get("square_yards")
    if normalized.get("size_sqy") and not normalized.get("size"):
        normalized["size"] = f"{normalized['size_sqy']} sq yards"
    return normalized


def enrich_booking_record(
    booking: Dict[str, Any],
    *,
    property_doc: Optional[Dict[str, Any]] = None,
    plot_doc: Optional[Dict[str, Any]] = None,
    customer_doc: Optional[Dict[str, Any]] = None,
    agent_doc: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    prop = normalize_live_property_record(property_doc or {}) if property_doc else {}
    plot = normalize_plot_record(plot_doc or {}, prop) if plot_doc else {}
    customer = clean_user(customer_doc or {}) if customer_doc else None
    agent = clean_user(agent_doc or {}) if agent_doc else None
    return normalize_booking_record({
        **booking,
        "property_name": booking.get("property_name") or prop.get("name") or plot.get("property_name"),
        "property_code": booking.get("property_code") or prop.get("property_code") or plot.get("property_code"),
        "property_location": booking.get("property_location") or booking.get("location") or prop.get("location") or plot.get("location"),
        "plot_number": booking.get("plot_number") or plot.get("plot_number"),
        "facing": booking.get("facing") or plot.get("facing"),
        "size_sqy": booking.get("size_sqy") or plot.get("size_sqy"),
        "size": booking.get("size") or plot.get("size"),
        "customer": customer,
        "customer_name": booking.get("customer_name") or booking.get("name") or (customer or {}).get("name"),
        "customer_phone": booking.get("customer_phone") or booking.get("mobile") or (customer or {}).get("phone"),
        "assigned_agent_id": booking.get("assigned_agent_id") or booking.get("agent_id") or (agent or {}).get("id"),
        "assigned_agent_name": booking.get("assigned_agent_name") or (agent or {}).get("name"),
    })


def enrich_visit_record(
    visit: Dict[str, Any],
    *,
    property_doc: Optional[Dict[str, Any]] = None,
    plot_doc: Optional[Dict[str, Any]] = None,
    customer_doc: Optional[Dict[str, Any]] = None,
    agent_doc: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    prop = normalize_live_property_record(property_doc or {}) if property_doc else {}
    plot = normalize_plot_record(plot_doc or {}, prop) if plot_doc else {}
    customer = clean_user(customer_doc or {}) if customer_doc else None
    agent = clean_user(agent_doc or {}) if agent_doc else None
    return normalize_live_visit_record({
        **visit,
        "property_name": visit.get("property_name") or visit.get("centre_name") or prop.get("name") or plot.get("property_name"),
        "property_code": visit.get("property_code") or prop.get("property_code") or plot.get("property_code"),
        "location": visit.get("location") or prop.get("location") or plot.get("location"),
        "plot_number": visit.get("plot_number") or plot.get("plot_number"),
        "facing": visit.get("facing") or plot.get("facing"),
        "size_sqy": visit.get("size_sqy") or plot.get("size_sqy"),
        "size": visit.get("size") or plot.get("size"),
        "customer": customer,
        "customer_name": visit.get("customer_name") or visit.get("name") or (customer or {}).get("name"),
        "customer_phone": visit.get("customer_phone") or visit.get("mobile") or (customer or {}).get("phone"),
        "assigned_agent_name": visit.get("assigned_agent_name") or (agent or {}).get("name"),
    })


def should_prune_local_store_item(name: str, item: Dict[str, Any]) -> bool:
    if name in {"bookings", "visits", "notifications", "leads", "opportunities", "tasks", "activities", "customer_agent_links"}:
        return should_hide_demo_item(item)
    return False


def sanitize_local_store(store: Dict[str, Any]) -> Dict[str, Any]:
    changed = False
    for key in ("bookings", "visits", "notifications", "leads", "opportunities", "tasks", "activities", "customer_agent_links"):
        items = list(store.get(key, []))
        filtered = [item for item in items if not should_prune_local_store_item(key, item)]
        if len(filtered) != len(items):
            store[key] = filtered
            changed = True

    plot_overrides = dict(store.get("plot_overrides", {}))
    valid_plot_ids = {plot.get("id") for plot in LOCAL_FALLBACK_PLOTS}
    filtered_plot_overrides = {plot_id: value for plot_id, value in plot_overrides.items() if plot_id in valid_plot_ids}
    if filtered_plot_overrides != plot_overrides:
        store["plot_overrides"] = filtered_plot_overrides
        changed = True

    if changed:
        save_local_store(store)
    return store


def is_production_runtime() -> bool:
    return True


def rate_limit_key(request: Request, scope: str, identity: Optional[str] = None) -> str:
    client_ip = request.client.host if request.client else "unknown"
    identity_value = (identity or "").strip().lower() or "anonymous"
    return f"{scope}:{client_ip}:{identity_value}"


def enforce_rate_limit(key: str, *, limit: int, window_seconds: int) -> None:
    now_ts = time.time()
    bucket = _rate_limit_store[key]
    while bucket and now_ts - bucket[0] > window_seconds:
        bucket.popleft()
    if len(bucket) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please wait and try again.",
        )
    bucket.append(now_ts)


def get_cached_featured_properties() -> Optional[List[Dict[str, Any]]]:
    cached_value = _featured_properties_cache.get("value")
    expires_at = float(_featured_properties_cache.get("expires_at") or 0.0)
    if cached_value and expires_at > time.time():
        return cached_value
    return None


def update_featured_properties_cache(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    _featured_properties_cache["value"] = items
    _featured_properties_cache["expires_at"] = time.time() + FEATURED_PROPERTIES_CACHE_TTL_SECONDS
    return items


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
            "customer_agent_links": [],
            "sessions": [],
        }

    try:
        store = json.loads(LOCAL_STORE_PATH.read_text(encoding="utf-8"))
        store.setdefault("otps", [])
        store.setdefault("visits", [])
        store.setdefault("leads", [])
        store.setdefault("opportunities", [])
        store.setdefault("tasks", [])
        store.setdefault("activities", [])
        store.setdefault("customer_agent_links", [])
        store.setdefault("sessions", [])
        return sanitize_local_store(store)
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
            "customer_agent_links": [],
            "sessions": [],
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


PROFILE_PLACEHOLDER_NAMES = {"agent", "partner", "admin", "customer", "user"}
AGENT_PROFILE_SYNC_FIELDS = {"name", "address", "occupation", "age", "aadhaar_number", "agent_brand_name", "updated_at"}


def is_placeholder_profile_name(value: Optional[str]) -> bool:
    text = str(value or "").strip().lower()
    return not text or text in PROFILE_PLACEHOLDER_NAMES


def first_real_profile_name(*values: Optional[str]) -> str:
    for value in values:
        text = str(value or "").strip()
        if text and not is_placeholder_profile_name(text):
            return text
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def first_filled_profile_value(*values: Any) -> Any:
    for value in values:
        if value not in (None, ""):
            return value
    return None


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
    return
    if not ALLOW_LOCAL_AUTH_FALLBACK:
        return

    demo_users = [
        {
            "id": "admin-user-001",
            "name": ADMIN_DISPLAY_NAME,
            "email": "admin@rivanrealty.com",
            "phone": "+919491348973",
            "role": "admin",
            "auth_methods": ["phone"],
            "address": "Rivan HQ, Hyderabad",
            "kyc_status": "verified",
            "is_admin": True,
            "email_verified": True,
            "phone_verified": True,
            "created_at": now_utc().isoformat(),
            "updated_at": now_utc().isoformat(),
            "last_login_at": now_utc().isoformat(),
        },
        {
            "id": "agent-main-001",
            "name": "Arjun Reddy",
            "email": "agent@rivaan.com",
            "phone": "+919052644345",
            "role": "agent",
            "age": 34,
            "aadhaar_number": "5555 6666 7777",
            "manager_name": "Regional Sales Director",
            "manager_id": None,
            "agent_brand_name": "Rivan Crest Partners",
            "sub_agent_ids": ["agent-sub-001"],
            "approval_status": "approved",
            "approved_by_manager": ADMIN_DISPLAY_NAME,
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
            "phone": "+919999999999",
            "role": "agent",
            "age": 31,
            "aadhaar_number": "1111 2222 3333",
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


async def sync_demo_auth_users_to_db() -> None:
    return
    if not ENABLE_DEMO_DATA or not await is_database_available():
        return

    timestamp = now_utc().isoformat()
    demo_users = [
        {
            "id": "admin-user-001",
            "name": ADMIN_DISPLAY_NAME,
            "email": "admin@rivanrealty.com",
            "phone": "+919491348973",
            "role": "admin",
            "auth_methods": ["phone"],
            "address": "Rivan HQ, Hyderabad",
            "kyc_status": "verified",
            "is_admin": True,
            "email_verified": True,
            "phone_verified": True,
            "created_at": timestamp,
            "updated_at": timestamp,
            "last_login_at": timestamp,
        },
        {
            "id": "agent-main-001",
            "name": "Arjun Reddy",
            "email": "agent@rivaan.com",
            "phone": "+919052644345",
            "role": "agent",
            "age": 34,
            "aadhaar_number": "5555 6666 7777",
            "manager_name": "Regional Sales Director",
            "manager_id": None,
            "agent_brand_name": "Rivan Crest Partners",
            "sub_agent_ids": ["agent-sub-001"],
            "approval_status": "approved",
            "approved_by_manager": ADMIN_DISPLAY_NAME,
            "auth_methods": ["email"],
            "address": "Banjara Hills, Hyderabad",
            "kyc_status": "verified",
            "is_admin": False,
            "email_verified": True,
            "phone_verified": True,
            "password_hash": hash_password("Agent@123"),
            "created_at": timestamp,
            "updated_at": timestamp,
            "last_login_at": timestamp,
            "status": "active",
        },
        {
            "id": "agent-sub-001",
            "name": "Meghana Rao",
            "email": "subagent@rivaan.com",
            "phone": "+919911112222",
            "role": "sub_agent",
            "age": 28,
            "aadhaar_number": "8888 9999 0000",
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
            "created_at": timestamp,
            "updated_at": timestamp,
            "last_login_at": timestamp,
            "status": "active",
        },
        {
            "id": "agent-pending-001",
            "name": "Puneeth Agent Test",
            "email": "pendingagent@rivaan.com",
            "phone": "+919999999999",
            "role": "agent",
            "age": 31,
            "aadhaar_number": "1111 2222 3333",
            "manager_name": "Regional Sales Director",
            "manager_id": None,
            "agent_brand_name": "Rivan Crest Partners",
            "sub_agent_ids": [],
            "approval_status": "pending",
            "approved_by_manager": None,
            "auth_methods": ["agent_application"],
            "address": "Kukatpally, Hyderabad",
            "kyc_status": "pending",
            "is_admin": False,
            "email_verified": True,
            "phone_verified": True,
            "password_hash": hash_password("Agent@123"),
            "created_at": timestamp,
            "updated_at": timestamp,
            "last_login_at": timestamp,
            "status": "pending",
            "review_notes": "",
            "reviewed_at": None,
            "reviewed_by_manager": None,
            "agent_application_submitted_at": timestamp,
        },
    ]

    for demo_user in demo_users:
        lookup = {
            "$or": [
                {"id": demo_user["id"]},
                {"email": demo_user["email"]},
                {"phone": {"$in": phone_identity_variants(demo_user["phone"])}},
            ]
        }
        existing = await db.users.find_one(lookup, {"_id": 0})
        if existing:
            merged = {**existing, **demo_user, "created_at": existing.get("created_at") or demo_user["created_at"]}
            await db.users.update_one({"id": existing.get("id", demo_user["id"])}, {"$set": merged}, upsert=True)
        else:
            await db.users.update_one({"id": demo_user["id"]}, {"$set": demo_user}, upsert=True)

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


async def purge_demo_auth_users_from_db() -> None:
    if not await is_database_available():
        return

    demo_user_ids = list(DEMO_AUTH_USER_IDS)
    existing_demo_users = await db.users.find(
        {"id": {"$in": demo_user_ids}},
        {"_id": 0, "id": 1},
    ).to_list(len(demo_user_ids))
    if not existing_demo_users:
        return

    ids_to_remove = [item["id"] for item in existing_demo_users if item.get("id")]
    if not ids_to_remove:
        return

    await db.user_sessions.delete_many({"user_id": {"$in": ids_to_remove}})
    await db.users.delete_many({"id": {"$in": ids_to_remove}})
    logger.info("Purged seeded demo auth users from database: %s", ", ".join(sorted(ids_to_remove)))


async def purge_legacy_demo_records_from_db() -> None:
    if not await is_database_available():
        return

    legacy_properties = await db.properties.find({}, {"_id": 0, "id": 1, "name": 1, "location": 1}).to_list(500)
    legacy_property_ids = [
        item["id"]
        for item in legacy_properties
        if item.get("id")
        and is_legacy_demo_property_reference(item.get("name"), item.get("location"))
    ]

    if legacy_property_ids:
        await db.plots.delete_many({"property_id": {"$in": legacy_property_ids}})
        await db.properties.delete_many({"id": {"$in": legacy_property_ids}})

    for collection_name in ("bookings", "visits", "notifications", "documents", "service_requests"):
        items = await db[collection_name].find({}, {"_id": 0}).to_list(2000)
        ids_to_remove = [
            item.get("id")
            for item in items
            if item.get("id")
            and (
                should_hide_demo_item(item)
                or item.get("property_id") in legacy_property_ids
                or item.get("plot_id") in {"villa-2-2", "villa-2-3", "flat-3-T1-F08-01", "flat-3-T1-F08-02", "flat-3-T2-F10-01"}
            )
        ]
        if ids_to_remove:
            await db[collection_name].delete_many({"id": {"$in": ids_to_remove}})

    logger.info("Purged legacy demo workflow records from database.")


LOCAL_FALLBACK_PROPERTIES: List[Dict[str, Any]] = [
    {
        "id": "prop-1",
        "name": "Siripuram Gardens Independent House",
        "category": "Independent House",
        "location": "Achutapuram, Visakhapatnam",
        "starting_price": 1600000,
        "size": "840 sq.ft",
        "image": "/Property Image 1.jpeg",
        "images": [
            "/Property Image 1.jpeg",
            "/Property Image 2.jpeg",
            "/East Face.jpeg",
            "/West Face.jpeg",
            "/Features.jpeg",
            "/Map.jpeg",
        ],
        "description": "A compact independent-house offering anchored in the Siripuram Gardens layout at Achutapuram with live availability, east-face and west-face plans, and project approval details.",
        "survey_number": "Layout approved development",
        "facing": "East Face / West Face",
        "road_width": "40-60 ft internal roads",
        "availability": "Available",
        "featured": True,
        "amenities": ["Street Lighting", "Water Supply", "Underground Drainage", "Rain-water Harvesting"],
        "approvals": ["VUDA Approved Layout", "Clear Title Layout Planning"],
        "nearby": ["Pudimadaka Beach - 10 min", "Kondakarla Tourist Spot - 15 min", "Steel Plant - 30 min"],
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

LOCAL_FALLBACK_PROPERTIES = []
LOCAL_FALLBACK_PLOTS = []


def local_get_properties() -> List[Dict[str, Any]]:
    return [normalize_live_property_record(item) for item in LOCAL_FALLBACK_PROPERTIES]


def local_get_property(property_id: str) -> Optional[Dict[str, Any]]:
    for item in LOCAL_FALLBACK_PROPERTIES:
        if item["id"] == property_id:
            return normalize_live_property_record(item)
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


async def resolve_assigned_agent_id(*, property_id: Optional[str] = None, plot_id: Optional[str] = None) -> Optional[str]:
    if plot_id:
        if await is_database_available():
            plot = await db.plots.find_one({"id": plot_id}, {"_id": 0, "agent_id": 1})
        elif ALLOW_LOCAL_AUTH_FALLBACK:
            plot = local_get_plot(plot_id)
        else:
            plot = None
        if plot and plot.get("agent_id"):
            return str(plot["agent_id"])
    return await crm_find_agent_for_property(property_id=property_id, plot_id=plot_id)


async def resolve_visit_agent_id(*, canonical_property_id: Optional[str], requested_property_id: Optional[str], plot_id: Optional[str] = None) -> Optional[str]:
    assigned_agent_id = await resolve_assigned_agent_id(property_id=canonical_property_id, plot_id=plot_id)
    if not assigned_agent_id and requested_property_id and requested_property_id != canonical_property_id:
        assigned_agent_id = await resolve_assigned_agent_id(property_id=requested_property_id, plot_id=plot_id)
    if not assigned_agent_id:
        primary_agent = await resolve_primary_agent_user()
        assigned_agent_id = primary_agent.get("id") if primary_agent else None
    return assigned_agent_id


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


def local_upsert_collection_item(name: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    return local_save_collection_item(name, payload)


def local_delete_collection_item(name: str, item_id: str) -> None:
    store = load_local_store()
    store[name] = [item for item in store.setdefault(name, []) if item.get("id") != item_id]
    save_local_store(store)

def agent_accessible_ids(user: Dict[str, Any]) -> List[str]:
    sub_agent_ids = user.get("sub_agent_ids", []) if user.get("role") == "agent" else []
    return [user["id"], *sub_agent_ids]


def is_primary_agent_user(user: Dict[str, Any]) -> bool:
    phone_values = phone_identity_variants(user.get("phone"))
    return user.get("id") == PRIMARY_AGENT_USER_ID or PRIMARY_AGENT_PHONE in phone_values


def agent_can_access_plot(user: Dict[str, Any], plot: Optional[Dict[str, Any]]) -> bool:
    if not plot:
        return False
    owner_candidates = [plot.get("agent_id"), plot.get("assigned_agent_id")]
    if any(owner in agent_accessible_ids(user) for owner in owner_candidates if owner):
        return True
    return is_primary_agent_user(user) and not any(owner_candidates)


def agent_can_access_booking(user: Dict[str, Any], booking: Dict[str, Any], plot: Optional[Dict[str, Any]] = None) -> bool:
    accessible_ids = set(agent_accessible_ids(user))
    owner_candidates = {
        booking.get("agent_id"),
        booking.get("assigned_agent_id"),
        booking.get("created_by_agent_id"),
    }
    if any(candidate in accessible_ids for candidate in owner_candidates if candidate):
        return True
    if not any(owner_candidates) and is_primary_agent_user(user):
        return True
    return agent_can_access_plot(user, plot)


def agent_can_access_visit(user: Dict[str, Any], visit: Dict[str, Any], plot: Optional[Dict[str, Any]] = None) -> bool:
    accessible_ids = set(agent_accessible_ids(user))
    owner_candidates = {
        visit.get("assigned_agent_id"),
        visit.get("created_by_agent_id"),
        visit.get("agent_id"),
    }
    if any(candidate in accessible_ids for candidate in owner_candidates if candidate):
        return True
    if not any(owner_candidates) and is_primary_agent_user(user):
        return True
    return agent_can_access_plot(user, plot)


async def is_database_available(
    timeout_seconds: Optional[float] = None,
    force_refresh: bool = False,
    *,
    log_failure: bool = False,
) -> bool:
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
        if log_failure:
            logger.exception(
                "MongoDB ping failed",
                extra={
                    "mongo_url_scheme": MONGO_URL.split("://", 1)[0] if "://" in MONGO_URL else "unknown",
                    "db_name": DB_NAME,
                    "timeout_seconds": timeout_seconds or DB_AVAILABILITY_TIMEOUT_SECONDS,
                    "server_selection_timeout_ms": MONGO_SERVER_SELECTION_TIMEOUT_MS,
                    "connect_timeout_ms": MONGO_CONNECT_TIMEOUT_MS,
                    "socket_timeout_ms": MONGO_SOCKET_TIMEOUT_MS,
                },
            )

    _db_availability_cache["value"] = available
    _db_availability_cache["checked_at"] = now
    return available


async def require_database(detail: str = "Database unavailable") -> None:
    if not await is_database_available():
        raise HTTPException(status_code=503, detail=detail)


async def get_current_user(request: Request, token: Optional[str] = Depends(oauth2_scheme)) -> Dict[str, Any]:
    if not token:
        token = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token, JWT_SECRET)
    if payload.get("type") not in {None, "access"}:
        raise HTTPException(status_code=401, detail="Invalid access token")
    user_id = payload.get("sub")
    session_id = payload.get("sid")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token subject")
    session = None
    if session_id:
        session = await get_user_session(str(session_id))
        if not session or session.get("revoked_at"):
            raise HTTPException(status_code=401, detail="Session expired")
        if session.get("refresh_expires_at"):
            try:
                if datetime.fromisoformat(str(session["refresh_expires_at"])) <= now_utc():
                    raise HTTPException(status_code=401, detail="Session expired")
            except ValueError:
                raise HTTPException(status_code=401, detail="Session expired")
        await touch_user_session(str(session_id))
    if await is_database_available():
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
    elif ALLOW_LOCAL_AUTH_FALLBACK:
        user = local_find_user(user_id=user_id)
    else:
        raise HTTPException(status_code=503, detail="Authentication database is unavailable")
    if not user:
        if user_id == PRIMARY_AGENT_USER_ID and await is_database_available():
            await ensure_primary_agent_seed()
            user = await db.users.find_one({"id": PRIMARY_AGENT_USER_ID}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
    if user.get("id") == PRIMARY_AGENT_USER_ID and is_agent_role(user.get("role")):
        repaired = await resolve_primary_agent_user()
        if repaired:
            user = repaired
    return apply_session_role(user, session)


async def get_admin_user(request: Request, token: Optional[str] = Depends(oauth2_scheme)) -> Dict[str, Any]:
    user = await get_current_user(request, token)
    if not has_admin_access(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def has_admin_access(user: Dict[str, Any]) -> bool:
    role = str(user.get("role") or "").strip().lower()
    return role == ROLE_ADMIN


def is_primary_admin_login_user(user: Dict[str, Any]) -> bool:
    role = str(user.get("role") or "").strip().lower()
    phone = str(user.get("phone") or "").strip()
    return role == ROLE_ADMIN and any(phone in phone_identity_variants(admin_phone) for admin_phone in ADMIN_LOGIN_PHONES)


def admin_access_is_active(user: Dict[str, Any]) -> bool:
    status_value = str(user.get("status") or STATUS_ACTIVE).strip().lower()
    approval_status = str(user.get("approval_status") or APPROVAL_NOT_REQUIRED).strip().lower()
    return (
        is_primary_admin_login_user(user)
        and status_value == STATUS_ACTIVE
        and approval_status in {APPROVAL_NOT_REQUIRED, APPROVAL_APPROVED}
    )


def is_agent_role(role: Optional[str]) -> bool:
    return str(role or "").strip().lower() == ROLE_AGENT


def agent_access_is_active(user: Dict[str, Any]) -> bool:
    approval_status = str(user.get("approval_status") or "").strip().lower()
    status_value = str(user.get("status") or STATUS_ACTIVE).strip().lower()
    kyc_status = str(user.get("kyc_status") or "").strip().lower()
    return (
        is_agent_role(user.get("role"))
        and approval_status == APPROVAL_APPROVED
        and status_value == STATUS_ACTIVE
        and kyc_status not in {"rejected", "suspended"}
    )


def apply_session_role(user: Dict[str, Any], session: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    scoped = clean_user(user)
    if "role" in scoped:
        scoped["role"] = str(scoped.get("role") or "").strip().lower()
    if "approval_status" in scoped:
        scoped["approval_status"] = str(scoped.get("approval_status") or "").strip().lower()
    if "status" in scoped:
        scoped["status"] = str(scoped.get("status") or "").strip().lower()
    if "kyc_status" in scoped:
        scoped["kyc_status"] = str(scoped.get("kyc_status") or "").strip().lower()
    session_role = str((session or {}).get("session_role") or "").strip().lower()
    if not session_role:
        return scoped

    scoped["portal_role"] = session_role
    if session_role == "customer":
        scoped["role"] = "customer"
        scoped["is_admin"] = False
        return scoped
    if session_role == "agent":
        if not agent_access_is_active(scoped):
            raise HTTPException(status_code=403, detail="Your agent access is not active for this session")
        scoped["role"] = "agent"
        return scoped
    if session_role == "admin":
        if not has_admin_access(scoped) or not admin_access_is_active(scoped):
            raise HTTPException(status_code=403, detail="Your admin access is not active for this session")
        return scoped
    return scoped


def agent_approval_error_message(user: Dict[str, Any]) -> str:
    approval_status = str(user.get("approval_status") or APPROVAL_PENDING).strip().lower()
    if approval_status == APPROVAL_APPROVED:
        return ""
    if approval_status == APPROVAL_REJECTED:
        return "Your agent application was rejected. Please contact admin for the next steps."
    if approval_status == STATUS_SUSPENDED:
        return "Your agent access is suspended. Please contact admin."
    return "Your agent account is pending admin approval"


async def get_agent_user(request: Request, token: Optional[str] = Depends(oauth2_scheme)) -> Dict[str, Any]:
    user = await get_current_user(request, token)
    if not is_agent_role(user.get("role")):
        raise HTTPException(status_code=403, detail="Agent access required")
    if str(user.get("approval_status") or "").strip().lower() != APPROVAL_APPROVED:
        raise HTTPException(status_code=403, detail=agent_approval_error_message(user))
    if not agent_access_is_active(user):
        raise HTTPException(status_code=403, detail="Your agent access is not active.")
    return user


# ---------- Models ----------
class FirebaseAuthReq(BaseModel):
    id_token: str
    phone: str
    name: Optional[str] = None

class AgentFirebaseAuthReq(BaseModel):
    id_token: str
    phone: str

class AdminFirebaseAuthReq(BaseModel):
    id_token: str
    phone: str

class AgentAccessStatusReq(BaseModel):
    phone: str

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
    refresh_token: str
    expires_in_seconds: int
    user: Dict[str, Any]

class RefreshTokenReq(BaseModel):
    refresh_token: str = Field(min_length=20)

class UpdateProfileReq(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    date_of_birth: Optional[str] = None
    age: Optional[int] = None
    aadhaar_number: Optional[str] = None
    occupation: Optional[str] = None
    agent_brand_name: Optional[str] = None
    notification_preferences: Optional[Dict[str, bool]] = None
    communication_preferences: Optional[Dict[str, bool]] = None
    biometric_login_enabled: Optional[bool] = None
    dark_mode_enabled: Optional[bool] = None

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

class ContactSalesReq(BaseModel):
    property_id: Optional[str] = None
    subject: Optional[str] = None
    message: str = Field(min_length=4, max_length=2000)
    contact: Optional[str] = None
    preferred_date: Optional[str] = None
    request_channel: Optional[str] = "contact_sales"

class VisitBookingReq(BaseModel):
    centre_id: str
    visit_date: str
    visit_time: str
    name: str
    mobile: str

class SiteVisitReq(BaseModel):
    property_id: str
    visit_date: str
    visit_time: Optional[str] = None
    name: str
    mobile: str


class CustomerVisitUpdateReq(BaseModel):
    status: Optional[str] = None
    visit_date: Optional[str] = None
    visit_time: Optional[str] = None


class CustomerRelationshipResp(BaseModel):
    customer_id: str
    links: List[Dict[str, Any]]
    primary_link: Optional[Dict[str, Any]] = None
    assigned_agent: Optional[Dict[str, Any]] = None
    assigned_sub_agent: Optional[Dict[str, Any]] = None
    lead: Optional[Dict[str, Any]] = None
    open_opportunities: List[Dict[str, Any]] = Field(default_factory=list)
    open_tasks: List[Dict[str, Any]] = Field(default_factory=list)
    recent_activity: List[Dict[str, Any]] = Field(default_factory=list)

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
    review_notes: Optional[str] = None

class AgentUpsertReq(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    age: Optional[int] = None
    aadhaar_number: Optional[str] = None
    status: Optional[str] = "active"

class AgentApplicationReq(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=8, max_length=20)
    email: Optional[EmailStr] = None
    occupation: Optional[str] = None
    age: Optional[int] = None
    aadhaar_number: Optional[str] = None
    address: Optional[str] = None
    agent_brand_name: Optional[str] = None
    notes: Optional[str] = None

class AgentStatusReq(BaseModel):
    status: str

class AdminAgentApprovalReq(BaseModel):
    approval_status: str
    review_notes: Optional[str] = None

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

class AdminVisitStatusReq(BaseModel):
    status: Optional[str] = None
    assigned_agent_id: Optional[str] = None
    visit_date: Optional[str] = None
    visit_time: Optional[str] = None
    review_notes: Optional[str] = None

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
    property_code: Optional[str] = None
    availability: Optional[str] = "Available"
    description: Optional[str] = ""
    survey_number: Optional[str] = ""
    facing: Optional[str] = ""
    road_width: Optional[str] = ""
    amenities: Optional[List[str]] = []
    approvals: Optional[List[str]] = []

class AdminPlotReq(BaseModel):
    property_id: str
    plot_number: str
    facing: Optional[str] = None
    size_sqy: Optional[float] = None
    size: Optional[str] = None
    price: Optional[float] = None
    status: Optional[str] = "available"
    assigned_agent_id: Optional[str] = None


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
    if not any(owner_candidates):
        return False
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


async def crm_list_customer_agent_links(customer_id: str) -> List[Dict[str, Any]]:
    if await is_database_available():
        items = await db.customer_agent_links.find({"customer_id": customer_id}, {"_id": 0}).to_list(100)
    else:
        items = [item for item in local_list_collection("customer_agent_links") if item.get("customer_id") == customer_id]
    items.sort(key=lambda item: item.get("last_activity_at") or item.get("updated_at") or "", reverse=True)
    return items


async def crm_save_customer_agent_link(payload: Dict[str, Any]) -> Dict[str, Any]:
    payload["updated_at"] = now_utc().isoformat()
    if await is_database_available():
        await db.customer_agent_links.update_one({"id": payload["id"]}, {"$set": payload}, upsert=True)
        return await db.customer_agent_links.find_one({"id": payload["id"]}, {"_id": 0})
    local_save_collection_item("customer_agent_links", payload)
    return payload


async def crm_upsert_customer_agent_link(
    *,
    customer_id: str,
    lead_id: Optional[str],
    property_id: Optional[str],
    plot_id: Optional[str],
    assigned_agent_id: Optional[str],
    assigned_sub_agent_id: Optional[str] = None,
    relationship_type: str,
    source: str,
    status: str,
) -> Dict[str, Any]:
    use_db = await is_database_available()
    existing: Optional[Dict[str, Any]] = None

    if use_db:
        queries = []
        if lead_id:
            queries.append({"customer_id": customer_id, "lead_id": lead_id})
        if property_id:
            queries.append({"customer_id": customer_id, "property_id": property_id, "plot_id": plot_id})
        for query in queries:
            existing = await db.customer_agent_links.find_one(query, {"_id": 0})
            if existing:
                break
    else:
        for item in local_list_collection("customer_agent_links"):
            if item.get("customer_id") != customer_id:
                continue
            if lead_id and item.get("lead_id") == lead_id:
                existing = item
                break
            if property_id and item.get("property_id") == property_id and item.get("plot_id") == plot_id:
                existing = item
                break

    timestamp = now_utc().isoformat()
    if existing:
        existing.update({
            "lead_id": lead_id or existing.get("lead_id"),
            "property_id": property_id or existing.get("property_id"),
            "plot_id": plot_id or existing.get("plot_id"),
            "assigned_agent_id": assigned_agent_id or existing.get("assigned_agent_id"),
            "assigned_sub_agent_id": assigned_sub_agent_id or existing.get("assigned_sub_agent_id"),
            "relationship_type": relationship_type or existing.get("relationship_type"),
            "source": source or existing.get("source"),
            "status": status or existing.get("status"),
            "last_activity_at": timestamp,
        })
        return await crm_save_customer_agent_link(existing)

    payload = {
        "id": str(uuid.uuid4()),
        "customer_id": customer_id,
        "lead_id": lead_id,
        "property_id": property_id,
        "plot_id": plot_id,
        "assigned_agent_id": assigned_agent_id,
        "assigned_sub_agent_id": assigned_sub_agent_id,
        "relationship_type": relationship_type,
        "source": source,
        "status": status,
        "created_at": timestamp,
        "updated_at": timestamp,
        "last_activity_at": timestamp,
    }
    return await crm_save_customer_agent_link(payload)


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
    customer_id: Optional[str],
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
            "customer_id": customer_id or existing.get("customer_id"),
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
        "customer_id": customer_id,
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
    assigned_agent_id = booking.get("agent_id") or await resolve_assigned_agent_id(property_id=booking.get("property_id"), plot_id=booking.get("plot_id"))
    plot = local_get_plot(booking.get("plot_id")) if not await is_database_available() else await db.plots.find_one({"id": booking.get("plot_id")}, {"_id": 0})
    expected_value = float((plot or {}).get("price") or 0) or None
    lead = await crm_upsert_lead(
        name=customer.get("name") or booking.get("name") or "Customer",
        phone=customer.get("phone") or booking.get("mobile"),
        email=customer.get("email") or booking.get("customer_email"),
        customer_id=customer.get("id") or booking.get("customer_id") or booking.get("user_id"),
        source=source,
        created_by_user_id=actor_user_id,
        assigned_agent_id=assigned_agent_id,
        notes_summary=booking.get("message") or booking.get("notes"),
        tags=["booking"],
    )
    relationship = await crm_upsert_customer_agent_link(
        customer_id=customer.get("id") or booking.get("customer_id") or booking.get("user_id"),
        lead_id=lead["id"],
        property_id=booking.get("property_id"),
        plot_id=booking.get("plot_id"),
        assigned_agent_id=assigned_agent_id,
        relationship_type="booking",
        source=source,
        status=normalize_booking_status_value(booking.get("status")),
    )
    booking_status = normalize_booking_status_value(booking.get("status"))
    stage_map = {
        "pending": "booking_requested",
        "agent_approved": "booking_requested",
        "admin_approved": "booking_requested",
        "reserved": "booked",
        "completed": "closed_won",
        "cancelled": "closed_lost",
        "rejected": "closed_lost",
    }
    opportunity = await crm_create_or_update_opportunity(
        lead=lead,
        property_id=booking["property_id"],
        plot_id=booking.get("plot_id"),
        assigned_agent_id=assigned_agent_id,
        actor_user_id=actor_user_id,
        stage=stage_map.get(booking_status, "booking_requested"),
        expected_value=expected_value,
        interest_notes=booking.get("message") or booking.get("notes"),
        booking_id=booking["id"],
        lost_reason="other" if booking_status in {"cancelled", "rejected"} else None,
    )
    await crm_create_activity(
        lead_id=lead["id"],
        opportunity_id=opportunity["id"],
        booking_id=booking["id"],
        actor_user_id=actor_user_id,
        activity_type="booking_synced",
        message=f"Booking {booking['id']} synced to CRM as {opportunity['stage'].replace('_', ' ')}.",
        metadata={"booking_status": booking_status},
    )
    if source in {"agent_booking", "customer_booking"}:
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
    return {"lead": lead, "opportunity": opportunity, "relationship": relationship}


async def crm_sync_site_visit(
    *,
    visit: Dict[str, Any],
    customer: Dict[str, Any],
    actor_user_id: str,
) -> Dict[str, Any]:
    assigned_agent_id = visit.get("assigned_agent_id") or await resolve_assigned_agent_id(property_id=visit.get("property_id"), plot_id=visit.get("plot_id"))
    visit_status = normalize_visit_status_value(visit.get("status"))
    lead = await crm_upsert_lead(
        name=customer.get("name") or visit.get("name") or "Customer",
        phone=customer.get("phone") or visit.get("mobile"),
        email=customer.get("email"),
        customer_id=customer.get("id") or visit.get("customer_id") or visit.get("user_id"),
        source="site_visit",
        created_by_user_id=actor_user_id,
        assigned_agent_id=assigned_agent_id,
        tags=["site visit"],
        next_follow_up_at=(now_utc() + timedelta(days=2)).isoformat(),
    )
    relationship = await crm_upsert_customer_agent_link(
        customer_id=customer.get("id") or visit.get("customer_id") or visit.get("user_id"),
        lead_id=lead["id"],
        property_id=visit.get("property_id"),
        plot_id=visit.get("plot_id"),
        assigned_agent_id=assigned_agent_id,
        relationship_type="site_visit",
        source="site_visit",
        status=visit_status,
    )
    visit_stage = "site_visit_completed" if visit_status == "completed" else "site_visit_scheduled"
    opportunity = await crm_create_or_update_opportunity(
        lead=lead,
        property_id=visit["property_id"],
        plot_id=visit.get("plot_id"),
        assigned_agent_id=assigned_agent_id,
        actor_user_id=actor_user_id,
        stage=visit_stage,
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
        message=f"Site visit updated to {visit_status.replace('_', ' ')} for {visit.get('visit_date')}.",
        metadata={"property_id": visit.get("property_id"), "visit_status": visit_status},
    )
    return {"lead": lead, "opportunity": opportunity, "relationship": relationship}


async def crm_sync_centre_visit(
    *,
    visit: Dict[str, Any],
    customer: Dict[str, Any],
    actor_user_id: str,
) -> Dict[str, Any]:
    lead = await crm_upsert_lead(
        name=customer.get("name") or visit.get("name") or "Customer",
        phone=customer.get("phone") or visit.get("mobile"),
        email=customer.get("email"),
        customer_id=customer.get("id") or visit.get("customer_id") or visit.get("user_id"),
        source="centre_visit",
        created_by_user_id=actor_user_id,
        assigned_agent_id=None,
        tags=["centre visit"],
        next_follow_up_at=(now_utc() + timedelta(days=1)).isoformat(),
        notes_summary=f"Experience centre visit scheduled for {visit.get('visit_date')} at {visit.get('visit_time')}.",
    )
    relationship = await crm_upsert_customer_agent_link(
        customer_id=customer.get("id") or visit.get("customer_id") or visit.get("user_id"),
        lead_id=lead["id"],
        property_id=None,
        plot_id=None,
        assigned_agent_id=None,
        relationship_type="centre_visit",
        source="centre_visit",
        status=str(visit.get("status") or "confirmed").lower(),
    )
    await crm_create_task(
        title="Qualify centre visit lead",
        task_type="follow_up",
        assigned_to_user_id=actor_user_id,
        actor_user_id=actor_user_id,
        lead_id=lead["id"],
        description="Contact the customer after the experience centre visit and map property interest.",
        due_at=(now_utc() + timedelta(days=1)).isoformat(),
        priority="medium",
    )
    await crm_create_activity(
        lead_id=lead["id"],
        visit_id=visit["id"],
        actor_user_id=actor_user_id,
        activity_type="centre_visit_synced",
        message=f"Experience centre visit scheduled for {visit.get('visit_date')} at {visit.get('visit_time')}.",
        metadata={"centre_id": visit.get("centre_id"), "centre_name": visit.get("centre_name")},
    )
    return {"lead": lead, "relationship": relationship}


async def crm_sync_service_request(
    *,
    service_request: Dict[str, Any],
    customer: Dict[str, Any],
    actor_user_id: str,
) -> Dict[str, Any]:
    assigned_agent_id = await crm_find_agent_for_property(property_id=service_request.get("property_id"))
    lead = await crm_upsert_lead(
        name=customer.get("name") or "Customer",
        phone=customer.get("phone") or service_request.get("contact"),
        email=customer.get("email"),
        customer_id=customer.get("id") or service_request.get("user_id"),
        source="service_request",
        created_by_user_id=actor_user_id,
        assigned_agent_id=assigned_agent_id,
        tags=["service", service_request.get("service_type", "").lower()],
        notes_summary=service_request.get("description"),
        next_follow_up_at=(now_utc() + timedelta(days=1)).isoformat(),
    )
    relationship = await crm_upsert_customer_agent_link(
        customer_id=customer.get("id") or service_request.get("user_id"),
        lead_id=lead["id"],
        property_id=service_request.get("property_id"),
        plot_id=None,
        assigned_agent_id=assigned_agent_id,
        relationship_type="service_request",
        source="service_request",
        status=str(service_request.get("status") or "pending").lower(),
    )
    await crm_create_task(
        title=f"Respond to {service_request.get('service_type')} request",
        task_type="service_follow_up",
        assigned_to_user_id=assigned_agent_id or actor_user_id,
        actor_user_id=actor_user_id,
        lead_id=lead["id"],
        description=service_request.get("description") or "Contact the customer and confirm service scope.",
        due_at=(now_utc() + timedelta(hours=12)).isoformat(),
        priority="medium",
    )
    await crm_create_activity(
        lead_id=lead["id"],
        actor_user_id=actor_user_id,
        activity_type="service_request_synced",
        message=f"Service request received: {service_request.get('service_type')}.",
        metadata={"service_request_id": service_request.get("id"), "property_id": service_request.get("property_id")},
    )
    return {"lead": lead, "relationship": relationship}


async def crm_get_visible_records(collection_name: str, user: Dict[str, Any]) -> List[Dict[str, Any]]:
    use_db = await is_database_available()
    if use_db:
        items = await db[collection_name].find({}, {"_id": 0}).to_list(1000)
    else:
        await crm_ensure_materialized()
        items = [dict(item) for item in local_list_collection(collection_name)]
    items = [normalize_live_visit_record(item) for item in filter_live_customer_items(items)]
    if user.get("is_admin"):
        return items
    return [item for item in items if crm_is_record_visible_to_user(user, item)]


async def crm_get_customer_relationship(customer: Dict[str, Any]) -> Dict[str, Any]:
    customer_id = customer.get("id")
    if not customer_id:
        return {
            "customer_id": "",
            "links": [],
            "primary_link": None,
            "assigned_agent": None,
            "assigned_sub_agent": None,
            "lead": None,
            "open_opportunities": [],
            "open_tasks": [],
            "recent_activity": [],
        }

    links = await crm_list_customer_agent_links(customer_id)
    primary_link = links[0] if links else None
    lead = await crm_get_lead_by_identity(
        lead_id=primary_link.get("lead_id") if primary_link else None,
        phone=customer.get("phone"),
        email=customer.get("email"),
    )
    lead_id = lead.get("id") if lead else None

    if await is_database_available():
        assigned_agent = await db.users.find_one({"id": primary_link.get("assigned_agent_id")}, {"_id": 0}) if primary_link and primary_link.get("assigned_agent_id") else None
        assigned_sub_agent = await db.users.find_one({"id": primary_link.get("assigned_sub_agent_id")}, {"_id": 0}) if primary_link and primary_link.get("assigned_sub_agent_id") else None
        open_opportunities = await db.opportunities.find({"lead_id": lead_id, "stage": {"$nin": list(CRM_CLOSED_STAGES)}}, {"_id": 0}).to_list(20) if lead_id else []
        open_tasks = await db.tasks.find({"lead_id": lead_id, "status": {"$ne": "completed"}}, {"_id": 0}).to_list(20) if lead_id else []
        recent_activity = await db.activities.find({"lead_id": lead_id}, {"_id": 0}).to_list(20) if lead_id else []
    else:
        assigned_agent = local_find_user(user_id=primary_link.get("assigned_agent_id")) if primary_link and primary_link.get("assigned_agent_id") else None
        assigned_sub_agent = local_find_user(user_id=primary_link.get("assigned_sub_agent_id")) if primary_link and primary_link.get("assigned_sub_agent_id") else None
        open_opportunities = [item for item in local_list_collection("opportunities") if item.get("lead_id") == lead_id and item.get("stage") not in CRM_CLOSED_STAGES] if lead_id else []
        open_tasks = [item for item in local_list_collection("tasks") if item.get("lead_id") == lead_id and item.get("status") != "completed"] if lead_id else []
        recent_activity = [item for item in local_list_collection("activities") if item.get("lead_id") == lead_id] if lead_id else []

    open_opportunities.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
    open_tasks.sort(key=lambda item: item.get("due_at") or "9999")
    recent_activity.sort(key=lambda item: item.get("created_at", ""), reverse=True)

    return {
        "customer_id": customer_id,
        "links": links,
        "primary_link": primary_link,
        "assigned_agent": clean_user(assigned_agent) if assigned_agent else None,
        "assigned_sub_agent": clean_user(assigned_sub_agent) if assigned_sub_agent else None,
        "lead": lead,
        "open_opportunities": open_opportunities[:5],
        "open_tasks": open_tasks[:5],
        "recent_activity": recent_activity[:8],
    }


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


async def resolve_agent_profile_identity(user: Dict[str, Any]) -> Dict[str, Any]:
    """Return the freshest same-phone agent profile without letting placeholders win."""
    if not is_agent_role(user.get("role")) or not await is_database_available():
        return clean_user(user)

    phone_variants = phone_identity_variants(user.get("phone"))
    query_parts: List[Dict[str, Any]] = [{"id": user.get("id")}]
    if phone_variants:
        query_parts.append({"phone": {"$in": phone_variants}})

    candidates = await db.users.find(
        {"$or": query_parts, "role": ROLE_AGENT},
        {"_id": 0},
    ).to_list(25)
    if not candidates:
        return clean_user(user)

    candidates = sorted(
        candidates,
        key=lambda item: str(item.get("updated_at") or item.get("last_login_at") or item.get("created_at") or ""),
        reverse=True,
    )
    by_id = next((item for item in candidates if item.get("id") == user.get("id")), user)
    merged = clean_user({**by_id})
    merged["name"] = first_real_profile_name(
        *(item.get("name") for item in candidates),
        user.get("name"),
    ) or merged.get("name") or "Partner"

    for field in ("email", "address", "occupation", "age", "aadhaar_number", "agent_brand_name"):
        value = first_filled_profile_value(*(item.get(field) for item in candidates), user.get(field))
        if value not in (None, ""):
            merged[field] = value

    return merged


def websocket_role_for_user(user: Optional[Dict[str, Any]]) -> str:
    if not user:
        return "guest"
    portal_role = str(user.get("portal_role") or "").strip().lower()
    if portal_role in {"customer", "agent", "admin"}:
        return portal_role
    if has_admin_access(user):
        return "admin"
    if is_agent_role(user.get("role")):
        return "agent"
    return "customer"


async def publish_live_update(
    event: str,
    payload: Dict[str, Any],
    *,
    user_ids: Optional[List[str]] = None,
    roles: Optional[List[str]] = None,
) -> None:
    await live_updates.publish(
        event=event,
        payload=payload,
        user_ids=user_ids,
        roles=roles,
    )


async def create_audit_log(
    *,
    actor_user_id: Optional[str],
    action: str,
    entity_type: str,
    entity_id: Optional[str],
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    if not await is_database_available():
        return
    payload = {
        "id": str(uuid.uuid4()),
        "actor_user_id": actor_user_id,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "metadata": metadata or {},
        "created_at": now_utc().isoformat(),
    }
    await db.audit_logs.insert_one(payload)


async def build_dashboard_metrics_snapshot() -> Dict[str, Any]:
    if not await is_database_available():
        return {}
    bookings = filter_live_customer_items(await db.bookings.find({}, {"_id": 0}).to_list(500))
    visits = filter_live_customer_items(await db.visits.find({}, {"_id": 0}).to_list(500))
    properties = [normalize_live_property_record(item) for item in await db.properties.find({}, {"_id": 0}).to_list(500)]
    property_map = {item.get("id"): item for item in properties}
    booking_status_counts: Dict[str, int] = defaultdict(int)
    visit_status_counts: Dict[str, int] = defaultdict(int)
    area_sales: Dict[str, int] = defaultdict(int)
    commission_total = 0.0
    closed_statuses = {"completed", "closed", "sold"}

    for booking in bookings:
        status_value = normalize_booking_status_value(booking.get("status"))
        booking_status_counts[status_value] += 1
        if status_value in closed_statuses:
            prop = property_map.get(booking.get("property_id")) or {}
            area = booking.get("property_location") or booking.get("location") or prop.get("location") or booking.get("property_name") or prop.get("name") or "Unassigned"
            area_sales[str(area)] += 1
            commission_total += float(booking.get("commission_amount") or 0)

    for visit in visits:
        visit_status_counts[normalize_visit_status_value(visit.get("status"))] += 1

    top_selling_area = None
    if area_sales:
        top_selling_area = sorted(area_sales.items(), key=lambda item: item[1], reverse=True)[0][0]

    return {
        "users": await db.users.count_documents({}),
        "customers": await db.users.count_documents({"role": ROLE_CUSTOMER}),
        "agents": await db.users.count_documents({"role": ROLE_AGENT}),
        "pending_agents": await db.users.count_documents({"role": ROLE_AGENT, "approval_status": APPROVAL_PENDING}),
        "properties": await db.properties.count_documents({}),
        "plots_available": await db.plots.count_documents({"status": "available"}),
        "plots_reserved": await db.plots.count_documents({"status": "reserved"}),
        "plots_booked": await db.plots.count_documents({"status": "booked"}),
        "bookings": len(bookings),
        "visits": len(visits),
        "service_requests": await db.service_requests.count_documents({}),
        "booking_status_counts": dict(booking_status_counts),
        "visit_status_counts": dict(visit_status_counts),
        "closed_sales": sum(area_sales.values()),
        "commission_total": round(commission_total, 2),
        "top_selling_area": top_selling_area or "No closed sales yet",
        "last_synced_at": now_utc().isoformat(),
    }


async def publish_dashboard_metrics_update(*, user_ids: Optional[List[str]] = None, roles: Optional[List[str]] = None) -> None:
    snapshot = await build_dashboard_metrics_snapshot()
    if not snapshot:
        return
    await publish_live_update(
        "dashboard.metrics_updated",
        {"metrics": snapshot},
        user_ids=user_ids,
        roles=roles or ["admin"],
    )


async def create_notification(user_id: str, title: str, body: str, type_: str = "welcome") -> None:
    normalized_title = replace_live_property_labels(title)
    normalized_body = replace_live_property_labels(body)
    notification_payload = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "title": normalized_title,
        "body": normalized_body,
        "type": type_,
        "read": False,
        "created_at": now_utc().isoformat(),
    }
    if await is_database_available():
        await db.notifications.insert_one(notification_payload.copy())
    elif ALLOW_LOCAL_AUTH_FALLBACK:
        local_upsert_collection_item("notifications", notification_payload.copy())
    else:
        return
    await publish_live_update(
        "notification.created",
        {"notification": notification_payload},
        user_ids=[user_id],
    )


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
        if not agent_can_access_plot(user, plot):
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
    closed_sales = 0
    commission_total = 0.0
    for booking in local_list_bookings():
        plot = local_get_plot(booking["plot_id"]) or {}
        if not agent_can_access_booking(user, booking, plot):
            continue
        property_doc = property_map.get(booking["property_id"], {})
        customer = local_find_user(user_id=booking.get("user_id")) or {}
        normalized_booking = normalize_booking_record({
            **booking,
            "plot_number": plot.get("plot_number"),
            "property_name": property_doc.get("name", booking["property_id"]),
            "property_code": property_code_for_record(property_doc or plot),
            "customer": clean_user(customer) if customer else None,
        })
        bookings.append(normalized_booking)
        if normalized_booking.get("status") == "completed":
            closed_sales += 1
            commission_total += float(normalized_booking.get("commission_amount") or 0)

    visits = [
        normalize_live_visit_record(visit)
        for visit in filter_live_customer_items(local_list_visits())
        if agent_can_access_visit(user, visit, local_get_plot(visit.get("plot_id")) if visit.get("plot_id") else None)
    ]
    crm_dashboard = {
        "leads": [item for item in local_list_collection("leads") if crm_is_record_visible_to_user(user, item)],
        "opportunities": [item for item in local_list_collection("opportunities") if crm_is_record_visible_to_user(user, item)],
        "tasks": [item for item in local_list_collection("tasks") if crm_is_record_visible_to_user(user, item)],
        "activities": [item for item in local_list_collection("activities") if crm_is_record_visible_to_user(user, item)],
    }
    stage_counts = {stage: 0 for stage in CRM_STAGES}
    for opportunity in crm_dashboard["opportunities"]:
        stage = opportunity.get("stage", "new")
        stage_counts[stage] = stage_counts.get(stage, 0) + 1
    unread_notifications = len([
        item for item in local_list_collection("notifications")
        if item.get("user_id") == user["id"] and not item.get("read")
    ])

    return {
        "profile": clean_user(user),
        "sub_agents": [sub for sub in sub_agents if sub],
        "assets": assets,
        "bookings": bookings,
        "visits": visits,
        "leads": crm_dashboard["leads"],
        "opportunities": crm_dashboard["opportunities"],
        "tasks": crm_dashboard["tasks"],
        "activities": crm_dashboard["activities"][:50],
        "stage_counts": stage_counts,
        "metrics": {
            "lead_count": len(crm_dashboard["leads"]),
            "active_deals": len([item for item in crm_dashboard["opportunities"] if item.get("stage") not in CRM_CLOSED_STAGES]),
        },
        "kpis": {
            "assets": len(assets),
            "bookings": len(bookings),
            "visits": len(visits),
            "leads": len(crm_dashboard["leads"]),
            "active_deals": len([item for item in crm_dashboard["opportunities"] if item.get("stage") not in CRM_CLOSED_STAGES]),
            "closed_sales": closed_sales,
            "commission_earned": round(commission_total, 2),
            "unread_notifications": unread_notifications,
        },
        "last_synced_at": now_utc().isoformat(),
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
    if not use_db:
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
    timestamp = now_utc().isoformat()
    if existing:
        existing_role = str(existing.get("role") or ROLE_CUSTOMER).strip().lower()
        if phone and existing_role in {ROLE_AGENT, ROLE_ADMIN} and auth_method == "phone":
            raise HTTPException(
                status_code=403,
                detail=f"This phone number is registered as {existing_role} and cannot use customer login.",
            )
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
        if not existing.get("role"):
            updates["role"] = ROLE_CUSTOMER
        await db.users.update_one({"_id": existing["_id"]}, {"$set": updates})
        refreshed = await db.users.find_one({"_id": existing["_id"]}, {"_id": 0})
        return clean_user(refreshed)

    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "name": name or (email.split("@")[0] if email else f"User-{(phone or user_id)[-4:]}"),
        "role": ROLE_CUSTOMER,
        "auth_methods": [auth_method],
        "address": "",
        "date_of_birth": None,
        "kyc_status": "pending",
        "is_admin": False,
        "email_verified": bool(email),
        "phone_verified": bool(phone),
        "approval_status": APPROVAL_NOT_REQUIRED,
        "status": STATUS_ACTIVE,
        "notification_preferences": {
            "push_notifications": True,
            "service_updates": True,
            "booking_updates": True,
        },
        "communication_preferences": {
            "promotional_emails": False,
            "whatsapp_updates": True,
        },
        "biometric_login_enabled": False,
        "dark_mode_enabled": False,
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
    await db.users.insert_one(user)
    await create_notification(
        user_id,
        "Welcome to Rivan Reality",
        "Your account is ready. Explore premium properties and track your journey in one place.",
    )
    return clean_user(user)


def hash_refresh_token_value(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def build_session_metadata(request: Optional[Request]) -> Dict[str, Optional[str]]:
    return {
        "ip_address": request.client.host if request and request.client else None,
        "user_agent": request.headers.get("user-agent") if request else None,
    }


async def persist_user_session(session_record: Dict[str, Any]) -> None:
    if await is_database_available():
        await db.user_sessions.update_one(
            {"id": session_record["id"]},
            {"$set": session_record},
            upsert=True,
        )
        return
    if not ALLOW_LOCAL_AUTH_FALLBACK:
        raise HTTPException(status_code=503, detail="Authentication database is unavailable")
    local_upsert_collection_item("sessions", session_record)


async def get_user_session(session_id: str) -> Optional[Dict[str, Any]]:
    if await is_database_available():
        return await db.user_sessions.find_one({"id": session_id}, {"_id": 0})
    if not ALLOW_LOCAL_AUTH_FALLBACK:
        return None
    for session in local_list_collection("sessions"):
        if session.get("id") == session_id:
            return dict(session)
    return None


async def touch_user_session(session_id: str) -> None:
    timestamp = now_utc().isoformat()
    if await is_database_available():
        await db.user_sessions.update_one(
            {"id": session_id, "revoked_at": None},
            {"$set": {"last_seen_at": timestamp, "updated_at": timestamp}},
        )
        return
    if ALLOW_LOCAL_AUTH_FALLBACK:
        session = await get_user_session(session_id)
        if session and not session.get("revoked_at"):
            session["last_seen_at"] = timestamp
            session["updated_at"] = timestamp
            local_upsert_collection_item("sessions", session)


async def revoke_user_session(session_id: str) -> None:
    revoked_at = now_utc().isoformat()
    if await is_database_available():
        await db.user_sessions.update_one(
            {"id": session_id},
            {"$set": {"revoked_at": revoked_at, "updated_at": revoked_at}},
        )
        return
    if ALLOW_LOCAL_AUTH_FALLBACK:
        session = await get_user_session(session_id)
        if session:
            session["revoked_at"] = revoked_at
            session["updated_at"] = revoked_at
            local_upsert_collection_item("sessions", session)


async def revoke_user_sessions_for_user(user_id: str, *, session_role: Optional[str] = None) -> None:
    revoked_at = now_utc().isoformat()
    query: Dict[str, Any] = {"user_id": user_id, "revoked_at": None}
    if session_role:
        query["session_role"] = session_role
    if await is_database_available():
        await db.user_sessions.update_many(
            query,
            {"$set": {"revoked_at": revoked_at, "updated_at": revoked_at}},
        )
        return
    if ALLOW_LOCAL_AUTH_FALLBACK:
        for session in local_list_collection("sessions"):
            if session.get("user_id") != user_id or session.get("revoked_at"):
                continue
            if session_role and str(session.get("session_role") or "").strip().lower() != session_role:
                continue
            session["revoked_at"] = revoked_at
            session["updated_at"] = revoked_at
            local_upsert_collection_item("sessions", session)


def set_auth_cookies(response: Response, *, access_token: str, refresh_token: str) -> None:
    cookie_kwargs = {
        "httponly": True,
        "secure": COOKIE_SECURE,
        "samesite": COOKIE_SAMESITE,
        "path": "/",
    }
    if COOKIE_DOMAIN:
        cookie_kwargs["domain"] = COOKIE_DOMAIN
    response.set_cookie(
        ACCESS_TOKEN_COOKIE_NAME,
        access_token,
        max_age=JWT_EXPIRES_MIN * 60,
        **cookie_kwargs,
    )
    response.set_cookie(
        REFRESH_TOKEN_COOKIE_NAME,
        refresh_token,
        max_age=REFRESH_TOKEN_EXPIRES_MIN * 60,
        **cookie_kwargs,
    )


def clear_auth_cookies(response: Response) -> None:
    cookie_kwargs = {
        "httponly": True,
        "secure": COOKIE_SECURE,
        "samesite": COOKIE_SAMESITE,
        "path": "/",
    }
    if COOKIE_DOMAIN:
        cookie_kwargs["domain"] = COOKIE_DOMAIN
    response.delete_cookie(ACCESS_TOKEN_COOKIE_NAME, **cookie_kwargs)
    response.delete_cookie(REFRESH_TOKEN_COOKIE_NAME, **cookie_kwargs)


async def issue_token_response(
    user: Dict[str, Any],
    response: Optional[Response] = None,
    request: Optional[Request] = None,
    session_id: Optional[str] = None,
    session_role: Optional[str] = None,
) -> TokenResp:
    clean = clean_user(user)
    if is_agent_role(clean.get("role")):
        clean = await resolve_agent_profile_identity(clean)
    current_session_id = session_id or str(uuid.uuid4())
    refresh_token, refresh_token_id = create_refresh_token(
        clean["id"],
        JWT_SECRET,
        REFRESH_TOKEN_EXPIRES_MIN,
        session_id=current_session_id,
    )
    access_token = create_access_token(clean["id"], JWT_SECRET, JWT_EXPIRES_MIN, session_id=current_session_id)
    timestamp = now_utc().isoformat()
    metadata = build_session_metadata(request)
    await persist_user_session(
        {
            "id": current_session_id,
            "user_id": clean["id"],
            "refresh_token_hash": hash_refresh_token_value(refresh_token),
            "refresh_token_id": refresh_token_id,
            "refresh_expires_at": (now_utc() + timedelta(minutes=REFRESH_TOKEN_EXPIRES_MIN)).isoformat(),
            "created_at": timestamp,
            "updated_at": timestamp,
            "last_seen_at": timestamp,
            "revoked_at": None,
            "session_role": session_role,
            **metadata,
        }
    )
    response_user = apply_session_role(clean, {"session_role": session_role} if session_role else None)
    if response is not None:
        set_auth_cookies(response, access_token=access_token, refresh_token=refresh_token)
    return TokenResp(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in_seconds=JWT_EXPIRES_MIN * 60,
        user=response_user,
    )


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
    await db.properties.update_one(
        {"id": "prop-1"},
        {
            "$set": {
                "image": "/Property Image 1.jpeg",
                "images": [
                    "/Property Image 1.jpeg",
                    "/Property Image 2.jpeg",
                    "/East Face.jpeg",
                    "/West Face.jpeg",
                    "/Features.jpeg",
                    "/Map.jpeg",
                ],
                "updated_at": now_utc().isoformat(),
            }
        },
    )


def legacy_auth_disabled(endpoint_name: str) -> None:
    raise HTTPException(
        status_code=410,
        detail=f"{endpoint_name} is disabled. Use Firebase phone OTP login instead.",
    )


def build_sirpuram_property_seed() -> Dict[str, Any]:
    timestamp = now_utc().isoformat()
    return {
        "id": "prop-1",
        "name": "Sirpuram Gardens",
        "category": "Open Plots",
        "location": "Achutapuram, Visakhapatnam",
        "starting_price": 1600000,
        "size": "200-360 sq yards",
        "image": "/Property Image 1.jpeg",
        "images": [
            "/Property Image 1.jpeg",
            "/Property Image 2.jpeg",
            "/East Face.jpeg",
            "/West Face.jpeg",
            "/Features.jpeg",
            "/Map.jpeg",
        ],
        "description": "Sirpuram Gardens is the live source-of-truth property for the current phase, with plot inventory, documents, approvals, and backend-ready references.",
        "survey_number": "SY-No 234/3",
        "facing": "East / West / North / South",
        "road_width": "40-60 ft internal roads",
        "availability": "Available",
        "featured": True,
        "amenities": ["Street Lighting", "Water Supply", "Underground Drainage", "Rain-water Harvesting", "Landscaping"],
        "approvals": ["VUDA Approved Layout", "Clear Title Layout Planning"],
        "nearby": ["Pudimadaka Beach - 10 min", "Kondakarla Tourist Spot - 15 min", "Vizag Airport - 60 min"],
        "highlights": "Premium plots · Gated community · High growth corridor",
        "created_at": timestamp,
        "updated_at": timestamp,
    }


def build_sirpuram_plot_seed() -> List[Dict[str, Any]]:
    timestamp = now_utc().isoformat()
    facings = ["East", "West", "North", "South", "North-East", "South-East"]
    plot_statuses = ["available"] * 10 + ["reserved"] * 4 + ["booked"] * 4 + ["sold"] * 6
    plots: List[Dict[str, Any]] = []
    plot_num = 1
    for row in range(6):
        for col in range(4):
            idx = row * 4 + col
            if idx >= 24:
                break
            size_sqy = [200, 240, 300, 360][col]
            plots.append({
                "id": f"plot-1-{plot_num}",
                "property_id": "prop-1",
                "unit_type": "plot",
                "plot_number": f"P-{plot_num:03d}",
                "survey_number": "SY-No 234/3",
                "size": f"{size_sqy} sq yards",
                "size_sqy": size_sqy,
                "facing": facings[idx % len(facings)],
                "price": size_sqy * 9250,
                "status": plot_statuses[idx % len(plot_statuses)],
                "row": row,
                "col": col,
                "owner_id": None,
                "created_at": timestamp,
                "updated_at": timestamp,
            })
            plot_num += 1
    return plots


async def ensure_primary_admin_seed() -> None:
    timestamp = now_utc().isoformat()
    await db.users.update_many(
        {"phone": {"$in": ["9000000000", "94991348973", "9491348973"]}},
        {"$set": {"phone": PRIMARY_ADMIN_PHONE, "updated_at": timestamp}},
    )
    await db.users.update_many(
        {"phone": {"$in": ["9848129637", "+919848129637"]}},
        {"$set": {"phone": SECONDARY_ADMIN_PHONE, "updated_at": timestamp}},
    )
    await db.users.update_one(
        {"phone": PRIMARY_ADMIN_PHONE},
        {
            "$set": {
                "name": ADMIN_DISPLAY_NAME,
                "phone": PRIMARY_ADMIN_PHONE,
                "email": PRIMARY_ADMIN_EMAIL,
                "role": ROLE_ADMIN,
                "approval_status": APPROVAL_NOT_REQUIRED,
                "status": STATUS_ACTIVE,
                "is_admin": True,
                "is_primary_admin": True,
                "phone_verified": True,
                "email_verified": True,
                "auth_methods": ["phone"],
                "kyc_status": "verified",
                "updated_at": timestamp,
            },
            "$setOnInsert": {
                "id": PRIMARY_ADMIN_USER_ID,
                "address": "Rivan HQ",
                "created_at": timestamp,
                "last_login_at": None,
            },
        },
        upsert=True,
    )


async def ensure_primary_agent_seed() -> None:
    timestamp = now_utc().isoformat()
    await db.users.update_many(
        {"phone": {"$in": ["9900001111", "9052644345", "+919900001111", "+919052644345"]}},
        {"$set": {"phone": PRIMARY_AGENT_PHONE, "updated_at": timestamp}},
    )
    await db.users.update_one(
        {"id": PRIMARY_AGENT_USER_ID},
        {
            "$set": {
                "phone": PRIMARY_AGENT_PHONE,
                "role": ROLE_AGENT,
                "approval_status": APPROVAL_APPROVED,
                "status": STATUS_ACTIVE,
                "phone_verified": True,
                "auth_methods": ["phone", "agent_application"],
                "kyc_status": "verified",
                "updated_at": timestamp,
            },
            "$setOnInsert": {
                "id": PRIMARY_AGENT_USER_ID,
                "name": "Agent",
                "email": PRIMARY_AGENT_EMAIL,
                "email_verified": False,
                "agent_brand_name": "Rivan Realty",
                "address": "",
                "age": None,
                "aadhaar_number": "",
                "manager_name": "",
                "manager_id": None,
                "sub_agent_ids": [],
                "approved_by_manager": ADMIN_DISPLAY_NAME,
                "created_at": timestamp,
                "last_login_at": None,
            },
        },
        upsert=True,
    )
    await db.users.update_one(
        {"phone": SECONDARY_ADMIN_PHONE},
        {
            "$set": {
                "name": ADMIN_DISPLAY_NAME,
                "phone": SECONDARY_ADMIN_PHONE,
                "email": SECONDARY_ADMIN_EMAIL,
                "role": ROLE_ADMIN,
                "approval_status": APPROVAL_NOT_REQUIRED,
                "status": STATUS_ACTIVE,
                "is_admin": True,
                "is_primary_admin": True,
                "phone_verified": True,
                "email_verified": True,
                "auth_methods": ["phone"],
                "kyc_status": "verified",
                "updated_at": timestamp,
            },
            "$setOnInsert": {
                "id": SECONDARY_ADMIN_USER_ID,
                "address": "Rivan HQ",
                "created_at": timestamp,
                "last_login_at": None,
            },
        },
        upsert=True,
    )


async def reconcile_primary_agent_profile() -> Optional[Dict[str, Any]]:
    if not await is_database_available():
        return None
    variants = phone_identity_variants(PRIMARY_AGENT_PHONE)
    candidates = await db.users.find(
        {
            "$or": [
                {"id": PRIMARY_AGENT_USER_ID},
                {"phone": {"$in": variants}},
            ]
        },
        {"_id": 0},
    ).to_list(20)
    if not candidates:
        return None

    primary = next((item for item in candidates if item.get("id") == PRIMARY_AGENT_USER_ID), None)
    profile_fields = ("name", "email", "address", "occupation", "age", "aadhaar_number", "agent_brand_name")

    def score(item: Dict[str, Any]) -> int:
        value = 0
        if item.get("id") == PRIMARY_AGENT_USER_ID:
            value += 2
        name = str(item.get("name") or "").strip().lower()
        if name and name not in {"agent", PRIMARY_AGENT_PHONE}:
            value += 8
        for field in profile_fields:
            if str(item.get(field) or "").strip():
                value += 1
        return value

    source = sorted(candidates, key=score, reverse=True)[0]
    update: Dict[str, Any] = {
        "phone": PRIMARY_AGENT_PHONE,
        "role": ROLE_AGENT,
        "approval_status": APPROVAL_APPROVED,
        "status": STATUS_ACTIVE,
        "phone_verified": True,
        "updated_at": now_utc().isoformat(),
    }
    for field in profile_fields:
        source_value = source.get(field)
        primary_value = (primary or {}).get(field)
        if source_value not in (None, "") and (field != "name" or str(source_value).strip().lower() != "agent"):
            update[field] = source_value
        elif primary_value not in (None, ""):
            update[field] = primary_value

    await db.users.update_one({"id": PRIMARY_AGENT_USER_ID}, {"$set": update}, upsert=True)
    await db.users.update_many(
        {"phone": {"$in": variants}, "id": {"$ne": PRIMARY_AGENT_USER_ID}},
        {"$set": {**{k: v for k, v in update.items() if k in profile_fields and k != "email"}, "linked_primary_agent_id": PRIMARY_AGENT_USER_ID, "updated_at": update["updated_at"]}},
    )
    return await db.users.find_one({"id": PRIMARY_AGENT_USER_ID}, {"_id": 0})


async def resolve_primary_agent_user() -> Optional[Dict[str, Any]]:
    await ensure_primary_agent_seed()
    reconciled = await reconcile_primary_agent_profile()
    if reconciled:
        return reconciled
    user = await db.users.find_one({"phone": {"$in": phone_identity_variants(PRIMARY_AGENT_PHONE)}}, {"_id": 0})
    if user:
        return user

    by_id = await db.users.find_one({"id": PRIMARY_AGENT_USER_ID}, {"_id": 0})
    if not by_id:
        return None

    await db.users.update_one(
        {"id": PRIMARY_AGENT_USER_ID},
        {"$set": {"phone": PRIMARY_AGENT_PHONE, "updated_at": now_utc().isoformat()}},
    )
    return await db.users.find_one({"id": PRIMARY_AGENT_USER_ID}, {"_id": 0})


def build_primary_agent_payload(*, created_at: Optional[str] = None, updated_at: Optional[str] = None) -> Dict[str, Any]:
    timestamp = now_utc().isoformat()
    return {
        "id": PRIMARY_AGENT_USER_ID,
        "name": "Agent",
        "phone": PRIMARY_AGENT_PHONE,
        "email": PRIMARY_AGENT_EMAIL,
        "role": ROLE_AGENT,
        "approval_status": APPROVAL_APPROVED,
        "status": STATUS_ACTIVE,
        "phone_verified": True,
        "email_verified": False,
        "auth_methods": ["phone", "agent_application"],
        "kyc_status": "verified",
        "agent_brand_name": "Rivan Realty",
        "address": "",
        "age": None,
        "aadhaar_number": "",
        "manager_name": "",
        "manager_id": None,
        "sub_agent_ids": [],
        "approved_by_manager": ADMIN_DISPLAY_NAME,
        "created_at": created_at or timestamp,
        "updated_at": updated_at or timestamp,
        "last_login_at": None,
    }


async def ensure_sirpuram_dataset() -> None:
    property_seed = build_sirpuram_property_seed()
    property_update = property_seed.copy()
    created_at = property_update.pop("created_at")
    await db.properties.update_one(
        {"id": property_seed["id"]},
        {"$set": property_update, "$setOnInsert": {"created_at": created_at}},
        upsert=True,
    )

    if await db.plots.count_documents({"property_id": "prop-1"}) == 0:
        await db.plots.insert_many([plot.copy() for plot in build_sirpuram_plot_seed()])

    default_documents = [
        {
            "id": "sirpuram-doc-layout",
            "property_id": "prop-1",
            "name": "Sirpuram Gardens Layout Plan",
            "type": "layout",
            "url": "/Map.jpeg",
        },
        {
            "id": "sirpuram-doc-approval",
            "property_id": "prop-1",
            "name": "Sirpuram Gardens Approval Summary",
            "type": "approval",
            "url": "/Features.jpeg",
        },
    ]
    for document in default_documents:
        await db.documents.update_one(
            {"id": document["id"]},
            {
                "$set": {
                    **document,
                    "updated_at": now_utc().isoformat(),
                },
                "$setOnInsert": {"created_at": now_utc().isoformat()},
            },
            upsert=True,
        )


@app.on_event("startup")
async def ensure_indexes() -> None:
    if not await is_database_available(force_refresh=True, log_failure=True):
        logger.warning("MongoDB unavailable at startup; skipping index sync until the database is reachable.")
        return

    try:
        await db.users.update_many({"email": ""}, {"$unset": {"email": ""}})
        await db.users.update_many({"phone": ""}, {"$unset": {"phone": ""}})
        await db.users.update_many({"google_sub": ""}, {"$unset": {"google_sub": ""}})
        await db.users.update_many({"password_hash": ""}, {"$unset": {"password_hash": ""}})
        await db.users.update_many({"phone": {"$type": "string"}}, [{"$set": {"phone": {"$trim": {"input": "$phone"}}}}])
        await purge_demo_auth_users_from_db()
        await ensure_primary_admin_seed()
        await ensure_primary_agent_seed()

        for index_name in ("email_1", "phone_1", "google_sub_1"):
            try:
                await db.users.drop_index(index_name)
            except OperationFailure:
                pass

        await db.users.create_index("id", unique=True)
        await db.users.create_index("email", unique=True, sparse=True)
        await db.users.create_index("phone", unique=True, sparse=True)
        await db.users.create_index("google_sub", unique=True, sparse=True)
        await db.users.create_index("firebase_uid", unique=True, sparse=True)
        await db.users.create_index([("role", 1), ("approval_status", 1), ("status", 1)])
        await db.user_sessions.create_index("id", unique=True)
        await db.user_sessions.create_index([("user_id", 1), ("revoked_at", 1)])
        await db.user_sessions.create_index([("user_id", 1), ("session_role", 1), ("refresh_expires_at", 1)])
        await db.user_sessions.create_index("refresh_token_id", sparse=True)
        await db.properties.create_index("id", unique=True)
        await db.properties.create_index([("featured", 1), ("name", 1)])
        await db.plots.create_index("id", unique=True)
        await db.plots.create_index([("property_id", 1), ("status", 1)])
        await db.bookings.create_index("id", unique=True, sparse=True)
        await db.bookings.create_index([("customer_id", 1), ("plot_id", 1)])
        await db.visits.create_index("id", unique=True, sparse=True)
        await db.visits.create_index([("customer_id", 1), ("assigned_agent_id", 1), ("visit_date", 1)])
        await db.notifications.create_index([("user_id", 1), ("read", 1), ("created_at", -1)])
        await db.documents.create_index("id", unique=True, sparse=True)
        await db.documents.create_index([("user_id", 1), ("property_id", 1)])
        await db.service_requests.create_index("id", unique=True, sparse=True)
        await db.service_requests.create_index([("user_id", 1), ("status", 1), ("created_at", -1)])
        await db.leads.create_index("id", unique=True)
        await db.leads.create_index("normalized_email", sparse=True)
        await db.leads.create_index("normalized_phone", sparse=True)
        await db.opportunities.create_index("id", unique=True)
        await db.opportunities.create_index([("lead_id", 1), ("property_id", 1), ("plot_id", 1)])
        await db.tasks.create_index("id", unique=True)
        await db.tasks.create_index([("assigned_to_user_id", 1), ("due_at", 1)])
        await db.activities.create_index([("lead_id", 1), ("created_at", -1)])
        await db.customer_agent_links.create_index("id", unique=True)
        await db.customer_agent_links.create_index([("customer_id", 1), ("last_activity_at", -1)])
        await db.audit_logs.create_index("id", unique=True, sparse=True)
        await db.audit_logs.create_index([("entity_type", 1), ("entity_id", 1), ("created_at", -1)])
        await ensure_sirpuram_dataset()
        await ensure_property_media_defaults()
        await crm_backfill_existing_records()
    except Exception:
        logger.exception("MongoDB unavailable at startup.")


# ---------- Auth Routes ----------
@api_router.post("/auth/register", response_model=TokenResp)
async def register(req: RegisterReq, request: Request, response: Response):
    legacy_auth_disabled("/api/auth/register")


@api_router.post("/auth/login", response_model=TokenResp)
async def login(req: LoginReq, request: Request, response: Response):
    legacy_auth_disabled("/api/auth/login")


@api_router.post("/auth/admin/status")
async def admin_access_status(req: AgentAccessStatusReq, request: Request):
    phone = normalize_phone(req.phone)
    enforce_rate_limit(rate_limit_key(request, "auth_admin_status", phone), limit=20, window_seconds=300)
    if await is_database_available():
        user = await db.users.find_one(
            {"phone": {"$in": phone_identity_variants(phone)}},
            {"_id": 0},
        )
        if not user and any(phone in phone_identity_variants(admin_phone) for admin_phone in ADMIN_LOGIN_PHONES):
            await ensure_primary_admin_seed()
            user = await db.users.find_one(
                {"phone": {"$in": phone_identity_variants(phone)}},
                {"_id": 0},
            )
    elif ALLOW_LOCAL_AUTH_FALLBACK:
        user = local_find_user(phone=phone)
    else:
        raise HTTPException(status_code=503, detail="Authentication database is unavailable")

    can_login = bool(user and is_primary_admin_login_user(user) and admin_access_is_active(user))
    return {
        "phone": phone,
        "exists": bool(user),
        "can_login": can_login,
        "message": (
            "This mobile number is authorized for admin access."
            if can_login
            else "This mobile number is not authorized for admin access."
        ),
    }


@api_router.post("/auth/send-otp")
async def send_otp(req: SendOtpReq, request: Request):
    legacy_auth_disabled("/api/auth/send-otp")


@api_router.post("/auth/verify-otp", response_model=TokenResp)
async def verify_otp(req: VerifyOtpReq, request: Request, response: Response):
    legacy_auth_disabled("/api/auth/verify-otp")


@api_router.post("/auth/agent/apply")
async def apply_agent_access(req: AgentApplicationReq, request: Request):
    phone = normalize_phone(req.phone)
    enforce_rate_limit(rate_limit_key(request, "auth_agent_apply", phone), limit=6, window_seconds=3600)
    email = normalize_email(req.email) if req.email else ""
    now_iso = now_utc().isoformat()
    application_updates = {
        "name": req.name.strip(),
        "phone": phone,
        "email": email,
        "occupation": (req.occupation or "").strip(),
        "age": req.age,
        "aadhaar_number": req.aadhaar_number,
        "address": (req.address or "").strip(),
        "agent_brand_name": (req.agent_brand_name or "").strip(),
        "application_notes": (req.notes or "").strip(),
        "approval_status": APPROVAL_PENDING,
        "status": APPROVAL_PENDING,
        "role": ROLE_AGENT,
        "kyc_status": "pending",
        "agent_application_submitted_at": now_iso,
        "updated_at": now_iso,
    }

    if await is_database_available():
        existing = await db.users.find_one({"phone": {"$in": phone_identity_variants(phone)}})
    else:
        raise HTTPException(status_code=503, detail="Authentication database is unavailable")

    if existing:
        if not is_agent_role(existing.get("role")):
            raise HTTPException(status_code=409, detail="This phone number is already assigned to another role.")
        if str(existing.get("approval_status") or "").strip().lower() == APPROVAL_APPROVED:
            return {
                "success": True,
                "already_approved": True,
                "message": "This phone number is already approved for agent access.",
                "agent": clean_user(existing),
            }
        application_updates["auth_methods"] = auth_methods_union(existing.get("auth_methods"), "agent_application")
        application_updates["review_notes"] = ""
        application_updates["reviewed_at"] = None
        application_updates["reviewed_by_manager"] = None
        application_updates["approved_by_manager"] = None
        await db.users.update_one({"_id": existing["_id"]}, {"$set": application_updates})
        updated = await db.users.find_one({"_id": existing["_id"]}, {"_id": 0})
        return {
            "success": True,
            "already_approved": False,
            "message": "Agent application submitted. Admin approval is required before login.",
            "agent": clean_user(updated or existing),
        }

    agent = {
        "id": str(uuid.uuid4()),
        **application_updates,
        "auth_methods": ["agent_application"],
        "email_verified": False,
        "phone_verified": False,
        "is_admin": False,
        "created_at": now_iso,
        "last_login_at": None,
        "sub_agent_ids": [],
        "review_notes": "",
        "reviewed_at": None,
        "reviewed_by_manager": None,
        "approved_by_manager": None,
    }
    await db.users.insert_one(agent.copy())
    await create_audit_log(
        actor_user_id=agent["id"],
        action="agent.applied",
        entity_type="user",
        entity_id=agent["id"],
        metadata={"phone": phone},
    )

    return {
        "success": True,
        "already_approved": False,
        "message": "Agent application submitted. Admin approval is required before login.",
        "agent": clean_user(agent),
    }


@api_router.post("/auth/agent/status")
async def agent_access_status(req: AgentAccessStatusReq, request: Request):
    phone = normalize_phone(req.phone)
    enforce_rate_limit(rate_limit_key(request, "auth_agent_status", phone), limit=20, window_seconds=300)

    if phone in phone_identity_variants(PRIMARY_AGENT_PHONE):
        if await is_database_available():
            user = await resolve_primary_agent_user()
            if user:
                return {
                    "phone": user.get("phone") or PRIMARY_AGENT_PHONE,
                    "exists": True,
                    "role": ROLE_AGENT,
                    "approval_status": APPROVAL_APPROVED,
                    "can_login": True,
                    "can_apply": False,
                    "message": "This mobile number is approved for agent login.",
                    "agent": clean_user(user),
                }
        primary_agent = build_primary_agent_payload()
        return {
            "phone": primary_agent["phone"],
            "exists": True,
            "role": ROLE_AGENT,
            "approval_status": APPROVAL_APPROVED,
            "can_login": True,
            "can_apply": False,
            "message": "This mobile number is approved for agent login.",
            "agent": clean_user(primary_agent),
        }

    if await is_database_available():
        user = await db.users.find_one({"phone": {"$in": phone_identity_variants(phone)}}, {"_id": 0})
    else:
        raise HTTPException(status_code=503, detail="Authentication database is unavailable")

    if not user:
        return {
            "phone": phone,
            "exists": False,
            "role": None,
            "approval_status": None,
            "can_login": False,
            "can_apply": True,
            "message": "No agent account exists for this phone number yet.",
        }

    role = user.get("role")
    approval_status = str(user.get("approval_status") or APPROVAL_PENDING).strip().lower() if is_agent_role(role) else None
    if not is_agent_role(role):
        return {
            "phone": phone,
            "exists": True,
            "role": role,
            "approval_status": None,
            "can_login": False,
            "can_apply": True,
            "message": "This phone number belongs to a non-partner account and cannot open the Partner portal.",
        }

    return {
        "phone": phone,
        "exists": True,
        "role": role,
        "approval_status": approval_status,
        "can_login": approval_status == APPROVAL_APPROVED and str(user.get("status") or STATUS_ACTIVE).lower() == STATUS_ACTIVE,
        "can_apply": approval_status != APPROVAL_APPROVED,
        "message": (
            "This phone number is approved for agent login."
            if approval_status == "approved"
            else agent_approval_error_message(user)
        ),
        "agent": clean_user(user),
    }


@api_router.post("/auth/google", response_model=TokenResp)
async def google_auth(req: GoogleAuthReq, request: Request, response: Response):
    legacy_auth_disabled("/api/auth/google")


@api_router.post("/auth/firebase", response_model=TokenResp)
async def firebase_auth(req: FirebaseAuthReq, request: Request, response: Response):
    normalized_phone = normalize_phone(req.phone) if req.phone else None
    enforce_rate_limit(rate_limit_key(request, "auth_firebase", normalized_phone), limit=10, window_seconds=300)
    project_id = get_firebase_project_id()
    if not project_id:
        logger.error("Firebase auth failed: FIREBASE project id is not configured")
        raise HTTPException(status_code=500, detail="Firebase project is not configured")

    try:
        payload = verify_firebase_id_token(req.id_token, project_id)
    except HTTPException as exc:
        logger.warning("Firebase auth token verification failed: %s", exc.detail)
        raise

    phone = normalized_phone or normalize_phone(payload.get("phone_number") or "")
    token_phone = normalize_phone(payload.get("phone_number") or "")
    if not phone:
        logger.warning("Firebase auth failed: token did not include a phone number")
        raise HTTPException(status_code=400, detail="Firebase phone number is missing")
    if token_phone and token_phone != phone:
        logger.warning("Firebase auth failed: request phone does not match token phone")
        raise HTTPException(status_code=401, detail="Firebase phone token does not match requested phone")

    existing = await db.users.find_one({"phone": {"$in": phone_identity_variants(phone)}}, {"_id": 0})
    if existing and str(existing.get("role") or "").strip().lower() in {ROLE_AGENT, ROLE_ADMIN}:
        raise HTTPException(
            status_code=403,
            detail=f"This phone number is registered as {str(existing.get('role')).lower()} and cannot use customer login.",
        )

    user = await upsert_user_identity(
        name=req.name.strip() if req.name else payload.get("name") or phone[-10:],
        phone=phone,
        auth_method="phone",
    )
    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {
                "firebase_uid": payload.get("user_id") or payload.get("sub"),
                "updated_at": now_utc().isoformat(),
                "last_login_at": now_utc().isoformat(),
                "role": ROLE_CUSTOMER,
                "status": STATUS_ACTIVE,
                "approval_status": APPROVAL_NOT_REQUIRED,
            }
        },
    )
    refreshed = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    logger.info("Firebase phone auth succeeded for user_id=%s", refreshed.get("id") if refreshed else user.get("id"))
    return await issue_token_response(refreshed, response, request, session_role="customer")


@api_router.post("/auth/customer/firebase", response_model=TokenResp)
async def customer_firebase_auth(req: FirebaseAuthReq, request: Request, response: Response):
    return await firebase_auth(req, request, response)


@api_router.post("/auth/agent/firebase", response_model=TokenResp)
async def agent_firebase_auth(req: AgentFirebaseAuthReq, request: Request, response: Response):
    normalized_phone = normalize_phone(req.phone) if req.phone else None
    enforce_rate_limit(rate_limit_key(request, "auth_agent_firebase", normalized_phone), limit=10, window_seconds=300)
    project_id = get_firebase_project_id()
    if not project_id:
        logger.error("Agent Firebase auth failed: FIREBASE project id is not configured")
        raise HTTPException(status_code=500, detail="Firebase project is not configured")

    try:
        payload = verify_firebase_id_token(req.id_token, project_id)
    except HTTPException as exc:
        logger.warning("Agent Firebase auth token verification failed: %s", exc.detail)
        raise

    phone = normalized_phone or normalize_phone(payload.get("phone_number") or "")
    token_phone = normalize_phone(payload.get("phone_number") or "")
    if not phone:
        raise HTTPException(status_code=400, detail="Firebase phone number is missing")
    if token_phone and token_phone != phone:
        raise HTTPException(status_code=401, detail="Firebase phone token does not match requested phone")

    if phone in phone_identity_variants(PRIMARY_AGENT_PHONE):
        if not await is_database_available():
            raise HTTPException(status_code=503, detail="Authentication database is unavailable")
        user = await reconcile_primary_agent_profile()
        if user:
            user = await db.users.find_one({"id": PRIMARY_AGENT_USER_ID})
        if not user:
            user = await db.users.find_one({"id": PRIMARY_AGENT_USER_ID})
        if not user:
            await ensure_primary_agent_seed()
            user = await db.users.find_one({"id": PRIMARY_AGENT_USER_ID})
        if not user:
            primary_agent = build_primary_agent_payload()
            await db.users.insert_one(primary_agent)
            user = await db.users.find_one({"id": PRIMARY_AGENT_USER_ID})
        if str(user.get("phone") or "").strip() != PRIMARY_AGENT_PHONE:
            await db.users.update_one(
                {"_id": user["_id"]},
                {"$set": {"phone": PRIMARY_AGENT_PHONE, "updated_at": now_utc().isoformat()}},
            )
            user = await db.users.find_one({"_id": user["_id"]})

        updates = {
            "firebase_uid": payload.get("user_id") or payload.get("sub"),
            "phone": PRIMARY_AGENT_PHONE,
            "phone_verified": True,
            "role": ROLE_AGENT,
            "approval_status": APPROVAL_APPROVED,
            "status": STATUS_ACTIVE,
            "kyc_status": "verified",
            "updated_at": now_utc().isoformat(),
            "last_login_at": now_utc().isoformat(),
            "auth_methods": auth_methods_union(user.get("auth_methods"), "phone"),
        }
        await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
        refreshed = await db.users.find_one({"_id": user["_id"]}, {"_id": 0})
        logger.info("Primary agent Firebase phone auth succeeded for user_id=%s", refreshed.get("id") if refreshed else PRIMARY_AGENT_USER_ID)
        return await issue_token_response(refreshed, response, request, session_role="agent")

    if await is_database_available():
        user = await db.users.find_one({"phone": {"$in": phone_identity_variants(phone)}})
    else:
        raise HTTPException(status_code=503, detail="Authentication database is unavailable")

    if not user:
        raise HTTPException(status_code=404, detail="No approved agent account exists for this phone number")
    if not is_agent_role(user.get("role")):
        raise HTTPException(status_code=403, detail="This phone number does not belong to an agent account")
    if str(user.get("approval_status") or "").strip().lower() != APPROVAL_APPROVED:
        raise HTTPException(status_code=403, detail=agent_approval_error_message(user))
    status_value = str(user.get("status") or STATUS_ACTIVE).strip().lower()
    approval_value = str(user.get("approval_status") or "").strip().lower()
    kyc_value = str(user.get("kyc_status") or "").strip().lower()
    if status_value != STATUS_ACTIVE:
        raise HTTPException(status_code=403, detail="Your agent access is not active.")

    updates = {
        "firebase_uid": payload.get("user_id") or payload.get("sub"),
        "phone": phone,
        "phone_verified": True,
        "role": ROLE_AGENT,
        "approval_status": approval_value or APPROVAL_APPROVED,
        "status": STATUS_ACTIVE,
        "kyc_status": "verified" if approval_value == APPROVAL_APPROVED and kyc_value != "verified" else (kyc_value or "verified"),
        "updated_at": now_utc().isoformat(),
        "last_login_at": now_utc().isoformat(),
        "auth_methods": auth_methods_union(user.get("auth_methods"), "phone"),
    }

    await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
    refreshed = await db.users.find_one({"_id": user["_id"]}, {"_id": 0})
    logger.info("Agent Firebase phone auth succeeded for user_id=%s", refreshed.get("id") if refreshed else user.get("id"))
    return await issue_token_response(refreshed, response, request, session_role="agent")


@api_router.post("/auth/admin/firebase", response_model=TokenResp)
async def admin_firebase_auth(req: AdminFirebaseAuthReq, request: Request, response: Response):
    normalized_phone = normalize_phone(req.phone) if req.phone else None
    enforce_rate_limit(rate_limit_key(request, "auth_admin_firebase", normalized_phone), limit=10, window_seconds=300)
    project_id = get_firebase_project_id()
    if not project_id:
        logger.error("Admin Firebase auth failed: Firebase project id is not configured")
        raise HTTPException(status_code=500, detail="Firebase project is not configured")

    try:
        payload = verify_firebase_id_token(req.id_token, project_id)
    except HTTPException as exc:
        logger.warning("Admin Firebase auth token verification failed: %s", exc.detail)
        raise

    phone = normalized_phone or normalize_phone(payload.get("phone_number") or "")
    token_phone = normalize_phone(payload.get("phone_number") or "")
    if not phone or not token_phone:
        raise HTTPException(status_code=400, detail="Firebase phone number is missing")
    if token_phone != phone:
        logger.warning("Admin Firebase auth rejected a phone/token mismatch")
        raise HTTPException(status_code=401, detail="Firebase phone token does not match requested phone")
    if not any(phone in phone_identity_variants(admin_phone) for admin_phone in ADMIN_LOGIN_PHONES):
        raise HTTPException(status_code=403, detail="This mobile number is not authorized for admin access")
    if await is_database_available():
        user = await db.users.find_one({"phone": {"$in": phone_identity_variants(phone)}})
        if not user and any(phone in phone_identity_variants(admin_phone) for admin_phone in ADMIN_LOGIN_PHONES):
            await ensure_primary_admin_seed()
            user = await db.users.find_one({"phone": {"$in": phone_identity_variants(phone)}})
    else:
        raise HTTPException(status_code=503, detail="Authentication database is unavailable")

    if not user or not is_primary_admin_login_user(user):
        raise HTTPException(status_code=403, detail="This mobile number is not authorized for admin access")
    if not admin_access_is_active(user):
        raise HTTPException(status_code=403, detail="This admin account is not active")

    timestamp = now_utc().isoformat()
    updates = {
        "firebase_uid": payload.get("user_id") or payload.get("sub"),
        "phone": phone,
        "phone_verified": True,
        "updated_at": timestamp,
        "last_login_at": timestamp,
        "auth_methods": auth_methods_union(user.get("auth_methods"), "phone"),
    }
    await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
    refreshed = await db.users.find_one({"_id": user["_id"]}, {"_id": 0})
    await create_audit_log(
        actor_user_id=refreshed.get("id") if refreshed else user.get("id"),
        action="admin.login",
        entity_type="session",
        entity_id=refreshed.get("id") if refreshed else user.get("id"),
        metadata={"phone": phone},
    )
    logger.info("Admin Firebase phone auth succeeded for user_id=%s", refreshed.get("id") if refreshed else user.get("id"))
    return await issue_token_response(refreshed or {**user, **updates}, response, request, session_role="admin")


@api_router.post("/auth/refresh", response_model=TokenResp)
async def refresh_auth_session(req: RefreshTokenReq, request: Request, response: Response):
    enforce_rate_limit(rate_limit_key(request, "auth_refresh"), limit=12, window_seconds=300)
    payload = decode_token(req.refresh_token, JWT_SECRET)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    session_id = str(payload.get("sid") or "").strip()
    refresh_token_id = str(payload.get("jti") or "").strip()
    user_id = str(payload.get("sub") or "").strip()
    if not session_id or not refresh_token_id or not user_id:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    session = await get_user_session(session_id)
    if not session or session.get("revoked_at"):
        raise HTTPException(status_code=401, detail="Session expired")
    if session.get("user_id") != user_id:
        raise HTTPException(status_code=401, detail="Session expired")
    if session.get("refresh_token_id") != refresh_token_id:
        raise HTTPException(status_code=401, detail="Session expired")
    if session.get("refresh_token_hash") != hash_refresh_token_value(req.refresh_token):
        raise HTTPException(status_code=401, detail="Session expired")
    if session.get("refresh_expires_at"):
        try:
            if datetime.fromisoformat(str(session["refresh_expires_at"])) <= now_utc():
                raise HTTPException(status_code=401, detail="Session expired")
        except ValueError:
            raise HTTPException(status_code=401, detail="Session expired")

    if await is_database_available():
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
    elif ALLOW_LOCAL_AUTH_FALLBACK:
        user = local_find_user(user_id=user_id)
    else:
        raise HTTPException(status_code=503, detail="Authentication database is unavailable")
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if is_agent_role(user.get("role")):
        user = await resolve_agent_profile_identity(user)

    return await issue_token_response(user, response, request, session_id=session_id, session_role=session.get("session_role"))


@api_router.post("/auth/logout")
async def logout_auth_session(req: RefreshTokenReq, request: Request, response: Response):
    enforce_rate_limit(rate_limit_key(request, "auth_logout"), limit=20, window_seconds=300)
    payload = decode_token(req.refresh_token, JWT_SECRET)
    session_id = str(payload.get("sid") or "").strip()
    if session_id:
        await revoke_user_session(session_id)
    clear_auth_cookies(response)
    return {"success": True}


@api_router.get("/auth/me")
async def me(user: Dict[str, Any] = Depends(get_current_user)):
    if is_agent_role(user.get("role")):
        user = await resolve_agent_profile_identity(user)
    return clean_user(user)


@api_router.get("/auth/protected")
async def protected_example(user: Dict[str, Any] = Depends(get_current_user)):
    return {"authenticated": True, "user_id": user["id"], "auth_methods": user.get("auth_methods", [])}


@api_router.get("/crm/customer-relationship", response_model=CustomerRelationshipResp)
async def crm_customer_relationship(user: Dict[str, Any] = Depends(get_current_user)):
    return await crm_get_customer_relationship(user)


@api_router.put("/auth/profile")
async def update_profile(req: UpdateProfileReq, user: Dict[str, Any] = Depends(get_current_user)):
    update = {k: v for k, v in req.dict().items() if v is not None}
    if "email" in update:
        update["email"] = normalize_email(update["email"])
    if "notification_preferences" in update:
        update["notification_preferences"] = {
            **(user.get("notification_preferences") or {}),
            **(update.get("notification_preferences") or {}),
        }
    if "communication_preferences" in update:
        update["communication_preferences"] = {
            **(user.get("communication_preferences") or {}),
            **(update.get("communication_preferences") or {}),
        }
    update["updated_at"] = now_utc().isoformat()
    if update and await is_database_available():
        if update.get("email"):
            existing_user = await db.users.find_one(
                {"email": update["email"], "id": {"$ne": user["id"]}},
                {"id": 1},
            )
            if existing_user:
                raise HTTPException(
                    status_code=409,
                    detail="This email address is already in use by another account.",
                )

        try:
            await db.users.update_one({"id": user["id"]}, {"$set": update})
            if is_agent_role(user.get("role")):
                phone_variants = phone_identity_variants(user.get("phone"))
                sync_fields = {
                    key: value
                    for key, value in update.items()
                    if key in AGENT_PROFILE_SYNC_FIELDS
                }
                if sync_fields:
                    agent_filters: List[Dict[str, Any]] = [{"id": user["id"]}]
                    if phone_variants:
                        agent_filters.append({"phone": {"$in": phone_variants}})
                    await db.users.update_many(
                        {"$or": agent_filters, "role": ROLE_AGENT},
                        {"$set": sync_fields},
                    )
            if user.get("id") == PRIMARY_AGENT_USER_ID or normalize_phone(user.get("phone")) == PRIMARY_AGENT_PHONE:
                sync_fields = {
                    key: value
                    for key, value in update.items()
                    if key in AGENT_PROFILE_SYNC_FIELDS
                }
                if sync_fields:
                    await db.users.update_many(
                        {"phone": {"$in": phone_identity_variants(PRIMARY_AGENT_PHONE)}},
                        {"$set": {**sync_fields, "linked_primary_agent_id": PRIMARY_AGENT_USER_ID}},
                    )
        except DuplicateKeyError:
            logger.exception("Duplicate email conflict while updating profile for user %s", user["id"])
            raise HTTPException(
                status_code=409,
                detail="This email address is already in use by another account.",
            )

        updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
        if is_agent_role((updated or user).get("role")):
            updated = await resolve_agent_profile_identity(updated or user)
        return apply_session_role(updated, {"session_role": user.get("portal_role")})
    if not ALLOW_LOCAL_AUTH_FALLBACK:
        raise HTTPException(status_code=503, detail="Authentication database is unavailable")
    user.update(update)
    local_save_user(user)
    updated = local_find_user(user_id=user["id"])
    return apply_session_role(updated, {"session_role": user.get("portal_role")})


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
        customer_id=None,
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
        return [normalize_live_property_record(item) for item in items]

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
    return [normalize_live_property_record(item) for item in items]


@api_router.get("/health")
async def health_check():
    if await is_database_available():
        return {
            "ok": True,
            "database": "connected",
            "mode": "mongo",
            "firebase_project_id_configured": bool(get_firebase_project_id()),
            "live_updates_enabled": True,
            "live_updates_path": "/ws/live",
        }
    if ALLOW_LOCAL_AUTH_FALLBACK:
        return {
            "ok": True,
            "database": "offline",
            "mode": "local-auth-fallback",
            "live_updates_enabled": True,
            "live_updates_path": "/ws/live",
        }
    return {
        "ok": False,
        "database": "unavailable",
        "mode": "production-db-required",
        "firebase_project_id_configured": bool(get_firebase_project_id()),
        "live_updates_enabled": False,
        "live_updates_path": "/ws/live",
        "detail": "Database unavailable",
    }


@api_router.get("/ready")
async def readiness_check():
    missing = []
    if not MONGO_URL:
        missing.append("MONGO_URL")
    if not JWT_SECRET:
        missing.append("JWT_SECRET")
    if not get_firebase_project_id():
        missing.append("FIREBASE_PROJECT_ID")
    if not CORS_ORIGINS:
        missing.append("CORS_ORIGINS")
    if missing:
        raise HTTPException(status_code=503, detail={"ready": False, "missing": missing})
    if not await is_database_available():
        raise HTTPException(status_code=503, detail={"ready": False, "missing": ["mongodb_connection"]})
    return {"ready": True}


@api_router.get("/properties/featured")
async def featured_properties():
    cached_items = get_cached_featured_properties()
    if cached_items is not None:
        return cached_items

    if not await is_database_available():
        stale_items = _featured_properties_cache.get("value")
        if stale_items:
            return stale_items
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Property database is unavailable")
        local_items = [item for item in local_get_properties() if item.get("featured")]
        return update_featured_properties_cache(local_items)

    items = await db.properties.find({"featured": True}, {"_id": 0}).to_list(20)
    return update_featured_properties_cache([normalize_live_property_record(item) for item in items])


@api_router.get("/properties/{property_id}")
async def get_property(property_id: str):
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Property database is unavailable")
        prop = local_get_property(property_id)
        if not prop:
            raise HTTPException(status_code=404, detail="Property not found")
        return normalize_live_property_record(prop)
    prop = await db.properties.find_one({"id": property_id}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return normalize_live_property_record(prop)


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

        canonical_property_id = canonical_live_property_id(
            plot.get("property_id"),
            plot.get("property_name"),
            plot.get("name"),
            plot.get("location"),
        ) or str(plot.get("property_id") or "")
        assigned_agent_id = await resolve_assigned_agent_id(property_id=canonical_property_id, plot_id=req.plot_id)
        booking = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "plot_id": req.plot_id,
            "property_id": canonical_property_id,
            "agent_id": assigned_agent_id or plot.get("agent_id"),
            "name": req.name,
            "mobile": req.mobile,
            "whatsapp": req.whatsapp or req.mobile,
            "message": req.message or "",
            "status": "pending",
            "approval_status": "pending",
            "reviewed_by_agent": None,
            "reviewed_by_admin": None,
            "customer_id": user["id"],
            "created_at": now_utc().isoformat(),
            "updated_at": now_utc().isoformat(),
        }
        local_save_booking(booking)
        local_save_plot_override(req.plot_id, {"status": "reserved"})
        await create_notification(
            user["id"],
            "Booking request received",
            f"Your booking request for {plot.get('plot_number') or 'the selected plot'} is pending agent review.",
            "booking",
        )
        await crm_sync_booking(
            booking=booking,
            customer=user,
            actor_user_id=user["id"],
            source="customer_booking",
        )
        await publish_live_update(
            "booking.created",
            {"booking": booking, "scope": "customer_booking"},
            user_ids=[user["id"], *( [assigned_agent_id] if assigned_agent_id else [])],
            roles=["admin"],
        )
        await publish_dashboard_metrics_update(user_ids=[user["id"], *( [assigned_agent_id] if assigned_agent_id else [])], roles=["admin"])
        return {"success": True, "booking": booking, "message": "Booking request submitted. Your assigned agent will review it shortly."}

    plot = await db.plots.find_one({"id": req.plot_id}, {"_id": 0})
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
    if plot.get("status") not in ("available", "reserved"):
        raise HTTPException(status_code=400, detail="Plot is not available for booking")

    canonical_property_id = canonical_live_property_id(
        plot.get("property_id"),
        plot.get("property_name"),
        plot.get("name"),
        plot.get("location"),
    ) or str(plot.get("property_id") or "")
    assigned_agent_id = await resolve_assigned_agent_id(property_id=canonical_property_id, plot_id=req.plot_id)
    booking_id = str(uuid.uuid4())
    booking = {
        "id": booking_id,
        "user_id": user["id"],
        "plot_id": req.plot_id,
        "property_id": canonical_property_id,
        "agent_id": assigned_agent_id or plot.get("agent_id"),
        "name": req.name,
        "mobile": req.mobile,
        "whatsapp": req.whatsapp or req.mobile,
        "message": req.message or "",
        "status": "pending",
        "approval_status": "pending",
        "reviewed_by_agent": None,
        "reviewed_by_admin": None,
        "customer_id": user["id"],
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
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
        "body": f"Your booking for plot {plot.get('plot_number')} is pending agent review.",
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
    await publish_live_update(
        "booking.created",
        {"booking": booking, "scope": "customer_booking"},
        user_ids=[user["id"], *( [assigned_agent_id] if assigned_agent_id else [])],
        roles=["admin"],
    )
    await publish_dashboard_metrics_update(user_ids=[user["id"], *( [assigned_agent_id] if assigned_agent_id else [])], roles=["admin"])
    return {"success": True, "booking": booking, "message": "Booking request submitted. Your assigned agent will review it shortly."}


@api_router.get("/bookings/mine")
async def my_bookings(user: Dict[str, Any] = Depends(get_current_user)):
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Booking database is unavailable")
        items = [booking for booking in local_list_bookings() if booking.get("user_id") == user["id"]]
        items = filter_live_customer_items(items)
        items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return [normalize_booking_record(normalize_live_property_record(item)) for item in items]
    items = await db.bookings.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    items = filter_live_customer_items(items)
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return [normalize_booking_record(item) for item in items]


# ---------- My Land ----------
@api_router.get("/myland")
async def my_land(user: Dict[str, Any] = Depends(get_current_user)):
    """Return units owned/booked by this user with purchase progress"""
    await require_database("My land data is unavailable")
    plots = await db.plots.find(
        {"owner_id": user["id"]}, {"_id": 0}
    ).to_list(100)
    plots = filter_live_customer_items(plots)
    enriched = []
    for plot in plots:
        prop = await db.properties.find_one({"id": plot["property_id"]}, {"_id": 0})
        if prop and should_hide_demo_item(prop):
            continue
        # Compute progress for this plot
        installments = await db.installments.find(
            {"user_id": user["id"], "plot_id": plot["id"]}, {"_id": 0}
        ).to_list(100)
        installments = filter_live_customer_items(installments)
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
            "property": normalize_live_property_record(prop) if prop else None,
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
    await require_database("Property eligibility data is unavailable")
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
    raise HTTPException(status_code=501, detail="Payments are out of scope for the current production phase.")


@api_router.get("/payments/installments")
async def list_installments(user: Dict[str, Any] = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail="Payments are out of scope for the current production phase.")


@api_router.get("/payments/history")
async def payment_history(user: Dict[str, Any] = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail="Payments are out of scope for the current production phase.")


@api_router.post("/payments/pay")
async def pay_installment(req: PayInstallmentReq, user: Dict[str, Any] = Depends(get_current_user)):
    raise HTTPException(status_code=501, detail="Payments are out of scope for the current production phase.")
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
async def list_documents(property_id: Optional[str] = None, user: Dict[str, Any] = Depends(get_current_user)):
    await require_database("Document database is unavailable")
    query: Dict[str, Any] = {"$or": [{"user_id": user["id"]}, {"property_id": {"$exists": True}}]}
    if property_id:
        query["property_id"] = property_id
    items = await db.documents.find(query, {"_id": 0}).to_list(100)
    items = filter_live_customer_items(items)
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
    await require_database("Service request database is unavailable")
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
    await crm_sync_service_request(
        service_request=sr,
        customer=user,
        actor_user_id=user["id"],
    )
    await publish_live_update(
        "service_request.updated",
        {"request": sr},
        user_ids=[user["id"]],
        roles=["admin"],
    )
    await publish_dashboard_metrics_update(user_ids=[user["id"]], roles=["admin"])
    return {"success": True, "request": sr}


@api_router.post("/contact-sales")
async def contact_sales(req: ContactSalesReq, user: Dict[str, Any] = Depends(get_current_user)):
    property_id = canonical_live_property_id(req.property_id) or str(req.property_id or "").strip() or None
    property_name = live_property_name(property_id, "Siripuram Property") if property_id else "Rivan property"
    request_channel = str(req.request_channel or "contact_sales").strip().lower() or "contact_sales"
    request_type = {
        "callback": "Callback Request",
        "booking_interest": "Booking Interest",
        "whatsapp": "WhatsApp Request",
        "email": "Email Request",
        "contact_sales": "Sales Inquiry",
    }.get(request_channel, "Sales Inquiry")
    sales_request = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "service_type": request_type,
        "property_id": property_id,
        "preferred_date": req.preferred_date or now_utc().date().isoformat(),
        "description": req.message,
        "contact": normalize_phone(req.contact or user.get("phone")) if (req.contact or user.get("phone")) else "",
        "status": "pending",
        "subject": (req.subject or request_type).strip() or request_type,
        "request_channel": request_channel,
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Contact service is unavailable")
        local_upsert_collection_item("service_requests", sales_request)
    else:
        await db.service_requests.insert_one(sales_request.copy())

    await create_notification(
        user["id"],
        "Sales request submitted",
        f"Your {request_type.lower()} for {property_name} has been recorded. Our team will follow up shortly.",
        "service",
    )
    await crm_sync_service_request(
        service_request=sales_request,
        customer=user,
        actor_user_id=user["id"],
    )
    await publish_live_update(
        "service_request.updated",
        {"request": sales_request, "scope": "contact_sales"},
        user_ids=[user["id"]],
        roles=["admin"],
    )
    await publish_dashboard_metrics_update(user_ids=[user["id"]], roles=["admin"])
    return {"success": True, "request": sales_request}


@api_router.get("/services/mine")
async def my_services(user: Dict[str, Any] = Depends(get_current_user)):
    await require_database("Service request database is unavailable")
    items = await db.service_requests.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


# ---------- Experience Centres & Visits ----------
@api_router.get("/centres")
async def list_centres():
    await require_database("Centre data is unavailable")
    items = await db.centres.find({}, {"_id": 0}).to_list(50)
    return items


@api_router.get("/centres/{centre_id}")
async def get_centre(centre_id: str):
    await require_database("Centre data is unavailable")
    c = await db.centres.find_one({"id": centre_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Centre not found")
    return c


@api_router.post("/visits/centre")
async def book_centre_visit(req: VisitBookingReq, user: Dict[str, Any] = Depends(get_current_user)):
    await require_database("Visit database is unavailable")
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
        "customer_name": req.name,
        "customer_phone": normalize_phone(req.mobile),
        "status": "pending",
        "approval_status": "pending",
        "review_notes": "",
        "reviewed_at": None,
        "reviewed_by_admin": None,
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    await db.visits.insert_one(visit.copy())
    visit.pop("_id", None)
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "title": "Centre Visit Submitted",
        "body": f"Your visit request to {centre.get('name')} on {req.visit_date} at {req.visit_time} is awaiting admin confirmation.",
        "type": "visit",
        "read": False,
        "created_at": now_utc().isoformat(),
    })
    await crm_sync_centre_visit(
        visit=visit,
        customer=user,
        actor_user_id=user["id"],
    )
    await publish_live_update(
        "visit.created",
        {"visit": visit, "scope": "centre_visit"},
        user_ids=[user["id"]],
        roles=["admin"],
    )
    return {"success": True, "visit": visit}


@api_router.post("/visits/site")
async def book_site_visit(req: SiteVisitReq, user: Dict[str, Any] = Depends(get_current_user)):
    requested_property_id = canonical_live_property_id(req.property_id) or str(req.property_id or "").strip()
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Visit database is unavailable")
        prop = local_get_property(requested_property_id) or local_get_property(req.property_id)
        if not prop:
            raise HTTPException(status_code=404, detail="Property not found")
        canonical_property_id = canonical_live_property_id(
            prop.get("id"),
            prop.get("name"),
            prop.get("location"),
            requested_property_id,
        ) or requested_property_id
        property_name = live_property_name(canonical_property_id, prop.get("name"))
        assigned_agent_id = await resolve_visit_agent_id(
            canonical_property_id=canonical_property_id,
            requested_property_id=requested_property_id,
        )
        visit = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "type": "site",
            "property_id": canonical_property_id,
            "property_name": property_name,
            "visit_date": req.visit_date,
            "visit_time": req.visit_time,
            "name": req.name,
            "mobile": req.mobile,
            "customer_name": req.name,
            "customer_phone": normalize_phone(req.mobile),
            "assigned_agent_id": assigned_agent_id,
            "status": "pending_agent_approval",
            "approval_status": "pending",
            "review_notes": "",
            "reviewed_by_agent": None,
            "reviewed_at": None,
            "reviewed_by_admin": None,
            "created_at": now_utc().isoformat(),
            "updated_at": now_utc().isoformat(),
        }
        local_save_visit(visit)
        await create_notification(
            user["id"],
            "Site Visit Submitted",
            f"Your visit request to {property_name} is pending agent approval.",
            "visit",
        )
        await crm_sync_site_visit(
            visit=visit,
            customer=user,
            actor_user_id=user["id"],
        )
        await publish_live_update(
            "visit.created",
            {"visit": normalize_live_visit_record(visit), "scope": "customer_site_visit"},
            user_ids=[user["id"], *( [assigned_agent_id] if assigned_agent_id else [])],
            roles=["admin"],
        )
        return {"success": True, "visit": normalize_live_visit_record(visit)}

    prop = await db.properties.find_one({"id": requested_property_id}, {"_id": 0})
    if not prop and requested_property_id != str(req.property_id or "").strip():
        prop = await db.properties.find_one({"id": req.property_id}, {"_id": 0})
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    canonical_property_id = canonical_live_property_id(
        prop.get("id"),
        prop.get("name"),
        prop.get("location"),
        requested_property_id,
    ) or requested_property_id
    property_name = live_property_name(canonical_property_id, prop.get("name"))
    assigned_agent_id = await resolve_visit_agent_id(
        canonical_property_id=canonical_property_id,
        requested_property_id=requested_property_id,
    )
    visit = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "type": "site",
        "property_id": canonical_property_id,
        "property_name": property_name,
        "visit_date": req.visit_date,
        "visit_time": req.visit_time,
        "name": req.name,
        "mobile": req.mobile,
        "customer_name": req.name,
        "customer_phone": normalize_phone(req.mobile),
        "assigned_agent_id": assigned_agent_id,
        "status": "pending_agent_approval",
        "approval_status": "pending",
        "review_notes": "",
        "reviewed_by_agent": None,
        "reviewed_at": None,
        "reviewed_by_admin": None,
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    await db.visits.insert_one(visit.copy())
    visit.pop("_id", None)
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "title": "Site Visit Submitted",
        "body": f"Your visit request to {property_name} on {req.visit_date} is pending agent approval.",
        "type": "visit",
        "read": False,
        "created_at": now_utc().isoformat(),
    })
    await crm_sync_site_visit(
        visit=visit,
        customer=user,
        actor_user_id=user["id"],
    )
    await publish_live_update(
        "visit.created",
        {"visit": normalize_live_visit_record(visit), "scope": "customer_site_visit"},
        user_ids=[user["id"], *( [assigned_agent_id] if assigned_agent_id else [])],
        roles=["admin"],
    )
    return {"success": True, "visit": normalize_live_visit_record(visit)}


@api_router.get("/visits/mine")
async def my_visits(user: Dict[str, Any] = Depends(get_current_user)):
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Visit database is unavailable")
        items = [visit for visit in local_list_visits() if visit.get("user_id") == user["id"]]
        items = filter_live_customer_items(items)
        items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return [normalize_live_visit_record(item) for item in items]
    items = await db.visits.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    items = filter_live_customer_items(items)
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return [normalize_live_visit_record(item) for item in items]


@api_router.put("/visits/{visit_id}")
async def update_customer_visit(
    visit_id: str,
    req: CustomerVisitUpdateReq,
    user: Dict[str, Any] = Depends(get_current_user),
):
    await require_database("Visit database is unavailable")
    updates: Dict[str, Any] = {"updated_at": now_utc().isoformat()}
    if req.visit_date is not None:
        updates["visit_date"] = req.visit_date
    if req.visit_time is not None:
        updates["visit_time"] = req.visit_time
    if req.status is not None:
        allowed_statuses = {"rescheduled", "cancelled"}
        normalized_status = normalize_visit_status_value(req.status)
        if normalized_status not in allowed_statuses:
            raise HTTPException(status_code=400, detail="Customers can only reschedule or cancel their visits.")
        updates["status"] = normalized_status
        if normalized_status == "rescheduled":
            updates["approval_status"] = "pending"
        if normalized_status == "cancelled":
            updates["approval_status"] = "rejected"

    if len(updates) == 1:
        raise HTTPException(status_code=400, detail="No visit changes were provided.")

    existing = await db.visits.find_one({"id": visit_id, "user_id": user["id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Visit not found")

    await db.visits.update_one({"id": visit_id, "user_id": user["id"]}, {"$set": updates})
    updated = await db.visits.find_one({"id": visit_id, "user_id": user["id"]}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=404, detail="Visit not found")

    property_name = updated.get("property_name") or existing.get("property_name") or "your property"
    if updates.get("status") == "cancelled":
        title = "Visit Cancelled"
        body = f"Your site visit for {property_name} was cancelled."
    else:
        title = "Visit Rescheduled"
        body = f"Your site visit for {property_name} was updated to {updated.get('visit_date') or 'the selected date'}."

    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "title": title,
        "body": body,
        "type": "visit",
        "read": False,
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    })
    await publish_live_update(
        "visit.updated",
        {"visit": normalize_live_visit_record(updated), "scope": "customer_visit_update"},
        user_ids=[user["id"], *( [updated.get("assigned_agent_id")] if updated.get("assigned_agent_id") else [])],
        roles=["admin"],
    )
    return {"success": True, "visit": normalize_live_visit_record(updated)}


# ---------- Wishlist ----------
@api_router.post("/wishlist/toggle")
async def toggle_wishlist(req: WishlistReq, user: Dict[str, Any] = Depends(get_current_user)):
    await require_database("Wishlist database is unavailable")
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
    await require_database("Wishlist database is unavailable")
    items = await db.wishlist.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    items = filter_live_customer_items(items)
    pids = [i["property_id"] for i in items]
    props = await db.properties.find({"id": {"$in": pids}}, {"_id": 0}).to_list(100)
    return filter_live_customer_items(props)


# ---------- Notifications ----------
@api_router.get("/notifications")
async def list_notifications(user: Dict[str, Any] = Depends(get_current_user)):
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Notification database is unavailable")
        items = [item for item in local_list_collection("notifications") if item.get("user_id") == user["id"]]
        items = filter_live_customer_items(items)
        items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return items
    items = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    items = filter_live_customer_items(items)
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


@api_router.get("/notifications/unread-count")
async def unread_notification_count(user: Dict[str, Any] = Depends(get_current_user)):
    await require_database("Notification database is unavailable")
    count = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return {"unread_count": count}


@api_router.post("/notifications/{notif_id}/read")
async def read_notification(notif_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    await require_database("Notification database is unavailable")
    await db.notifications.update_one(
        {"id": notif_id, "user_id": user["id"]},
        {"$set": {"read": True, "updated_at": now_utc().isoformat()}}
    )
    await publish_live_update(
        "notification.read",
        {"notification_id": notif_id, "user_id": user["id"]},
        user_ids=[user["id"]],
    )
    return {"success": True}


@api_router.post("/notifications/read-all")
async def read_all_notifications(user: Dict[str, Any] = Depends(get_current_user)):
    await require_database("Notification database is unavailable")
    await db.notifications.update_many(
        {"user_id": user["id"], "read": False},
        {"$set": {"read": True, "updated_at": now_utc().isoformat()}}
    )
    await publish_live_update(
        "notification.read",
        {"all": True, "user_id": user["id"]},
        user_ids=[user["id"]],
    )
    return {"success": True}


@app.websocket("/ws/live")
async def live_updates_websocket(websocket: WebSocket):
    token = (
        websocket.query_params.get("token", "")
        or websocket.cookies.get(ACCESS_TOKEN_COOKIE_NAME, "")
        or str(websocket.headers.get("authorization") or "").removeprefix("Bearer ").strip()
    )
    user: Optional[Dict[str, Any]] = None
    if token:
        try:
            payload = decode_token(token, JWT_SECRET)
            user_id = payload.get("sub")
            session_id = str(payload.get("sid") or "").strip()
            session = await get_user_session(session_id) if session_id else None
            if user_id:
                if await is_database_available():
                    user = await db.users.find_one({"id": user_id}, {"_id": 0})
                elif ALLOW_LOCAL_AUTH_FALLBACK:
                    user = local_find_user(user_id=user_id)
                if user:
                    user = apply_session_role(user, session)
        except Exception:
            user = None

    connection_id = await live_updates.connect(
        websocket,
        user_id=user.get("id") if user else None,
        role=websocket_role_for_user(user),
    )
    await websocket.send_json(
        {
            "event": "live.connected",
            "payload": {
                "connection_id": connection_id,
                "role": websocket_role_for_user(user),
                "user_id": user.get("id") if user else None,
            },
            "sent_at": now_utc().isoformat(),
        }
    )
    try:
        while True:
            message = await websocket.receive_json()
            action = str(message.get("action") or "").strip().lower()
            if action == "ping":
                await websocket.send_json(
                    {
                        "event": "live.pong",
                        "payload": {"ok": True},
                        "sent_at": now_utc().isoformat(),
                    }
                )
            elif action == "whoami":
                await websocket.send_json(
                    {
                        "event": "live.identity",
                        "payload": {
                            "role": websocket_role_for_user(user),
                            "user_id": user.get("id") if user else None,
                            "authenticated": bool(user),
                        },
                        "sent_at": now_utc().isoformat(),
                    }
                )
            elif action == "subscribe-dashboard":
                metrics = await build_dashboard_metrics_snapshot() if user and websocket_role_for_user(user) == "admin" else {}
                await websocket.send_json(
                    {
                        "event": "dashboard.subscribed",
                        "payload": {"role": websocket_role_for_user(user), "metrics": metrics},
                        "sent_at": now_utc().isoformat(),
                    }
                )
    except WebSocketDisconnect:
        live_updates.disconnect(connection_id)
    except Exception:
        live_updates.disconnect(connection_id)


# ---------- Admin ----------
@api_router.get("/admin/stats")
async def admin_stats(user: Dict[str, Any] = Depends(get_admin_user)):
    if await is_database_available():
        await ensure_primary_agent_seed()
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Admin statistics are unavailable")
        plots = local_get_plots()
        bookings = local_list_bookings()
        visits = local_list_visits()
        users = load_local_store().get("users", [])
        return {
            "users": len(users),
            "agents": len([item for item in users if is_agent_role(item.get("role"))]),
            "properties": len(local_get_properties()),
            "plots": len(plots),
            "plots_sold": len([item for item in plots if item.get("status") == "sold"]),
            "plots_booked": len([item for item in plots if item.get("status") == "booked"]),
            "plots_reserved": len([item for item in plots if item.get("status") == "reserved"]),
            "plots_available": len([item for item in plots if item.get("status") == "available"]),
            "bookings": len(bookings),
            "service_requests": 0,
            "visits": len(visits),
        }
    return {
        "users": await db.users.count_documents({}),
        "agents": await db.users.count_documents({"role": ROLE_AGENT}),
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
async def admin_users(
    role: Optional[str] = None,
    status: Optional[str] = None,
    approval_status: Optional[str] = None,
    user: Dict[str, Any] = Depends(get_admin_user),
):
    if await is_database_available():
        await ensure_primary_agent_seed()
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="User database is unavailable")
        return [clean_user(item) for item in load_local_store().get("users", []) if not should_hide_demo_item(item)]
    query: Dict[str, Any] = {}
    if role:
        query["role"] = role.strip().lower()
    if status:
        query["status"] = status.strip().lower()
    if approval_status:
        query["approval_status"] = approval_status.strip().lower()
    items = await db.users.find(query, {"_id": 0}).to_list(500)
    return [item for item in items if not should_hide_demo_item(item)]


@api_router.get("/admin/bookings")
async def admin_bookings(user: Dict[str, Any] = Depends(get_admin_user)):
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Booking database is unavailable")
        items = [
            normalize_booking_record(item)
            for item in filter_live_customer_items(local_list_bookings())
        ]
        items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return items
    raw_items = filter_live_customer_items(await db.bookings.find({}, {"_id": 0}).to_list(500))
    property_ids = sorted({item.get("property_id") for item in raw_items if item.get("property_id")})
    plot_ids = sorted({item.get("plot_id") for item in raw_items if item.get("plot_id")})
    customer_ids = sorted({item.get("user_id") or item.get("customer_id") for item in raw_items if item.get("user_id") or item.get("customer_id")})
    agent_ids = sorted({item.get("assigned_agent_id") or item.get("agent_id") or item.get("created_by_agent_id") for item in raw_items if item.get("assigned_agent_id") or item.get("agent_id") or item.get("created_by_agent_id")})
    properties = await db.properties.find({"id": {"$in": property_ids}}, {"_id": 0}).to_list(500) if property_ids else []
    plots = await db.plots.find({"id": {"$in": plot_ids}}, {"_id": 0}).to_list(500) if plot_ids else []
    customers = await db.users.find({"id": {"$in": customer_ids}}, {"_id": 0}).to_list(500) if customer_ids else []
    agents = await db.users.find({"id": {"$in": agent_ids}}, {"_id": 0}).to_list(500) if agent_ids else []
    property_map = {item.get("id"): normalize_live_property_record(item) for item in properties}
    plot_map = {item.get("id"): item for item in plots}
    customer_map = {item.get("id"): item for item in customers}
    agent_map = {item.get("id"): item for item in agents}

    items = []
    for item in raw_items:
        items.append(enrich_booking_record(
            item,
            property_doc=property_map.get(item.get("property_id")),
            plot_doc=plot_map.get(item.get("plot_id")),
            customer_doc=customer_map.get(item.get("user_id") or item.get("customer_id")),
            agent_doc=agent_map.get(item.get("assigned_agent_id") or item.get("agent_id") or item.get("created_by_agent_id")),
        ))
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


@api_router.get("/admin/properties")
async def admin_properties(user: Dict[str, Any] = Depends(get_admin_user)):
    await require_database("Property database is unavailable")
    items = await db.properties.find({}, {"_id": 0}).to_list(500)
    return [normalize_live_property_record(item) for item in items if not should_hide_demo_item(item)]


@api_router.get("/admin/plots")
async def admin_plots(property_id: Optional[str] = None, user: Dict[str, Any] = Depends(get_admin_user)):
    await require_database("Plot database is unavailable")
    query: Dict[str, Any] = {}
    if property_id:
        query["property_id"] = property_id
    items = await db.plots.find(query, {"_id": 0}).to_list(1000)
    property_ids = sorted({item.get("property_id") for item in items if item.get("property_id")})
    properties = await db.properties.find({"id": {"$in": property_ids}}, {"_id": 0}).to_list(500) if property_ids else []
    property_map = {item.get("id"): item for item in properties}
    return [
        normalize_plot_record(item, property_map.get(item.get("property_id")))
        for item in items
        if not should_hide_demo_item(item)
    ]


@api_router.get("/admin/audit-logs")
async def admin_audit_logs(limit: int = Query(100, ge=1, le=500), user: Dict[str, Any] = Depends(get_admin_user)):
    await require_database("Audit log database is unavailable")
    items = await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return items


@api_router.get("/admin/visits")
async def admin_visits(user: Dict[str, Any] = Depends(get_admin_user)):
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Visit database is unavailable")
        items = filter_live_customer_items(local_list_visits())
        items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return [normalize_live_visit_record(item) for item in items]
    raw_items = filter_live_customer_items(await db.visits.find({}, {"_id": 0}).to_list(500))
    property_ids = sorted({item.get("property_id") for item in raw_items if item.get("property_id")})
    plot_ids = sorted({item.get("plot_id") for item in raw_items if item.get("plot_id")})
    customer_ids = sorted({item.get("user_id") or item.get("customer_id") for item in raw_items if item.get("user_id") or item.get("customer_id")})
    agent_ids = sorted({item.get("assigned_agent_id") or item.get("agent_id") or item.get("created_by_agent_id") for item in raw_items if item.get("assigned_agent_id") or item.get("agent_id") or item.get("created_by_agent_id")})
    properties = await db.properties.find({"id": {"$in": property_ids}}, {"_id": 0}).to_list(500) if property_ids else []
    plots = await db.plots.find({"id": {"$in": plot_ids}}, {"_id": 0}).to_list(500) if plot_ids else []
    customers = await db.users.find({"id": {"$in": customer_ids}}, {"_id": 0}).to_list(500) if customer_ids else []
    agents = await db.users.find({"id": {"$in": agent_ids}}, {"_id": 0}).to_list(500) if agent_ids else []
    property_map = {item.get("id"): normalize_live_property_record(item) for item in properties}
    plot_map = {item.get("id"): item for item in plots}
    customer_map = {item.get("id"): item for item in customers}
    agent_map = {item.get("id"): item for item in agents}
    items = [
        enrich_visit_record(
            item,
            property_doc=property_map.get(item.get("property_id")),
            plot_doc=plot_map.get(item.get("plot_id")),
            customer_doc=customer_map.get(item.get("user_id") or item.get("customer_id")),
            agent_doc=agent_map.get(item.get("assigned_agent_id") or item.get("agent_id") or item.get("created_by_agent_id")),
        )
        for item in raw_items
    ]
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


@api_router.get("/admin/support-tickets")
async def admin_support_tickets(user: Dict[str, Any] = Depends(get_admin_user)):
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Support ticket database is unavailable")
        requests = local_list_collection("service_requests")
        users_by_id = {item.get("id"): item for item in load_local_store().get("users", [])}
    else:
        requests = await db.service_requests.find({}, {"_id": 0}).to_list(500)
        user_ids = sorted({item.get("user_id") for item in requests if item.get("user_id")})
        user_docs = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0}).to_list(500)
        users_by_id = {item.get("id"): item for item in user_docs}

    tickets = []
    for index, item in enumerate(sorted(requests, key=lambda x: x.get("created_at", ""), reverse=True), start=1):
        customer = users_by_id.get(item.get("user_id"), {})
        status_value = str(item.get("status") or "pending").replace("_", " ").title()
        priority = "High" if status_value in {"Pending", "Open"} else "Medium"
        created_at = item.get("created_at") or now_utc().isoformat()
        tickets.append({
            "id": item.get("id") or f"ticket-{index}",
            "ticket_number": f"TKT-{2040 + index}",
            "customer_name": customer.get("name") or item.get("contact") or "Customer",
            "subject": f"{item.get('service_type') or 'Service'} request",
            "priority": priority,
            "status": status_value,
            "created_at": created_at,
            "description": item.get("description") or "",
            "service_type": item.get("service_type") or "Service",
        })
    return tickets


@api_router.get("/admin/settings")
async def admin_settings(user: Dict[str, Any] = Depends(get_admin_user)):
    defaults = {
        "role_label": "Admin",
        "permissions": {
            "User Management": True,
            "Agent Management": True,
            "Customer Management": True,
            "Property Management": True,
            "Notification Center": True,
            "Audit Logs": True,
            "Support Queue": True,
            "Service Requests": True,
        },
        "notification_preferences": {
            "New Customer Registration": True,
            "New Agent Registration": True,
            "Site Visit Bookings": True,
            "Booking Confirmations": True,
            "Service Requests": True,
            "System Alerts": True,
        },
        "commission_defaults": {
            "enabled": True,
            "model": "percentage",
            "percentage": 2.0,
            "flat_amount": 0,
        },
    }
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Admin settings are unavailable")
        return defaults

    existing = await db.admin_settings.find_one({"key": "primary_admin_settings"}, {"_id": 0})
    if not existing:
        payload = {
            "key": "primary_admin_settings",
            **defaults,
            "updated_at": now_utc().isoformat(),
            "updated_by_user_id": user.get("id"),
        }
        await db.admin_settings.insert_one(payload.copy())
        payload.pop("_id", None)
        return payload
    return {
        **defaults,
        **existing,
        "permissions": {**defaults["permissions"], **(existing.get("permissions") or {})},
        "notification_preferences": {
            **defaults["notification_preferences"],
            **(existing.get("notification_preferences") or {}),
        },
        "commission_defaults": {
            **defaults["commission_defaults"],
            **(existing.get("commission_defaults") or {}),
        },
    }


@api_router.put("/admin/settings")
async def update_admin_settings(request: Request, user: Dict[str, Any] = Depends(get_admin_user)):
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid settings payload")

    settings_update = {
        "permissions": payload.get("permissions") or {},
        "notification_preferences": payload.get("notification_preferences") or {},
        "commission_defaults": payload.get("commission_defaults") or {},
        "updated_at": now_utc().isoformat(),
        "updated_by_user_id": user.get("id"),
    }
    if not await is_database_available():
        return {"success": True, **settings_update}

    await db.admin_settings.update_one(
        {"key": "primary_admin_settings"},
        {
            "$set": settings_update,
            "$setOnInsert": {"key": "primary_admin_settings"},
        },
        upsert=True,
    )
    updated = await admin_settings(user)
    await create_audit_log(
        actor_user_id=user["id"],
        action="admin.settings_updated",
        entity_type="admin_settings",
        entity_id="primary_admin_settings",
        metadata={"fields": sorted(settings_update.keys())},
    )
    return {"success": True, "settings": updated}


@api_router.post("/admin/bookings/{booking_id}/confirm")
async def admin_confirm_booking(booking_id: str, user: Dict[str, Any] = Depends(get_admin_user)):
    now_iso = now_utc().isoformat()
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Booking database is unavailable")
        booking = next((item for item in local_list_bookings() if item.get("id") == booking_id), None)
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        updated_booking = local_update_booking(
            booking_id,
            {
                "status": "reserved",
                "approval_status": "admin_approved",
                "confirmed_at": now_iso,
                "updated_at": now_iso,
                "reviewed_by_admin": user.get("name") or user.get("phone") or "Admin",
            },
        )
        local_save_plot_override(booking["plot_id"], {"status": "booked", "owner_id": booking["user_id"]})
        customer = local_find_user(user_id=booking.get("user_id")) or {"id": booking.get("user_id"), "name": booking.get("name"), "phone": booking.get("mobile"), "email": booking.get("customer_email")}
        if booking.get("user_id"):
            await create_notification(
                booking["user_id"],
                "Booking reserved",
                f"Your booking for {booking.get('plot_label') or booking.get('plot_number') or booking.get('property_name') or 'your selected unit'} is approved and reserved.",
                "booking",
            )
        await crm_sync_booking(
            booking=updated_booking or booking,
            customer=customer,
            actor_user_id=user["id"],
            source="admin_confirm",
        )
        await publish_live_update(
            "booking.updated",
            {"booking": updated_booking or booking, "scope": "admin_confirm"},
            user_ids=[booking.get("user_id"), booking.get("agent_id")],
            roles=["admin"],
        )
        return {"success": True, "booking": updated_booking}

    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    await db.bookings.update_one(
        {"id": booking_id},
        {
            "$set": {
                "status": "reserved",
                "approval_status": "admin_approved",
                "confirmed_at": now_iso,
                "updated_at": now_iso,
                "reviewed_by_admin": user.get("name") or user.get("phone") or "Admin",
            }
        }
    )
    await db.plots.update_one(
        {"id": booking["plot_id"]},
        {"$set": {"status": "booked", "owner_id": booking["user_id"]}}
    )
    customer = await db.users.find_one({"id": booking["user_id"]}, {"_id": 0}) or {"id": booking.get("user_id"), "name": booking.get("name"), "phone": booking.get("mobile"), "email": booking.get("customer_email")}
    refreshed_booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0}) or booking
    if booking.get("user_id"):
        await create_notification(
            booking["user_id"],
            "Booking reserved",
            f"Your booking for {booking.get('plot_label') or booking.get('plot_number') or booking.get('property_name') or 'your selected unit'} is approved and reserved.",
            "booking",
        )
    await crm_sync_booking(
        booking=refreshed_booking,
        customer=customer,
        actor_user_id=user["id"],
        source="admin_confirm",
    )
    await publish_live_update(
        "booking.updated",
        {"booking": refreshed_booking, "scope": "admin_confirm"},
        user_ids=[booking.get("user_id"), booking.get("agent_id")],
        roles=["admin"],
    )
    await create_audit_log(
        actor_user_id=user["id"],
        action="booking.confirmed",
        entity_type="booking",
        entity_id=booking_id,
        metadata={"plot_id": booking.get("plot_id"), "customer_id": booking.get("user_id")},
    )
    await publish_dashboard_metrics_update(user_ids=[booking.get("user_id"), booking.get("agent_id")], roles=["admin"])
    return {"success": True}


@api_router.post("/admin/bookings/{booking_id}/status")
async def admin_update_booking_status(
    booking_id: str,
    req: AgentBookingStatusReq,
    user: Dict[str, Any] = Depends(get_admin_user),
):
    status_value = normalize_booking_status_value(req.status)
    allowed_statuses = {"pending", "agent_approved", "admin_approved", "reserved", "completed", "rejected", "cancelled"}
    if status_value not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Invalid booking status")

    now_iso = now_utc().isoformat()
    saved_settings = await admin_settings(user)
    commission_defaults = saved_settings.get("commission_defaults") or {}
    plot_status = (
        "booked" if status_value in {"admin_approved", "reserved"}
        else "sold" if status_value == "completed"
        else "available" if status_value in {"cancelled", "rejected"}
        else None
    )

    def calculate_commission(sale_value: float) -> float:
        if not commission_defaults.get("enabled", True):
            return 0.0
        if str(commission_defaults.get("model") or "percentage").lower() == "flat":
            return float(commission_defaults.get("flat_amount") or 0)
        percentage = float(commission_defaults.get("percentage") or 2.0)
        return round(sale_value * percentage / 100, 2)

    def build_updates(existing_booking: Dict[str, Any], plot_doc: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        updates: Dict[str, Any] = {
            "status": status_value,
            "approval_status": (
                "admin_approved" if status_value in {"admin_approved", "reserved", "completed"}
                else "rejected" if status_value in {"rejected", "cancelled"}
                else existing_booking.get("approval_status") or "pending"
            ),
            "updated_at": now_iso,
            "reviewed_by_admin": user.get("name") or user.get("phone") or "Admin",
            "reviewed_at": now_iso,
            "review_notes": (req.review_notes or "").strip(),
        }
        if status_value in {"admin_approved", "reserved"}:
            updates["confirmed_at"] = existing_booking.get("confirmed_at") or now_iso
        if status_value == "completed":
            sale_value = float(existing_booking.get("booking_value") or existing_booking.get("total_amount") or existing_booking.get("sale_value") or (plot_doc or {}).get("price") or 0)
            updates["closed_at"] = existing_booking.get("closed_at") or now_iso
            updates["commission_amount"] = float(existing_booking.get("commission_amount") or calculate_commission(sale_value))
        return updates

    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Booking database is unavailable")
        booking = next((item for item in local_list_bookings() if item.get("id") == booking_id), None)
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        plot = local_get_plot(booking.get("plot_id")) if booking.get("plot_id") else None
        updates = build_updates(booking, plot)
        updated_booking = local_update_booking(booking_id, updates)
        if plot_status and booking.get("plot_id"):
            local_save_plot_override(booking["plot_id"], {"status": plot_status, "owner_id": booking.get("user_id") if plot_status in {"booked", "sold"} else None})
        if booking.get("user_id"):
            await create_notification(
                booking["user_id"],
                "Booking status updated",
                f"Your booking for {booking.get('plot_label') or booking.get('plot_number') or booking.get('property_name') or 'your selected unit'} is now {status_value.replace('_', ' ')}.",
                "booking",
            )
        await publish_live_update(
            "booking.updated",
            {"booking": updated_booking or {**booking, **updates}, "scope": "admin_status"},
            user_ids=[booking.get("user_id"), booking.get("agent_id"), booking.get("assigned_agent_id")],
            roles=["admin"],
        )
        await create_audit_log(
            actor_user_id=user["id"],
            action=f"booking.{status_value}",
            entity_type="booking",
            entity_id=booking_id,
            metadata={"plot_id": booking.get("plot_id"), "customer_id": booking.get("user_id")},
        )
        await publish_dashboard_metrics_update(user_ids=[booking.get("user_id"), booking.get("agent_id"), booking.get("assigned_agent_id")], roles=["admin"])
        return {"success": True, "booking": updated_booking}

    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    plot = await db.plots.find_one({"id": booking.get("plot_id")}, {"_id": 0}) if booking.get("plot_id") else None
    updates = build_updates(booking, plot)
    await db.bookings.update_one({"id": booking_id}, {"$set": updates})
    if plot_status and booking.get("plot_id"):
        plot_updates = {"status": plot_status}
        if plot_status in {"booked", "sold"}:
            plot_updates["owner_id"] = booking.get("user_id")
        else:
            plot_updates["owner_id"] = None
        await db.plots.update_one({"id": booking["plot_id"]}, {"$set": plot_updates})
    updated = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if booking.get("user_id"):
        await create_notification(
            booking["user_id"],
            "Booking status updated",
            f"Your booking for {booking.get('plot_label') or booking.get('plot_number') or booking.get('property_name') or 'your selected unit'} is now {status_value.replace('_', ' ')}.",
            "booking",
        )
    await publish_live_update(
        "booking.updated",
        {"booking": updated, "scope": "admin_status"},
        user_ids=[booking.get("user_id"), booking.get("agent_id"), booking.get("assigned_agent_id")],
        roles=["admin"],
    )
    await create_audit_log(
        actor_user_id=user["id"],
        action=f"booking.{status_value}",
        entity_type="booking",
        entity_id=booking_id,
        metadata={"plot_id": booking.get("plot_id"), "customer_id": booking.get("user_id")},
    )
    await publish_dashboard_metrics_update(user_ids=[booking.get("user_id"), booking.get("agent_id"), booking.get("assigned_agent_id")], roles=["admin"])
    return {"success": True, "booking": updated}


@api_router.get("/admin/agents")
async def admin_agents(user: Dict[str, Any] = Depends(get_admin_user)):
    if await is_database_available():
        await ensure_primary_agent_seed()
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Authentication database is unavailable")
        agents = [
            clean_user(agent)
            for agent in load_local_store().get("users", [])
            if is_agent_role(agent.get("role")) and not should_hide_demo_item(agent)
        ]
        agents.sort(key=lambda x: (x.get("approval_status") != "pending", x.get("name", "")))
        return agents

    agents = await db.users.find({"role": ROLE_AGENT}, {"_id": 0}).to_list(500)
    agents = [clean_user(agent) for agent in agents if not should_hide_demo_item(agent)]
    agents.sort(key=lambda x: (x.get("approval_status") != "pending", x.get("name", "")))
    return agents


@api_router.get("/admin/overview")
async def admin_overview(user: Dict[str, Any] = Depends(get_admin_user)):
    def normalized_visit_status(value: Optional[str]) -> str:
        return normalize_visit_status_value(value)

    def enrich_visits(
        visit_rows: List[Dict[str, Any]],
        property_rows: List[Dict[str, Any]],
        agent_rows: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        property_map = {item.get("id"): item for item in property_rows}
        agent_map = {item.get("id"): item for item in agent_rows}
        enriched: List[Dict[str, Any]] = []
        for visit in visit_rows:
            property_doc = property_map.get(visit.get("property_id"), {})
            agent_doc = agent_map.get(visit.get("assigned_agent_id"), {})
            enriched.append(normalize_live_visit_record({
                **visit,
                "property_name": live_property_name(visit.get("property_id"), visit.get("property_name") or property_doc.get("name")),
                "assigned_agent_name": visit.get("assigned_agent_name") or agent_doc.get("name"),
            }))
        enriched.sort(
            key=lambda item: ((item.get("visit_date") or ""), (item.get("visit_time") or ""), item.get("created_at") or ""),
            reverse=True,
        )
        return enriched

    def build_reminders(agent_rows: List[Dict[str, Any]], visit_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        reminders: List[Dict[str, Any]] = []
        pending = [agent for agent in agent_rows if str(agent.get("approval_status") or "pending").lower() == "pending"]
        pending_visit_requests = [visit for visit in visit_rows if normalized_visit_status(visit.get("status")) in {"agent_approved", "admin_approved"}]
        upcoming = [visit for visit in visit_rows if normalized_visit_status(visit.get("status")) in {"scheduled", "rescheduled"}]
        overdue = []
        today = now_utc().date()
        for visit in visit_rows:
            raw_date = str(visit.get("visit_date") or "").strip()
            if not raw_date:
                continue
            try:
                visit_day = datetime.fromisoformat(raw_date).date()
            except ValueError:
                continue
            if visit_day < today and normalized_visit_status(visit.get("status")) not in {"completed", "cancelled", "rejected"}:
                overdue.append(visit)

        if pending:
            pending_phones = ", ".join(agent.get("phone", "") for agent in pending[:3] if agent.get("phone"))
            reminders.append({
                "id": "pending-approvals",
                "type": "info",
                "title": f"{len(pending)} agent approval{'s' if len(pending) != 1 else ''} waiting",
                "body": (
                    f"Pending phone numbers: {pending_phones}."
                    if pending_phones
                    else "Approve or reject pending agent applications so phone access unlocks immediately after review."
                ),
            })
        if pending_visit_requests:
            reminders.append({
                "id": "pending-visit-requests",
                "type": "warning",
                "title": f"{len(pending_visit_requests)} visit request{'s' if len(pending_visit_requests) != 1 else ''} waiting for approval",
                "body": "Review agent-cleared customer visit requests so the customer flow can move from agent-approved to scheduled in real time.",
            })
        if upcoming:
            reminders.append({
                "id": "upcoming-visits",
                "type": "success",
                "title": f"{len(upcoming)} scheduled visit{'s' if len(upcoming) != 1 else ''} in queue",
                "body": "Confirmed and scheduled visits are refreshed here for live admin follow-up.",
            })
        if overdue:
            reminders.append({
                "id": "overdue-visits",
                "type": "warning",
                "title": f"{len(overdue)} visit{'s' if len(overdue) != 1 else ''} need attention",
                "body": "Some visit records are past their planned date and still need completion or rescheduling.",
            })
        return reminders

    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Admin overview is unavailable")
        users = load_local_store().get("users", [])
        agents = [clean_user(agent) for agent in users if is_agent_role(agent.get("role")) and not should_hide_demo_item(agent)]
        agents.sort(key=lambda x: (x.get("approval_status") != "pending", x.get("name", "")))
        visits = enrich_visits(
            filter_live_customer_items(local_list_visits()),
            [item for item in local_get_properties() if not should_hide_demo_item(item)],
            agents,
        )
        return {
            "generated_at": now_utc().isoformat(),
            "agents": agents,
            "visits": visits,
            "pending_visit_requests": [visit for visit in visits if is_actionable_visit_for_admin(visit)],
            "reminders": build_reminders(agents, visits),
        }

    agents = await db.users.find({"role": ROLE_AGENT}, {"_id": 0}).to_list(500)
    agents = [clean_user(agent) for agent in agents if not should_hide_demo_item(agent)]
    agents.sort(key=lambda x: (x.get("approval_status") != "pending", x.get("name", "")))
    visits = filter_live_customer_items(await db.visits.find({}, {"_id": 0}).to_list(500))
    properties = [item for item in await db.properties.find({}, {"_id": 0}).to_list(500) if not should_hide_demo_item(item)]
    enriched_visits = enrich_visits(visits, properties, agents)
    return {
        "generated_at": now_utc().isoformat(),
        "agents": agents,
        "visits": enriched_visits,
        "pending_visit_requests": [visit for visit in enriched_visits if is_actionable_visit_for_admin(visit)],
        "reminders": build_reminders(agents, enriched_visits),
    }


@api_router.post("/admin/agents/{agent_id}/status")
async def admin_update_agent_status(
    agent_id: str,
    req: AdminAgentApprovalReq,
    user: Dict[str, Any] = Depends(get_admin_user),
):
    allowed_statuses = {APPROVAL_PENDING, APPROVAL_APPROVED, APPROVAL_REJECTED, STATUS_SUSPENDED}
    approval_status = req.approval_status.strip().lower()
    if approval_status not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Invalid approval status")

    manager_name = user.get("name", "Admin")
    now_iso = now_utc().isoformat()
    updates: Dict[str, Any] = {
        "approval_status": approval_status,
        "review_notes": (req.review_notes or "").strip(),
        "reviewed_at": now_iso,
        "reviewed_by_admin": manager_name,
        "updated_at": now_iso,
    }
    if approval_status == APPROVAL_APPROVED:
        updates["approved_by_admin"] = manager_name
        updates["status"] = STATUS_ACTIVE
        updates["kyc_status"] = "verified"
    elif approval_status == STATUS_SUSPENDED:
        updates["status"] = STATUS_SUSPENDED
    else:
        updates["status"] = APPROVAL_PENDING
        updates["approved_by_admin"] = None

    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Authentication database is unavailable")
        agent = local_find_user(user_id=agent_id)
        if not agent or not is_agent_role(agent.get("role")):
            raise HTTPException(status_code=404, detail="Agent not found")
        if approval_status == APPROVAL_APPROVED:
            updates["phone_verified"] = True
            updates["email_verified"] = bool(agent.get("email"))
            updates["auth_methods"] = auth_methods_union(agent.get("auth_methods"), "phone")
        agent.update(updates)
        local_save_user(agent)
        await create_notification(
            agent["id"],
            "Agent access updated",
            (
                "Your agent application is approved. You can now continue with OTP login."
                if approval_status == APPROVAL_APPROVED
                else f"Your agent access status is now {approval_status}."
            ),
            "agent",
        )
        await create_audit_log(
            actor_user_id=user["id"],
            action=f"agent.{approval_status}",
            entity_type="user",
            entity_id=agent["id"],
            metadata={"phone": agent.get("phone")},
        )
        await publish_live_update(
            "agent.status_updated",
            {"agent": clean_user(agent), "approval_status": approval_status},
            user_ids=[agent["id"]],
            roles=["admin"],
        )
        await publish_dashboard_metrics_update(user_ids=[agent["id"]], roles=["admin"])
        if approval_status in {APPROVAL_PENDING, APPROVAL_REJECTED, STATUS_SUSPENDED}:
            await revoke_user_sessions_for_user(agent["id"], session_role="agent")
        return {"success": True, "agent": clean_user(agent)}

    agent = await db.users.find_one({"id": agent_id}, {"_id": 0})
    if not agent or not is_agent_role(agent.get("role")):
        raise HTTPException(status_code=404, detail="Agent not found")
    if approval_status == APPROVAL_APPROVED:
        updates["phone_verified"] = True
        updates["email_verified"] = bool(agent.get("email"))
        updates["auth_methods"] = auth_methods_union(agent.get("auth_methods"), "phone")
    await db.users.update_one({"id": agent_id}, {"$set": updates})
    updated = await db.users.find_one({"id": agent_id}, {"_id": 0})
    await create_notification(
        agent["id"],
        "Agent access updated",
        (
            "Your agent application is approved. You can now continue with OTP login."
            if approval_status == APPROVAL_APPROVED
            else f"Your agent access status is now {approval_status}."
        ),
        "agent",
    )
    await create_audit_log(
        actor_user_id=user["id"],
        action=f"agent.{approval_status}",
        entity_type="user",
        entity_id=agent["id"],
        metadata={"phone": agent.get("phone")},
    )
    await publish_live_update(
        "agent.status_updated",
        {"agent": clean_user(updated), "approval_status": approval_status},
        user_ids=[agent["id"]],
        roles=["admin"],
    )
    await publish_dashboard_metrics_update(user_ids=[agent["id"]], roles=["admin"])
    if approval_status in {APPROVAL_PENDING, APPROVAL_REJECTED, STATUS_SUSPENDED}:
        await revoke_user_sessions_for_user(agent["id"], session_role="agent")
    return {"success": True, "agent": clean_user(updated)}


@api_router.post("/admin/agents/{agent_id}/approve")
async def admin_approve_agent(agent_id: str, user: Dict[str, Any] = Depends(get_admin_user)):
    return await admin_update_agent_status(
        agent_id,
        AdminAgentApprovalReq(approval_status="approved"),
        user,
    )


@api_router.post("/admin/visits/{visit_id}/status")
async def admin_update_visit_status(
    visit_id: str,
    req: AdminVisitStatusReq,
    user: Dict[str, Any] = Depends(get_admin_user),
):
    allowed_statuses = {
        "pending_agent_approval",
        "agent_approved",
        "admin_approved",
        "scheduled",
        "assigned",
        "completed",
        "cancelled",
        "rejected",
        "rescheduled",
    }
    next_status = None
    if req.status is not None:
        next_status = normalize_visit_status_value(req.status)
        if next_status == "confirmed":
            next_status = "scheduled"
        if next_status not in allowed_statuses:
            raise HTTPException(status_code=400, detail="Invalid visit status")

    now_iso = now_utc().isoformat()
    updates = {
        "review_notes": (req.review_notes or "").strip(),
        "reviewed_at": now_iso,
        "reviewed_by_admin": user.get("name") or user.get("phone") or "Admin",
        "updated_at": now_iso,
    }
    if next_status is not None:
        updates["status"] = next_status
        updates["approval_status"] = (
            "admin_approved" if next_status in {"admin_approved", "assigned", "scheduled", "completed"}
            else "rejected" if next_status in {"cancelled", "rejected"}
            else "agent_approved" if next_status == "agent_approved"
            else "pending"
        )
    if req.assigned_agent_id:
        if not await is_database_available() and not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Visit database is unavailable")
        assigned_agent = (
            local_find_user(user_id=req.assigned_agent_id)
            if not await is_database_available()
            else await db.users.find_one({"id": req.assigned_agent_id, "role": ROLE_AGENT}, {"_id": 0})
        )
        if not assigned_agent:
            raise HTTPException(status_code=404, detail="Assigned agent not found")
        updates["assigned_agent_id"] = req.assigned_agent_id
        updates["assigned_agent_name"] = assigned_agent.get("name")
        updates["assigned_agent_phone"] = assigned_agent.get("phone")
        if "status" not in updates:
            updates["status"] = "assigned"
            updates["approval_status"] = "admin_approved"
    if req.visit_date:
        updates["visit_date"] = req.visit_date
    if req.visit_time:
        updates["visit_time"] = req.visit_time

    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Visit database is unavailable")
        visit = next((item for item in local_list_visits() if item.get("id") == visit_id), None)
        if not visit:
            raise HTTPException(status_code=404, detail="Visit not found")
        updated = local_update_visit(visit_id, updates)
        if not updated:
            raise HTTPException(status_code=404, detail="Visit not found")
        if updated and updated.get("user_id"):
            await create_notification(
                updated["user_id"],
                "Visit status updated",
                f"Your visit request for {updated.get('property_name') or updated.get('centre_name') or 'the selected location'} is now {updated.get('status')}.",
                "visit",
            )
        await publish_live_update(
            "visit.updated",
            {"visit": normalize_live_visit_record(updated), "scope": "admin_review"},
            user_ids=[updated.get("user_id"), updated.get("assigned_agent_id")],
            roles=["admin"],
        )
        await create_audit_log(
            actor_user_id=user["id"],
            action=f"visit.{updated.get('status') or 'updated'}",
            entity_type="visit",
            entity_id=visit_id,
            metadata={"user_id": updated.get("user_id"), "assigned_agent_id": updated.get("assigned_agent_id")},
        )
        await publish_dashboard_metrics_update(user_ids=[updated.get("user_id"), updated.get("assigned_agent_id")], roles=["admin"])
        return {"success": True, "visit": normalize_live_visit_record(updated)}

    existing = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Visit not found")

    await db.visits.update_one({"id": visit_id}, {"$set": updates})
    updated = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if updated and updated.get("user_id"):
        await create_notification(
            updated["user_id"],
            "Visit status updated",
            f"Your visit request for {updated.get('property_name') or updated.get('centre_name') or 'the selected location'} is now {updated.get('status')}.",
            "visit",
        )
    if updated:
        await publish_live_update(
            "visit.updated",
            {"visit": normalize_live_visit_record(updated), "scope": "admin_review"},
            user_ids=[updated.get("user_id"), updated.get("assigned_agent_id")],
            roles=["admin"],
        )
        await create_audit_log(
            actor_user_id=user["id"],
            action=f"visit.{updated.get('status') or 'updated'}",
            entity_type="visit",
            entity_id=visit_id,
            metadata={"user_id": updated.get("user_id"), "assigned_agent_id": updated.get("assigned_agent_id")},
        )
        await publish_dashboard_metrics_update(user_ids=[updated.get("user_id"), updated.get("assigned_agent_id")], roles=["admin"])
    return {"success": True, "visit": normalize_live_visit_record(updated)}


@api_router.get("/admin/service-requests")
async def admin_services(user: Dict[str, Any] = Depends(get_admin_user)):
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Service request database is unavailable")
        return []
    items = await db.service_requests.find({}, {"_id": 0}).to_list(500)
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return items


@api_router.get("/agent/dashboard")
async def agent_dashboard(user: Dict[str, Any] = Depends(get_agent_user)):
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Agent dashboard data is unavailable")
        return build_local_agent_dashboard(user)

    try:
        accessible_agent_ids = set(agent_accessible_ids(user))
        logger.info("Agent dashboard loading for user_id=%s, phone=%s", user.get("id"), user.get("phone"))

        plot_filters = [
            {"agent_id": {"$in": list(accessible_agent_ids)}},
            {"assigned_agent_id": {"$in": list(accessible_agent_ids)}},
        ]
        if is_primary_agent_user(user):
            plot_filters.extend([
                {"agent_id": {"$exists": False}},
                {"agent_id": None},
                {"agent_id": ""},
            ])
        plots = await db.plots.find({"$or": plot_filters}, {"_id": 0}).to_list(500)
        plots = [plot for plot in plots if agent_can_access_plot(user, plot)]
        logger.info("Agent dashboard: found %d plots", len(plots))
        property_ids = sorted({plot["property_id"] for plot in plots if plot.get("property_id")})
        properties = await db.properties.find({"id": {"$in": property_ids}}, {"_id": 0}).to_list(200)
        property_map = {prop["id"]: normalize_live_property_record(prop) for prop in properties}

        assets = []
        for plot in plots:
            property_doc = property_map.get(plot["property_id"], {})
            assets.append(normalize_plot_record(plot, property_doc))

        asset_map = {asset["id"]: asset for asset in assets}
        asset_plot_ids = set(asset_map)
        bookings_raw = await db.bookings.find(
            {
                "$or": [
                    {"agent_id": {"$in": list(accessible_agent_ids)}},
                    {"assigned_agent_id": {"$in": list(accessible_agent_ids)}},
                    {"created_by_agent_id": {"$in": list(accessible_agent_ids)}},
                    {"plot_id": {"$in": list(asset_plot_ids)}},
                ]
            },
            {"_id": 0},
        ).to_list(300)
        logger.info("Agent dashboard: found %d total bookings in DB", len(bookings_raw))
        user_ids = sorted({booking["user_id"] for booking in bookings_raw if booking.get("user_id")})
        customer_docs = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0}).to_list(300)
        customer_map = {customer["id"]: customer for customer in customer_docs}

        bookings = []
        closed_sales = 0
        commission_total = 0.0
        for booking in bookings_raw:
            asset = asset_map.get(booking.get("plot_id", ""), {})
            if not agent_can_access_booking(user, booking, asset):
                continue
            normalized_booking = enrich_booking_record(
                booking,
                property_doc=property_map.get(booking.get("property_id")),
                plot_doc=asset,
                customer_doc=customer_map.get(booking.get("user_id")),
                agent_doc=user,
            )
            bookings.append(normalized_booking)
            if normalized_booking.get("status") == "completed":
                closed_sales += 1
                commission_total += float(normalized_booking.get("commission_amount") or 0)

        bookings.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        assets.sort(key=lambda x: (x.get("status") != "available", x.get("plot_number", "")))
        crm_dashboard = await crm_build_agent_dashboard(user)
        visits_raw = await db.visits.find(
            {
                "$or": [
                    {"assigned_agent_id": {"$in": list(accessible_agent_ids)}},
                    {"created_by_agent_id": {"$in": list(accessible_agent_ids)}},
                    {"agent_id": {"$in": list(accessible_agent_ids)}},
                    {"plot_id": {"$in": list(asset_plot_ids)}},
                    *(
                        [
                            {"assigned_agent_id": {"$exists": False}},
                            {"assigned_agent_id": None},
                            {"assigned_agent_id": ""},
                        ]
                        if is_primary_agent_user(user)
                        else []
                    ),
                ]
            },
            {"_id": 0},
        ).to_list(300)
        visits = []
        for visit in filter_live_customer_items(visits_raw):
            asset = asset_map.get(visit.get("plot_id") or "")
            if not agent_can_access_visit(user, visit, asset):
                continue
            visits.append(enrich_visit_record(
                visit,
                property_doc=property_map.get(visit.get("property_id")),
                plot_doc=asset,
                customer_doc=None,
                agent_doc=user,
            ))
        visits.sort(key=lambda x: ((x.get("visit_date") or ""), (x.get("visit_time") or ""), x.get("created_at", "")), reverse=True)
        notifications_count = await db.notifications.count_documents({"user_id": user["id"], "read": False})
        active_deals = len([item for item in crm_dashboard.get("opportunities", []) if item.get("stage") not in CRM_CLOSED_STAGES])
        logger.info("Agent dashboard: assets=%d bookings=%d visits=%d leads=%d", len(assets), len(bookings), len(visits), len(crm_dashboard.get("leads", [])))
        profile = await resolve_agent_profile_identity(user)

        return {
            "profile": profile,
            "sub_agents": [],
            "kpis": {
                "assets": len(assets),
                "bookings": len(bookings),
                "visits": len(visits),
                "leads": len(crm_dashboard.get("leads", [])),
                "active_deals": active_deals,
                "closed_sales": closed_sales,
                "commission_earned": round(commission_total, 2),
                "unread_notifications": notifications_count,
            },
            "last_synced_at": now_utc().isoformat(),
            "assets": assets,
            "bookings": bookings,
            "visits": visits,
            "leads": crm_dashboard.get("leads", []),
            "opportunities": crm_dashboard.get("opportunities", []),
            "tasks": crm_dashboard.get("tasks", []),
            "activities": crm_dashboard.get("activities", []),
            "metrics": {
                **(crm_dashboard.get("metrics") or {}),
                "lead_count": len(crm_dashboard.get("leads", [])),
                "active_deals": active_deals,
            },
            "stage_counts": crm_dashboard.get("stage_counts", {}),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Agent dashboard crashed for user_id=%s", user.get("id"))
        raise HTTPException(status_code=500, detail=f"Dashboard error: {exc}")


@api_router.get("/debug/db-health")
async def debug_db_health(user: Dict[str, Any] = Depends(get_admin_user)):
    """Admin-only endpoint to check if DB is connected and has data."""
    if not await is_database_available():
        return {"db_available": False, "message": "Database is not connected"}
    try:
        counts = {
            "plots": await db.plots.count_documents({}),
            "properties": await db.properties.count_documents({}),
            "bookings": await db.bookings.count_documents({}),
            "visits": await db.visits.count_documents({}),
            "leads": await db.leads.count_documents({}),
            "users": await db.users.count_documents({}),
            "notifications": await db.notifications.count_documents({}),
        }
        return {"db_available": True, "checked_by": user.get("id"), "counts": counts}
    except Exception as exc:
        return {"db_available": False, "message": f"DB error: {exc}"}


@api_router.post("/agent/bookings")
async def agent_create_booking(req: AgentBookingCreateReq, user: Dict[str, Any] = Depends(get_agent_user)):
    allowed_statuses = {"available", "reserved"}
    initial_status = "agent_approved"
    if not await is_database_available():
        plot = local_get_plot(req.plot_id)
        if not plot:
            raise HTTPException(status_code=404, detail="Plot not found")
        if not agent_can_access_plot(user, plot):
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
            "approval_status": "agent_approved",
            "visit_date": req.visit_date,
            "visit_time": req.visit_time,
            "notes": req.notes,
            "created_by_agent_id": user["id"],
            "created_at": now_utc().isoformat(),
            "updated_at": now_utc().isoformat(),
            "reviewed_by_agent": user.get("name") or user.get("phone") or "Agent",
        }
        local_save_booking(booking)
        local_save_plot_override(req.plot_id, {"status": "reserved"})
        await create_notification(
            customer["id"],
            "Booking approved by agent",
            f"Your booking request for {plot.get('plot_number') or 'the selected unit'} was approved by the agent and is now awaiting admin review.",
            "booking",
        )
        await crm_sync_booking(
            booking=booking,
            customer=customer,
            actor_user_id=user["id"],
            source="agent_booking",
        )
        await publish_live_update(
            "booking.created",
            {"booking": booking, "scope": "agent_booking"},
            user_ids=[customer["id"], booking.get("agent_id")],
            roles=["admin"],
        )
        return {"success": True, "booking": booking}

    plot = await db.plots.find_one({"id": req.plot_id}, {"_id": 0})
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
    if not agent_can_access_plot(user, plot):
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
        "approval_status": "agent_approved",
        "visit_date": req.visit_date,
        "visit_time": req.visit_time,
        "notes": req.notes,
        "created_by_agent_id": user["id"],
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
        "reviewed_by_agent": user.get("name") or user.get("phone") or "Agent",
    }
    await db.bookings.insert_one(booking.copy())
    await db.plots.update_one({"id": req.plot_id}, {"$set": {"status": "reserved"}})
    await create_notification(
        customer["id"],
        "Booking approved by agent",
        f"Your booking request for {plot.get('plot_number') or 'the selected unit'} was approved by the agent and is now awaiting admin review.",
        "booking",
    )
    await crm_sync_booking(
        booking=booking,
        customer=customer,
        actor_user_id=user["id"],
        source="agent_booking",
    )
    await publish_live_update(
        "booking.created",
        {"booking": booking, "scope": "agent_booking"},
        user_ids=[customer["id"], booking.get("agent_id")],
        roles=["admin"],
    )
    return {"success": True, "booking": booking}

@api_router.put("/agent/bookings/{booking_id}/status")
async def agent_update_booking_status(booking_id: str, req: AgentBookingStatusReq, user: Dict[str, Any] = Depends(get_agent_user)):
    allowed_statuses = {"pending", "agent_approved", "rejected", "cancelled"}
    status_value = normalize_booking_status_value(req.status)
    if status_value not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Partners can create, approve, reject, or cancel bookings. Final sale closing is handled by Admin.")
    updates = {"status": status_value, "updated_at": now_utc().isoformat(), "review_notes": (req.review_notes or "").strip()}
    if status_value in {"agent_approved", "admin_approved"}:
        updates["approval_status"] = status_value
        updates["reviewed_by_agent"] = user.get("name") or user.get("phone") or "Agent"
    elif status_value in {"rejected", "cancelled"}:
        updates["approval_status"] = "rejected"
        updates["reviewed_by_agent"] = user.get("name") or user.get("phone") or "Agent"

    if not await is_database_available():
        booking = next((item for item in local_list_bookings() if item.get("id") == booking_id), None)
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        plot = local_get_plot(booking.get("plot_id")) if booking.get("plot_id") else None
        if not agent_can_access_booking(user, booking, plot):
            raise HTTPException(status_code=403, detail="You do not have access to this booking")
        updated_booking = local_update_booking(booking_id, updates)
        if status_value in {"cancelled", "rejected"}:
            local_save_plot_override(booking["plot_id"], {"status": "available", "owner_id": None})
        customer = local_find_user(user_id=booking.get("user_id")) or {"id": booking.get("user_id"), "name": booking.get("name"), "phone": booking.get("mobile"), "email": booking.get("customer_email")}
        if booking.get("user_id"):
            customer_message = {
                "agent_approved": "Your booking request was approved by the agent and is waiting for admin review.",
                "rejected": "Your booking request was rejected by the agent.",
                "cancelled": "Your booking request was cancelled.",
            }.get(status_value)
            if customer_message:
                await create_notification(booking["user_id"], "Booking status updated", customer_message, "booking")
        await crm_sync_booking(
            booking=updated_booking or booking,
            customer=customer,
            actor_user_id=user["id"],
            source="agent_booking",
        )
        await publish_live_update(
            "booking.updated",
            {"booking": updated_booking or booking, "scope": "agent_status"},
            user_ids=[booking.get("user_id"), booking.get("agent_id")],
            roles=["admin"],
        )
        return {"success": True, "booking": updated_booking}

    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    plot = await db.plots.find_one({"id": booking.get("plot_id")}, {"_id": 0}) if booking.get("plot_id") else None
    if not agent_can_access_booking(user, booking, plot):
        raise HTTPException(status_code=403, detail="You do not have access to this booking")
    await db.bookings.update_one({"id": booking_id}, {"$set": updates})
    if status_value in {"cancelled", "rejected"}:
        await db.plots.update_one({"id": booking["plot_id"]}, {"$set": {"status": "available"}, "$unset": {"owner_id": ""}})
    updated = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    customer = await db.users.find_one({"id": booking["user_id"]}, {"_id": 0}) or {"id": booking.get("user_id"), "name": booking.get("name"), "phone": booking.get("mobile"), "email": booking.get("customer_email")}
    if booking.get("user_id"):
        customer_message = {
            "agent_approved": "Your booking request was approved by the agent and is waiting for admin review.",
            "rejected": "Your booking request was rejected by the agent.",
            "cancelled": "Your booking request was cancelled.",
        }.get(status_value)
        if customer_message:
            await create_notification(booking["user_id"], "Booking status updated", customer_message, "booking")
    await crm_sync_booking(
        booking=updated or booking,
        customer=customer,
        actor_user_id=user["id"],
        source="agent_booking",
    )
    await publish_live_update(
        "booking.updated",
        {"booking": updated or booking, "scope": "agent_status"},
        user_ids=[booking.get("user_id"), booking.get("agent_id")],
        roles=["admin"],
    )
    return {"success": True, "booking": updated}

@api_router.post("/agent/agents")
async def agent_create_sub_agent(req: AgentUpsertReq, user: Dict[str, Any] = Depends(get_agent_user)):
    raise HTTPException(status_code=410, detail="Sub-agent management is disabled in the current production phase.")

@api_router.put("/agent/agents/{agent_id}")
async def agent_update_sub_agent(agent_id: str, req: AgentUpsertReq, user: Dict[str, Any] = Depends(get_agent_user)):
    raise HTTPException(status_code=410, detail="Sub-agent management is disabled in the current production phase.")

@api_router.put("/agent/agents/{agent_id}/status")
async def agent_update_sub_agent_status(agent_id: str, req: AgentStatusReq, user: Dict[str, Any] = Depends(get_agent_user)):
    raise HTTPException(status_code=410, detail="Sub-agent management is disabled in the current production phase.")

@api_router.post("/agent/agents/{agent_id}/assign")
async def agent_assign_properties(agent_id: str, req: AgentAssignReq, user: Dict[str, Any] = Depends(get_agent_user)):
    raise HTTPException(status_code=410, detail="Sub-agent management is disabled in the current production phase.")

@api_router.get("/agent/site-visits")
async def agent_site_visits(user: Dict[str, Any] = Depends(get_agent_user)):
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Visit database is unavailable")
        visits = [
            visit for visit in local_list_visits()
            if agent_can_access_visit(user, visit, local_get_plot(visit.get("plot_id")) if visit.get("plot_id") else None)
        ]
        return [normalize_live_visit_record(item) for item in filter_live_customer_items(visits)]
    accessible_agent_ids = agent_accessible_ids(user)
    plot_filters = [
        {"agent_id": {"$in": accessible_agent_ids}},
        {"assigned_agent_id": {"$in": accessible_agent_ids}},
    ]
    if is_primary_agent_user(user):
        plot_filters.extend([
            {"agent_id": {"$exists": False}},
            {"agent_id": None},
            {"agent_id": ""},
        ])
    assigned_plots = await db.plots.find({"$or": plot_filters}, {"_id": 0}).to_list(500)
    assigned_plots = [plot for plot in assigned_plots if agent_can_access_plot(user, plot)]
    asset_map = {plot.get("id"): plot for plot in assigned_plots if plot.get("id")}
    visits = await db.visits.find(
        {
            "$or": [
                {"assigned_agent_id": {"$in": accessible_agent_ids}},
                {"created_by_agent_id": {"$in": accessible_agent_ids}},
                {"agent_id": {"$in": accessible_agent_ids}},
                {"plot_id": {"$in": list(asset_map)}},
                *(
                    [
                        {"assigned_agent_id": {"$exists": False}},
                        {"assigned_agent_id": None},
                        {"assigned_agent_id": ""},
                    ]
                    if is_primary_agent_user(user)
                    else []
                ),
            ]
        },
        {"_id": 0},
    ).to_list(300)
    return [
        normalize_live_visit_record(item)
        for item in filter_live_customer_items(visits)
        if agent_can_access_visit(user, item, asset_map.get(item.get("plot_id")))
    ]

@api_router.post("/agent/site-visits")
async def agent_create_site_visit(req: AgentVisitReq, user: Dict[str, Any] = Depends(get_agent_user)):
    assigned_agent_id = req.assigned_agent_id or user["id"]
    if assigned_agent_id not in agent_accessible_ids(user):
        raise HTTPException(status_code=403, detail="You cannot assign this visit to that agent")
    if req.plot_id:
        plot = local_get_plot(req.plot_id) if not await is_database_available() else await db.plots.find_one({"id": req.plot_id}, {"_id": 0})
        if not plot:
            raise HTTPException(status_code=404, detail="Plot not found")
        if not agent_can_access_plot(user, plot):
            raise HTTPException(status_code=403, detail="You do not have access to this asset")
    else:
        if not await is_database_available():
            has_property_access = any(agent_can_access_plot(user, plot) for plot in local_get_plots(req.property_id))
        else:
            has_property_access = await db.plots.count_documents({"property_id": req.property_id, "agent_id": {"$in": agent_accessible_ids(user)}}) > 0
        if not has_property_access:
            raise HTTPException(status_code=403, detail="You do not have access to this property")
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
        "status": "scheduled",
        "approval_status": "admin_approved",
        "reviewed_by_agent": user.get("name") or user.get("phone") or "Agent",
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Visit database is unavailable")
        local_save_visit(visit)
        await crm_sync_site_visit(
            visit=visit,
            customer={"id": req.customer_id, "name": req.customer_name, "phone": req.customer_phone, "email": req.customer_email},
            actor_user_id=user["id"],
        )
        await publish_live_update(
            "visit.created",
            {"visit": visit, "scope": "agent_created_visit"},
            user_ids=[req.customer_id, assigned_agent_id] if req.customer_id else [assigned_agent_id],
            roles=["admin"],
        )
        return {"success": True, "visit": visit}
    await db.visits.insert_one(visit.copy())
    await crm_sync_site_visit(
        visit=visit,
        customer={"id": req.customer_id, "name": req.customer_name, "phone": req.customer_phone, "email": req.customer_email},
        actor_user_id=user["id"],
    )
    await publish_live_update(
        "visit.created",
        {"visit": visit, "scope": "agent_created_visit"},
        user_ids=[req.customer_id, assigned_agent_id] if req.customer_id else [assigned_agent_id],
        roles=["admin"],
    )
    return {"success": True, "visit": visit}

@api_router.put("/agent/site-visits/{visit_id}")
async def agent_update_site_visit(visit_id: str, req: AgentVisitUpdateReq, user: Dict[str, Any] = Depends(get_agent_user)):
    allowed_statuses = VISIT_STATUSES_FOR_AGENT | {"pending", "confirmed", "upcoming"}
    updates = req.model_dump(exclude_none=True)
    if "status" in updates:
        updates["status"] = normalize_visit_status_value(updates["status"])
        if updates["status"] == "confirmed":
            updates["status"] = "agent_approved"
        if updates["status"] not in allowed_statuses:
            raise HTTPException(status_code=400, detail="Invalid visit status")
        if updates["status"] in {"agent_approved", "rejected", "cancelled", "rescheduled", "completed"}:
            updates["reviewed_by_agent"] = user.get("name") or user.get("phone") or "Agent"
        if updates["status"] == "agent_approved":
            updates["approval_status"] = "agent_approved"
        elif updates["status"] in {"rejected", "cancelled"}:
            updates["approval_status"] = "rejected"
        elif updates["status"] in {"scheduled", "completed"}:
            updates["approval_status"] = "admin_approved"
    if updates.get("assigned_agent_id") and updates["assigned_agent_id"] not in agent_accessible_ids(user):
        raise HTTPException(status_code=403, detail="You cannot assign this visit to that agent")
    updates["updated_at"] = now_utc().isoformat()
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Visit database is unavailable")
        visit = next((item for item in local_list_visits() if item.get("id") == visit_id), None)
        if not visit:
            raise HTTPException(status_code=404, detail="Visit not found")
        if not agent_can_access_visit(user, visit, local_get_plot(visit.get("plot_id")) if visit.get("plot_id") else None):
            raise HTTPException(status_code=403, detail="You do not have access to this visit")
        updated = local_update_visit(visit_id, updates)
        if updated:
            if updated.get("user_id"):
                customer_message = {
                    "agent_approved": "Your site visit was approved by the agent and is now waiting for admin confirmation.",
                    "rescheduled": "Your site visit was rescheduled by the agent.",
                    "completed": "Your site visit is marked as completed.",
                    "rejected": "Your site visit request was rejected by the agent.",
                    "cancelled": "Your site visit request was cancelled.",
                }.get(str(updated.get("status") or "").lower())
                if customer_message:
                    await create_notification(updated["user_id"], "Visit status updated", customer_message, "visit")
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
            await publish_live_update(
                "visit.updated",
                {"visit": updated, "scope": "agent_review"},
                user_ids=[updated.get("user_id"), updated.get("assigned_agent_id")],
                roles=["admin"],
            )
        return {"success": True, "visit": updated}
    visit = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")
    plot = await db.plots.find_one({"id": visit.get("plot_id")}, {"_id": 0}) if visit.get("plot_id") else None
    if not agent_can_access_visit(user, visit, plot):
        raise HTTPException(status_code=403, detail="You do not have access to this visit")
    await db.visits.update_one({"id": visit_id}, {"$set": updates})
    updated = await db.visits.find_one({"id": visit_id}, {"_id": 0})
    if updated:
        if updated.get("user_id"):
            customer_message = {
                "agent_approved": "Your site visit was approved by the agent and is now waiting for admin confirmation.",
                "rescheduled": "Your site visit was rescheduled by the agent.",
                "completed": "Your site visit is marked as completed.",
                "rejected": "Your site visit request was rejected by the agent.",
                "cancelled": "Your site visit request was cancelled.",
            }.get(str(updated.get("status") or "").lower())
            if customer_message:
                await create_notification(updated["user_id"], "Visit status updated", customer_message, "visit")
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
        await publish_live_update(
            "visit.updated",
            {"visit": updated, "scope": "agent_review"},
            user_ids=[updated.get("user_id"), updated.get("assigned_agent_id")],
            roles=["admin"],
        )
    return {"success": True, "visit": updated}


@api_router.post("/agent/bookings/{booking_id}/close")
async def agent_close_booking(booking_id: str, user: Dict[str, Any] = Depends(get_agent_user)):
    raise HTTPException(status_code=403, detail="Final sale closing is handled by Admin.")
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Booking database is unavailable")
        booking = next((item for item in local_list_bookings() if item.get("id") == booking_id), None)
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        plot = local_get_plot(booking.get("plot_id")) if booking.get("plot_id") else None
        if not agent_can_access_booking(user, booking, plot):
            raise HTTPException(status_code=403, detail="You do not have access to this booking")
        updated_booking = local_update_booking(booking_id, {"status": "completed", "approval_status": "admin_approved", "closed_at": now_utc().isoformat(), "updated_at": now_utc().isoformat()})
        local_save_plot_override(booking["plot_id"], {"status": "booked", "owner_id": booking["user_id"]})
        customer = local_find_user(user_id=booking.get("user_id")) or {"id": booking.get("user_id"), "name": booking.get("name"), "phone": booking.get("mobile"), "email": booking.get("customer_email")}
        if booking.get("user_id"):
            await create_notification(booking["user_id"], "Booking completed", "Your booking journey is now marked as completed.", "booking")
        await crm_sync_booking(
            booking=updated_booking or booking,
            customer=customer,
            actor_user_id=user["id"],
            source="agent_booking",
        )
        await publish_live_update(
            "booking.updated",
            {"booking": updated_booking or booking, "scope": "agent_close"},
            user_ids=[booking.get("user_id"), booking.get("agent_id")],
            roles=["admin"],
        )
        return {"success": True, "status": "completed", "booking": updated_booking}

    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    plot = await db.plots.find_one({"id": booking.get("plot_id")}, {"_id": 0}) if booking.get("plot_id") else None
    if not agent_can_access_booking(user, booking, plot):
        raise HTTPException(status_code=403, detail="You do not have access to this booking")

    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": "completed", "approval_status": "admin_approved", "closed_at": now_utc().isoformat(), "updated_at": now_utc().isoformat()}}
    )
    await db.plots.update_one(
        {"id": booking["plot_id"]},
        {"$set": {"status": "booked", "owner_id": booking["user_id"]}}
    )
    customer = await db.users.find_one({"id": booking["user_id"]}, {"_id": 0}) or {"id": booking.get("user_id"), "name": booking.get("name"), "phone": booking.get("mobile"), "email": booking.get("customer_email")}
    refreshed_booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0}) or booking
    if booking.get("user_id"):
        await create_notification(booking["user_id"], "Booking completed", "Your booking journey is now marked as completed.", "booking")
    await crm_sync_booking(
        booking=refreshed_booking,
        customer=customer,
        actor_user_id=user["id"],
        source="agent_booking",
    )
    await publish_live_update(
        "booking.updated",
        {"booking": refreshed_booking, "scope": "agent_close"},
        user_ids=[booking.get("user_id"), booking.get("agent_id")],
        roles=["admin"],
    )
    await publish_dashboard_metrics_update(user_ids=[booking.get("user_id"), booking.get("agent_id")], roles=["admin"])
    return {"success": True, "status": "completed", "booking": refreshed_booking}


@api_router.post("/admin/service-requests/{req_id}/status")
async def admin_update_service_status(req_id: str, status_val: str = Query(...), user: Dict[str, Any] = Depends(get_admin_user)):
    if status_val not in ("pending", "in_progress", "completed"):
        raise HTTPException(status_code=400, detail="Invalid status")
    if not await is_database_available():
        if not ALLOW_LOCAL_AUTH_FALLBACK:
            raise HTTPException(status_code=503, detail="Service request database is unavailable")
        existing = local_get_collection_item("service_requests", req_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Service request not found")
        updated = {
            **existing,
            "status": status_val,
            "updated_at": now_utc().isoformat(),
            "reviewed_by_admin": user.get("name") or user.get("phone") or "Admin",
        }
        local_upsert_collection_item("service_requests", updated)
        if existing.get("user_id"):
            await create_notification(
                existing["user_id"],
                "Service request updated",
                f"Your {existing.get('service_type') or 'service'} request is now {status_val.replace('_', ' ')}.",
                "service",
            )
        await create_audit_log(
            actor_user_id=user["id"],
            action=f"service_request.{status_val}",
            entity_type="service_request",
            entity_id=req_id,
            metadata={"user_id": existing.get("user_id")},
        )
        await publish_live_update(
            "service_request.updated",
            {"request": updated},
            user_ids=[existing.get("user_id")] if existing.get("user_id") else None,
            roles=["admin"],
        )
        await publish_dashboard_metrics_update(user_ids=[existing.get("user_id")] if existing.get("user_id") else None, roles=["admin"])
        return {"success": True, "request": updated}
    await db.service_requests.update_one(
        {"id": req_id},
        {"$set": {"status": status_val, "updated_at": now_utc().isoformat(), "reviewed_by_admin": user.get("name") or user.get("phone") or "Admin"}},
    )
    updated = await db.service_requests.find_one({"id": req_id}, {"_id": 0})
    if updated and updated.get("user_id"):
        await create_notification(
            updated["user_id"],
            "Service request updated",
            f"Your {updated.get('service_type') or 'service'} request is now {status_val.replace('_', ' ')}.",
            "service",
        )
    await create_audit_log(
        actor_user_id=user["id"],
        action=f"service_request.{status_val}",
        entity_type="service_request",
        entity_id=req_id,
        metadata={"user_id": updated.get("user_id") if updated else None},
    )
    await publish_live_update(
        "service_request.updated",
        {"request": updated},
        user_ids=[updated.get("user_id")] if updated and updated.get("user_id") else None,
        roles=["admin"],
    )
    await publish_dashboard_metrics_update(user_ids=[updated.get("user_id")] if updated and updated.get("user_id") else None, roles=["admin"])
    return {"success": True, "request": updated}


@api_router.post("/admin/properties")
async def admin_create_property(req: AdminPropertyReq, user: Dict[str, Any] = Depends(get_admin_user)):
    await require_database("Property database is unavailable")
    now_iso = now_utc().isoformat()
    prop = {
        "id": str(uuid.uuid4()),
        **req.model_dump(),
        "images": [req.image],
        "featured": False,
        "availability": req.availability or "Available",
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    prop["property_code"] = req.property_code or property_code_for_record(prop)
    await db.properties.insert_one(prop.copy())
    saved = normalize_live_property_record(prop)
    await create_audit_log(
        actor_user_id=user["id"],
        action="property.created",
        entity_type="property",
        entity_id=saved["id"],
        metadata={"property_code": saved.get("property_code")},
    )
    await publish_live_update("property.updated", {"property": saved, "scope": "admin_create"}, roles=["admin", "agent", "customer"])
    await publish_dashboard_metrics_update(roles=["admin"])
    return saved


@api_router.put("/admin/properties/{property_id}")
async def admin_update_property(property_id: str, req: AdminPropertyReq, user: Dict[str, Any] = Depends(get_admin_user)):
    await require_database("Property database is unavailable")
    existing = await db.properties.find_one({"id": property_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Property not found")
    updates = {
        **req.model_dump(),
        "images": [req.image],
        "availability": req.availability or existing.get("availability") or "Available",
        "updated_at": now_utc().isoformat(),
    }
    updates["property_code"] = req.property_code or property_code_for_record({**existing, **updates})
    await db.properties.update_one({"id": property_id}, {"$set": updates})
    updated = normalize_live_property_record(await db.properties.find_one({"id": property_id}, {"_id": 0}) or {**existing, **updates})
    await create_audit_log(
        actor_user_id=user["id"],
        action="property.updated",
        entity_type="property",
        entity_id=property_id,
        metadata={"property_code": updated.get("property_code")},
    )
    await publish_live_update("property.updated", {"property": updated, "scope": "admin_update"}, roles=["admin", "agent", "customer"])
    await publish_dashboard_metrics_update(roles=["admin"])
    return {"success": True, "property": updated}


def clean_plot_payload(req: AdminPlotReq, *, existing: Optional[Dict[str, Any]] = None, assigned_agent: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = req.model_dump()
    payload["status"] = str(payload.get("status") or "available").strip().lower()
    if payload.get("size_sqy") and not payload.get("size"):
        payload["size"] = f"{payload['size_sqy']} sq yards"
    if assigned_agent:
        payload["assigned_agent_id"] = assigned_agent.get("id")
        payload["agent_id"] = assigned_agent.get("id")
        payload["assigned_agent_name"] = assigned_agent.get("name")
        payload["assigned_agent_phone"] = assigned_agent.get("phone")
    elif payload.get("assigned_agent_id") in {"", None}:
        payload["assigned_agent_id"] = None
        payload["agent_id"] = None
        payload["assigned_agent_name"] = None
        payload["assigned_agent_phone"] = None
    payload["updated_at"] = now_utc().isoformat()
    return {**(existing or {}), **payload}


@api_router.post("/admin/plots")
async def admin_create_plot(req: AdminPlotReq, user: Dict[str, Any] = Depends(get_admin_user)):
    await require_database("Plot database is unavailable")
    property_doc = await db.properties.find_one({"id": req.property_id}, {"_id": 0})
    if not property_doc:
        raise HTTPException(status_code=404, detail="Property not found")
    assigned_agent = None
    if req.assigned_agent_id:
        assigned_agent = await db.users.find_one({"id": req.assigned_agent_id, "role": ROLE_AGENT}, {"_id": 0})
        if not assigned_agent:
            raise HTTPException(status_code=404, detail="Assigned partner not found")
    now_iso = now_utc().isoformat()
    plot = clean_plot_payload(req, assigned_agent=assigned_agent)
    plot.update({
        "id": str(uuid.uuid4()),
        "property_code": property_code_for_record(property_doc),
        "created_at": now_iso,
        "updated_at": now_iso,
    })
    await db.plots.insert_one(plot.copy())
    saved = normalize_plot_record(plot, property_doc)
    await create_audit_log(
        actor_user_id=user["id"],
        action="plot.created",
        entity_type="plot",
        entity_id=saved["id"],
        metadata={"property_id": req.property_id, "plot_number": req.plot_number},
    )
    await publish_live_update("property.updated", {"plot": saved, "scope": "admin_plot_create"}, roles=["admin", "agent", "customer"])
    await publish_dashboard_metrics_update(roles=["admin"])
    return {"success": True, "plot": saved}


@api_router.put("/admin/plots/{plot_id}")
async def admin_update_plot(plot_id: str, req: AdminPlotReq, user: Dict[str, Any] = Depends(get_admin_user)):
    await require_database("Plot database is unavailable")
    existing = await db.plots.find_one({"id": plot_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Plot not found")
    property_doc = await db.properties.find_one({"id": req.property_id}, {"_id": 0})
    if not property_doc:
        raise HTTPException(status_code=404, detail="Property not found")
    assigned_agent = None
    if req.assigned_agent_id:
        assigned_agent = await db.users.find_one({"id": req.assigned_agent_id, "role": ROLE_AGENT}, {"_id": 0})
        if not assigned_agent:
            raise HTTPException(status_code=404, detail="Assigned partner not found")
    updates = clean_plot_payload(req, existing=existing, assigned_agent=assigned_agent)
    updates["property_code"] = property_code_for_record(property_doc)
    await db.plots.update_one({"id": plot_id}, {"$set": updates})
    updated = normalize_plot_record(await db.plots.find_one({"id": plot_id}, {"_id": 0}) or updates, property_doc)
    await create_audit_log(
        actor_user_id=user["id"],
        action="plot.updated",
        entity_type="plot",
        entity_id=plot_id,
        metadata={"property_id": req.property_id, "plot_number": req.plot_number},
    )
    await publish_live_update("property.updated", {"plot": updated, "scope": "admin_plot_update"}, roles=["admin", "agent", "customer"])
    await publish_dashboard_metrics_update(roles=["admin"])
    return {"success": True, "plot": updated}


# ---------- Seed Data ----------
async def seed_data():
    logger.info("Demo startup seeding is disabled in realtime mode.")
    return
    if not ENABLE_DEMO_DATA:
        logger.info("Demo seed data disabled; skipping startup seed.")
        return

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
            "name": "Siripuram Gardens Independent House",
            "category": "Independent House",
            "location": "Achutapuram, Visakhapatnam",
            "starting_price": 1600000,
            "size": "840 sq.ft",
            "image": "/Property Image 1.jpeg",
            "images": [
                "/Property Image 1.jpeg",
                "/Property Image 2.jpeg",
                "/Map.jpeg",
            ],
            "description": "A compact independent-house offering anchored in the Siripuram Gardens layout at Achutapuram with live availability, east-face and west-face plans, and project approval details.",
            "survey_number": "Layout approved development",
            "facing": "East Face / West Face",
            "road_width": "40-60 ft internal roads",
            "availability": "Available",
            "featured": True,
            "amenities": ["Street Lighting", "Water Supply", "Underground Drainage", "Rain-water Harvesting", "Landscaping and plantation"],
            "approvals": ["VUDA Approved Layout", "Clear Title Layout Planning"],
            "nearby": ["Pudimadaka Beach - 10 min", "Kondakarla Tourist Spot - 15 min", "Steel Plant - 30 min", "Vizag Airport - 60 min"],
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

    # ---- Plots for Siripuram Gardens (interactive layout) ----
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

    if ENABLE_DEMO_DATA:
        # ---- Demo user with land + installments + documents ----
        demo_user_id = "demo-user-001"
        await db.users.insert_one({
            "id": demo_user_id,
            "phone": "+919999900001",
            "name": "Rajesh Kumar",
            "email": "rajesh.demo@rivanrealty.com",
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
        "phone": "+919491348973",
        "name": ADMIN_DISPLAY_NAME,
        "email": "admin@rivanrealty.com",
        "address": "Rivan HQ, Hyderabad",
        "kyc_status": "verified",
        "is_admin": True,
        "role": "admin",
        "email_verified": True,
        "phone_verified": True,
        "auth_methods": ["phone"],
        "updated_at": now_utc().isoformat(),
        "last_login_at": now_utc().isoformat(),
        "created_at": now_utc().isoformat(),
    })

    await db.users.insert_one({
        "id": "agent-main-001",
        "phone": "+919052644345",
        "name": "Arjun Reddy",
        "email": "agent@rivaan.com",
        "address": "Banjara Hills, Hyderabad",
        "kyc_status": "verified",
        "is_admin": False,
        "role": "agent",
        "age": 34,
        "aadhaar_number": "5555 6666 7777",
        "manager_name": "Regional Sales Director",
        "agent_brand_name": "Rivan Crest Partners",
        "sub_agent_ids": ["agent-sub-001"],
        "approval_status": "approved",
        "approved_by_manager": ADMIN_DISPLAY_NAME,
        "status": "active",
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
        "manager_name": "Arjun Reddy",
        "manager_id": "agent-main-001",
        "agent_brand_name": "Rivan Crest Partners",
        "sub_agent_ids": [],
        "approval_status": "approved",
        "approved_by_manager": "Arjun Reddy",
        "status": "active",
        "auth_methods": ["email"],
        "email_verified": True,
        "phone_verified": True,
        "password_hash": hash_password("Agent@123"),
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
        "last_login_at": now_utc().isoformat(),
    })

    await db.users.insert_one({
        "id": "agent-pending-001",
        "phone": "+919999999999",
        "name": "Puneeth Agent Test",
        "email": "pendingagent@rivaan.com",
        "address": "Kukatpally, Hyderabad",
        "kyc_status": "pending",
        "is_admin": False,
        "role": "agent",
        "age": 31,
        "aadhaar_number": "1111 2222 3333",
        "manager_name": "Regional Sales Director",
        "agent_brand_name": "Rivan Crest Partners",
        "sub_agent_ids": [],
        "approval_status": "pending",
        "approved_by_manager": None,
        "status": "pending",
        "auth_methods": ["agent_application"],
        "email_verified": True,
        "phone_verified": True,
        "password_hash": hash_password("Agent@123"),
        "review_notes": "",
        "reviewed_at": None,
        "reviewed_by_manager": None,
        "agent_application_submitted_at": now_utc().isoformat(),
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
        "last_login_at": now_utc().isoformat(),
    })

    logger.info("Seed data inserted successfully.")


# ---------- Lifecycle ----------
def log_registered_auth_routes() -> None:
    auth_routes: List[str] = []
    for route in app.routes:
        path = getattr(route, "path", "")
        if not path.startswith("/api/auth/"):
            continue
        methods = ",".join(sorted(getattr(route, "methods", []) or []))
        auth_routes.append(f"{path} [{methods}]")
    logger.info("Registered auth routes: %s", "; ".join(sorted(auth_routes)))
    logger.info("CORS origins: %s", ", ".join(CORS_ORIGINS))


app.include_router(api_router)
log_registered_auth_routes()

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_methods=["*"],
    allow_headers=["*"],
)


def origin_is_allowed(origin: Optional[str]) -> bool:
    normalized = (origin or "").strip().rstrip("/")
    if not normalized:
        return False
    if normalized in CORS_ORIGINS:
        return True
    if CORS_ORIGIN_REGEX:
        try:
            return re.fullmatch(CORS_ORIGIN_REGEX, normalized) is not None
        except re.error:
            logger.exception("Invalid CORS_ORIGIN_REGEX configured")
    return False


@app.middleware("http")
async def ensure_cors_headers(request: Request, call_next):
    origin = request.headers.get("origin")
    allowed_origin = origin.strip().rstrip("/") if origin_is_allowed(origin) else None

    if request.method == "OPTIONS" and allowed_origin:
        response = Response(status_code=204)
    else:
        try:
            response = await call_next(request)
        except HTTPException as exc:
            response = JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        except Exception:
            logger.exception("Unhandled backend error while serving %s %s", request.method, request.url.path)
            response = JSONResponse(
                status_code=500,
                content={"detail": "Internal server error"},
            )

    if allowed_origin:
        response.headers["Access-Control-Allow-Origin"] = allowed_origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = request.headers.get(
            "access-control-request-headers",
            "Authorization,Content-Type,Accept,Origin,X-Requested-With",
        )
        response.headers["Vary"] = "Origin"

    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)")
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
    response.headers.setdefault("Cross-Origin-Resource-Policy", "cross-origin")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' data: https:; media-src 'self' data: https:; connect-src 'self' https: wss: ws:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; font-src 'self' data: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https:;",
    )

    return response


@app.on_event("startup")
async def on_startup():
    await purge_demo_auth_users_from_db()
    await purge_legacy_demo_records_from_db()
    await seed_data()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re
import ssl
from typing import Any, Dict, Optional, Sequence

import bcrypt
import jwt as pyjwt
import requests
from fastapi import HTTPException
from requests.adapters import HTTPAdapter
from urllib3.poolmanager import PoolManager
from jwt import PyJWKClient

try:
    import truststore  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    truststore = None


JWT_ALGORITHM = "HS256"


class SSLContextAdapter(HTTPAdapter):
    def __init__(self, ssl_context: ssl.SSLContext, **kwargs):
        self.ssl_context = ssl_context
        super().__init__(**kwargs)

    def init_poolmanager(self, connections, maxsize, block=False, **pool_kwargs):
        pool_kwargs["ssl_context"] = self.ssl_context
        return super().init_poolmanager(connections, maxsize, block=block, **pool_kwargs)


def build_http_session() -> requests.Session:
    session = requests.Session()
    if truststore is not None:
        ssl_context = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        adapter = SSLContextAdapter(ssl_context)
        session.mount("https://", adapter)
    return session


http_session = build_http_session()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(subject: str, secret: str, expires_minutes: int) -> str:
    payload = {
        "sub": subject,
        "iat": now_utc(),
        "exp": now_utc() + timedelta(minutes=expires_minutes),
    }
    return pyjwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def decode_token(token: str, secret: str) -> Dict[str, Any]:
    try:
        return pyjwt.decode(token, secret, algorithms=[JWT_ALGORITHM])
    except pyjwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Token expired") from exc
    except pyjwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def validate_password_strength(password: str) -> None:
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
    if not re.search(r"[A-Z]", password):
        raise HTTPException(status_code=400, detail="Password must include at least one uppercase letter")
    if not re.search(r"[a-z]", password):
        raise HTTPException(status_code=400, detail="Password must include at least one lowercase letter")
    if not re.search(r"\d", password):
        raise HTTPException(status_code=400, detail="Password must include at least one number")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def normalize_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) == 10:
        return f"+91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    if 10 <= len(digits) <= 15:
        return f"+{digits}"
    raise HTTPException(status_code=400, detail="Invalid phone number")


def verify_google_id_token(id_token: str, expected_audience: str | Sequence[str]) -> Dict[str, Any]:
    valid_audiences = (
        [aud for aud in expected_audience if aud]
        if isinstance(expected_audience, (list, tuple, set))
        else [expected_audience]
    )

    try:
        response = http_session.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": id_token},
            timeout=15,
        )
    except requests.exceptions.SSLError as exc:
        raise HTTPException(status_code=502, detail="TLS certificate verification failed while contacting Google") from exc
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="Failed to reach Google verification service") from exc

    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    payload = response.json()
    aud = payload.get("aud")
    azp = payload.get("azp")
    if aud not in valid_audiences and azp not in valid_audiences:
        raise HTTPException(
            status_code=401,
            detail="Google token audience mismatch. Ensure the frontend Google client ID and backend Google client ID match for this platform.",
        )
    if payload.get("email_verified") not in ("true", True):
        raise HTTPException(status_code=401, detail="Google email is not verified")
    if not payload.get("sub") or not payload.get("email"):
        raise HTTPException(status_code=401, detail="Incomplete Google profile")
    return payload


def verify_firebase_id_token(id_token: str, project_id: str) -> Dict[str, Any]:
    if not project_id:
        raise HTTPException(status_code=500, detail="Firebase project is not configured")

    issuer = f"https://securetoken.google.com/{project_id}"
    jwk_client = PyJWKClient("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
    try:
        signing_key = jwk_client.get_signing_key_from_jwt(id_token)
        payload = pyjwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=project_id,
            issuer=issuer,
        )
    except pyjwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Firebase token expired") from exc
    except pyjwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Invalid Firebase token") from exc

    if not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Incomplete Firebase profile")
    return payload


def auth_methods_union(existing: Optional[list[str]], *new_values: str) -> list[str]:
    items = set(existing or [])
    for value in new_values:
        if value:
            items.add(value)
    return sorted(items)

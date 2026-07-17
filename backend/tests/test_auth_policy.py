import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("JWT_SECRET", "test-only-jwt-secret")
os.environ.setdefault("ALLOW_LOCAL_AUTH_FALLBACK", "false")

from server import CORS_ORIGINS, admin_access_is_active, app, has_admin_access, is_primary_admin_login_user  # noqa: E402


def test_admin_access_accepts_database_admin_roles():
    assert has_admin_access({"role": "admin"})
    assert not has_admin_access({"role": "manager"})
    assert not has_admin_access({"role": "super_admin"})
    assert not has_admin_access({"role": "customer", "is_admin": True})


def test_admin_access_rejects_non_admin_roles_and_inactive_records():
    assert not has_admin_access({"role": "agent", "is_admin": False})
    assert admin_access_is_active({"role": "admin", "phone": "+919491348973", "status": "active", "approval_status": "not_required"})
    assert admin_access_is_active({"role": "admin", "phone": "+919848129637", "status": "active", "approval_status": "not_required"})
    assert not admin_access_is_active({"role": "admin", "phone": "+919491348973", "status": "suspended", "approval_status": "not_required"})
    assert not admin_access_is_active({"role": "admin", "phone": "+919491348973", "approval_status": "pending"})


def test_primary_admin_login_is_limited_to_admin_records():
    assert is_primary_admin_login_user({"role": "admin", "phone": "+919491348973"})
    assert is_primary_admin_login_user({"role": "admin", "phone": "9491348973"})
    assert is_primary_admin_login_user({"role": "admin", "phone": "+919848129637"})
    assert is_primary_admin_login_user({"role": "admin", "phone": "9848129637"})
    assert not is_primary_admin_login_user({"role": "customer", "is_admin": True, "phone": "+919491348973"})
    assert not is_primary_admin_login_user({"role": "manager", "is_admin": False, "phone": "+919491348973"})
    assert not is_primary_admin_login_user({"role": "super_admin", "is_admin": False})


def test_only_otp_admin_login_routes_are_registered():
    route_paths = {route.path for route in app.routes}
    assert "/api/auth/admin/status" in route_paths
    assert "/api/auth/admin/firebase" in route_paths
    assert "/api/auth/admin/login" not in route_paths
    assert "/api/auth/admin/demo-access" not in route_paths


def test_live_frontend_origins_are_allowed_for_cors():
    assert "https://rivanrealty.com" in CORS_ORIGINS
    assert "https://www.rivanrealty.com" in CORS_ORIGINS
    assert "https://localhost" in CORS_ORIGINS
    assert "capacitor://localhost" in CORS_ORIGINS


def test_preflight_from_live_frontend_receives_cors_headers():
    client = TestClient(app)
    response = client.options(
        "/api/auth/admin/status",
        headers={
            "Origin": "https://rivanrealty.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code in {200, 204}
    assert response.headers["access-control-allow-origin"] == "https://rivanrealty.com"


def test_preflight_from_capacitor_android_receives_cors_headers():
    client = TestClient(app)
    response = client.options(
        "/api/auth/customer/firebase",
        headers={
            "Origin": "https://localhost",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code in {200, 204}
    assert response.headers["access-control-allow-origin"] == "https://localhost"

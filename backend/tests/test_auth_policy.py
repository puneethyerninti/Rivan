import os
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("JWT_SECRET", "test-only-jwt-secret")
os.environ.setdefault("ALLOW_LOCAL_AUTH_FALLBACK", "false")

from server import admin_access_is_active, app, has_admin_access  # noqa: E402


def test_admin_access_accepts_database_admin_roles():
    assert has_admin_access({"role": "manager"})
    assert has_admin_access({"role": "admin"})
    assert has_admin_access({"role": "super_admin"})
    assert has_admin_access({"role": "customer", "is_admin": True})


def test_admin_access_rejects_non_admin_roles_and_inactive_records():
    assert not has_admin_access({"role": "agent", "is_admin": False})
    assert admin_access_is_active({"role": "manager", "status": "active"})
    assert not admin_access_is_active({"role": "manager", "status": "suspended"})
    assert not admin_access_is_active({"role": "admin", "approval_status": "pending"})


def test_only_otp_admin_login_routes_are_registered():
    route_paths = {route.path for route in app.routes}
    assert "/api/auth/admin/status" in route_paths
    assert "/api/auth/admin/firebase" in route_paths
    assert "/api/auth/admin/login" not in route_paths
    assert "/api/auth/admin/demo-access" not in route_paths

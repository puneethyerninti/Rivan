"""Rivan Reality - Backend API Tests (comprehensive)"""
import os
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / '.env')

BASE_URL = os.environ['EXPO_PUBLIC_BACKEND_URL'].rstrip('/') if os.environ.get('EXPO_PUBLIC_BACKEND_URL') else None
if not BASE_URL:
    # Fall back to frontend env (preview URL)
    fenv = Path('/app/frontend/.env')
    for line in fenv.read_text().splitlines():
        if line.startswith('EXPO_PUBLIC_BACKEND_URL='):
            BASE_URL = line.split('=', 1)[1].strip().strip('"').rstrip('/')

DEMO_PHONE = "9999900001"
ADMIN_PHONE = "9000000000"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def user_token(session):
    pytest.skip("Firebase phone auth requires a real Firebase ID token fixture.")


@pytest.fixture(scope="module")
def admin_token(session):
    pytest.skip("Firebase phone auth requires a real Firebase ID token fixture.")


def auth_h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Properties ----------
def test_properties_list(session):
    r = session.get(f"{BASE_URL}/api/properties")
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 7
    assert all("id" in p and "name" in p for p in data)


def test_properties_filter_category(session):
    r = session.get(f"{BASE_URL}/api/properties", params={"category": "Villas"})
    assert r.status_code == 200
    data = r.json()
    assert all(p["category"] == "Villas" for p in data)


def test_properties_search(session):
    r = session.get(f"{BASE_URL}/api/properties", params={"search": "Greens"})
    assert r.status_code == 200
    assert any("Greens" in p["name"] for p in r.json())


def test_featured(session):
    r = session.get(f"{BASE_URL}/api/properties/featured")
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1


def test_property_plots(session):
    r = session.get(f"{BASE_URL}/api/properties/prop-1/plots")
    assert r.status_code == 200
    plots = r.json()
    assert len(plots) == 24
    statuses = {p["status"] for p in plots}
    assert statuses.issubset({"available", "reserved", "booked", "sold"})


def test_get_plot(session):
    r = session.get(f"{BASE_URL}/api/plots/plot-1-1")
    assert r.status_code == 200
    assert r.json()["id"] == "plot-1-1"


# ---------- My Land / Payments ----------
def test_myland(session, user_token):
    r = session.get(f"{BASE_URL}/api/myland", headers=auth_h(user_token))
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    assert data[0]["id"] == "plot-1-5"


def test_payments_summary(session, user_token):
    r = session.get(f"{BASE_URL}/api/payments/summary", headers=auth_h(user_token))
    assert r.status_code == 200
    d = r.json()
    assert d["total_installments"] == 12
    assert d["paid_count"] == 3
    assert d["balance"] > 0


def test_payments_installments(session, user_token):
    r = session.get(f"{BASE_URL}/api/payments/installments", headers=auth_h(user_token))
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 12


def test_payments_history(session, user_token):
    r = session.get(f"{BASE_URL}/api/payments/history", headers=auth_h(user_token))
    assert r.status_code == 200
    assert len(r.json()) >= 3


# ---------- Documents / Services / Centres ----------
def test_documents(session, user_token):
    r = session.get(f"{BASE_URL}/api/documents", headers=auth_h(user_token))
    assert r.status_code == 200
    assert len(r.json()) == 9


def test_services_catalog(session):
    r = session.get(f"{BASE_URL}/api/services/catalog")
    assert r.status_code == 200
    assert len(r.json()) == 10


def test_centres(session):
    r = session.get(f"{BASE_URL}/api/centres")
    assert r.status_code == 200
    assert len(r.json()) == 3


def test_service_request(session, user_token):
    body = {
        "service_type": "Cleaning",
        "preferred_date": "2026-02-15",
        "description": "TEST_request",
        "contact": DEMO_PHONE,
    }
    r = session.post(f"{BASE_URL}/api/services/request", json=body, headers=auth_h(user_token))
    assert r.status_code == 200
    assert r.json()["success"] is True


def test_visit_centre(session, user_token):
    body = {
        "centre_id": "centre-1",
        "visit_date": "2026-02-20",
        "visit_time": "11:00 AM",
        "name": "TEST Demo",
        "mobile": DEMO_PHONE,
    }
    r = session.post(f"{BASE_URL}/api/visits/centre", json=body, headers=auth_h(user_token))
    assert r.status_code == 200


def test_visit_site(session, user_token):
    body = {"property_id": "prop-1", "visit_date": "2026-02-22", "name": "TEST", "mobile": DEMO_PHONE}
    r = session.post(f"{BASE_URL}/api/visits/site", json=body, headers=auth_h(user_token))
    assert r.status_code == 200


def test_wishlist_toggle(session, user_token):
    r1 = session.post(f"{BASE_URL}/api/wishlist/toggle", json={"property_id": "prop-2"}, headers=auth_h(user_token))
    assert r1.status_code == 200
    state1 = r1.json()["wishlisted"]
    r2 = session.post(f"{BASE_URL}/api/wishlist/toggle", json={"property_id": "prop-2"}, headers=auth_h(user_token))
    assert r2.json()["wishlisted"] != state1


def test_notifications(session, user_token):
    r = session.get(f"{BASE_URL}/api/notifications", headers=auth_h(user_token))
    assert r.status_code == 200
    assert len(r.json()) >= 1


# ---------- Bookings ----------
def test_booking_create(session, user_token):
    # Find an available plot in prop-6 (so we don't lock prop-1 needed by tests)
    plots = session.get(f"{BASE_URL}/api/properties/prop-6/plots").json()
    avail = [p for p in plots if p["status"] == "available"]
    if not avail:
        pytest.skip("No available plots to book")
    pid = avail[0]["id"]
    body = {"plot_id": pid, "name": "TEST Buyer", "mobile": DEMO_PHONE}
    r = session.post(f"{BASE_URL}/api/bookings", json=body, headers=auth_h(user_token))
    assert r.status_code == 200, r.text
    assert r.json()["success"] is True
    # Verify plot is now reserved
    r2 = session.get(f"{BASE_URL}/api/plots/{pid}")
    assert r2.json()["status"] == "reserved"


# ---------- Admin ----------
def test_admin_stats(session, admin_token):
    r = session.get(f"{BASE_URL}/api/admin/stats", headers=auth_h(admin_token))
    assert r.status_code == 200
    d = r.json()
    assert d["properties"] >= 7
    assert d["plots"] >= 40


def test_admin_bookings(session, admin_token):
    r = session.get(f"{BASE_URL}/api/admin/bookings", headers=auth_h(admin_token))
    assert r.status_code == 200


def test_admin_requires_admin(session, user_token):
    r = session.get(f"{BASE_URL}/api/admin/stats", headers=auth_h(user_token))
    assert r.status_code == 403


def test_protected_endpoints_require_auth(session):
    for ep in ["/api/myland", "/api/payments/summary", "/api/documents", "/api/notifications", "/api/wishlist"]:
        r = session.get(f"{BASE_URL}{ep}")
        assert r.status_code == 401, f"{ep} returned {r.status_code}"


def test_pay_installment(session, user_token):
    # Get an upcoming installment
    insts = session.get(f"{BASE_URL}/api/payments/installments", headers=auth_h(user_token)).json()
    upcoming = [i for i in insts if i["status"] != "paid"]
    if not upcoming:
        pytest.skip("No upcoming installment")
    iid = upcoming[0]["id"]
    r = session.post(f"{BASE_URL}/api/payments/pay", json={"installment_id": iid}, headers=auth_h(user_token))
    assert r.status_code == 200
    assert "receipt_id" in r.json()["payment"]

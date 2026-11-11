from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.db import Base, get_db
from app.main import app
from app.models import User
from app.security import hash_password


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient, None, None]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr(settings, "jwt_secret", "test-signing-secret-that-is-over-32-characters")
    monkeypatch.setattr(settings, "authorized_repositories", "owner/repo")

    def override_db() -> Generator[Session, None, None]:
        db = factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    with factory() as db:
        db.add_all([
            User(email="admin@example.com", name="Admin User", password_hash=hash_password("correct-admin-password"), role="admin"),
            User(email="customer@example.com", name="Customer User", password_hash=hash_password("correct-customer-password"), role="customer"),
            User(email="other@example.com", name="Other User", password_hash=hash_password("correct-other-password"), role="customer"),
        ])
        db.commit()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    engine.dispose()


def get_token(client: TestClient, email: str, password: str) -> str:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_login_rejects_invalid_password(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"email": "customer@example.com", "password": "wrong"})
    assert response.status_code == 401


def test_only_admin_can_create_customer_accounts(client: TestClient) -> None:
    payload = {"email": "new@example.com", "name": "New Customer", "company": "Example", "password": "a-strong-initial-password"}
    customer_token = get_token(client, "customer@example.com", "correct-customer-password")
    denied = client.post("/api/admin/customers", json=payload, headers={"Authorization": f"Bearer {customer_token}"})
    assert denied.status_code == 403
    admin_token = get_token(client, "admin@example.com", "correct-admin-password")
    created = client.post("/api/admin/customers", json=payload, headers={"Authorization": f"Bearer {admin_token}"})
    assert created.status_code == 201
    assert created.json()["company"] == "Example"


def test_customer_intake_waits_for_admin_repository_assignment(client: TestClient) -> None:
    customer_token = get_token(client, "customer@example.com", "correct-customer-password")
    headers = {"Authorization": f"Bearer {customer_token}"}
    payload = {
        "title": "Bug in sample flow",
        "description": "The sample endpoint returns an unexpected result for valid input.",
        "steps_to_reproduce": "Start the app and submit a valid request.",
    }
    created = client.post("/api/tickets", json=payload, headers=headers)
    assert created.status_code == 202
    assert created.json()["status"] == "pending_admin"
    assert created.json()["repository_url"] is None
    ticket_id = created.json()["id"]
    other_token = get_token(client, "other@example.com", "correct-other-password")
    denied = client.get(f"/api/tickets/{ticket_id}", headers={"Authorization": f"Bearer {other_token}"})
    assert denied.status_code == 404
    repository_payload = {"repository_url": "https://github.com/owner/repo"}
    customer_cannot_assign = client.post(
        f"/api/admin/tickets/{ticket_id}/repository",
        json=repository_payload,
        headers=headers,
    )
    assert customer_cannot_assign.status_code == 403
    admin_token = get_token(client, "admin@example.com", "correct-admin-password")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    not_allowlisted = {"repository_url": "https://github.com/owner/other"}
    blocked = client.post(f"/api/admin/tickets/{ticket_id}/repository", json=not_allowlisted, headers=admin_headers)
    assert blocked.status_code == 403
    connected = client.post(f"/api/admin/tickets/{ticket_id}/repository", json=repository_payload, headers=admin_headers)
    assert connected.status_code == 200
    assert connected.json()["status"] == "queued"
    assert connected.json()["repository"] == "owner/repo"


def test_profile_and_password_updates_are_persisted(client: TestClient) -> None:
    token = get_token(client, "customer@example.com", "correct-customer-password")
    headers = {"Authorization": f"Bearer {token}"}
    profile = client.patch("/api/auth/profile", json={"name": "Updated Customer", "company": "Updated Org"}, headers=headers)
    assert profile.status_code == 200
    assert profile.json()["name"] == "Updated Customer"
    assert profile.json()["company"] == "Updated Org"
    changed = client.post(
        "/api/auth/change-password",
        json={"current_password": "correct-customer-password", "new_password": "a-new-strong-password"},
        headers=headers,
    )
    assert changed.status_code == 204
    assert client.post("/api/auth/login", json={"email": "customer@example.com", "password": "correct-customer-password"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "customer@example.com", "password": "a-new-strong-password"}).status_code == 200

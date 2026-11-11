import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.db import Base
from app.models import AgentRun, Ticket, User
from app.security import hash_password, verify_password
from app.services.github import parse_repository_url
from app.services.workflow import WorkflowError, _valid_patch_path, mark_runner_result
import app.services.workflow as workflow


def test_repository_parser_accepts_only_canonical_public_github_urls() -> None:
    assert parse_repository_url("https://github.com/Owner/Project.git") == "owner/project"
    with pytest.raises(HTTPException):
        parse_repository_url("https://github.com/owner/project/tree/main")
    with pytest.raises(HTTPException):
        parse_repository_url("https://github.com.evil.example/owner/project")
    with pytest.raises(HTTPException):
        parse_repository_url("https://user:pass@github.com/owner/project")


def test_password_hash_is_salted_and_verified() -> None:
    first = hash_password("sample-customer-password")
    second = hash_password("sample-customer-password")
    assert first != second
    assert verify_password("sample-customer-password", first)
    assert not verify_password("incorrect-password", first)


def test_patch_paths_are_limited_to_selected_source_files() -> None:
    allowed = {"src/auth/login.py", "src/assets/logo.png"}
    assert _valid_patch_path("src/auth/login.py", allowed)
    assert not _valid_patch_path("../config.py", allowed)
    assert not _valid_patch_path(".github/workflows/test.yml", {".github/workflows/test.yml"})
    assert not _valid_patch_path("src/assets/logo.png", allowed)


def runner_database(monkeypatch: pytest.MonkeyPatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr(workflow, "get_session_factory", lambda: factory)
    monkeypatch.setattr(settings, "runner_callback_secret", "runner-callback-test-secret")
    with factory() as db:
        db.add(User(id=1, email="runner@example.com", name="Runner Test", password_hash=hash_password("runner-test-password"), role="customer"))
        ticket = Ticket(
            id=5,
            owner_id=1,
            customer_name="Runner Test",
            repository_url="https://github.com/owner/repo",
            repository="owner/repo",
            title="Test ticket",
            description="Ticket description for runner callback tests.",
            steps_to_reproduce="Run the test callback.",
            status="testing",
            stage="agent4",
            base_branch="main",
            base_commit_sha="a" * 40,
            test_status="running",
        )
        db.add(ticket)
        db.flush()
        db.add(AgentRun(
            ticket_id=5,
            agent_name="Agent 4 - Testing",
            status="running",
            input_data={"phase": "patch_tests", "patch_sha256": "b" * 64},
            output_data={"phase": "patch_tests", "runner_run_id": "run-5"},
        ))
        db.commit()
    return factory, engine


def test_runner_rejects_success_for_different_patch(monkeypatch: pytest.MonkeyPatch) -> None:
    factory, engine = runner_database(monkeypatch)
    try:
        result = {
            "phase": "patch_tests", "status": "passed", "run_id": "run-5", "executed": True,
            "exit_code": 0, "run_url": "https://ci.example/runs/5", "base_commit_sha": "a" * 40,
            "patch_sha256": "c" * 64,
        }
        with pytest.raises(WorkflowError, match="does not match"):
            mark_runner_result(5, result, "runner-callback-test-secret")
        with factory() as db:
            assert db.get(Ticket, 5).status == "testing"
    finally:
        engine.dispose()


def test_only_executed_ci_result_can_request_admin_approval(monkeypatch: pytest.MonkeyPatch) -> None:
    factory, engine = runner_database(monkeypatch)
    try:
        result = {
            "phase": "patch_tests", "status": "passed", "run_id": "run-5", "executed": True,
            "exit_code": 0, "run_url": "https://ci.example/runs/5", "base_commit_sha": "a" * 40,
            "patch_sha256": "b" * 64, "summary": "Runner executed test suite.", "logs": "actual CI output",
        }
        phase, retry = mark_runner_result(5, result, "runner-callback-test-secret")
        assert phase == "patch_tests"
        assert not retry
        with factory() as db:
            ticket = db.get(Ticket, 5)
            assert ticket.status == "awaiting_approval"
            assert ticket.test_status == "passed"
            assert ticket.test_report["run_url"] == result["run_url"]
    finally:
        engine.dispose()

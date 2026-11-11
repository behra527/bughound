from types import SimpleNamespace

import pytest

import app.services.workflow as workflow
from app.services.agent_schemas import InvestigationEvidence
from app.services.workflow import (
    WorkflowError,
    _generate_patch,
    _validate_evidence_references,
    _validate_report,
    _validation_payload,
)


def test_evidence_rejects_unknown_source_file() -> None:
    evidence = [
        InvestigationEvidence(
            path="src/unknown.py",
            lines=[1],
            observation="Potential cause.",
        )
    ]
    source_files = [
        {"path": "src/app.py", "content": "line one\nline two"}
    ]

    with pytest.raises(WorkflowError, match="outside the retrieved"):
        _validate_evidence_references(
            evidence,
            source_files,
            agent_name="Agent 1",
        )


def test_evidence_rejects_out_of_range_line_numbers() -> None:
    evidence = [
        InvestigationEvidence(
            path="src/app.py",
            lines=[10],
            observation="Potential cause.",
        )
    ]
    source_files = [
        {"path": "src/app.py", "content": "line one\nline two"}
    ]

    with pytest.raises(WorkflowError, match="outside"):
        _validate_evidence_references(
            evidence,
            source_files,
            agent_name="Agent 1",
        )


def test_evidence_accepts_valid_source_reference() -> None:
    evidence = [
        InvestigationEvidence(
            path="src/app.py",
            lines=[1, 2],
            observation="The function handles the request.",
        )
    ]
    source_files = [
        {"path": "src/app.py", "content": "line one\nline two"}
    ]

    _validate_evidence_references(
        evidence,
        source_files,
        agent_name="Agent 1",
    )


def test_validation_payload_separates_source_evidence() -> None:
    bug = {"title": "Login failure"}
    investigation = {
        "summary": "Login handler has a potential issue.",
        "evidence_files": [
            {"path": "src/auth.py", "content": "def login(): pass"}
        ],
        "repository_commits": [{"sha": "abc123"}],
    }

    payload = _validation_payload(bug, investigation)

    assert payload["bug"] == bug
    assert payload["source_evidence"] == investigation["evidence_files"]
    assert "evidence_files" not in payload["investigation_report"]
    assert payload["investigation_report"]["repository_commits"] == [
        {"sha": "abc123"}
    ]


def test_agent2_rejects_fabricated_evidence_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    investigation = {
        "summary": "Potential login issue.",
        "suspected_root_cause": "Incorrect token handling.",
        "confidence": 0.8,
        "evidence": [],
        "assumptions": [],
        "additional_information_needed": [],
        "evidence_files": [
            {"path": "src/auth.py", "content": "def login(): pass"}
        ],
    }

    monkeypatch.setattr(
        workflow,
        "ask_json",
        lambda *args, **kwargs: {
            "validated": True,
            "root_cause": "Incorrect token handling.",
            "confidence": 0.9,
            "supporting_evidence": [
                {
                    "path": "src/fabricated.py",
                    "lines": [1],
                    "observation": "Fabricated evidence.",
                }
            ],
            "counterevidence": [],
            "assumptions_to_correct": [],
            "rationale": "The source confirms the issue.",
        },
    )

    with pytest.raises(WorkflowError, match="outside the retrieved"):
        _validate_report(
            {"title": "Login failure"},
            investigation,
        )


def test_agent2_rejects_validated_report_without_supporting_evidence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    investigation = {
        "evidence_files": [
            {"path": "src/auth.py", "content": "def login(): pass"}
        ]
    }

    monkeypatch.setattr(
        workflow,
        "ask_json",
        lambda *args, **kwargs: {
            "validated": True,
            "root_cause": "Incorrect token handling.",
            "confidence": 0.9,
            "supporting_evidence": [],
            "counterevidence": [],
            "assumptions_to_correct": [],
            "rationale": "The issue is confirmed.",
        },
    )

    with pytest.raises(WorkflowError, match="without supporting evidence"):
        _validate_report(
            {"title": "Login failure"},
            investigation,
        )


def test_agent3_blocks_patch_when_root_cause_is_unvalidated() -> None:
    ticket = SimpleNamespace(
        title="Login failure",
        description="Login endpoint fails.",
        steps_to_reproduce="Submit valid credentials.",
    )
    investigation = {
        "evidence_files": [
            {"path": "src/auth.py", "content": "def login(): pass"}
        ]
    }

    with pytest.raises(WorkflowError, match="without validated root cause"):
        _generate_patch(
            ticket,
            {"validated": False},
            investigation,
        )


def test_agent3_rejects_patch_outside_selected_source_files(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ticket = SimpleNamespace(
        title="Login failure",
        description="Login endpoint fails.",
        steps_to_reproduce="Submit valid credentials.",
    )
    investigation = {
        "evidence_files": [
            {"path": "src/auth.py", "content": "def login(): pass"}
        ]
    }

    monkeypatch.setattr(
        workflow,
        "ask_json",
        lambda *args, **kwargs: {
            "files": [
                {
                    "path": "src/other.py",
                    "content": "def login(): return True",
                }
            ],
            "summary": "Attempted unauthorized file modification.",
        },
    )

    with pytest.raises(WorkflowError, match="outside the selected source evidence"):
        _generate_patch(
            ticket,
            {"validated": True},
            investigation,
        )


def test_agent3_generates_diff_for_valid_selected_file(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ticket = SimpleNamespace(
        title="Login failure",
        description="Login endpoint fails.",
        steps_to_reproduce="Submit valid credentials.",
    )
    investigation = {
        "evidence_files": [
            {
                "path": "src/auth.py",
                "content": "def login():\n    return False\n",
            }
        ]
    }
    updated_content = "def login():\n    return True\n"

    monkeypatch.setattr(
        workflow,
        "ask_json",
        lambda *args, **kwargs: {
            "files": [
                {
                    "path": "src/auth.py",
                    "content": updated_content,
                }
            ],
            "summary": "Corrected login result.",
        },
    )

    result = _generate_patch(
        ticket,
        {"validated": True},
        investigation,
    )

    assert len(result) == 1
    assert result[0]["path"] == "src/auth.py"
    assert result[0]["content"] == updated_content
    assert result[0]["original"] == "def login():\n    return False\n"
    assert "-    return False" in result[0]["diff"]
    assert "+    return True" in result[0]["diff"]

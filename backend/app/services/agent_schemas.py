
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class AgentSchema(BaseModel):
    """Base configuration for structured LLM outputs."""

    model_config = ConfigDict(extra="ignore")


class SourceFile(AgentSchema):
    """Source file retrieved from the inspected repository commit."""

    path: str = Field(min_length=1)
    content: str


class InvestigationEvidence(AgentSchema):
    """A source-backed observation made by Agent 1 or Agent 2."""

    path: str = Field(min_length=1)
    lines: str | list[int] | None = None
    observation: str = Field(min_length=1)


class InvestigationReport(AgentSchema):
    """Structured output expected from Agent 1."""

    summary: str = Field(min_length=1)
    suspected_root_cause: str = Field(min_length=1)
    confidence: float = Field(ge=0.0, le=1.0)

    evidence: list[InvestigationEvidence]
    assumptions: list[str]
    additional_information_needed: list[str]

    # Internal evidence retained for validation and patch generation.
    evidence_files: list[SourceFile] = Field(default_factory=list)

    repository_commits: list[dict[str, Any]] = Field(
        default_factory=list
    )


class ValidationReport(AgentSchema):
    """Structured output expected from Agent 2."""

    validated: bool
    root_cause: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)

    supporting_evidence: list[InvestigationEvidence]
    counterevidence: list[InvestigationEvidence]
    assumptions_to_correct: list[str]

    rationale: str = Field(min_length=1)

"""Read-only retrieval diagnostics, separate from generation and storage."""

from typing import Annotated, Literal

from pydantic import Field, field_validator

from proofline.models import Identifier, Model


class InspectionInput(Model):
    incident_id: Identifier
    question: Annotated[str, Field(min_length=1, max_length=1000)]

    @field_validator("question")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("question cannot be blank")
        return value.strip()


class RetrievalCandidate(Model):
    evidence_id: Identifier
    trusted: bool
    matched_terms: list[str]
    coverage: float = Field(ge=0, le=1)
    bm25_score: float = Field(ge=0)
    context_boost: float = Field(ge=1)
    kind_boost: float = Field(ge=1)
    focused_score: float = Field(ge=0)
    bm25_rank: int | None = Field(default=None, ge=1)
    focused_rank: int | None = Field(default=None, ge=1)
    exclusion_reason: Literal["untrusted", "empty_query", "below_coverage", "no_overlap"] | None = (
        None
    )


class RetrievalInspection(Model):
    incident_id: Identifier
    question: str
    query_tokens: list[str]
    coverage_threshold: float
    max_coverage: float
    admitted: bool
    limit: int
    candidates: list[RetrievalCandidate]

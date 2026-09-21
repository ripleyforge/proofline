"""Validated domain and HTTP schemas, independent of the HTTP framework."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator

Strategy = Literal["bm25", "focused"]
Mode = Literal["extractive", "local"]
Identifier = Annotated[str, Field(min_length=1, max_length=120, pattern=r"^[a-zA-Z0-9_-]+$")]
ShortText = Annotated[str, Field(min_length=1, max_length=500)]


def utc_timestamp(value: str) -> str:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.utcoffset() is None or parsed.utcoffset().total_seconds() != 0:
        raise ValueError("timestamp must be UTC")
    return value


Timestamp = Annotated[str, Field(max_length=40), AfterValidator(utc_timestamp)]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Evidence(Model):
    id: Identifier
    incident_id: Identifier
    kind: Literal["metric", "log", "change", "runbook", "note"]
    timestamp: Timestamp
    title: ShortText
    body: Annotated[str, Field(min_length=1, max_length=16000)]
    service: ShortText
    trusted: bool


class MetricPoint(Model):
    time: Timestamp
    value: float


class Metric(Model):
    name: ShortText
    unit: ShortText
    threshold: float | None = None
    points: list[MetricPoint] = Field(max_length=1000)


class Service(Model):
    id: Identifier
    label: ShortText
    status: Literal["healthy", "degraded", "failed"]
    upstream: list[Identifier] = Field(max_length=50)


class IncidentSummary(Model):
    id: Identifier
    title: ShortText
    service: ShortText
    severity: Literal["SEV2", "SEV3"]
    status: Literal["investigating", "monitoring"]
    start_time: Timestamp
    summary: Annotated[str, Field(min_length=1, max_length=4000)]
    tags: list[ShortText] = Field(max_length=30)
    evidence_count: int = Field(ge=0, le=1000)


class IncidentDetail(IncidentSummary):
    evidence: list[Evidence] = Field(max_length=1000)
    metrics: list[Metric] = Field(max_length=50)
    services: list[Service] = Field(max_length=50)
    suggested_questions: list[ShortText] = Field(max_length=20)


class Claim(Model):
    text: Annotated[str, Field(min_length=1, max_length=2000)]
    evidence_id: Identifier
    quote: Annotated[str, Field(min_length=1, max_length=1500)]
    verified: bool = False


class Trace(Model):
    step: str
    detail: str
    duration_ms: float = Field(ge=0)


class Investigation(Model):
    id: Identifier
    incident_id: Identifier
    question: str
    strategy: Strategy
    mode: Mode
    status: Literal["answered", "abstained"]
    answer: str
    claims: list[Claim]
    citations: list[Evidence]
    warnings: list[str]
    trace: list[Trace]
    created_at: Timestamp
    duration_ms: float = Field(ge=0)


class InvestigationInput(Model):
    incident_id: Identifier
    question: Annotated[str, Field(min_length=1, max_length=1000)]
    strategy: Strategy = "focused"
    mode: Mode = "extractive"

    @field_validator("question")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("question cannot be blank")
        return value.strip()


class NoteInput(Model):
    body: Annotated[str, Field(min_length=1, max_length=4000)]
    evidence_ids: list[Identifier] = Field(default_factory=list, max_length=30)

    @field_validator("body")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("note cannot be blank")
        return value.strip()


class Note(NoteInput):
    id: Identifier
    incident_id: Identifier
    created_at: Timestamp


class EvaluationInput(Model):
    strategy: Strategy = "focused"


class EvaluationFixture(Model):
    id: Identifier
    name: ShortText
    category: Literal["retrieval", "abstention", "injection", "isolation"]
    incident_id: Identifier
    question: Annotated[str, Field(min_length=1, max_length=1000)]
    expected_evidence_ids: list[Identifier] = Field(max_length=30)
    expect_abstain: bool


class EvaluationCase(Model):
    id: str
    name: str
    category: str
    passed: bool
    detail: str
    duration_ms: float = Field(ge=0)


class EvaluationMetrics(Model):
    retrieval_recall: float = Field(ge=0, le=1)
    citation_validity: float = Field(ge=0, le=1)
    abstention_accuracy: float = Field(ge=0, le=1)
    injection_resistance: float = Field(ge=0, le=1)


class Evaluation(Model):
    id: Identifier
    strategy: Strategy
    passed: int
    total: int
    metrics: EvaluationMetrics
    cases: list[EvaluationCase]
    created_at: Timestamp
    duration_ms: float = Field(ge=0)

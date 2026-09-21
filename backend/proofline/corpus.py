"""Load and validate the complete corpus before serving any request."""

import json
from pathlib import Path

from pydantic import TypeAdapter

from proofline.models import EvaluationFixture, IncidentDetail, IncidentSummary


class Corpus:
    def __init__(self, incidents: list[IncidentDetail]):
        self.incidents = {incident.id: incident for incident in incidents}
        if not incidents or len(self.incidents) != len(incidents):
            raise ValueError("corpus must contain incidents with unique IDs")
        evidence_ids: set[str] = set()
        for incident in incidents:
            if incident.evidence_count != len(incident.evidence):
                raise ValueError("evidence_count does not match evidence")
            service_ids = {service.id for service in incident.services}
            if len(service_ids) != len(incident.services):
                raise ValueError("service IDs must be unique within incident")
            if any(set(service.upstream) - service_ids for service in incident.services):
                raise ValueError("unknown service dependency")
            for evidence in incident.evidence:
                if evidence.incident_id != incident.id or evidence.id in evidence_ids:
                    raise ValueError("evidence must be scoped and globally unique")
                evidence_ids.add(evidence.id)

    @classmethod
    def load(cls, path: Path) -> "Corpus":
        return cls(TypeAdapter(list[IncidentDetail]).validate_json(path.read_text()))

    def get(self, incident_id: str) -> IncidentDetail:
        if incident_id not in self.incidents:
            raise KeyError(incident_id)
        return self.incidents[incident_id]

    def summaries(self) -> list[IncidentSummary]:
        fields = IncidentSummary.model_fields
        return [
            IncidentSummary.model_validate(incident.model_dump(include=set(fields)))
            for incident in self.incidents.values()
        ]

    def load_evaluations(self, path: Path) -> list[EvaluationFixture]:
        cases = TypeAdapter(list[EvaluationFixture]).validate_python(json.loads(path.read_text()))
        if not cases or len({case.id for case in cases}) != len(cases):
            raise ValueError("evaluation cases must have unique IDs and cannot be empty")
        for case in cases:
            incident = self.get(case.incident_id)
            eligible = {item.id for item in incident.evidence if item.trusted}
            if set(case.expected_evidence_ids) - eligible:
                raise ValueError(
                    "evaluation expected evidence must belong to incident and be trusted"
                )
        return cases

"""One inspectable BM25 scorer for retrieval and read-only policy comparison."""

import math
import re
from collections import Counter
from datetime import datetime
from typing import Protocol

from proofline.inspection import RetrievalCandidate, RetrievalInspection
from proofline.models import Evidence, IncidentDetail, Strategy

STOPWORDS = set(
    "a an and are as at be been before by can could did do does for from had has have how "
    "i in into is it its me of on or our should show tell than that the their them there these "
    "they this to us was were what when where which who why will with would you your "
    "incident evidence happened explain caused cause know please any about after during".split()
)
COVERAGE_THRESHOLD = 0.4
CONTEXT_LIMIT = 5
KIND_HINTS = {
    "change": {"deploy", "deployed", "deployment", "change", "changed", "release", "rollback"},
    "metric": {"metric", "metrics", "latency", "rate", "p95", "p99", "queue", "lag"},
    "log": {"log", "logs", "error", "errors", "timeout", "trace"},
    "runbook": {"runbook", "mitigate", "mitigation", "procedure", "check", "steps"},
    "note": {"note", "notes", "hypothesis", "uncertainty"},
}


def tokens(text: str) -> list[str]:
    return [token for token in re.findall(r"[a-z0-9]+", text.lower()) if token not in STOPWORDS]


class Retriever(Protocol):
    def retrieve(
        self, incident: IncidentDetail, question: str, strategy: Strategy
    ) -> list[Evidence]: ...


class BM25Retriever:
    """Rank trusted incident evidence; focused applies service/tag and kind priors.

    A 40% query-token overlap in any trusted document admits the query. Individual
    returned documents need positive overlap, not 40% coverage. Explanations and
    retrieval share this scorer so diagnostics cannot drift from ranking.
    """

    def inspect(self, incident: IncidentDetail, question: str) -> RetrievalInspection:
        documents = [item for item in incident.evidence if item.trusted]
        query = sorted(set(tokens(question)))
        query_set = set(query)
        bags = {
            item.id: Counter(tokens(f"{item.title} {item.body} {item.service}"))
            for item in documents
        }
        # Compute document frequencies once instead of scanning every document
        # again for each term of every candidate.
        frequencies: Counter[str] = Counter()
        for bag in bags.values():
            frequencies.update(bag.keys())
        avg_length = sum(sum(bag.values()) for bag in bags.values()) / max(len(bags), 1) or 1
        context = set(tokens(" ".join([incident.service, *incident.tags])))
        max_coverage = (
            max((len(query_set & bag.keys()) / len(query) for bag in bags.values()), default=0)
            if query
            else 0
        )
        admitted = bool(query and max_coverage >= COVERAGE_THRESHOLD)
        candidates = []
        for item in sorted(
            incident.evidence,
            key=lambda item: (
                datetime.fromisoformat(item.timestamp.replace("Z", "+00:00")),
                item.id,
            ),
        ):
            bag = bags.get(item.id, Counter())
            matched = [term for term in query if term in bag]
            score = 0.0
            length = sum(bag.values())
            for term in matched:
                frequency = bag[term]
                count = frequencies[term]
                idf = math.log(1 + (len(documents) - count + 0.5) / (count + 0.5))
                score += (
                    idf * frequency * 2.5 / (frequency + 1.5 * (0.25 + 0.75 * length / avg_length))
                )
            context_boost = 1.15 if item.trusted and context & bag.keys() else 1.0
            kind_boost = 1.25 if item.trusted and query_set & KIND_HINTS[item.kind] else 1.0
            if not item.trusted:
                reason = "untrusted"
            elif not query:
                reason = "empty_query"
            elif not admitted:
                reason = "below_coverage"
            elif not matched:
                reason = "no_overlap"
            else:
                reason = None
            candidates.append(
                RetrievalCandidate(
                    evidence_id=item.id,
                    trusted=item.trusted,
                    matched_terms=matched,
                    coverage=len(matched) / len(query) if query else 0,
                    bm25_score=score,
                    context_boost=context_boost,
                    kind_boost=kind_boost,
                    focused_score=score * context_boost * kind_boost,
                    exclusion_reason=reason,
                )
            )
        for strategy in ("bm25", "focused"):
            ranked = sorted(
                (item for item in candidates if item.exclusion_reason is None),
                key=lambda item: (-getattr(item, f"{strategy}_score"), item.evidence_id),
            )
            for rank, candidate in enumerate(ranked, 1):
                setattr(candidate, f"{strategy}_rank", rank)
        return RetrievalInspection(
            incident_id=incident.id,
            question=question,
            query_tokens=query,
            coverage_threshold=COVERAGE_THRESHOLD,
            max_coverage=max_coverage,
            admitted=admitted,
            limit=CONTEXT_LIMIT,
            candidates=candidates,
        )

    def retrieve(
        self, incident: IncidentDetail, question: str, strategy: Strategy
    ) -> list[Evidence]:
        inspection = self.inspect(incident, question)
        sources = {item.id: item for item in incident.evidence}
        selected = [
            item
            for item in inspection.candidates
            if (rank := getattr(item, f"{strategy}_rank")) is not None and rank <= inspection.limit
        ]
        selected.sort(key=lambda item: getattr(item, f"{strategy}_rank"))
        return [sources[item.evidence_id] for item in selected]

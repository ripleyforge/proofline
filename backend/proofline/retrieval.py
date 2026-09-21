"""BM25 baseline and explicit, small incident/evidence-kind ranking priors."""

import math
import re
from collections import Counter
from typing import Protocol

from proofline.models import Evidence, IncidentDetail, Strategy

STOPWORDS = set(
    "a an and are as at be been before by can could did do does for from had has have how "
    "i in into is it its me of on or our should show tell than that the their them there these "
    "they this to us was were what when where which who why will with would you your "
    "incident evidence happened explain caused cause know please any about after during".split()
)


def tokens(text: str) -> list[str]:
    return [token for token in re.findall(r"[a-z0-9]+", text.lower()) if token not in STOPWORDS]


class Retriever(Protocol):
    def retrieve(
        self, incident: IncidentDetail, question: str, strategy: Strategy
    ) -> list[Evidence]: ...


class BM25Retriever:
    """Rank only trusted evidence in the selected incident; return at most five sources.

    Focused mode adds 15% for service/tag context and 25% for an explicit question-kind
    match. A query needs 40% token coverage in at least one document; priors never
    admit documents with zero lexical question overlap.
    """

    def retrieve(
        self, incident: IncidentDetail, question: str, strategy: Strategy
    ) -> list[Evidence]:
        documents = [item for item in incident.evidence if item.trusted]
        query = set(tokens(question))
        if not documents or not query:
            return []
        bags = [Counter(tokens(f"{item.title} {item.body} {item.service}")) for item in documents]
        # Require substantive query coverage before any answer context is admitted.
        # This conservative lexical gate is transparent, not a semantic entailment test.
        coverage = max(len(query & bag.keys()) / len(query) for bag in bags)
        if coverage < 0.4:
            return []
        avg_length = sum(sum(bag.values()) for bag in bags) / len(bags) or 1
        context = set(tokens(" ".join([incident.service, *incident.tags])))
        kind_hints = {
            "change": {
                "deploy",
                "deployed",
                "deployment",
                "change",
                "changed",
                "release",
                "rollback",
            },
            "metric": {"metric", "metrics", "latency", "rate", "p95", "p99", "queue", "lag"},
            "log": {"log", "logs", "error", "errors", "timeout", "trace"},
            "runbook": {"runbook", "mitigate", "mitigation", "procedure", "check", "steps"},
            "note": {"note", "notes", "hypothesis", "uncertainty"},
        }
        scored = []
        for item, bag in zip(documents, bags, strict=True):
            score = 0.0
            length = sum(bag.values())
            for term in query:
                frequency = bag[term]
                if not frequency:
                    continue
                count = sum(term in candidate for candidate in bags)
                idf = math.log(1 + (len(bags) - count + 0.5) / (count + 0.5))
                score += (
                    idf * frequency * 2.5 / (frequency + 1.5 * (0.25 + 0.75 * length / avg_length))
                )
            if score <= 0:
                continue
            if strategy == "focused":
                score *= 1 + 0.15 * bool(context & bag.keys())
                score *= 1 + 0.25 * bool(query & kind_hints[item.kind])
            scored.append((score, item))
        scored.sort(key=lambda pair: (-pair[0], pair[1].id))
        return [item for _, item in scored[:5]]

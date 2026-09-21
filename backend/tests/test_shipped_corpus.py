import os
from pathlib import Path

import pytest

from proofline.corpus import Corpus
from proofline.evaluation import evaluate
from proofline.retrieval import BM25Retriever

DATA = Path(os.getenv("PROOFLINE_TEST_DATA_DIR", str(Path(__file__).resolve().parents[2] / "data")))


@pytest.mark.skipif(
    not DATA.is_dir(), reason="Shipped data not present in isolated backend worktree"
)
@pytest.mark.parametrize("strategy", ["bm25", "focused"])
def test_shipped_corpus_evaluation_contract(strategy):
    corpus = Corpus.load(DATA / "incidents.json")
    fixtures = corpus.load_evaluations(DATA / "evaluations.json")
    result = evaluate(corpus, fixtures, strategy, BM25Retriever())
    assert result.passed == result.total, [case.detail for case in result.cases if not case.passed]
    assert result.metrics.retrieval_recall == 1
    assert result.metrics.abstention_accuracy == 1

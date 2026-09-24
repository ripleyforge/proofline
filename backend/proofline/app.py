"""FastAPI composition root. Run with uvicorn proofline.app:create_app --factory."""

import os
import sqlite3
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, Response

from proofline.corpus import Corpus
from proofline.evaluation import evaluate
from proofline.export import brief_markdown, incident_brief, markdown
from proofline.generation import ExtractiveGenerator, LocalGenerator, OllamaGenerator, ProviderError
from proofline.inspection import InspectionInput, RetrievalInspection
from proofline.models import (
    Evaluation,
    EvaluationInput,
    HistoryQuery,
    Hypothesis,
    HypothesisInput,
    HypothesisPage,
    HypothesisUpdate,
    IncidentDetail,
    IncidentSummary,
    Investigation,
    InvestigationInput,
    InvestigationPage,
    Note,
    NoteInput,
)
from proofline.retrieval import BM25Retriever, Retriever
from proofline.service import investigate, now
from proofline.storage import HypothesisConflict, HypothesisNotFound, SQLiteStore, Store

ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    corpus_path: Path = field(
        default_factory=lambda: (
            Path(os.getenv("PROOFLINE_DATA_DIR", str(ROOT / "data"))) / "incidents.json"
        )
    )
    evaluation_path: Path = field(
        default_factory=lambda: (
            Path(os.getenv("PROOFLINE_DATA_DIR", str(ROOT / "data"))) / "evaluations.json"
        )
    )
    db_path: Path = field(
        default_factory=lambda: Path(
            os.getenv("PROOFLINE_DB_PATH", str(ROOT / ".local/proofline.sqlite3"))
        )
    )
    frontend_dist: Path = field(
        default_factory=lambda: Path(
            os.getenv("PROOFLINE_FRONTEND_DIST", str(ROOT / "frontend/dist"))
        )
    )
    ollama_url: str = field(
        default_factory=lambda: os.getenv("PROOFLINE_OLLAMA_URL", "http://127.0.0.1:11435")
    )
    ollama_model: str = field(default_factory=lambda: os.getenv("PROOFLINE_OLLAMA_MODEL", ""))
    dev_origin: str | None = field(
        default_factory=lambda: os.getenv("PROOFLINE_DEV_ORIGIN") or None
    )


def _safe_host(host: str) -> bool:
    try:
        parsed = urlsplit(f"http://{host}")
        return (
            parsed.hostname in {"localhost", "127.0.0.1", "::1"}
            and parsed.username is None
            and parsed.password is None
            and not parsed.path
            and not parsed.query
            and not parsed.fragment
            and (parsed.port is None or 1 <= parsed.port <= 65535)
        )
    except ValueError:
        return False


def create_app(
    settings: Settings | None = None,
    *,
    generator: LocalGenerator | None = None,
    retriever: Retriever | None = None,
    store: Store | None = None,
) -> FastAPI:
    settings = settings or Settings()
    if settings.dev_origin is not None:
        origin = urlsplit(settings.dev_origin)
        if (
            origin.scheme != "http"
            or not _safe_host(origin.netloc)
            or origin.path
            or origin.query
            or origin.fragment
        ):
            raise ValueError(
                "dev origin must be an HTTP loopback origin without a path or credentials"
            )
    corpus = Corpus.load(settings.corpus_path)
    fixtures = corpus.load_evaluations(settings.evaluation_path)
    storage = store or SQLiteStore(settings.db_path)
    search = retriever or BM25Retriever()
    local = generator or OllamaGenerator(settings.ollama_url, settings.ollama_model)
    extractive = ExtractiveGenerator()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        local.close()

    app = FastAPI(title="Proofline", version="1.0.0", lifespan=lifespan)
    app.state.corpus = corpus
    app.state.store = storage

    @app.middleware("http")
    async def loopback_guard(request: Request, call_next):
        host = request.headers.get("host", "")
        if not _safe_host(host):
            return JSONResponse(
                {"detail": "Use a loopback hostname to access Proofline."}, status_code=400
            )
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            allowed_origins = {f"http://{host}", settings.dev_origin}
            if origin and origin not in allowed_origins:
                return JSONResponse(
                    {"detail": "Cross-origin writes are not allowed."}, status_code=403
                )
            if request.headers.get("sec-fetch-site") == "cross-site":
                return JSONResponse(
                    {"detail": "Cross-site writes are not allowed."}, status_code=403
                )
            if not request.headers.get("content-type", "").lower().startswith("application/json"):
                return JSONResponse(
                    {"detail": "Send JSON with Content-Type application/json."}, status_code=415
                )
            buffered = bytearray()
            async for chunk in request.stream():
                buffered.extend(chunk)
                if len(buffered) > 32768:
                    return JSONResponse(
                        {"detail": "Request body exceeds the 32 KiB limit."}, status_code=413
                    )
            request._body = bytes(buffered)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; "
            "form-action 'self'"
        )
        return response

    @app.exception_handler(ProviderError)
    async def provider_error(request: Request, exc: ProviderError):
        return JSONResponse({"detail": str(exc)}, status_code=503)

    @app.exception_handler(sqlite3.Error)
    async def storage_error(request: Request, exc: sqlite3.Error):
        return JSONResponse(
            {"detail": "Local storage is unavailable. Check disk space and database permissions."},
            status_code=503,
        )

    @app.exception_handler(HypothesisNotFound)
    async def hypothesis_not_found(request: Request, exc: HypothesisNotFound):
        return JSONResponse({"detail": "Hypothesis not found."}, status_code=404)

    @app.exception_handler(HypothesisConflict)
    async def hypothesis_conflict(request: Request, exc: HypothesisConflict):
        return JSONResponse(
            {"detail": "This hypothesis has a newer revision. Reload it before saving your edit."},
            status_code=409,
        )

    def incident(incident_id: str) -> IncidentDetail:
        try:
            return corpus.get(incident_id)
        except KeyError as exc:
            raise HTTPException(404, "Incident not found.") from exc

    def run_by_id(run_id: str) -> Investigation:
        found = storage.get("investigation", run_id)
        if found is None:
            raise HTTPException(404, "Investigation not found.")
        return Investigation.model_validate(found)

    def hypothesis_incident(incident_id: str, body: HypothesisInput) -> IncidentDetail:
        selected = incident(incident_id)
        evidence_ids = {item.id for item in selected.evidence}
        references = set(body.supporting_evidence_ids) | set(body.challenging_evidence_ids)
        if references - evidence_ids:
            raise HTTPException(422, "Every evidence reference must belong to this incident.")
        return selected

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": "1.0.0", "storage": "sqlite", "mode": "local-only"}

    @app.get("/api/config")
    def config():
        available, reason = local.availability()
        return {
            "generation_modes": ["extractive", "local"] if available else ["extractive"],
            "local_model": {
                "available": available,
                "name": settings.ollama_model or None,
                "reason": reason,
            },
            "limits": {"question_chars": 1000, "note_chars": 4000},
        }

    @app.get("/api/incidents", response_model=list[IncidentSummary])
    def list_incidents():
        return corpus.summaries()

    @app.get("/api/incidents/{incident_id}", response_model=IncidentDetail)
    def get_incident(incident_id: str):
        return incident(incident_id)

    @app.post("/api/retrieval/inspect", response_model=RetrievalInspection)
    def inspect_retrieval(body: InspectionInput):
        # Inspection describes the built-in policies, independent of optional
        # test/provider substitutions. It never invokes generation or persistence.
        return BM25Retriever().inspect(incident(body.incident_id), body.question)

    @app.get("/api/incidents/{incident_id}/brief")
    def export_incident(incident_id: str, format: Literal["markdown", "json"] = "markdown"):
        selected = incident(incident_id)
        brief = incident_brief(selected, storage.incident_snapshot(selected.id))
        if format == "json":
            content, media_type, suffix = (
                brief.model_dump_json(indent=2),
                "application/json",
                "json",
            )
        else:
            content, media_type, suffix = brief_markdown(brief), "text/markdown", "md"
        return Response(
            content,
            media_type=media_type,
            headers={
                "Content-Disposition": (
                    f'attachment; filename="proofline-{selected.id}-brief.{suffix}"'
                )
            },
        )

    @app.post("/api/investigations", response_model=Investigation, status_code=201)
    def create_investigation(body: InvestigationInput):
        selected = incident(body.incident_id)
        if body.mode == "local":
            available, reason = local.availability()
            if not available:
                raise ProviderError(reason)
        engine = local if body.mode == "local" else extractive
        run = investigate(selected, body, search, engine)
        storage.save("investigation", run)
        return run

    @app.get("/api/investigations", response_model=list[Investigation])
    def list_investigations(incident_id: str | None = None):
        if incident_id is not None:
            incident(incident_id)
        return storage.list("investigation", incident_id, 100)

    @app.get("/api/investigations/page", response_model=InvestigationPage)
    def page_investigations(query: Annotated[HistoryQuery, Query()]):
        if query.incident_id is not None:
            incident(query.incident_id)
        return storage.investigations_page(query)

    @app.get("/api/investigations/{run_id}", response_model=Investigation)
    def get_investigation(run_id: str):
        return run_by_id(run_id)

    @app.get("/api/investigations/{run_id}/export")
    def export_investigation(run_id: str, format: Literal["markdown", "json"] = "markdown"):
        run = run_by_id(run_id)
        if format == "json":
            content, media_type, suffix = run.model_dump_json(indent=2), "application/json", "json"
        else:
            content, media_type, suffix = markdown(run), "text/markdown", "md"
        return Response(
            content,
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="proofline-{run.id}.{suffix}"'},
        )

    @app.get("/api/incidents/{incident_id}/notes", response_model=list[Note])
    def list_notes(incident_id: str):
        incident(incident_id)
        return storage.list("note", incident_id, None)

    @app.post("/api/incidents/{incident_id}/notes", response_model=Note, status_code=201)
    def create_note(incident_id: str, body: NoteInput):
        selected = incident(incident_id)
        evidence_ids = {item.id for item in selected.evidence}
        if set(body.evidence_ids) - evidence_ids:
            raise HTTPException(422, "Every evidence reference must belong to this incident.")
        note = Note(
            id=uuid4().hex,
            incident_id=incident_id,
            body=body.body,
            evidence_ids=list(dict.fromkeys(body.evidence_ids)),
            created_at=now(),
        )
        storage.save("note", note)
        return note

    @app.get("/api/incidents/{incident_id}/hypotheses", response_model=HypothesisPage)
    def list_hypotheses(incident_id: str):
        incident(incident_id)
        return storage.hypotheses_page(incident_id)

    @app.post("/api/incidents/{incident_id}/hypotheses", response_model=Hypothesis, status_code=201)
    def create_hypothesis(incident_id: str, body: HypothesisInput):
        selected = hypothesis_incident(incident_id, body)
        timestamp = now()
        hypothesis = Hypothesis(
            **body.model_dump(),
            id=uuid4().hex,
            incident_id=selected.id,
            revision=1,
            created_at=timestamp,
            updated_at=timestamp,
        )
        storage.create_hypothesis(hypothesis)
        return hypothesis

    @app.put("/api/incidents/{incident_id}/hypotheses/{hypothesis_id}", response_model=Hypothesis)
    def update_hypothesis(incident_id: str, hypothesis_id: str, body: HypothesisUpdate):
        hypothesis_incident(incident_id, body)
        return storage.revise_hypothesis(incident_id, hypothesis_id, body, now())

    @app.get(
        "/api/incidents/{incident_id}/hypotheses/{hypothesis_id}/revisions",
        response_model=HypothesisPage,
    )
    def list_hypothesis_revisions(incident_id: str, hypothesis_id: str):
        incident(incident_id)
        return storage.hypothesis_revisions(incident_id, hypothesis_id)

    @app.post("/api/evaluations", response_model=Evaluation, status_code=201)
    def create_evaluation(body: EvaluationInput):
        result = evaluate(corpus, fixtures, body.strategy, search)
        storage.save("evaluation", result)
        return result

    @app.get("/api/evaluations", response_model=list[Evaluation])
    def list_evaluations():
        return storage.list("evaluation", limit=20)

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "API route not found.")
        root = settings.frontend_dist.resolve()
        candidate = (root / path).resolve()
        if not candidate.is_relative_to(root):
            raise HTTPException(404, "File not found.")
        if candidate.is_file():
            return FileResponse(candidate)
        if Path(path).suffix:
            raise HTTPException(404, "File not found.")
        index = root / "index.html"
        if index.is_file():
            return FileResponse(index)
        raise HTTPException(
            404, "Frontend is not built. Run the documented frontend build command."
        )

    return app

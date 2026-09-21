import json

import httpx
import pytest

from proofline.generation import OllamaGenerator, ProviderError

MODEL = "tiny:local"


def model_transport(generation=None, *, tags=None, show=None):
    calls = []

    def handle(request):
        calls.append(request)
        if request.url.path == "/api/tags":
            return httpx.Response(
                200,
                json=tags
                if tags is not None
                else {
                    "models": [{"name": MODEL, "digest": "a" * 64, "size": 100}],
                },
            )
        if request.url.path == "/api/show":
            return httpx.Response(
                200,
                json=show
                if show is not None
                else {
                    "model_info": {"general.architecture": "llama"},
                },
            )
        return (
            generation(request)
            if generation
            else httpx.Response(
                200,
                json={
                    "done": True,
                    "response": '{"claims":[]}',
                },
            )
        )

    return httpx.MockTransport(handle), calls


@pytest.mark.parametrize(
    "url",
    [
        "https://api.example.com",
        "http://localhost:11434",
        "http://127.0.0.1.evil.test",
        "http://2130706433",
        "http://127.0.0.1@evil.test",
        "http://user:secret@127.0.0.1",
        "http://127.0.0.1/redirect",
        "http://127.0.0.1?url=evil",
        "http://0.0.0.0:11434",
    ],
)
def test_only_literal_loopback_allowed(url):
    with pytest.raises(ValueError):
        OllamaGenerator(url, MODEL)


def test_cloud_model_name_rejected():
    with pytest.raises(ValueError):
        OllamaGenerator("http://127.0.0.1:11435", "gpt-oss:cloud")


@pytest.mark.parametrize(
    "tags",
    [
        {"models": []},
        {"models": "invalid"},
        {
            "models": [
                {
                    "name": MODEL,
                    "size": 100,
                    "digest": "a" * 64,
                    "remote_host": "https://ollama.com",
                }
            ]
        },
        {"models": [{"name": MODEL, "size": 0, "digest": "a" * 64}]},
        {"models": [{"name": MODEL, "size": 100, "digest": "invalid"}]},
    ],
)
def test_missing_or_remote_blob_unavailable(tags):
    transport, calls = model_transport(tags=tags)
    engine = OllamaGenerator("http://127.0.0.1:11435", MODEL, transport=transport)
    assert not engine.availability()[0]
    assert all(request.url.path != "/api/generate" for request in calls)
    engine.close()


@pytest.mark.parametrize(
    "show",
    [
        {},
        {"remote_model": "cloud"},
        {
            "model_info": {"general.architecture": "llama"},
            "remote_host": "https://ollama.com",
        },
    ],
)
def test_show_must_verify_local_model(show):
    transport, _ = model_transport(show=show)
    engine = OllamaGenerator("http://127.0.0.1:11435", MODEL, transport=transport)
    assert not engine.availability()[0]
    engine.close()


def test_fixed_model_bounded_prompt_no_tools_and_structured_output(incident, monkeypatch):
    monkeypatch.setenv("HTTP_PROXY", "http://untrusted.example")
    transport, calls = model_transport()
    engine = OllamaGenerator("http://127.0.0.1:11435", MODEL, transport=transport)
    assert engine.generate("Payment?", incident.evidence[:1]) == []
    payload = json.loads(calls[-1].content)
    assert payload["model"] == MODEL
    assert payload["stream"] is False and "tools" not in payload
    assert payload["options"]["num_predict"] == 1200
    assert payload["format"]["properties"]["claims"]["maxItems"] == 8
    assert not engine.client.follow_redirects
    assert engine.client._trust_env is False
    assert all(request.url.host == "127.0.0.1" for request in calls)
    engine.close()


@pytest.mark.parametrize(
    "failure", ["timeout", "redirect", "http", "json", "schema", "large", "incomplete"]
)
def test_provider_failures_never_fall_back(incident, failure):
    def response(request):
        if failure == "timeout":
            raise httpx.ReadTimeout("private URL secret detail", request=request)
        if failure == "redirect":
            return httpx.Response(307, headers={"location": "https://evil.example"})
        if failure == "http":
            return httpx.Response(500, text="private path secret detail")
        if failure == "json":
            return httpx.Response(200, text="not JSON")
        if failure == "schema":
            return httpx.Response(
                200, json={"done": True, "response": '{"claims":[{"text":"bad"}]}'}
            )
        if failure == "large":
            return httpx.Response(200, content=b"x" * 1_000_001)
        return httpx.Response(200, json={"done": False, "response": '{"claims":[]}'})

    transport, calls = model_transport(response)
    engine = OllamaGenerator("http://127.0.0.1:11435", MODEL, transport=transport)
    with pytest.raises(ProviderError) as exc:
        engine.generate("Payment?", incident.evidence[:1])
    assert "secret" not in str(exc.value) and "private" not in str(exc.value)
    assert len(calls) == 3
    engine.close()

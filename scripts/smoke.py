#!/usr/bin/env python3
"""Read-only loopback smoke check for a running Proofline demo."""
import argparse
import json
import urllib.request
from urllib.parse import urlsplit

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--url", default="http://127.0.0.1:8100")
args = parser.parse_args()
parsed = urlsplit(args.url)
if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "::1", "localhost"} or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
    parser.error("a plain loopback HTTP origin is required")
base = args.url.rstrip("/")
for route in ["/api/health", "/api/config", "/api/incidents"]:
    with urllib.request.urlopen(base + route, timeout=5) as response:
        result = json.load(response)
        if route == "/api/health":
            assert result["status"] == "ok"
        if route == "/api/incidents":
            assert len(result) == 4
        print(f"PASS {route}")

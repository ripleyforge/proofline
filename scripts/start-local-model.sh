#!/usr/bin/env bash
set -euo pipefail
# Separate listener; does not alter the user's normal Ollama configuration.
export OLLAMA_HOST=127.0.0.1:11435
export OLLAMA_NO_CLOUD=1
export OLLAMA_MAX_LOADED_MODELS=1
export OLLAMA_NUM_PARALLEL=1
exec ollama serve

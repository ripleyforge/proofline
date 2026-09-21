# Five-minute demonstration

Start with `bash scripts/setup.sh` then `python3 scripts/serve.py`. Open http://127.0.0.1:8100.

1. Open the checkout incident. Explain the engineer's problem: correlated signals are not a confirmed cause. Inspect the retry signal, the client configuration change, and the healthy payment processor evidence.
2. Ask a suggested question in **Evidence extracts** mode. Open each citation. Explain that this mode is deterministic and uses real stored sources, not a language model.
3. Compare the baseline and focused retrieval policies. Inspect the actual trace and included evidence. A different strategy is useful only if it improves the measured task.
4. Ask an unsupported question such as “What is the cafeteria lunch menu?” Show the abstention instead of an invented answer.
5. Run the evaluation suite. Open a failure or adversarial case. Explain that this scores deterministic retrieval and validation, not the intelligence of an LLM.
6. Save an investigation note with evidence references, reopen a previous run, and download the Markdown brief. Reload the page to demonstrate persistence.
7. Optional: start the separate local Ollama server and set the installed model name before starting Proofline. Repeat a grounded question in local AI mode. Show model limitations and the source/quote validation boundary.

For an interview, spend more time on one meaningful tradeoff than listing frameworks. Discuss why quote validation cannot prove that generated prose follows from a quote, why evidence is incident-scoped before ranking, and why a local prototype does not need a distributed cloud stack.

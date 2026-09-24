# Five-minute demonstration

Start with `bash scripts/setup.sh` then `python3 scripts/serve.py`. Open http://127.0.0.1:8100.

1. Open the checkout incident. Explain the engineer's problem: correlated signals are not a confirmed cause. Inspect the retry signal, the client configuration change, and the healthy payment processor evidence.
2. Ask a suggested question in **Evidence extracts** mode. Open each citation. Explain that this mode is deterministic and uses real stored sources, not a language model.
3. Expand **Inspect retrieval** and choose **Compare retrieval strategies**. Compare the baseline and focused ranks, query coverage, included sources and exclusion reasons without saving another run. A different strategy is useful only if it improves the measured task.
4. Ask an unsupported question such as “What is the cafeteria lunch menu?” Show the abstention instead of an invented answer.
5. Run the evaluation suite. Open a failure or adversarial case. Explain that this scores deterministic retrieval and validation, not the intelligence of an LLM.
6. Start a note with evidence references, switch incidents, then return. Show that the draft belongs to its incident. Save the note and reload to demonstrate database persistence.
7. Open run history. Search question text, filter by incident or answer status, and reopen a saved result. Download a single-run brief, then an incident handoff containing the saved investigations, notes and current hypotheses. Inspect its coverage counts: it includes the latest 20 investigations, 50 notes and 50 hypotheses, with any omissions disclosed.
8. Optional: start the separate local Ollama server and set the installed model name before starting Proofline. Repeat a grounded question in local AI mode. Show model limitations and the source/quote validation boundary.

For an interview, spend more time on one meaningful tradeoff than listing frameworks. Discuss why quote validation cannot prove that generated prose follows from a quote, why evidence is incident-scoped before ranking, and why a local prototype does not need a distributed cloud stack.

## Reasoning through a conflict

Use the fourth incident, **Search health checks disagree while readiness probes fail**, for a deeper demonstration:

1. Open the probe report and add it to comparison. Open the dashboard report and add it too. Choose **Compare selected (2/2)** to show the conflicting 10:30 observations side by side, then close the comparison and inspect the collector metadata.
2. Use **Review hypotheses** to reach the board. Add “Stale monitoring explains the healthy dashboard” with the collector metadata as supporting evidence. Record the failing probe as challenging evidence for any broader claim that the service is healthy. Explain why two different claims need separate hypotheses.
3. Enter a next check: “Obtain a failed readiness request trace; verify collector change execution.” Save. The status is an analyst judgment, not a model finding.
4. Edit the rationale and save another revision. Open **Revision history** to show what changed. In two browser tabs, editing the same revision demonstrates the conflict response instead of silent overwriting.
5. Ask whether the proposed restoration executed. Inspect retrieval and the proposal source. The source says execution is unconfirmed; it does not establish a completed repair.
6. Export the incident handoff. Show the current hypothesis revision, evidence for and against it, next check, source provenance and bounded coverage. Full revision history stays in SQLite and its backup.

The scenario intentionally has no resolved service root cause. A useful investigation makes missing evidence visible and leaves a concrete next action for the next engineer.

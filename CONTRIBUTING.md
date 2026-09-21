# Contributing

Use a feature branch and a focused pull request. Keep all test data synthetic.
Read `docs/PRODUCT.md` and `docs/API.md` before changing a boundary. Update API callers and behavior tests together; prefer small composable functions and explicit dependencies over abstractions without a second use.

Setup: `bash scripts/setup.sh`. For full checks also run `npm ci --ignore-scripts` and `npx --no-install playwright install chromium`, then `bash scripts/check.sh`.

Do not add a cloud endpoint, production credential, network telemetry, model auto-download, or paid service. Do not import real customer logs. Validate changed behavior at the smallest useful level, then run the full gate once before delivery. Describe the actual behavior, tradeoff and validation in a PR.

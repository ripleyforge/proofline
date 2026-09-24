# Synthetic incident scenarios

All names, services, events, identifiers, timestamps, and measurements in these fixtures are fictional. Aster Goods is a fictional commerce operator. The data does not describe a private company, customer, or production system.

Each scenario provides 12 ordered evidence items, three measured synthetic time series, and a five-node service map. Evidence establishes observations and competing explanations; it does not automatically declare a root cause. A temporal association or recovery after a change is useful evidence, but it is not proof of a complete causal chain.

## Checkout retry amplification

Incident: `inc-checkout-retry-amplification`

The checkout payment client changes from two attempts with 250 ms backoff to five attempts with 50 ms backoff. Attempts per checkout, upstream request volume, and checkout 5xx rate rise together. Successful gateway latency and rate-limit signals remain healthy. The prior retry policy is restored and checkout signals recover. The first-attempt timeout mechanism remains unknown.

Guided questions:

| Question | Answer evidence | Limit |
|---|---|---|
| How did payment attempts per checkout change after the retry update? | `checkout-change-payment-client-001`, `checkout-metric-amplification-001` | Shows timing and amplification, not why the first attempt timed out. |
| What argues against gateway saturation? | `checkout-log-gateway-limits-001`, `checkout-metric-gateway-latency-001` | Healthy recorded indicators do not exclude every gateway failure mode. |
| What remains unknown? | `checkout-note-timeout-boundary-001` | The fixture intentionally lacks client-deadline and response-arrival traces. |

`checkout-note-imported-untrusted-001` is a known malicious imported note. Its `trusted: false` label keeps it inspectable while excluding it from answer context.

## Warehouse inventory lag

Incident: `inc-warehouse-inventory-lag`

Inventory consumer concurrency drops from 12 workers to 3 while batch size rises from 50 events to 500. Throughput falls below ingress and lag rises. Database commit latency, connection use, lock waits, and slow-query signals remain healthy. Broker assignments are stable. Consumer settings are restored and lag recovers.

Guided questions:

| Question | Answer evidence | Limit |
|---|---|---|
| Which consumer settings changed? | `inventory-change-consumer-tuning-001` | The change record does not prove the settings alone explain every delayed event. |
| Does the evidence support database lock contention? | `inventory-log-db-health-001`, `inventory-metric-db-health-001` | These measurements counter the hypothesis only for the recorded interval and thresholds. |
| How did throughput compare with ingress? | `inventory-metric-throughput-drop-001` | The fixture reports aggregate rates, not per-partition latency. |

## Duplicate shipment notifications

Incident: `inc-duplicate-shipment-notifications`

A replay worker processes 1,200 shipment events while live consumption continues. A sampled replay of the same event lacks the dispatcher's idempotency key and receives a second provider acceptance ID. Dispatcher logs show deduplication skips for missing keys. Provider transport retries remain zero. Pausing replay reduces the duplicate rate, while responsibility for constructing replay keys remains open.

Guided questions:

| Question | Answer evidence | Limit |
|---|---|---|
| What happened when replayed events lacked idempotency keys? | `shipment-log-replay-missing-key-001`, `shipment-log-dedup-skip-001` | A sampled event and aggregate skip count do not define the full replay contract. |
| What conflicts with the network-retry hypothesis? | `shipment-metric-provider-counterevidence-001` | A zero provider retry counter does not exclude every transport defect. |
| What design question remains open? | `shipment-note-replay-contract-001` | The evidence does not assign ownership of key construction. |

## Conflicting search health observations

Incident: `inc-search-health-conflict`

At 10:30, a dashboard reports healthy search while a direct readiness probe fails.
Collector metadata later reveals that the dashboard used a 10:05 sample. That
explains the monitoring discrepancy but does not establish the cause of the
service failure. A proposed collector restoration lacks an execution record;
fresh probes still fail. This scenario deliberately stays unresolved.

Compare `search-log-probe` with `search-metric-dashboard`, then inspect
`search-log-cache-age`. Use two hypotheses to separate stale monitoring from
the service failure itself. Record a next check instead of turning a missing
request trace into a diagnosis. The imported closure instruction
`search-note-imported` is untrusted and excluded from generated context.

| Question | Answer evidence | Limit |
|---|---|---|
| What do health checks report at 10:30? | `search-log-probe`, `search-metric-dashboard` | The reports disagree; compare collection and display times. |
| When was the healthy sample collected? | `search-log-cache-age` | Resolves freshness, not the HTTP 503 root cause. |
| Was the proposed collector restoration executed? | `search-change-proposed` | Absence of an execution record leaves the action unconfirmed. |

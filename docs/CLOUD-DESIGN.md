# A future AWS mapping, not a deployed system

The finished demo runs on one machine. This document is a design discussion for a future customer requirement; no AWS resources, accounts, model invocations, or costs were created by this project.

| Actual local responsibility | Possible AWS responsibility | Trigger for reconsideration |
|---|---|---|
| Static React bundle | S3 + CloudFront | Approved hosted, multi-user access |
| FastAPI application | Container on ECS/Fargate | Sustained API traffic and an operations owner |
| SQLite runs/notes | RDS PostgreSQL | Concurrent writers, backup/recovery requirements |
| Validated evidence files | S3 with immutable version identifiers | Authorized real-source ingestion |
| Local Ollama | Approved Bedrock model | Data governance, model evaluation and an explicit budget |
| Synchronous investigation | SQS worker queue | Long tasks, cancellation, bounded concurrency |
| Local traces | CloudWatch / OpenTelemetry collector | Explicit retention and redaction design |

Before hosting, add real identity, per-user/tenant authorization at every query, TLS, rate limits, distributed admission control, retention/deletion policy, recovery drills and review of incident data classification. Evidence should carry origin, collection time, tenant, immutable content digest and access policy. Retrieval must enforce authorization before ranking, not filter after a model has seen other tenants' context.

A synchronous API is simpler for short extractive work. For longer model tasks, a bounded queue and worker can preserve responsiveness; requests need idempotency and cancellation semantics. Neither a vector database nor a multi-agent framework is required simply because a model is involved.

Cost planning must use measured requests, model token counts, data retention and latency requirements. This project makes no numerical cloud-cost estimate or free-tier guarantee. Any future deployment requires new cost authorization.

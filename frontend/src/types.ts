export type EvidenceKind = 'metric' | 'log' | 'change' | 'runbook' | 'note'
export type Severity = 'SEV2' | 'SEV3'
export type IncidentStatus = 'investigating' | 'monitoring'
export type ServiceStatus = 'healthy' | 'degraded' | 'failed'
export type RetrievalStrategy = 'bm25' | 'focused'
export type GenerationMode = 'extractive' | 'local'

export interface Evidence {
  id: string
  incident_id: string
  kind: EvidenceKind
  timestamp: string
  title: string
  body: string
  service: string
  trusted: boolean
}

export interface IncidentSummary {
  id: string
  title: string
  service: string
  severity: Severity
  status: IncidentStatus
  start_time: string
  summary: string
  tags: string[]
  evidence_count: number
}

export interface MetricPoint { time: string; value: number }
export interface MetricSeries { name: string; unit: string; threshold?: number; points: MetricPoint[] }
export interface ServiceNode { id: string; label: string; status: ServiceStatus; upstream: string[] }

export interface IncidentDetail extends IncidentSummary {
  evidence: Evidence[]
  metrics: MetricSeries[]
  services: ServiceNode[]
  suggested_questions: string[]
}

export interface Claim {
  text: string
  evidence_id: string
  quote: string
  verified: boolean
}

export interface TraceStep { step: string; detail: string; duration_ms: number }

export interface Investigation {
  id: string
  incident_id: string
  question: string
  strategy: RetrievalStrategy
  mode: GenerationMode
  status: 'answered' | 'abstained'
  answer: string
  claims: Claim[]
  citations: Evidence[]
  warnings: string[]
  trace: TraceStep[]
  created_at: string
  duration_ms: number
}

export interface Note {
  id: string
  incident_id: string
  body: string
  evidence_ids: string[]
  created_at: string
}

export type EvaluationMetricName = 'retrieval_recall' | 'citation_validity' | 'abstention_accuracy' | 'injection_resistance'
export type EvaluationMetrics = Record<EvaluationMetricName, number>
export interface EvaluationCase { id: string; name: string; category: string; passed: boolean; detail: string; duration_ms: number }
export interface Evaluation {
  id: string
  strategy: RetrievalStrategy
  passed: number
  total: number
  metrics: EvaluationMetrics
  cases: EvaluationCase[]
  created_at: string
  duration_ms: number
}

export interface Config {
  generation_modes: GenerationMode[]
  local_model: { available: boolean; name: string | null; reason: string | null }
  limits: { question_chars: number; note_chars: number }
}

export type AppView = 'workspace' | 'evaluations' | 'history'

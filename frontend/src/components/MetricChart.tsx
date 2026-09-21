import { Activity } from 'lucide-react'
import { formatTime } from '../format'
import type { MetricSeries } from '../types'
import { EmptyState, SectionHeading } from './Primitives'

const width = 720
const height = 190
const pad = { top: 18, right: 26, bottom: 34, left: 52 }

function pathFor(points: Array<{ value: number }>, min: number, max: number): string {
  if (!points.length) return ''
  const range = max - min || 1
  return points.map((point, index) => {
    const x = pad.left + (index / Math.max(points.length - 1, 1)) * (width - pad.left - pad.right)
    const y = pad.top + (1 - (point.value - min) / range) * (height - pad.top - pad.bottom)
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
}

export function MetricCharts({ metrics }: { metrics: MetricSeries[] }) {
  if (!metrics.length) return <EmptyState title="No telemetry attached" message="This incident has no metric series to plot." />
  return (
    <section className="panel telemetry-panel" aria-labelledby="telemetry-heading">
      <SectionHeading title="Signal window" description="Observed metrics around the incident start." />
      <div className="metric-grid" id="telemetry-heading">
        {metrics.map((metric) => <MetricPlot key={metric.name} metric={metric} />)}
      </div>
    </section>
  )
}

function MetricPlot({ metric }: { metric: MetricSeries }) {
  const values = metric.points.map((point) => point.value)
  const threshold = metric.threshold
  const domainValues = threshold === undefined ? values : [...values, threshold]
  const rawMin = Math.min(...domainValues)
  const rawMax = Math.max(...domainValues)
  const padding = Math.max((rawMax - rawMin) * 0.12, Math.abs(rawMax) * 0.04, 1)
  const min = rawMin - padding
  const max = rawMax + padding
  const latest = metric.points.at(-1)
  const thresholdY = threshold === undefined
    ? null
    : pad.top + (1 - (threshold - min) / (max - min || 1)) * (height - pad.top - pad.bottom)
  const start = metric.points[0]
  const end = metric.points.at(-1)

  return (
    <article className="metric-chart">
      <div className="metric-chart-head">
        <div><Activity size={16} aria-hidden="true" /><h3>{metric.name}</h3></div>
        <div className="metric-latest"><strong>{latest?.value.toLocaleString() ?? 'No data'}</strong><span>{metric.unit}</span></div>
      </div>
      {metric.points.length ? (
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${metric.name} time series, latest value ${latest?.value} ${metric.unit}`}>
          <line className="chart-gridline" x1={pad.left} x2={width - pad.right} y1={pad.top} y2={pad.top} />
          <line className="chart-gridline" x1={pad.left} x2={width - pad.right} y1={(height - pad.bottom + pad.top) / 2} y2={(height - pad.bottom + pad.top) / 2} />
          <line className="chart-gridline" x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} />
          {thresholdY !== null && (
            <g>
              <line className="chart-threshold" x1={pad.left} x2={width - pad.right} y1={thresholdY} y2={thresholdY} />
              <text className="chart-threshold-label" x={width - pad.right} y={Math.max(thresholdY - 6, 12)} textAnchor="end">threshold {threshold}</text>
            </g>
          )}
          <path className="chart-line" d={pathFor(metric.points, min, max)} />
          {metric.points.map((point, index) => {
            const x = pad.left + (index / Math.max(metric.points.length - 1, 1)) * (width - pad.left - pad.right)
            const y = pad.top + (1 - (point.value - min) / (max - min || 1)) * (height - pad.top - pad.bottom)
            return <circle key={`${point.time}-${index}`} className="chart-point" cx={x} cy={y} r="3.5"><title>{`${formatTime(point.time)}: ${point.value} ${metric.unit}`}</title></circle>
          })}
          <text className="chart-axis-label" x={pad.left - 8} y={pad.top + 3} textAnchor="end">{Number(rawMax.toFixed(2))}</text>
          <text className="chart-axis-label" x={pad.left - 8} y={height - pad.bottom + 3} textAnchor="end">{Number(rawMin.toFixed(2))}</text>
          {start && <text className="chart-axis-label" x={pad.left} y={height - 10}>{formatTime(start.time)}</text>}
          {end && <text className="chart-axis-label" x={width - pad.right} y={height - 10} textAnchor="end">{formatTime(end.time)}</text>}
        </svg>
      ) : <p className="inline-empty">No points recorded.</p>}
    </article>
  )
}

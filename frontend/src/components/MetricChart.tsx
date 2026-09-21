import { Activity } from 'lucide-react'
import { formatTime } from '../format'
import type { MetricPoint, MetricSeries } from '../types'
import { EmptyState, SectionHeading } from './Primitives'

const width = 720
const height = 190
const pad = { top: 18, right: 26, bottom: 34, left: 52 }

function xFor(time: string, minTime: number, maxTime: number): number {
  const elapsed = new Date(time).getTime() - minTime
  const range = maxTime - minTime
  return pad.left + (range > 0 ? elapsed / range : 0.5) * (width - pad.left - pad.right)
}

function yFor(value: number, min: number, max: number): number {
  return pad.top + (1 - (value - min) / (max - min || 1)) * (height - pad.top - pad.bottom)
}

function pathFor(points: MetricPoint[], min: number, max: number, minTime: number, maxTime: number): string {
  if (!points.length) return ''
  const range = max - min || 1
  return points.map((point, index) => {
    const x = xFor(point.time, minTime, maxTime)
    const y = pad.top + (1 - (point.value - min) / range) * (height - pad.top - pad.bottom)
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
}

function axisLabel(value: number): string {
  if (Math.abs(value) >= 100) return Math.round(value).toLocaleString()
  return Number(value.toFixed(2)).toLocaleString()
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
  const points = [...metric.points].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
  const values = points.map((point) => point.value)
  const threshold = metric.threshold
  const domainValues = threshold === undefined ? values : [...values, threshold]
  const rawMin = Math.min(...domainValues)
  const rawMax = Math.max(...domainValues)
  const padding = Math.max((rawMax - rawMin) * 0.12, Math.abs(rawMax) * 0.04, 1)
  const min = rawMin >= 0 ? Math.max(0, rawMin - padding) : rawMin - padding
  const max = rawMax + padding
  const minTime = Math.min(...points.map((point) => new Date(point.time).getTime()))
  const maxTime = Math.max(...points.map((point) => new Date(point.time).getTime()))
  const latest = points.at(-1)
  const thresholdY = threshold === undefined
    ? null
    : yFor(threshold, min, max)
  const start = points[0]
  const end = points.at(-1)

  return (
    <article className="metric-chart">
      <div className="metric-chart-head">
        <div><Activity size={16} aria-hidden="true" /><h3>{metric.name}</h3></div>
        <div className="metric-latest"><strong>{latest?.value.toLocaleString() ?? 'No data'}</strong><span>{metric.unit}</span></div>
      </div>
      {points.length ? (
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
          <path className="chart-line" d={pathFor(points, min, max, minTime, maxTime)} />
          {points.map((point, index) => {
            const x = xFor(point.time, minTime, maxTime)
            const y = yFor(point.value, min, max)
            return <circle key={`${point.time}-${index}`} className="chart-point" cx={x} cy={y} r="3.5"><title>{`${formatTime(point.time)}: ${point.value} ${metric.unit}`}</title></circle>
          })}
          <text className="chart-axis-label" x={pad.left - 8} y={pad.top + 3} textAnchor="end">{axisLabel(max)}</text>
          <text className="chart-axis-label" x={pad.left - 8} y={height - pad.bottom + 3} textAnchor="end">{axisLabel(min)}</text>
          {start && <text className="chart-axis-label" x={pad.left} y={height - 10}>{formatTime(start.time)}</text>}
          {end && <text className="chart-axis-label" x={width - pad.right} y={height - 10} textAnchor="end">{formatTime(end.time)}</text>}
        </svg>
      ) : <p className="inline-empty">No points recorded.</p>}
    </article>
  )
}

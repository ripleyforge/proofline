import type { ServiceNode } from '../types'
import { EmptyState, SectionHeading, ServiceStatusBadge } from './Primitives'

interface PositionedNode extends ServiceNode { x: number; y: number }

function positionNodes(services: ServiceNode[]): PositionedNode[] {
  const depthById = new Map<string, number>()
  const findDepth = (node: ServiceNode, trail = new Set<string>()): number => {
    const cached = depthById.get(node.id)
    if (cached !== undefined) return cached
    if (trail.has(node.id) || node.upstream.length === 0) return 0
    const nextTrail = new Set(trail).add(node.id)
    const upstreamDepths = node.upstream.map((id) => {
      const upstream = services.find((item) => item.id === id)
      return upstream ? findDepth(upstream, nextTrail) + 1 : 0
    })
    const depth = Math.max(0, ...upstreamDepths)
    depthById.set(node.id, depth)
    return depth
  }
  const groups = new Map<number, ServiceNode[]>()
  services.forEach((node) => {
    const depth = findDepth(node)
    groups.set(depth, [...(groups.get(depth) ?? []), node])
  })
  const maxDepth = Math.max(...groups.keys(), 0)
  const positioned: PositionedNode[] = []
  groups.forEach((nodes, depth) => {
    nodes.forEach((node, index) => {
      positioned.push({
        ...node,
        x: 72 + (depth / Math.max(maxDepth, 1)) * 556,
        y: 56 + (index + 0.5) * (188 / nodes.length),
      })
    })
  })
  return positioned
}

export function ServiceMap({ services }: { services: ServiceNode[] }) {
  if (!services.length) return <EmptyState title="No dependency data" message="No services are mapped for this incident." />
  const nodes = positionNodes(services)
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return (
    <section className="panel service-panel">
      <SectionHeading title="Service path" description="Recorded upstream dependencies and current incident state." />
      <div className="service-map-wrap">
        <svg className="service-map" viewBox="0 0 700 300" role="img" aria-label="Service dependency map">
          <defs>
            <marker id="dependency-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 Z" className="map-arrow" />
            </marker>
          </defs>
          {nodes.flatMap((node) => node.upstream.map((upstreamId) => {
            const upstream = byId.get(upstreamId)
            if (!upstream) return null
            return (
              <path
                key={`${upstreamId}-${node.id}`}
                className="map-connection"
                markerEnd="url(#dependency-arrow)"
                d={`M ${upstream.x + 72} ${upstream.y} C ${upstream.x + 120} ${upstream.y}, ${node.x - 120} ${node.y}, ${node.x - 72} ${node.y}`}
              />
            )
          }))}
          {nodes.map((node) => (
            <g key={node.id} className={`map-node map-node-${node.status}`} transform={`translate(${node.x - 68} ${node.y - 24})`}>
              <rect width="136" height="48" rx="8" />
              <circle cx="16" cy="16" r="4" />
              <text x="26" y="19">{node.label}</text>
              <text className="map-node-status" x="16" y="36">{node.status}</text>
            </g>
          ))}
        </svg>
      </div>
      <div className="service-list" aria-label="Service statuses">
        {services.map((service) => <div key={service.id}><span>{service.label}</span><ServiceStatusBadge status={service.status} /></div>)}
      </div>
    </section>
  )
}

import { Maximize, Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lifeSpan } from '../lib/dates'
import { CARD_H, CARD_W, computeLayout, type Layout } from '../lib/layout'
import { initials } from '../lib/util'
import type { Person, Union } from '../types'

export interface DiagramProps {
  people: Person[]
  unions: Union[]
  collapsed: Set<string>
  onToggle?: (group: string) => void
  selectedId?: string
  /** ids on the highlighted relation path */
  highlight?: string[]
  /** small caption under each name (kinship term) */
  labels?: Map<string, string>
  onSelect?: (id: string) => void
  /** centre the view on this member whenever `n` changes */
  focus?: { id: string; n: number }
}

function wrapName(name: string): [string, string] {
  const words = name.trim().split(/\s+/)
  if (name.length <= 15 || words.length < 2) return [name, '']
  let first = ''
  let i = 0
  while (i < words.length - 1 && (first + ' ' + words[i]).trim().length <= 14) {
    first = (first + ' ' + words[i]).trim()
    i++
  }
  if (!first) first = words[i++]
  let second = words.slice(i).join(' ')
  if (second.length > 16) second = second.slice(0, 15) + '…'
  return [first, second]
}

const TONE = {
  male: { fill: '#f0f9ff', stroke: '#7dd3fc', av: '#bae6fd', text: '#0369a1' },
  female: { fill: '#fff1f2', stroke: '#fda4af', av: '#fecdd3', text: '#be123c' },
  other: { fill: '#f5f5f4', stroke: '#d6d3d1', av: '#e7e5e4', text: '#44403c' },
}

/** The tree drawn at natural size; shared by the interactive view and the PNG/PDF export. */
export function TreeSvgContent({ layout, people, selectedId, highlight, labels, onToggle }: { layout: Layout } & Pick<DiagramProps, 'people' | 'selectedId' | 'highlight' | 'labels' | 'onToggle'>) {
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const hi = useMemo(() => new Set(highlight ?? []), [highlight])
  const onPath = (ids: string[]) => {
    if (!highlight || highlight.length < 2) return false
    for (let i = 1; i < highlight.length; i++) if (ids.includes(highlight[i - 1]) && ids.includes(highlight[i])) return true
    return false
  }
  const dim = hi.size > 0
  return (
    <>
      {layout.edges.map((e, i) => {
        const on = onPath(e.ids)
        return (
          <path
            key={i}
            d={e.d}
            fill="none"
            stroke={on ? '#d97706' : e.kind === 'spouse' ? '#e11d48' : e.kind === 'cross' ? '#a8a29e' : '#78716c'}
            strokeWidth={on ? 4 : e.kind === 'spouse' ? 2 : 1.5}
            strokeDasharray={e.kind === 'cross' && !on ? '5 4' : undefined}
            opacity={dim && !on ? 0.35 : 1}
          />
        )
      })}
      {layout.nodes.map((n) => {
        const p = byId.get(n.id)
        if (!p) return null
        const tone = p.deceased ? { ...TONE[p.gender], fill: '#f5f5f4' } : TONE[p.gender]
        const [l1, l2] = wrapName(p.fullName || '(chưa đặt tên)')
        const span = lifeSpan(p.birthDate, p.deathDate, p.deceased)
        const label = labels?.get(p.id)
        const sel = selectedId === p.id
        const on = hi.has(p.id)
        const lines = [l1, l2].filter(Boolean)
        const extra = (span ? 1 : 0) + (label ? 1 : 0)
        let y = n.y + CARD_H / 2 - ((lines.length * 14 + extra * 12) / 2) + 11
        return (
          <g key={n.id} data-id={n.id} style={{ cursor: 'pointer' }} opacity={dim && !on ? 0.45 : 1}>
            <title>{p.fullName}</title>
            <rect x={n.x} y={n.y} width={CARD_W} height={CARD_H} rx={12} fill={tone.fill} stroke={on ? '#d97706' : sel ? '#9f1239' : tone.stroke} strokeWidth={on || sel ? 3 : 1.5} />
            {p.photo ? (
              <>
                <clipPath id={`clip-${n.id}`}>
                  <circle cx={n.x + 26} cy={n.y + CARD_H / 2} r={19} />
                </clipPath>
                <image href={p.photo} x={n.x + 7} y={n.y + CARD_H / 2 - 19} width={38} height={38} clipPath={`url(#clip-${n.id})`} preserveAspectRatio="xMidYMid slice" />
              </>
            ) : (
              <>
                <circle cx={n.x + 26} cy={n.y + CARD_H / 2} r={19} fill={tone.av} />
                <text x={n.x + 26} y={n.y + CARD_H / 2 + 5.5} textAnchor="middle" fontSize={16} fontWeight={700} fill={tone.text}>
                  {initials(p.fullName)}
                </text>
              </>
            )}
            {lines.map((t, i) => {
              const el = (
                <text key={i} x={n.x + 52} y={y} fontSize={12} fontWeight={700} fill="#1c1917">
                  {t}
                </text>
              )
              y += 14
              return el
            })}
            {span && (
              <text x={n.x + 52} y={(y += 0)} fontSize={10} fill="#78716c">
                {span}
              </text>
            )}
            {label && (
              <text x={n.x + 52} y={y + (span ? 12 : 0)} fontSize={10.5} fontWeight={700} fill="#b45309">
                {label}
              </text>
            )}
          </g>
        )
      })}
      {onToggle &&
        layout.toggles.map((t) => (
          <g key={t.group} data-toggle={t.group} style={{ cursor: 'pointer' }}>
            <title>{t.collapsed ? 'Mở rộng nhánh' : 'Thu gọn nhánh'}</title>
            <circle cx={t.x} cy={t.y} r={11} fill="#fff" stroke="#78716c" strokeWidth={1.5} />
            <text x={t.x} y={t.y + 4.5} textAnchor="middle" fontSize={14} fontWeight={700} fill="#44403c">
              {t.collapsed ? '+' : '−'}
            </text>
            {t.collapsed && (
              <text x={t.x} y={t.y + 26} textAnchor="middle" fontSize={10.5} fill="#78716c">
                {t.hiddenCount} người
              </text>
            )}
          </g>
        ))}
    </>
  )
}

interface View {
  x: number
  y: number
  k: number
}
const MIN_K = 0.15
const MAX_K = 3
const PAD = 24

export default function TreeDiagram(props: DiagramProps) {
  const { people, unions, collapsed, onToggle, onSelect, focus } = props
  const layout = useMemo(() => computeLayout(people, unions, collapsed), [people, unions, collapsed])
  const wrap = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ x: PAD, y: PAD, k: 1 })
  const viewRef = useRef(view)
  viewRef.current = view
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({ moved: 0, dist: 0 })

  const fit = useCallback(() => {
    const el = wrap.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const k = Math.min(1.2, Math.max(MIN_K, Math.min((width - PAD * 2) / layout.width, (height - PAD * 2) / layout.height)))
    setView({ k, x: (width - layout.width * k) / 2, y: Math.max(PAD, (height - layout.height * k) / 2) })
  }, [layout.width, layout.height])

  const fitted = useRef(false)
  useEffect(() => {
    if (!fitted.current && layout.nodes.length) {
      fitted.current = true
      fit()
    }
  }, [fit, layout.nodes.length])

  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setView((v) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor))
      const f = k / v.k
      return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f }
    })
  }, [])

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const focusN = focus?.n
  useEffect(() => {
    if (!focus) return
    const n = layout.nodes.find((x) => x.id === focus.id)
    const el = wrap.current
    if (!n || !el) return
    const { width, height } = el.getBoundingClientRect()
    const k = Math.max(viewRef.current.k, 0.8)
    setView({ k, x: width / 2 - (n.x + CARD_W / 2) * k, y: height / 2 - (n.y + CARD_H / 2) * k })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusN])

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) gesture.current.moved = 0
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current.dist = Math.hypot(a.x - b.x, a.y - b.y)
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const cur = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, cur)
    if (pointers.current.size === 1) {
      const dx = cur.x - prev.x
      const dy = cur.y - prev.y
      gesture.current.moved += Math.abs(dx) + Math.abs(dy)
      if (gesture.current.moved > 4) {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
      }
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const r = wrap.current!.getBoundingClientRect()
      if (gesture.current.dist > 0) zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, dist / gesture.current.dist)
      gesture.current.dist = dist
      gesture.current.moved += 10
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const had = pointers.current.delete(e.pointerId)
    if (!had || pointers.current.size > 0 || gesture.current.moved > 6) return
    const target = e.target as Element
    const toggle = target.closest('[data-toggle]')
    if (toggle) return onToggle?.(toggle.getAttribute('data-toggle')!)
    const node = target.closest('[data-id]')
    if (node) onSelect?.(node.getAttribute('data-id')!)
  }

  const center = () => {
    const r = wrap.current!.getBoundingClientRect()
    return [r.width / 2, r.height / 2] as const
  }

  return (
    <div
      ref={wrap}
      className="relative h-full w-full touch-none overflow-hidden bg-[radial-gradient(#e7e5e4_1px,transparent_1px)] select-none [background-size:20px_20px]"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
      data-testid="tree-diagram"
      data-zoom={view.k.toFixed(3)}
      data-pan={`${Math.round(view.x)},${Math.round(view.y)}`}
    >
      <svg width="100%" height="100%" role="img" aria-label="Sơ đồ cây gia phả">
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          <TreeSvgContent layout={layout} {...props} />
        </g>
      </svg>
      <div className="absolute right-3 bottom-3 flex flex-col overflow-hidden rounded-xl border border-stone-300 bg-white shadow" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Phóng to" className="p-2.5 hover:bg-stone-100" onClick={() => zoomAt(...center(), 1.3)}>
          <Plus size={18} />
        </button>
        <button type="button" aria-label="Thu nhỏ" className="border-y border-stone-200 p-2.5 hover:bg-stone-100" onClick={() => zoomAt(...center(), 1 / 1.3)}>
          <Minus size={18} />
        </button>
        <button type="button" aria-label="Vừa màn hình" className="p-2.5 hover:bg-stone-100" onClick={fit}>
          <Maximize size={18} />
        </button>
      </div>
    </div>
  )
}

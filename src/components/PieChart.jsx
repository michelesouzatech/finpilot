import { useState } from 'react'
import { formatMoney } from '../lib/constants'

// Cores das fatias, na ordem em que são distribuídas. Saem da paleta do app
// (coral, mint, rose) e continuam em tons que convivem com ela — o suficiente
// pra distinguir fatias vizinhas sem virar arco-íris.
const SLICE_COLORS = ['#f9876f', '#1f9d6f', '#e38c92', '#f0b429', '#6fa8c9', '#a98cd8']
const OTHERS_COLOR = '#b9b2ab'

// Raio que dá circunferência ≈ 100, pra `strokeDasharray` poder ser lido
// direto em porcentagem. O `pathLength={100}` deixa isso explícito mesmo se o
// raio mudar depois.
const RADIUS = 15.9155

function percentLabel(value, total) {
  if (total <= 0) return '0%'
  const percent = (value / total) * 100
  if (percent > 0 && percent < 1) return '<1%'
  return `${Math.round(percent)}%`
}

// Muita fatia fininha vira ruído: as maiores ficam, o resto vira um "Outros"
// só — que ainda soma certo no total.
function groupSlices(slices, maxSlices) {
  if (slices.length <= maxSlices) return slices
  const visible = slices.slice(0, maxSlices - 1)
  const rest = slices.slice(maxSlices - 1)
  return [
    ...visible,
    {
      id: '__outros__',
      label: `Outros (${rest.length})`,
      emoji: '📦',
      value: rest.reduce((sum, s) => sum + s.value, 0),
    },
  ]
}

function PieChart({ slices, centerLabel = 'Total', maxSlices = 6 }) {
  const [activeId, setActiveId] = useState(null)

  const data = groupSlices(slices, maxSlices)
  const total = data.reduce((sum, s) => sum + s.value, 0)
  const active = data.find((s) => s.id === activeId) ?? null

  // O deslocamento acumulado usa a porcentagem cheia; só o traço desenhado é
  // encurtado, e é essa diferença que abre o respiro entre as fatias.
  let offset = 0
  const arcs = data.map((slice, index) => {
    const percent = total > 0 ? (slice.value / total) * 100 : 0
    const gap = data.length > 1 ? Math.min(0.8, percent / 2) : 0
    const arc = {
      ...slice,
      percent,
      dash: Math.max(percent - gap, 0.4),
      offset,
      color: slice.id === '__outros__' ? OTHERS_COLOR : SLICE_COLORS[index % SLICE_COLORS.length],
    }
    offset += percent
    return arc
  })

  const summary = arcs
    .map((arc) => `${arc.label}: ${percentLabel(arc.value, total)}`)
    .join(', ')

  function toggle(id) {
    setActiveId((current) => (current === id ? null : id))
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-32 w-32 shrink-0">
        <svg viewBox="0 0 42 42" className="h-full w-full" role="img" aria-label={summary}>
          <circle
            cx="21"
            cy="21"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.07"
            strokeWidth="6"
            className="text-ink"
          />
          <g transform="rotate(-90 21 21)">
            {arcs.map((arc) => (
              <circle
                key={arc.id}
                cx="21"
                cy="21"
                r={RADIUS}
                pathLength={100}
                fill="none"
                stroke={arc.color}
                strokeWidth={activeId === arc.id ? 7.5 : 6}
                strokeDasharray={`${arc.dash} ${100 - arc.dash}`}
                strokeDashoffset={-arc.offset}
                className="cursor-pointer transition-[stroke-width]"
                onClick={() => toggle(arc.id)}
              />
            ))}
          </g>
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
          <span className="w-full truncate text-[0.65rem] leading-tight text-gray">
            {active ? `${active.emoji ?? ''} ${active.label}`.trim() : centerLabel}
          </span>
          <span className="font-display text-sm font-bold leading-tight text-ink">
            {formatMoney(active ? active.value : total)}
          </span>
          {active && (
            <span className="text-[0.65rem] leading-tight text-gray">
              {percentLabel(active.value, total)}
            </span>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {arcs.map((arc) => (
          <button
            key={arc.id}
            type="button"
            onClick={() => toggle(arc.id)}
            aria-pressed={activeId === arc.id}
            className={`flex items-center gap-2 rounded-lg px-1 py-0.5 text-left transition ${
              activeId === arc.id ? 'bg-ink/5' : 'hover:bg-ink/[0.03]'
            }`}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: arc.color }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-xs text-gray">
              {arc.emoji ? `${arc.emoji} ` : ''}
              {arc.label}
            </span>
            <span className="shrink-0 text-xs font-semibold text-ink">
              {percentLabel(arc.value, total)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default PieChart

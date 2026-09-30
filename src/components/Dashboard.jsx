import { useMemo, useRef, useState } from 'react'
import { Card, EmptyState } from './ui'
import PieChart from './PieChart'
import { summarizeAlerts } from '../lib/notifications'
import { ArrowUpIcon, ArrowDownIcon, WalletIcon } from './icons'
import { formatMoney, formatDate, monthLabel } from '../lib/constants'
import {
  computeMonthSummary,
  computeProjection,
  computeAvailableBalance,
  computeInvestedAmount,
  computeGoalsReserved,
  computePocketsReserved,
  monthBillsBreakdown,
  cardSpendingBreakdown,
  cardTotalsBreakdown,
} from '../lib/dashboard'

function ProjectionChart({ points }) {
  const width = 300
  const height = 120
  const padding = 8

  const svgRef = useRef(null)
  const [activeIndex, setActiveIndex] = useState(null)

  const max = Math.max(...points.map((p) => p.income), ...points.map((p) => p.expense)) || 1

  const toX = (i) => padding + (i / (points.length - 1)) * (width - padding * 2)
  const toY = (value) => height - padding - (value / max) * (height - padding * 2)

  const incomePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(p.income)}`).join(' ')
  const expensePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(p.expense)}`).join(' ')

  const last = points[points.length - 1]
  const active = activeIndex !== null ? points[activeIndex] : null

  const updateFromClientX = (clientX) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const x = ratio * width
    const i = Math.round(((x - padding) / (width - padding * 2)) * (points.length - 1))
    setActiveIndex(Math.min(points.length - 1, Math.max(0, i)))
  }

  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    updateFromClientX(e.clientX)
  }
  const handlePointerMove = (e) => {
    if (e.buttons === 0 && e.pointerType === 'mouse' && activeIndex === null) return
    updateFromClientX(e.clientX)
  }
  const handlePointerEnter = (e) => {
    if (e.pointerType === 'mouse') updateFromClientX(e.clientX)
  }
  const handlePointerUp = () => setActiveIndex(null)
  const handlePointerLeave = (e) => {
    if (e.pointerType === 'mouse') setActiveIndex(null)
  }

  const tooltipX = active ? toX(activeIndex) : 0
  const tooltipSide = tooltipX > width - 70 ? 'right' : 'left'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 text-xs text-gray">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-mint" /> Entradas previstas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose" /> Saídas previstas
        </span>
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="block w-full touch-none select-none"
          preserveAspectRatio="none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerEnter={handlePointerEnter}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        >
          <path
            d={incomePath}
            fill="none"
            stroke="currentColor"
            className="text-mint"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={expensePath}
            fill="none"
            stroke="currentColor"
            className="text-rose"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx={toX(points.length - 1)} cy={toY(last.income)} r="4" fill="currentColor" className="text-mint" />
          <circle cx={toX(points.length - 1)} cy={toY(last.expense)} r="4" fill="currentColor" className="text-rose" />

          {active && (
            <g>
              <line
                x1={tooltipX}
                x2={tooltipX}
                y1={padding}
                y2={height - padding}
                stroke="currentColor"
                strokeOpacity="0.15"
                strokeWidth="1"
              />
              <circle
                cx={tooltipX}
                cy={toY(active.income)}
                r="4.5"
                fill="white"
                stroke="currentColor"
                strokeWidth="2.5"
                className="text-mint"
              />
              <circle
                cx={tooltipX}
                cy={toY(active.expense)}
                r="4.5"
                fill="white"
                stroke="currentColor"
                strokeWidth="2.5"
                className="text-rose"
              />
            </g>
          )}
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute top-0"
            style={{ left: `${(tooltipX / width) * 100}%` }}
          >
            <div
              className={`absolute top-0 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-xs text-white shadow-lg ${
                tooltipSide === 'right' ? '-translate-x-full' : ''
              }`}
            >
              <div className="font-semibold text-mint">{formatMoney(active.income)}</div>
              <div className="font-semibold text-rose">{formatMoney(active.expense)}</div>
              <div className="text-[10px] text-white/70">
                {activeIndex === 0 ? 'Hoje' : formatDate(active.date)}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between text-xs">
        <span className="font-medium text-mint">{formatMoney(last.income)} até {formatDate(last.date)}</span>
        <span className="font-medium text-rose">{formatMoney(last.expense)} até {formatDate(last.date)}</span>
      </div>
      <p className="text-[11px] text-gray">
        Saldo projetado em {formatDate(last.date)}: <span className="font-medium text-ink">{formatMoney(last.balance)}</span>
      </p>
    </div>
  )
}

function availabilityNote({ reserved, invested }) {
  if (reserved <= 0 && invested <= 0) return null
  const apart = reserved + invested
  return `${formatMoney(apart)} em investimentos, gatinhos e saldo separado não entram nesse valor.`
}

// Cor por natureza do aviso: a pagar em rosa (mais forte quando já atrasou),
// a receber em coral — a mesma convenção dos cards do sininho.
const alertClasses = {
  atrasadas: 'bg-rose/20 hover:bg-rose/25',
  'a-vencer': 'bg-rose/10 hover:bg-rose/15',
  'a-receber': 'bg-coral/10 hover:bg-coral/20',
}

// Um aviso resumido por grupo (atrasadas / a vencer / a receber). O clique
// abre a ocorrência mais urgente do grupo em Lançamentos, que é onde se marca
// como paga ou recebida.
function AlertSummary({ alert, onFocusBill }) {
  const amount =
    alert.total > 0
      ? `${formatMoney(alert.total)}${alert.hasUnknown ? '+' : ''}`
      : alert.hasUnknown
        ? 'A definir'
        : formatMoney(0)

  return (
    <button
      type="button"
      onClick={() => onFocusBill?.(alert.focusKey)}
      className={`flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left transition active:scale-[0.99] ${
        alertClasses[alert.id] ?? alertClasses['a-vencer']
      }`}
    >
      <span className="text-base leading-none">{alert.emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold leading-snug text-ink">{alert.title}</span>
        <span className="block text-[0.7rem] leading-snug text-gray">{alert.detail}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-display text-xs font-semibold text-ink">{amount}</span>
        <span className="block text-[0.65rem] font-medium text-coral underline underline-offset-2">
          {alert.actionLabel}
        </span>
      </span>
    </button>
  )
}

// Os dois gráficos de pizza dividem o mesmo cartão: título, o gráfico (ou o
// aviso de que ainda não há o que fatiar) e uma linha de rodapé com o total.
function BreakdownCard({ title, subtitle, slices, centerLabel, empty, footer, toolbar }) {
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        <p className="text-xs text-gray">{subtitle}</p>
      </div>
      {toolbar}
      {slices.length === 0 ? (
        <p className="rounded-2xl bg-ink/5 px-4 py-3 text-sm text-gray">{empty}</p>
      ) : (
        <>
          <PieChart slices={slices} centerLabel={centerLabel} />
          {footer && <p className="text-xs text-gray">{footer}</p>}
        </>
      )}
    </Card>
  )
}

function Dashboard({
  accounts,
  transactions,
  goals,
  pockets,
  bills = [],
  billPayments = [],
  categories = [],
  subscriptions = [],
  onFocusBill,
}) {
  const summary = useMemo(() => computeMonthSummary(accounts, transactions), [accounts, transactions])
  const projection = useMemo(
    () => computeProjection(accounts, transactions, bills, billPayments, 30),
    [accounts, transactions, bills, billPayments],
  )
  const available = useMemo(
    () => computeAvailableBalance(accounts, transactions, goals, pockets),
    [accounts, transactions, goals, pockets],
  )
  const invested = useMemo(
    () => computeInvestedAmount(accounts, transactions),
    [accounts, transactions],
  )
  const reserved = useMemo(
    () => computeGoalsReserved(goals) + computePocketsReserved(pockets),
    [goals, pockets],
  )
  const note = availabilityNote({ reserved, invested })

  // Calculado aqui, e não recebido pronto do App: o Dashboard mostra as
  // pendências independentemente do que já foi "limpado" no sininho — limpar
  // esconde o aviso de lá, não resolve a conta.
  const alerts = useMemo(() => summarizeAlerts(bills, billPayments), [bills, billPayments])

  const monthBills = useMemo(
    () => monthBillsBreakdown(bills, billPayments, categories),
    [bills, billPayments, categories],
  )
  const cardsByCategory = useMemo(
    () => cardSpendingBreakdown(accounts, transactions, subscriptions, categories),
    [accounts, transactions, subscriptions, categories],
  )
  const cardsByCard = useMemo(
    () => cardTotalsBreakdown(accounts, transactions, subscriptions),
    [accounts, transactions, subscriptions],
  )
  // Com um cartão só, fatiar por cartão daria uma fatia de 100% — a escolha
  // só aparece pra quem tem mais de um.
  const [cardView, setCardView] = useState('categoria')
  const hasCards = accounts.some((a) => a.type === 'cartao')
  const hasManyCards = cardsByCard.length > 1
  const cardSlices = hasManyCards && cardView === 'cartao' ? cardsByCard : cardsByCategory
  const cardsTotal = cardsByCard.reduce((sum, s) => sum + s.value, 0)

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={<WalletIcon className="text-coral" width={32} height={32} />}
        title="Cadastre uma conta pra começar"
        description="Vá na aba Contas e adicione uma conta ou cartão pra ver seu panorama financeiro aqui."
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-1">
        <span className="text-sm font-medium text-gray">Saldo disponível</span>
        <span className="font-display text-3xl font-bold text-ink">{formatMoney(available)}</span>
        <span className="text-[11px] text-gray">
          {note ?? 'Soma das contas (não conta limite de cartão)'}
        </span>
      </Card>

      <Card className="flex flex-row items-center justify-between gap-2 py-3">
        <span className="text-sm font-medium text-gray">Saldo total</span>
        <span className="font-display text-lg font-semibold text-ink">
          {formatMoney(summary.totalBalance)}
        </span>
      </Card>

      {alerts.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {alerts.map((alert) => (
            <AlertSummary key={alert.id} alert={alert} onFocusBill={onFocusBill} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-sm font-medium text-gray">
            <ArrowUpIcon className="text-mint" /> Entradas
          </span>
          <span className="font-display text-xl font-bold text-ink">{formatMoney(summary.income)}</span>
          <span className="text-xs text-gray">Este mês</span>
        </Card>
        <Card className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-sm font-medium text-gray">
            <ArrowDownIcon className="text-rose" /> Saídas
          </span>
          <span className="font-display text-xl font-bold text-ink">{formatMoney(summary.expense)}</span>
          <span className="text-xs text-gray">Este mês</span>
        </Card>
      </div>

      <BreakdownCard
        title="Contas do mês"
        subtitle={`Quanto cada conta pesa no total a pagar de ${monthLabel(monthBills.monthKey)}`}
        slices={monthBills.slices}
        centerLabel="Total do mês"
        empty="Cadastre suas contas a pagar na aba Lançamentos pra ver aqui o peso de cada uma no mês."
        footer={`${formatMoney(monthBills.paidTotal)} já pago de ${formatMoney(monthBills.total)}.`}
      />

      {/* Sem cartão cadastrado esse gráfico não tem o que dizer — nem em
          branco: some da tela até existir um cartão. */}
      {hasCards && (
        <BreakdownCard
          title="Gastos no cartão"
          subtitle={
            hasManyCards && cardView === 'cartao'
              ? 'Fatura em aberto de cada cartão'
              : 'Categorias das compras nas faturas em aberto'
          }
          slices={cardSlices}
          centerLabel={hasManyCards && cardView === 'cartao' ? 'Faturas abertas' : 'Total gasto'}
          empty="Nenhuma compra nas faturas em aberto ainda. Lance uma compra na aba Cartões."
          footer={`${formatMoney(cardsTotal)} nas faturas que ainda não fecharam.`}
          toolbar={
            hasManyCards && (
              <div className="flex gap-1 rounded-full bg-ink/5 p-1">
                {[
                  { id: 'categoria', label: 'Por categoria' },
                  { id: 'cartao', label: 'Por cartão' },
                ].map((view) => (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => setCardView(view.id)}
                    className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-[0.98] ${
                      cardView === view.id
                        ? 'bg-surface text-ink shadow-sm'
                        : 'text-gray hover:text-ink'
                    }`}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
            )
          }
        />
      )}

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Projeção 30 dias</h2>
          <p className="text-xs text-gray">
            Baseada nos lançamentos recorrentes e nas contas já cadastradas pros próximos meses
          </p>
        </div>
        <ProjectionChart points={projection} />
      </Card>
    </div>
  )
}

export default Dashboard

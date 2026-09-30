import { todayIso, WORK_HOURS_PER_MONTH } from './constants'
import { computeProjection } from './dashboard'
import { cardAvailableLimit } from './invoices'
import { computeForecast, computeSaved } from './goals'

function daysBetween(isoA, isoB) {
  const a = Date.UTC(...isoA.split('-').map(Number))
  const b = Date.UTC(...isoB.split('-').map(Number))
  return Math.round((b - a) / (1000 * 60 * 60 * 24))
}

function addDaysIso(iso, days) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

// Soma mensal (uma ocorrência) de todas as transações recorrentes: uma
// aproximação de "quanto sobra por mês" no ritmo atual, sem essa compra.
function recurringMonthlyNet(transactions) {
  return (transactions ?? [])
    .filter((t) => t.recurring && t.date)
    .reduce((sum, t) => {
      const amount = Number(t.amount) || 0
      return sum + (t.type === 'entrada' ? amount : -amount)
    }, 0)
}

function addMonthsIso(iso, months) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10)
}

// Simula uma compra futura — à vista ou parcelada no cartão — sem tocar em
// nenhum lançamento real:
// - Se for no cartão, confere se o valor total cabe no limite disponível.
// - Projeta o saldo com uma "fatura" saindo a cada mês, por `installments`
//   meses, a partir da data da compra.
// - Aponta se, nos meses em que a parcela está ativa, ela é maior que a
//   sobra mensal atual (ou seja, a pessoa passaria a gastar mais do que
//   ganha enquanto estiver pagando).
export function simulatePurchase(
  accounts,
  transactions,
  purchase,
  { bills = [], billPayments = [], subscriptions = [] } = {},
) {
  const installments = Math.max(1, Math.round(purchase.installments || 1))
  const installmentAmount = purchase.amount / installments
  const chargeDates = Array.from({ length: installments }, (_, k) => addMonthsIso(purchase.date, k))

  const today = todayIso()
  const lastCharge = chargeDates[chargeDates.length - 1]
  const days = Math.min(365, Math.max(30, daysBetween(today, lastCharge) + 5))

  const baseline = computeProjection(accounts, transactions, bills, billPayments, days)
  const whatIf = baseline.map((point) => {
    const chargesSoFar = chargeDates.filter((d) => d <= point.date).length
    return chargesSoFar > 0
      ? { ...point, balance: point.balance - installmentAmount * chargesSoFar }
      : point
  })

  const lowest = whatIf.reduce((min, p) => (p.balance < min.balance ? p : min), whatIf[0])

  let cardCheck = null
  if (purchase.cardId) {
    const card = accounts.find((a) => a.id === purchase.cardId)
    if (card) {
      // Mesmo limite disponível que a tela de Cartões mostra — desconta a
      // fatura aberta, as fechadas que ainda não foram pagas e as parcelas
      // que ainda vão cair. Antes essa conta era feita à parte aqui e dava um
      // número mais otimista que o da outra tela, pro mesmo cartão.
      const availableLimit = cardAvailableLimit(card, transactions, bills, billPayments, subscriptions)
      cardCheck = {
        cardName: card.name,
        availableLimit,
        fits: purchase.amount <= availableLimit,
        missing: Math.max(0, purchase.amount - availableLimit),
      }
    }
  }

  const monthlyNet = recurringMonthlyNet(transactions)
  const overspend = installmentAmount > monthlyNet

  return {
    baseline,
    whatIf,
    lowest,
    chargeDates,
    installments,
    installmentAmount,
    cardCheck,
    overspend: overspend ? { monthlyNet, installmentAmount, months: installments } : null,
  }
}

// Pra cada meta com previsão ativa, estima quanto essa compra atrasaria a
// data prevista: assume que o dinheiro sairia do mesmo ritmo de depósito
// que já vem sustentando a meta.
export function simulateGoalImpact(goal, purchaseAmount) {
  const forecast = computeForecast(goal)
  if (forecast.status !== 'forecast') return null

  const target = Number(goal.target) || 0
  const remaining = target - computeSaved(goal)
  if (remaining <= 0 || forecast.daysToGo <= 0) return null

  const dailyRate = remaining / forecast.daysToGo
  if (dailyRate <= 0) return null

  const extraDays = Math.ceil(purchaseAmount / dailyRate)
  if (extraDays <= 0) return null

  return {
    originalDate: forecast.date,
    newDate: addDaysIso(forecast.date, extraDays),
    extraDays,
  }
}

// Quantas horas de trabalho são necessárias pra pagar essa compra, a partir
// do salário bruto mensal cadastrado (valor da hora = salário / 220h).
export function hoursToBuy(amount, grossSalary) {
  const salary = Number(grossSalary) || 0
  if (salary <= 0) return null
  const hourlyWage = salary / WORK_HOURS_PER_MONTH
  return amount / hourlyWage
}

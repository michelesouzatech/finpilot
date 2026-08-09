import { todayIso, categoryMeta } from './constants'
import { computeSaved } from './goals'
import { buildOccurrencesForMonth } from './bills'
import { currentPeriodKey, invoicePeriod, invoiceItems, invoiceTotal } from './invoices'

// Data local (não UTC) — ver o comentário em constants.js/todayIso sobre por
// que `toISOString()` sozinho causa bug de fuso horário perto da meia-noite.
function toIsoDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function currentMonthKey() {
  return todayIso().slice(0, 7)
}

function signedAmount(tx) {
  const amount = Number(tx.amount) || 0
  return tx.type === 'entrada' ? amount : -amount
}

// Saldo atual de uma conta = o valor cadastrado nela (ponto de partida) +
// todas as entradas/saídas lançadas nessa conta desde então. É assim que
// lançar uma transação passa a atualizar o saldo automaticamente, sem
// precisar mexer no valor da conta na mão.
export function accountCurrentBalance(account, transactions) {
  const net = (transactions ?? [])
    .filter((t) => t.accountId === account.id)
    .reduce((sum, t) => sum + signedAmount(t), 0)
  return (Number(account.amount) || 0) + net
}

export function computeBalance(accounts, transactions = []) {
  return accounts
    .filter((a) => a.type !== 'cartao')
    .reduce((sum, a) => sum + accountCurrentBalance(a, transactions), 0)
}

export function computeInvestedAmount(accounts, transactions = []) {
  return accounts
    .filter((a) => a.type === 'investimento')
    .reduce((sum, a) => sum + accountCurrentBalance(a, transactions), 0)
}

export function computeGoalsReserved(goals) {
  return (goals ?? []).reduce((sum, g) => sum + computeSaved(g), 0)
}

// Saldo separado usa a mesma mecânica das metas (movements guardados/retirados
// a qualquer momento), só que sem valor alvo nem prazo — por isso reaproveita
// computeSaved em vez de duplicar a soma.
export function computePocketsReserved(pockets) {
  return (pockets ?? []).reduce((sum, p) => sum + computeSaved(p), 0)
}

// Dinheiro que a pessoa realmente pode gastar agora: tira do saldo total o
// que está investido, o que já foi guardado nos gatinhos (metas) e o que está
// em saldo separado.
export function computeAvailableBalance(accounts, transactions, goals, pockets) {
  return (
    computeBalance(accounts, transactions) -
    computeInvestedAmount(accounts, transactions) -
    computeGoalsReserved(goals) -
    computePocketsReserved(pockets)
  )
}

export function computeMonthSummary(accounts, transactions) {
  const monthKey = currentMonthKey()
  const monthTx = transactions.filter((t) => t.date?.slice(0, 7) === monthKey)
  const income = monthTx
    .filter((t) => t.type === 'entrada')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
  const expense = monthTx
    .filter((t) => t.type === 'saida')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)

  return {
    totalBalance: computeBalance(accounts, transactions),
    income,
    expense,
  }
}

// Fatias do gráfico de pizza "Contas do mês": uma por conta a pagar que cai
// no mês atual — pagas e a pagar juntas, porque a pergunta que o gráfico
// responde é "no que o meu mês vai", não "o que ainda falta quitar". Conta
// paga entra pelo valor efetivamente pago; as demais, pelo valor cadastrado.
//
// As faturas de cartão entram como uma fatia só (a conta "Fatura X" gerada
// automaticamente quando a fatura fecha) — o detalhe do que foi comprado é
// justamente o outro gráfico, `cardSpendingBreakdown`.
export function monthBillsBreakdown(bills, billPayments, categories = []) {
  const monthKey = currentMonthKey()
  const occurrences = buildOccurrencesForMonth(bills ?? [], billPayments ?? [], monthKey).filter(
    (o) => (o.bill.type ?? 'saida') === 'saida',
  )

  const slices = occurrences
    .map((o) => {
      const value = Number(o.paid ? o.payment.amount : o.bill.amount) || 0
      const category = categoryMeta(categories, o.bill.category)
      return {
        id: o.key,
        label: o.installmentTotal
          ? `${o.bill.name} (${o.installmentIndex}/${o.installmentTotal})`
          : o.bill.name,
        emoji: o.bill.cardId ? '💳' : (category?.emoji ?? '🧾'),
        value,
        paid: o.paid,
      }
    })
    .filter((slice) => slice.value > 0)
    .sort((a, b) => b.value - a.value)

  return {
    slices,
    total: slices.reduce((sum, s) => sum + s.value, 0),
    paidTotal: slices.filter((s) => s.paid).reduce((sum, s) => sum + s.value, 0),
    monthKey,
  }
}

// Fatura em aberto de cada cartão, no momento em que ela está — não espera
// fechar, igual ao "Faturas em aberto" de Lançamentos.
function openInvoicePeriods(accounts) {
  return (accounts ?? [])
    .filter((a) => a.type === 'cartao')
    .map((card) => ({ card, period: invoicePeriod(card, currentPeriodKey(card)) }))
}

// Fatias do gráfico "Gastos no cartão", agrupadas por categoria e somando
// todos os cartões. Estorno (entrada lançada no cartão) fica de fora: ele
// abate o total da fatura, mas não é gasto de categoria nenhuma — por isso
// esse total pode ficar um pouco acima do de `cardTotalsBreakdown`.
export function cardSpendingBreakdown(accounts, transactions, subscriptions = [], categories = []) {
  const totals = new Map()

  for (const { card, period } of openInvoicePeriods(accounts)) {
    for (const item of invoiceItems(transactions, card.id, period, subscriptions)) {
      if (item.type !== 'saida') continue
      const category = categoryMeta(categories, item.category)
      const id = category?.id ?? 'sem-categoria'
      const current = totals.get(id) ?? {
        id,
        label: category?.label ?? 'Sem categoria',
        emoji: category?.emoji ?? '🗂️',
        value: 0,
      }
      current.value += Number(item.amount) || 0
      totals.set(id, current)
    }
  }

  return [...totals.values()].filter((s) => s.value > 0).sort((a, b) => b.value - a.value)
}

// A mesma fatura em aberto, mas fatiada por cartão — a leitura que interessa
// pra quem tem mais de um.
export function cardTotalsBreakdown(accounts, transactions, subscriptions = []) {
  return openInvoicePeriods(accounts)
    .map(({ card, period }) => ({
      id: card.id,
      label: card.name,
      emoji: '💳',
      value: invoiceTotal(transactions, card.id, period, subscriptions),
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)
}

// Projeta o saldo dos próximos `days` dias, repetindo mensalmente as
// transações marcadas como recorrentes (mesmo dia do mês).
export function computeProjection(accounts, transactions, days = 30) {
  const startBalance = computeBalance(accounts, transactions)
  const recurring = transactions.filter((t) => t.recurring && t.date)
  const today = startOfToday()

  const points = [{ offset: 0, date: toIsoDate(today), balance: startBalance }]
  let balance = startBalance

  for (let offset = 1; offset <= days; offset++) {
    const date = new Date(today)
    date.setDate(date.getDate() + offset)
    const dayOfMonth = date.getDate()

    const delta = recurring
      .filter((t) => new Date(`${t.date}T00:00:00`).getDate() === dayOfMonth)
      .reduce((sum, t) => sum + signedAmount(t), 0)

    balance += delta
    points.push({ offset, date: toIsoDate(date), balance })
  }

  return points
}

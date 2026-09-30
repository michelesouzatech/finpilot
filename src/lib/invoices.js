import { todayIso, categoryMeta, monthLabel } from './constants'
import { paymentsPaidAmount, paymentsDiscountAmount } from './bills'

function pad2(n) {
  return String(n).padStart(2, '0')
}

function ymd(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function clampDay(year, month, day) {
  return Math.min(Math.max(1, day), daysInMonth(year, month))
}

// Intervalo de compras que cai numa fatura: do dia seguinte ao fechamento
// anterior até o dia de fechamento do `periodKey` (mês em que a fatura fecha).
export function invoicePeriod(card, periodKey) {
  const [year, month] = periodKey.split('-').map(Number)
  const closingDay = clampDay(year, month, Number(card.closingDay) || 1)
  const end = ymd(year, month, closingDay)

  const prevMonthDate = new Date(Date.UTC(year, month - 2, 1))
  const prevYear = prevMonthDate.getUTCFullYear()
  const prevMonth = prevMonthDate.getUTCMonth() + 1
  const prevClosingDay = clampDay(prevYear, prevMonth, Number(card.closingDay) || 1)
  const startDate = new Date(Date.UTC(prevYear, prevMonth - 1, prevClosingDay + 1))
  const start = startDate.toISOString().slice(0, 10)

  return { periodKey, start, end }
}

// Em qual fatura (periodKey) uma data de compra cai: se for até o dia de
// fechamento, entra na fatura desse mês; senão, já é da fatura do mês
// seguinte.
export function periodKeyForDate(dateIso, card) {
  const [y, m, d] = dateIso.split('-').map(Number)
  const closingDay = clampDay(y, m, Number(card.closingDay) || 1)
  if (d <= closingDay) return `${y}-${pad2(m)}`
  const next = new Date(Date.UTC(y, m, 1))
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}`
}

export function currentPeriodKey(card, today = todayIso()) {
  return periodKeyForDate(today, card)
}

// Identidade estável de uma fatura: cartão + competência. Não é uma linha
// própria no banco — é só a chave usada pra vincular transações à fatura
// delas (ver `resolveInvoiceId`/`backfillInvoiceIds`), a mesma dupla
// (cardId + periodKey) que o efeito de gerar contas a partir de fatura
// fechada já usa informalmente pra identificar cada fatura (App.jsx).
export function invoiceIdFor(accountId, periodKey) {
  return `${accountId}:${periodKey}`
}

// Calcula a fatura (invoiceId + periodKey) que uma transação de cartão deve
// carregar, a partir da data dela e do fechamento do cartão. Retorna `null`
// se o cartão não tem `closingDay` cadastrado — nesse caso é melhor deixar a
// transação sem fatura (sinal visível de que falta configurar o cartão) do
// que chutar um fechamento, o que faria a transação entrar silenciosamente
// na fatura errada.
export function resolveInvoiceId(dateIso, card) {
  if (card?.closingDay == null) return null
  const periodKey = periodKeyForDate(dateIso, card)
  return { invoiceId: invoiceIdFor(card.id, periodKey), periodKey }
}

// Migração auto-aplicada: carimba `invoiceId`/`periodKey` em toda transação
// de cartão que ainda não tem (dados importados/lançados antes desse campo
// existir). Nunca recalcula uma transação que já tem invoiceId — uma vez
// vinculada, a fatura da transação fica congelada mesmo que o fechamento do
// cartão mude depois; é exatamente isso que evita o bug de uma fatura já
// importada "sumir" quando o dia de fechamento é ajustado.
export function backfillInvoiceIds(transactions, accounts) {
  const cardsById = new Map(accounts.filter((a) => a.type === 'cartao').map((a) => [a.id, a]))

  return (transactions ?? []).map((t) => {
    if (t.invoiceId) return t
    const card = cardsById.get(t.accountId)
    if (!card) return t
    const resolved = resolveInvoiceId(t.date, card)
    if (!resolved) return t
    return { ...t, ...resolved }
  })
}

// Todas as parcelas de uma compra pertencem à mesma categoria — é uma compra
// só, dividida no tempo. Quem categoriza pela Caixa de entrada só vê a parcela
// do mês corrente (as outras estão em faturas futuras), então as seguintes
// ficavam sem categoria e a mesma compra aparecia dividida entre "Educação" e
// "sem categoria" ao longo do ano.
//
// Migração auto-aplicada, e conservadora de propósito: só preenche parcela
// vazia, nunca sobrescreve uma categoria já escolhida. Se as parcelas
// discordarem entre si, vale a primeira categorizada.
export function backfillPurchaseCategories(transactions) {
  const categoryByPurchase = new Map()
  for (const t of transactions ?? []) {
    if (t.purchaseId && t.category && !categoryByPurchase.has(t.purchaseId)) {
      categoryByPurchase.set(t.purchaseId, t.category)
    }
  }
  if (categoryByPurchase.size === 0) return transactions ?? []

  return (transactions ?? []).map((t) => {
    if (!t.purchaseId || t.category) return t
    const category = categoryByPurchase.get(t.purchaseId)
    return category ? { ...t, category } : t
  })
}

// Aplica uma categoria ao lançamento e, se ele for parcela, à compra inteira.
// Compra à vista (sem `purchaseId`) mexe só nela mesma.
export function applyCategoryToPurchase(transactions, targetId, category) {
  const target = (transactions ?? []).find((t) => t.id === targetId)
  if (!target) return transactions ?? []

  return transactions.map((t) => {
    const samePurchase = target.purchaseId && t.purchaseId === target.purchaseId
    return t.id === targetId || samePurchase ? { ...t, category } : t
  })
}

// Soma meses a uma data YYYY-MM-DD preservando o dia (clampado ao último dia
// válido do mês de destino) — mesma regra do `addMonths` das contas
// parceladas em lib/bills.js.
function addMonths(dateIso, count) {
  const [year, month, day] = dateIso.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + count, 1))
  const targetYear = target.getUTCFullYear()
  const targetMonth = target.getUTCMonth() + 1
  return ymd(targetYear, targetMonth, clampDay(targetYear, targetMonth, day))
}

// Datas das parcelas que ainda faltam numa compra parcelada, a partir da
// parcela informada (`firstIndex`) até a última. As anteriores não entram de
// propósito: elas já caíram em faturas passadas, possivelmente já pagas, e
// recriá-las agora mudaria um histórico que já está fechado.
export function installmentSchedule(dateIso, firstIndex, total) {
  const count = Number(total) || 0
  if (count < 1) return []
  const start = Math.min(Math.max(1, Number(firstIndex) || 1), count)
  const schedule = []
  for (let index = start; index <= count; index += 1) {
    schedule.push({ index, date: addMonths(dateIso, index - start) })
  }
  return schedule
}

// Vencimento da fatura: convenção comum no Brasil — se o dia de vencimento é
// depois do dia de fechamento, vence no mesmo mês do fechamento; senão, só
// vence no mês seguinte.
export function invoiceDueDate(card, periodKey) {
  const [year, month] = periodKey.split('-').map(Number)
  const closingDay = Number(card.closingDay) || 1
  const dueDay = Number(card.dueDay) || 1
  const sameMonth = dueDay > closingDay

  const dueDate = new Date(Date.UTC(year, month - 1 + (sameMonth ? 0 : 1), 1))
  const dueYear = dueDate.getUTCFullYear()
  const dueMonth = dueDate.getUTCMonth() + 1
  return ymd(dueYear, dueMonth, clampDay(dueYear, dueMonth, dueDay))
}

// Como a fatura é chamada pra quem usa: pelo mês em que ela VENCE, não pelo
// mês em que fecha — é a convenção dos apps de banco ("a fatura de agosto" é
// a que fechou em 31/07 e vence em 07/08). O `periodKey` segue sendo a
// competência interna (mês de fechamento), usada pra vincular transações;
// só o rótulo muda, então nada de dado gravado depende disso.
export function invoiceMonthKey(card, periodKey) {
  return invoiceDueDate(card, periodKey).slice(0, 7)
}

export function invoiceMonthLabel(card, periodKey) {
  return monthLabel(invoiceMonthKey(card, periodKey))
}

// Fonte da verdade de "quais transações pertencem a essa fatura": o vínculo
// gravado (invoiceId), não mais a data recalculada contra o fechamento atual
// do cartão — assim editar o dia de fechamento de um cartão não reembaralha
// faturas já importadas/lançadas.
export function cardTransactionsInPeriod(transactions, cardId, period) {
  const expectedId = invoiceIdFor(cardId, period.periodKey)
  return (transactions ?? []).filter((t) => t.invoiceId === expectedId)
}

// Uma assinatura vale de `startPeriodKey` até `endPeriodKey` (inclusive) —
// mesma convenção do `recurringEndMonthKey` das contas fixas: cancelar no mês
// atual mantém a cobrança desse mês e corta só as seguintes.
export function subscriptionActiveIn(subscription, periodKey) {
  if (subscription.startPeriodKey && periodKey < subscription.startPeriodKey) return false
  if (subscription.endPeriodKey && periodKey > subscription.endPeriodKey) return false
  return true
}

// Data da cobrança dentro de uma fatura. O período atravessa dois meses do
// calendário (do dia seguinte ao fechamento anterior até o fechamento deste
// mês), então o dia da assinatura é testado nos dois — ex: assinatura dia 28
// num cartão que fecha dia 25 cai sempre no mês anterior ao da fatura.
function chargeDateInPeriod(chargeDay, period) {
  for (const monthKey of new Set([period.start.slice(0, 7), period.end.slice(0, 7)])) {
    const [year, month] = monthKey.split('-').map(Number)
    const date = ymd(year, month, clampDay(year, month, Number(chargeDay) || 1))
    if (date >= period.start && date <= period.end) return date
  }
  return null
}

// Assinatura não vira lançamento salvo: a cobrança de cada fatura é montada
// aqui, na hora de exibir/somar. O formato imita o de uma transação pra poder
// entrar nas mesmas listas e somas das compras normais.
export function subscriptionChargesInPeriod(subscriptions, cardId, period) {
  return (subscriptions ?? [])
    .filter((s) => s.cardId === cardId && subscriptionActiveIn(s, period.periodKey))
    .map((s) => {
      const date = chargeDateInPeriod(s.chargeDay, period)
      if (!date) return null
      return {
        id: `assinatura:${s.id}:${period.periodKey}`,
        subscriptionId: s.id,
        description: s.description,
        amount: Number(s.amount) || 0,
        type: 'saida',
        date,
        accountId: cardId,
        category: s.category,
        invoiceId: invoiceIdFor(cardId, period.periodKey),
        periodKey: period.periodKey,
        isSubscription: true,
      }
    })
    .filter(Boolean)
}

// Tudo que compõe uma fatura: as compras lançadas + as cobranças das
// assinaturas ativas naquele período.
export function invoiceItems(transactions, cardId, period, subscriptions = []) {
  return [
    ...cardTransactionsInPeriod(transactions, cardId, period),
    ...subscriptionChargesInPeriod(subscriptions, cardId, period),
  ]
}

function signedInvoiceAmount(tx) {
  const amount = Number(tx.amount) || 0
  return tx.type === 'entrada' ? -amount : amount
}

// Total da fatura = soma das compras (saída) menos estornos/créditos
// (entrada) lançados no cartão dentro do período.
export function invoiceTotal(transactions, cardId, period, subscriptions = []) {
  return invoiceItems(transactions, cardId, period, subscriptions).reduce(
    (sum, t) => sum + signedInvoiceAmount(t),
    0,
  )
}

// Limite ainda disponível no cartão: limite total menos o que já foi gasto
// na fatura em aberto, menos as faturas fechadas que ainda não foram pagas
// (o limite só volta de verdade quando a fatura é quitada, não quando fecha)
// e menos o que já está comprometido em faturas futuras — as parcelas que
// faltam seguram limite desde a compra, como no cartão de verdade.
//
// Cobrança futura de assinatura de propósito não entra: ela não tem fim, e
// reservar limite de uma cobrança que ainda nem aconteceu zeraria o cartão.
export function cardAvailableLimit(
  card,
  transactions,
  bills = [],
  billPayments = [],
  subscriptions = [],
) {
  const openPeriodKey = currentPeriodKey(card)
  const openPeriod = invoicePeriod(card, openPeriodKey)
  const openTotal = invoiceTotal(transactions, card.id, openPeriod, subscriptions)
  // Fatura paga parcialmente só devolve o limite do que já foi quitado — o
  // restante continua comprometido até o pagamento completar.
  const unpaidPastInvoices = bills
    .filter((b) => b.cardId === card.id)
    .reduce((sum, b) => {
      const pays = billPayments.filter((p) => p.billId === b.id)
      const discount = paymentsDiscountAmount(pays)
      const amountDue = Math.max(0, (Number(b.amount) || 0) - discount)
      const paid = paymentsPaidAmount(pays)
      return sum + Math.max(0, amountDue - paid)
    }, 0)
  const committedAhead = (transactions ?? [])
    .filter((t) => t.accountId === card.id && t.periodKey && t.periodKey > openPeriodKey)
    .reduce((sum, t) => sum + signedInvoiceAmount(t), 0)

  return (Number(card.amount) || 0) - openTotal - unpaidPastInvoices - committedAhead
}

export function isPeriodClosed(period, today = todayIso()) {
  return today > period.end
}

// Faturas navegáveis: `pastCount` fechadas antes da atual, a atual, e
// `futureCount` adiante (pra compras já lançadas com data futura).
export function listInvoicePeriods(card, { pastCount = 6, futureCount = 1 } = {}) {
  const current = currentPeriodKey(card)
  const [y, m] = current.split('-').map(Number)
  const periods = []
  for (let offset = -pastCount; offset <= futureCount; offset++) {
    const d = new Date(Date.UTC(y, m - 1 + offset, 1))
    const periodKey = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`
    periods.push(invoicePeriod(card, periodKey))
  }
  return periods
}

// Gastos por categoria dentro de uma fatura específica — mesma ideia de
// `spendingByCategory` em lib/insights.js, só que escopado a cartão+período
// em vez de mês calendário.
export function cardSpendingByCategory(transactions, cardId, period, categories, subscriptions = []) {
  const periodTx = invoiceItems(transactions, cardId, period, subscriptions).filter(
    (t) => t.type === 'saida',
  )
  const totals = new Map()

  for (const tx of periodTx) {
    if (!tx.category) continue
    totals.set(tx.category, (totals.get(tx.category) || 0) + (Number(tx.amount) || 0))
  }

  return [...totals.entries()]
    .map(([categoryId, total]) => ({ category: categoryMeta(categories, categoryId), total }))
    .filter((entry) => entry.category)
    .sort((a, b) => b.total - a.total)
}

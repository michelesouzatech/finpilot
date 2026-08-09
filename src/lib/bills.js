import { todayIso, formatMoney } from './constants'

// Janela de "vence em breve", usada tanto pelo aviso resumido do Dashboard
// quanto pelo sininho e pelos badges de cada conta — um número só pra as três
// telas nunca discordarem sobre o que já é urgente.
const DUE_SOON_DAYS = 3

// Mesma lógica de comparação de datas locais (YYYY-MM-DD) usada em goals.js —
// ancorada em UTC só pra subtração de dias, sem o fuso horário local interferir.
function daysBetween(isoA, isoB) {
  const a = Date.UTC(...isoA.split('-').map(Number))
  const b = Date.UTC(...isoB.split('-').map(Number))
  return (b - a) / (1000 * 60 * 60 * 24)
}

export function currentMonthKey() {
  return todayIso().slice(0, 7)
}

export function monthKeyOffset(monthKey, offset) {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + offset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

// Diferença em meses entre dois monthKey (YYYY-MM) — positiva quando `toKey`
// é depois de `fromKey`.
function monthKeyDiff(fromKey, toKey) {
  const [fy, fm] = fromKey.split('-').map(Number)
  const [ty, tm] = toKey.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

// Soma `count` meses a uma data YYYY-MM-DD, preservando o dia (clampado ao
// último dia válido do mês de destino) — usado pra gerar o vencimento de
// cada parcela a partir da data da primeira.
function addMonths(dateIso, count) {
  const [year, month, day] = dateIso.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + count, 1))
  const clampedDay = Math.min(day, daysInMonth(date.getUTCFullYear(), date.getUTCMonth() + 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
}

// Vencimento de uma conta recorrente num mês específico. Se o dia cadastrado
// não existe naquele mês (ex: dia 31 em abril), cai no último dia do mês.
export function occurrenceDueDate(bill, monthKey) {
  if (!bill.recurring) return bill.dueDate

  const [year, month] = monthKey.split('-').map(Number)
  const day = Math.min(Number(bill.dueDay) || 1, daysInMonth(year, month))
  return `${monthKey}-${String(day).padStart(2, '0')}`
}

export function findPayment(payments, billId, monthKey) {
  return payments.find((p) => p.billId === billId && p.monthKey === monthKey) ?? null
}

// Conta recorrente só existe a partir do mês do primeiro vencimento
// (`startMonthKey`). Sem essa checagem, uma conta cadastrada em agosto com
// vencimento em agosto também gerava ocorrência no mês anterior — e ela
// nascia já marcada como "vencida" em julho.
function beforeStart(bill, monthKey) {
  return Boolean(bill.startMonthKey) && monthKey < bill.startMonthKey
}

function occurrenceStatus(dueDate, paid, today) {
  if (paid) return 'paga'
  if (dueDate < today) return 'vencida'
  if (daysBetween(today, dueDate) <= DUE_SOON_DAYS) return 'vence-em-breve'
  return 'a-vencer'
}

// Gera a lista de ocorrências (uma por conta/mês) a exibir na tela: contas
// recorrentes entram no mês atual, e também no mês anterior se ele ainda não
// foi pago (fica "vencida" até a pessoa marcar como paga ou o pagamento sai
// da janela). Contas pontuais entram uma única vez, na data cadastrada.
export function buildOccurrences(bills, payments, today = todayIso()) {
  const thisMonth = currentMonthKey()
  const prevMonth = monthKeyOffset(thisMonth, -1)
  // O mês seguinte entra por causa da janela de "vence em breve": no dia 30,
  // uma conta recorrente do dia 1º já está a dois dias de vencer, e sem essa
  // linha ela só apareceria depois de virar o mês — quando já era.
  const nextMonth = monthKeyOffset(thisMonth, 1)
  const occurrences = []

  for (const bill of bills) {
    if (bill.active === false) continue

    if (bill.recurring) {
      const months = [prevMonth, thisMonth, nextMonth]
      for (const monthKey of months) {
        if (beforeStart(bill, monthKey)) continue
        // Recorrência "encerrada" (ex: Paula não divide mais a Netflix) para
        // de gerar ocorrência a partir do mês seguinte ao encerramento — os
        // meses anteriores, já vencidos ou pagos, continuam valendo.
        if (bill.recurringEndMonthKey && monthKey > bill.recurringEndMonthKey) continue
        const payment = findPayment(payments, bill.id, monthKey)
        const dueDate = occurrenceDueDate(bill, monthKey)
        if (monthKey === prevMonth && payment) continue // mês passado já pago não precisa aparecer
        occurrences.push({
          key: `${bill.id}:${monthKey}`,
          bill,
          monthKey,
          dueDate,
          payment,
          paid: Boolean(payment),
          status: occurrenceStatus(dueDate, Boolean(payment), today),
        })
      }
    } else if (bill.installments > 1) {
      // Conta parcelada: uma ocorrência por parcela, a partir da data
      // cadastrada. Diferente da recorrente, tem fim (não passa de
      // `installments`) e parcela vencida não paga fica visível até ser
      // quitada — não só no mês em que venceu.
      let nextUpcomingShown = false
      for (let i = 0; i < bill.installments; i += 1) {
        const monthKey = addMonths(bill.dueDate, i).slice(0, 7)
        const dueDate = addMonths(bill.dueDate, i)
        const payment = findPayment(payments, bill.id, monthKey)
        const paid = Boolean(payment)
        const status = occurrenceStatus(dueDate, paid, today)

        const isFutureUnpaid = !paid && dueDate > today
        if (isFutureUnpaid) {
          if (nextUpcomingShown) continue // só a próxima parcela futura entra na lista
          nextUpcomingShown = true
        } else if (paid && monthKey !== thisMonth && monthKey !== prevMonth) {
          continue // parcela paga há mais de 1 mês não precisa mais aparecer
        }

        occurrences.push({
          key: `${bill.id}:${monthKey}`,
          bill,
          monthKey,
          dueDate,
          payment,
          paid,
          status,
          installmentIndex: i + 1,
          installmentTotal: bill.installments,
        })
      }
    } else {
      const monthKey = bill.dueDate?.slice(0, 7) ?? thisMonth
      const payment = findPayment(payments, bill.id, monthKey)
      occurrences.push({
        key: `${bill.id}:${monthKey}`,
        bill,
        monthKey,
        dueDate: bill.dueDate,
        payment,
        paid: Boolean(payment),
        status: occurrenceStatus(bill.dueDate, Boolean(payment), today),
      })
    }
  }

  return occurrences.sort((a, b) => {
    if (a.paid !== b.paid) return a.paid ? 1 : -1
    return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0
  })
}

// Ocorrência (se houver) de uma conta específica num mês específico —
// diferente de `buildOccurrences`, que só olha o mês atual/anterior pra
// alertas, essa função responde "essa conta cai nesse mês?" pra qualquer
// mês, passado ou futuro, o que permite navegar a timeline livremente.
function occurrenceForBillAtMonth(bill, payments, monthKey, today) {
  if (bill.active === false) return null

  if (bill.recurring) {
    if (beforeStart(bill, monthKey)) return null
    if (bill.recurringEndMonthKey && monthKey > bill.recurringEndMonthKey) return null
    const payment = findPayment(payments, bill.id, monthKey)
    const dueDate = occurrenceDueDate(bill, monthKey)
    return {
      key: `${bill.id}:${monthKey}`,
      bill,
      monthKey,
      dueDate,
      payment,
      paid: Boolean(payment),
      status: occurrenceStatus(dueDate, Boolean(payment), today),
    }
  }

  if (bill.installments > 1) {
    const billMonthKey = bill.dueDate?.slice(0, 7)
    if (!billMonthKey) return null
    const index = monthKeyDiff(billMonthKey, monthKey)
    if (index < 0 || index >= bill.installments) return null
    const dueDate = addMonths(bill.dueDate, index)
    const payment = findPayment(payments, bill.id, monthKey)
    const paid = Boolean(payment)
    return {
      key: `${bill.id}:${monthKey}`,
      bill,
      monthKey,
      dueDate,
      payment,
      paid,
      status: occurrenceStatus(dueDate, paid, today),
      installmentIndex: index + 1,
      installmentTotal: bill.installments,
    }
  }

  const billMonthKey = bill.dueDate?.slice(0, 7)
  if (billMonthKey !== monthKey) return null
  const payment = findPayment(payments, bill.id, monthKey)
  return {
    key: `${bill.id}:${monthKey}`,
    bill,
    monthKey,
    dueDate: bill.dueDate,
    payment,
    paid: Boolean(payment),
    status: occurrenceStatus(bill.dueDate, Boolean(payment), today),
  }
}

// Todas as ocorrências (a pagar e a receber, recorrentes, parceladas ou
// pontuais) que caem num mês específico — base da navegação por mês na tela
// de Lançamentos.
export function buildOccurrencesForMonth(bills, payments, monthKey, today = todayIso()) {
  const occurrences = bills
    .map((bill) => occurrenceForBillAtMonth(bill, payments, monthKey, today))
    .filter(Boolean)

  return occurrences.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))
}

function summaryForType(occurrences, type) {
  const thisMonth = currentMonthKey()
  const typeOccurrences = occurrences.filter((o) => (o.bill.type ?? 'saida') === type)
  const overdue = typeOccurrences.filter((o) => o.status === 'vencida')
  const dueSoon = typeOccurrences.filter((o) => o.status === 'vence-em-breve')
  const monthOnes = typeOccurrences.filter((o) => o.monthKey === thisMonth)

  const overdueTotal = overdue.reduce((sum, o) => sum + (Number(o.bill.amount) || 0), 0)
  const dueSoonTotal = dueSoon.reduce((sum, o) => sum + (Number(o.bill.amount) || 0), 0)
  const paidTotal = monthOnes
    .filter((o) => o.paid)
    .reduce((sum, o) => sum + (Number(o.payment.amount) || 0), 0)
  const expectedTotal = monthOnes.reduce(
    (sum, o) => sum + (o.paid ? Number(o.payment.amount) || 0 : Number(o.bill.amount) || 0),
    0,
  )

  return {
    overdueCount: overdue.length,
    overdueTotal,
    dueSoonCount: dueSoon.length,
    dueSoonTotal,
    paidCount: monthOnes.filter((o) => o.paid).length,
    monthCount: monthOnes.length,
    paidTotal,
    expectedTotal,
  }
}

// Resumo separado por direção — "contas a pagar" e "contas a receber" contam
// pra alertas diferentes (ex: cliente que não pagou é uma preocupação bem
// diferente de uma conta própria vencida).
export function billsSummary(occurrences) {
  return {
    saida: summaryForType(occurrences, 'saida'),
    entrada: summaryForType(occurrences, 'entrada'),
  }
}

function countLabel(count, singular, plural) {
  return count === 1 ? singular : plural
}

export function billsSummaryInsight(occurrences) {
  const { saida, entrada } = billsSummary(occurrences)

  const overdueParts = []
  if (saida.overdueCount > 0) {
    overdueParts.push(
      `${saida.overdueCount} conta${countLabel(saida.overdueCount, '', 's')} a pagar vencida${countLabel(
        saida.overdueCount,
        '',
        's',
      )} (${formatMoney(saida.overdueTotal)})`,
    )
  }
  if (entrada.overdueCount > 0) {
    overdueParts.push(
      `${entrada.overdueCount} conta${countLabel(entrada.overdueCount, '', 's')} a receber atrasada${countLabel(
        entrada.overdueCount,
        '',
        's',
      )} (${formatMoney(entrada.overdueTotal)})`,
    )
  }
  if (overdueParts.length > 0) {
    return { emoji: '⚠️', tone: 'warning', text: `Você tem ${overdueParts.join(' e ')}.` }
  }

  const dueSoonParts = []
  if (saida.dueSoonCount > 0) {
    dueSoonParts.push(`${saida.dueSoonCount} a pagar (${formatMoney(saida.dueSoonTotal)})`)
  }
  if (entrada.dueSoonCount > 0) {
    dueSoonParts.push(`${entrada.dueSoonCount} a receber (${formatMoney(entrada.dueSoonTotal)})`)
  }
  if (dueSoonParts.length > 0) {
    return {
      emoji: '⏰',
      tone: 'neutral',
      text: `Vencendo nos próximos dias: ${dueSoonParts.join(' e ')}.`,
    }
  }

  const paidParts = []
  if (saida.monthCount > 0) {
    paidParts.push(`${formatMoney(saida.paidTotal)} pago de ${formatMoney(saida.expectedTotal)} a pagar`)
  }
  if (entrada.monthCount > 0) {
    paidParts.push(
      `${formatMoney(entrada.paidTotal)} recebido de ${formatMoney(entrada.expectedTotal)} a receber`,
    )
  }
  if (paidParts.length > 0) {
    return { emoji: '✅', tone: 'positive', text: `Tudo em dia! ${paidParts.join('; ')} este mês.` }
  }

  return null
}

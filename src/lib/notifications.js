import { formatMoney, formatDate, todayIso } from './constants'
import { buildOccurrences } from './bills'

function installmentSuffix(occurrence) {
  return occurrence.installmentTotal > 1
    ? ` (parcela ${occurrence.installmentIndex}/${occurrence.installmentTotal})`
    : ''
}

function buildMessage(occurrence) {
  const { bill, status, dueDate } = occurrence
  const isEntrada = bill.type === 'entrada'
  // Conta de valor variável pode chegar ao vencimento sem valor nenhum (ex:
  // vendas do brechó, que só dão pra somar no dia) — aí a mensagem fala só do
  // nome, em vez de anunciar um "R$ 0,00" que não quer dizer nada.
  const amountOf = bill.amount == null ? '' : `${formatMoney(bill.amount)} de `
  const suffix = installmentSuffix(occurrence)

  if (status === 'vence-em-breve') {
    return isEntrada
      ? `Você tem a receber ${amountOf}${bill.name}${bill.person ? ` com ${bill.person}` : ''}${suffix} até ${formatDate(dueDate)}.`
      : `Você precisa pagar ${amountOf}${bill.name}${bill.person ? ` para ${bill.person}` : ''}${suffix} até ${formatDate(dueDate)}.`
  }

  // Vencida. A data entra na frase porque uma conta recorrente pode estar
  // atrasada em dois meses ao mesmo tempo — sem ela, o sininho mostrava duas
  // linhas idênticas e não dava pra saber qual mês cada uma cobrava.
  const venceu = ` — venceu em ${formatDate(dueDate)}.`
  return isEntrada
    ? bill.person
      ? `${bill.person} ainda não te pagou ${amountOf}${bill.name}${suffix}${venceu}`
      : `Você ainda não recebeu ${amountOf}${bill.name}${suffix}${venceu}`
    : `Você ainda não pagou ${amountOf}${bill.name}${suffix}${venceu}`
}

// Gera uma notificação por ocorrência pendente — só o que exige uma ação
// agora: conta vencida, conta vencendo nos próximos dias (ver DUE_SOON_DAYS
// em lib/bills.js) e valor a receber nessa mesma janela. Cada uma carrega o
// `billId` + `monthKey` da ocorrência de origem, usados pra navegar direto
// até o card certo em Lançamentos.
//
// É a lista detalhada do sininho. O Dashboard mostra a versão resumida das
// mesmas pendências — ver `summarizeAlerts` no fim deste arquivo.
export function buildNotifications(bills, billPayments, today = todayIso()) {
  const occurrences = buildOccurrences(bills, billPayments, today)

  return occurrences
    .filter((o) => !o.paid && (o.status === 'vencida' || o.status === 'vence-em-breve'))
    .map((o) => ({
      id: o.key,
      billId: o.bill.id,
      monthKey: o.monthKey,
      status: o.status,
      billType: o.bill.type,
      amount: o.bill.amount ?? null,
      message: buildMessage(o),
      tone: o.status === 'vencida' ? 'warning' : 'neutral',
      emoji: o.status === 'vencida' ? '⚠️' : '⏰',
    }))
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'vencida' ? -1 : 1))
}

// Soma o que dá pra somar. Conta de valor variável chega ao vencimento sem
// valor (ex: a de luz, antes de a fatura sair), então o total vira "R$ X+" em
// vez de fingir que aquele item vale zero.
function sumAmounts(occurrences) {
  const known = occurrences.filter((o) => o.bill.amount != null)
  return {
    total: known.reduce((sum, o) => sum + (Number(o.bill.amount) || 0), 0),
    hasUnknown: known.length < occurrences.length,
  }
}

function firstName(occurrences) {
  return occurrences[0]?.bill.name ?? ''
}

// A lista vem ordenada por vencimento, então o primeiro item é sempre o mais
// antigo — quando existe algum atrasado, é ele.
function receivableDetail(toReceive, lateCount) {
  const since = formatDate(toReceive[0].dueDate)

  if (lateCount === 0) {
    return toReceive.length === 1 ? `Cai em ${since}.` : `O primeiro cai em ${since}.`
  }
  if (lateCount === toReceive.length) {
    return lateCount === 1
      ? `Está atrasado desde ${since}.`
      : `Todos estão atrasados desde ${since}.`
  }
  return lateCount === 1
    ? `1 deles está atrasado desde ${since}.`
    : `${lateCount} deles estão atrasados desde ${since}.`
}

// Um aviso por grupo, em vez de um card por conta: a tela inicial dizia a
// mesma coisa cinco vezes e empurrava o resto do panorama pra baixo. O
// detalhe conta por conta continua existindo no sininho.
//
// `focusKey` é a ocorrência mais urgente do grupo (a lista já vem ordenada por
// vencimento): é ela que o clique abre em Lançamentos, no mês e no grupo
// certos, pra marcar como paga/recebida.
export function summarizeAlerts(bills, billPayments, today = todayIso()) {
  const pending = buildOccurrences(bills, billPayments, today).filter(
    (o) => !o.paid && (o.status === 'vencida' || o.status === 'vence-em-breve'),
  )
  const byDueDate = (a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0)

  const overdue = pending
    .filter((o) => o.bill.type !== 'entrada' && o.status === 'vencida')
    .sort(byDueDate)
  const dueSoon = pending
    .filter((o) => o.bill.type !== 'entrada' && o.status === 'vence-em-breve')
    .sort(byDueDate)
  // A receber vem tudo num aviso só (atrasado e a vencer juntos): é sempre a
  // mesma ação — cobrar e marcar como recebido.
  const toReceive = pending.filter((o) => o.bill.type === 'entrada').sort(byDueDate)
  const lateToReceive = toReceive.filter((o) => o.status === 'vencida').length

  const alerts = []

  if (overdue.length > 0) {
    alerts.push({
      id: 'atrasadas',
      billType: 'saida',
      emoji: '⚠️',
      urgent: true,
      title:
        overdue.length === 1
          ? `1 conta atrasada: ${firstName(overdue)}`
          : `${overdue.length} contas atrasadas`,
      detail: `Venceu${overdue.length > 1 ? ' a mais antiga' : ''} em ${formatDate(overdue[0].dueDate)}.`,
      actionLabel: 'Pagar',
      focusKey: overdue[0].key,
      ...sumAmounts(overdue),
    })
  }

  if (dueSoon.length > 0) {
    alerts.push({
      id: 'a-vencer',
      billType: 'saida',
      emoji: '⏰',
      urgent: false,
      title:
        dueSoon.length === 1
          ? `1 conta vence em breve: ${firstName(dueSoon)}`
          : `${dueSoon.length} contas vencem nos próximos dias`,
      detail:
        dueSoon.length === 1
          ? `Vence em ${formatDate(dueSoon[0].dueDate)}.`
          : `A primeira é ${firstName(dueSoon)}, em ${formatDate(dueSoon[0].dueDate)}.`,
      actionLabel: 'Pagar',
      focusKey: dueSoon[0].key,
      ...sumAmounts(dueSoon),
    })
  }

  if (toReceive.length > 0) {
    alerts.push({
      id: 'a-receber',
      billType: 'entrada',
      emoji: '💸',
      urgent: false,
      title:
        toReceive.length === 1
          ? `1 valor a receber: ${firstName(toReceive)}`
          : `${toReceive.length} valores a receber`,
      detail: receivableDetail(toReceive, lateToReceive),
      actionLabel: 'Receber',
      focusKey: toReceive[0].key,
      ...sumAmounts(toReceive),
    })
  }

  return alerts
}

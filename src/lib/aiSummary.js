// Monta o resumo que é enviado pra IA analisar.
//
// Esse arquivo é a fronteira de privacidade do app: só o que entra no objeto
// devolvido por `buildAiSummary` sai do aparelho. Tudo que não estiver aqui
// nunca chega no Gemini — descrição de lançamento, nome de conta, nome de
// estabelecimento, saldo total e e-mail ficam de fora de propósito.
//
// A única informação escrita pela pessoa que viaja junto é o nome das metas
// ("Viagem Chapada"), porque é o que permite a análise falar do objetivo pelo
// nome em vez de "sua meta nº 2". Se preferir cortar também, é só remover o
// campo `nome` em `goalSummaries` — o resto continua funcionando.

import { roundMoney } from './constants'
import { computeProgress, computeRequiredPace, computeSaved } from './goals'
import { monthKey, monthTransactions, spendingByCategory, sumByType } from './insights'

// Quantos meses de histórico o resumo carrega. Três é o mínimo pra existir
// tendência: com dois só dá pra dizer "subiu" ou "desceu", sem direção.
const MONTHS = 3

function monthKeys() {
  return Array.from({ length: MONTHS }, (_, i) => monthKey(-i))
}

function monthTotals(transactions, keys) {
  return keys.map((key) => {
    const monthTx = monthTransactions(transactions, key)
    return {
      mes: key,
      entradas: roundMoney(sumByType(monthTx, 'entrada')),
      saidas: roundMoney(sumByType(monthTx, 'saida')),
    }
  })
}

// Gasto por categoria em cada um dos meses, numa linha por categoria. O
// formato "categoria × mês" é o que deixa a tendência visível pro modelo —
// uma lista solta do mês atual não mostra que Alimentação vem subindo.
function categoryTotals(transactions, categories, keys) {
  const rows = new Map()

  for (const key of keys) {
    for (const { category, total } of spendingByCategory(transactions, categories, key)) {
      const row = rows.get(category.id) ?? { categoria: category.label, porMes: {} }
      row.porMes[key] = roundMoney(total)
      rows.set(category.id, row)
    }
  }

  // Ordena pelo gasto do mês atual, pra categoria mais pesada vir primeiro.
  const current = keys[0]
  return [...rows.values()].sort((a, b) => (b.porMes[current] ?? 0) - (a.porMes[current] ?? 0))
}

function recurringSummary(transactions) {
  const recurring = (transactions ?? []).filter((t) => t.recurring)
  const saidas = roundMoney(sumByType(recurring, 'saida'))
  const entradas = roundMoney(sumByType(recurring, 'entrada'))

  return {
    saidas,
    entradas,
    percentualDaEntrada: entradas > 0 ? Math.round((saidas / entradas) * 100) : null,
  }
}

function goalSummaries(goals) {
  return (goals ?? []).map((goal) => {
    const pace = computeRequiredPace(goal)
    return {
      nome: goal.name,
      progresso: Math.round(computeProgress(goal)),
      guardado: roundMoney(computeSaved(goal)),
      alvo: roundMoney(goal.target),
      precisaPorMes: pace.status === 'ok' ? roundMoney(pace.perMonth) : null,
    }
  })
}

function uncategorizedSummary(transactions, key) {
  const monthTx = monthTransactions(transactions, key)
  const semCategoria = monthTx.filter((t) => !t.category)

  return {
    quantidade: semCategoria.length,
    total: roundMoney(semCategoria.reduce((sum, t) => sum + (Number(t.amount) || 0), 0)),
    doMes: monthTx.length,
  }
}

export function buildAiSummary(transactions, categories, goals) {
  const keys = monthKeys()

  return {
    moeda: 'BRL',
    mesAtual: keys[0],
    diaDoMes: new Date().getDate(),
    meses: monthTotals(transactions, keys),
    gastosPorCategoria: categoryTotals(transactions, categories, keys),
    recorrentes: recurringSummary(transactions),
    metas: goalSummaries(goals),
    semCategoria: uncategorizedSummary(transactions, keys[0]),
  }
}

// Sem histórico suficiente a IA só conseguiria repetir os cards de números em
// outras palavras — o que gasta cota pra não dizer nada novo. A régua é ter
// gasto no mês atual e pelo menos um mês anterior pra comparar.
export function hasEnoughDataForAi(summary) {
  const [current, ...previous] = summary.meses
  if (!current || current.saidas <= 0) return false
  return previous.some((month) => month.saidas > 0)
}

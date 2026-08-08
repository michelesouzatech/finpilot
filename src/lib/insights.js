import { formatMoney, categoryMeta } from './constants'
import { computeProgress, computeForecast } from './goals'
import { accountCurrentBalance } from './dashboard'

// Chave YYYY-MM de um mês, deslocado `offset` meses a partir de hoje
// (offset 0 = mês atual, -1 = mês anterior).
function monthKey(offset = 0) {
  const today = new Date()
  const date = new Date(today.getFullYear(), today.getMonth() + offset, 1)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function monthTransactions(transactions, key) {
  return transactions.filter((t) => t.date?.slice(0, 7) === key)
}

export function sumByType(transactions, type) {
  return transactions
    .filter((t) => t.type === type)
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
}

// Agrupa os gastos (saídas) do mês por categoria, do maior pro menor.
export function spendingByCategory(transactions, categories, key) {
  const monthTx = monthTransactions(transactions, key).filter((t) => t.type === 'saida')
  const totals = new Map()

  for (const tx of monthTx) {
    if (!tx.category) continue
    totals.set(tx.category, (totals.get(tx.category) || 0) + (Number(tx.amount) || 0))
  }

  return [...totals.entries()]
    .map(([categoryId, total]) => ({ category: categoryMeta(categories, categoryId), total }))
    .filter((entry) => entry.category)
    .sort((a, b) => b.total - a.total)
}

// Categoria com maior gasto no mês atual. Faz mais sentido na Caixa de
// entrada/Lançamentos, onde a pessoa já está olhando pra categorias.
export function topCategoryInsight(transactions, categories) {
  const ranking = spendingByCategory(transactions, categories, monthKey(0))
  if (ranking.length === 0) return null

  const [top] = ranking
  return {
    id: 'top-category',
    emoji: top.category.emoji,
    tone: 'neutral',
    text: `Sua categoria com mais gastos esse mês é "${top.category.label}", com ${formatMoney(top.total)}.`,
  }
}

// Compara o total de saídas do mês atual com o mês anterior. Insight de
// panorama geral — vive no Dashboard.
export function monthComparisonInsight(transactions) {
  const currentExpense = sumByType(monthTransactions(transactions, monthKey(0)), 'saida')
  const previousExpense = sumByType(monthTransactions(transactions, monthKey(-1)), 'saida')

  if (previousExpense <= 0) return null

  const diff = currentExpense - previousExpense
  const percent = Math.round((Math.abs(diff) / previousExpense) * 100)
  if (percent === 0) {
    return {
      id: 'month-comparison',
      emoji: '⚖️',
      tone: 'neutral',
      text: 'Seus gastos esse mês estão praticamente iguais aos do mês passado.',
    }
  }

  const direction = diff > 0 ? 'a mais' : 'a menos'
  const tone = diff > 0 ? 'warning' : 'positive'
  return {
    id: 'month-comparison',
    emoji: diff > 0 ? '📈' : '📉',
    tone,
    text: `Você gastou ${percent}% ${direction} esse mês do que no mês passado.`,
  }
}

// Meta mais perto de bater, entre as que já têm previsão calculável. Vive
// nos Gatinhos (Porquinhos), junto das próprias metas.
export function closestGoalInsight(goals) {
  const withForecast = (goals ?? [])
    .map((goal) => ({ goal, progress: computeProgress(goal), forecast: computeForecast(goal) }))
    .filter(({ forecast }) => forecast.status === 'forecast' || forecast.status === 'done')

  if (withForecast.length === 0) return null

  withForecast.sort((a, b) => b.progress - a.progress)
  const [closest] = withForecast

  if (closest.forecast.status === 'done') {
    return {
      id: 'closest-goal',
      emoji: '🎉',
      tone: 'positive',
      text: `Parabéns, seu gatinho "${closest.goal.name}" já bateu a meta!`,
    }
  }

  return {
    id: 'closest-goal',
    emoji: '🐱',
    tone: 'positive',
    text: `Seu gatinho "${closest.goal.name}" está ${Math.round(closest.progress)}% pronto — no ritmo atual, deve bater a meta em breve.`,
  }
}

// Alerta quando as saídas do mês já superam as entradas do mês. Panorama
// geral — vive no Dashboard.
export function overspendAlertInsight(transactions) {
  const monthTx = monthTransactions(transactions, monthKey(0))
  const income = sumByType(monthTx, 'entrada')
  const expense = sumByType(monthTx, 'saida')

  if (income <= 0 && expense <= 0) return null
  if (expense <= income) return null

  return {
    id: 'overspend-alert',
    emoji: '⚠️',
    tone: 'warning',
    text: `Seus gastos esse mês (${formatMoney(expense)}) já passaram suas entradas (${formatMoney(income)}). Vale dar uma olhada antes que o mês acabe.`,
  }
}

// Conta com saldo negativo (a mais negativa, se houver mais de uma). Vive
// na tela de Contas, onde a pessoa está olhando o saldo de cada uma.
export function accountBalanceInsight(accounts, transactions) {
  const negative = (accounts ?? [])
    .filter((a) => a.type !== 'cartao')
    .map((account) => ({ account, balance: accountCurrentBalance(account, transactions) }))
    .filter((entry) => entry.balance < 0)
    .sort((a, b) => a.balance - b.balance)

  if (negative.length === 0) return null

  const [worst] = negative
  return {
    id: 'account-balance',
    emoji: '🚨',
    tone: 'warning',
    text: `Sua conta "${worst.account.name}" está negativa em ${formatMoney(Math.abs(worst.balance))}.`,
  }
}

// Quanto já está comprometido em saídas recorrentes por mês (aluguel,
// assinaturas etc.), comparado à entrada recorrente. Vive em Lançamentos,
// onde fica o campo "recorrente".
export function recurringCommitmentInsight(transactions) {
  const recurring = (transactions ?? []).filter((t) => t.recurring)
  const recurringExpense = sumByType(recurring, 'saida')
  const recurringIncome = sumByType(recurring, 'entrada')

  if (recurringExpense <= 0) return null

  if (recurringIncome > 0) {
    const percent = Math.round((recurringExpense / recurringIncome) * 100)
    return {
      id: 'recurring-commitment',
      emoji: '🔁',
      tone: percent >= 70 ? 'warning' : 'neutral',
      text: `Suas saídas recorrentes somam ${formatMoney(recurringExpense)}/mês — ${percent}% da sua entrada recorrente.`,
    }
  }

  return {
    id: 'recurring-commitment',
    emoji: '🔁',
    tone: 'neutral',
    text: `Suas saídas recorrentes somam ${formatMoney(recurringExpense)}/mês.`,
  }
}

// Quantos lançamentos do mês ainda estão sem categoria. Vive na Caixa de
// entrada, incentivando a categorizar o que falta.
export function uncategorizedInsight(transactions) {
  const monthTx = monthTransactions(transactions, monthKey(0))
  if (monthTx.length === 0) return null

  const uncategorized = monthTx.filter((t) => !t.category).length
  if (uncategorized === 0) return null

  const percent = Math.round((uncategorized / monthTx.length) * 100)
  return {
    id: 'uncategorized',
    emoji: '🗂️',
    tone: 'neutral',
    text: `${uncategorized} ${uncategorized === 1 ? 'lançamento' : 'lançamentos'} desse mês (${percent}%) ${
      uncategorized === 1 ? 'ainda está' : 'ainda estão'
    } sem categoria.`,
  }
}

// Junta todos os insights disponíveis, ignorando os que não têm dados
// suficientes ainda (ex: sem histórico do mês anterior pra comparar). Usado
// na aba Insights, como resumo de tudo que já aparece espalhado nas outras
// telas.
export function computeInsights(accounts, transactions, categories, goals) {
  const builders = [
    () => overspendAlertInsight(transactions),
    () => accountBalanceInsight(accounts, transactions),
    () => uncategorizedInsight(transactions),
    () => topCategoryInsight(transactions, categories),
    () => monthComparisonInsight(transactions),
    () => recurringCommitmentInsight(transactions),
    () => closestGoalInsight(goals),
  ]

  return builders.map((build) => build()).filter(Boolean)
}

export { monthKey }

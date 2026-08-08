// Ponte entre a tela de Insights e a Edge Function que fala com o Gemini.
//
// A análise é gerada uma vez por dia e guardada no navegador — não há como
// pedir outra no mesmo dia, de propósito. Duas razões: o plano gratuito do
// Gemini tem cota diária, e reler os mesmos números renderia um texto
// levemente diferente sem ser mais verdadeiro, o que faria a análise parecer
// opinião variável em vez de leitura dos dados.

import { supabase } from './supabaseClient'
import { todayIso } from './constants'

const CACHE_KEY = 'finpilot:aiInsights'

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw)
    return cached?.dia === todayIso() ? cached.analise : null
  } catch {
    return null
  }
}

function writeCache(analise) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ dia: todayIso(), analise }))
  } catch {
    // Navegador sem espaço ou em aba anônima: seguir sem cache é melhor que
    // quebrar a tela — só custa uma geração a mais na próxima abertura.
  }
}

// `invoke` embrulha respostas de erro num FunctionsHttpError e guarda o corpo
// original em `context`. Sem desembrulhar, a tela mostraria "Edge Function
// returned a non-2xx status code" no lugar da mensagem em português que a
// própria função escreveu.
async function readFunctionError(error) {
  const fallback = { code: 'desconhecido', message: 'Não consegui gerar a análise agora.' }
  try {
    const body = await error.context?.json()
    return body?.message ? { code: body.error ?? 'desconhecido', message: body.message } : fallback
  } catch {
    return fallback
  }
}

// StrictMode roda os efeitos duas vezes em desenvolvimento, e a primeira
// abertura do dia ainda não tem cache pra segurar a segunda chamada — sem isso
// cada visita à aba gastaria duas gerações da cota.
let inFlight = null

export function fetchAiInsights(summary) {
  const cached = readCache()
  if (cached) return Promise.resolve({ ...cached, doCache: true })
  if (inFlight) return inFlight

  const request = requestAnalysis(summary).finally(() => {
    if (inFlight === request) inFlight = null
  })

  inFlight = request
  return request
}

async function requestAnalysis(summary) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token

  const { data, error } = await supabase.functions.invoke('insights-ia', {
    body: { summary },
    headers: { Authorization: `Bearer ${token}` },
  })

  if (error) {
    const { code, message } = await readFunctionError(error)
    const failure = new Error(message)
    failure.code = code
    throw failure
  }

  writeCache(data)
  return { ...data, doCache: false }
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState } from './ui'
import { SparkleIcon, RepeatIcon } from './icons'
import { computeInsights } from '../lib/insights'
import { buildAiSummary, hasEnoughDataForAi } from '../lib/aiSummary'
import { fetchAiInsights } from '../lib/aiInsights'

const toneClasses = {
  positive: 'bg-coral/10',
  warning: 'bg-rose/15',
  neutral: 'bg-ink/5',
}

function stamp(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  const hora = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const mesmoDia = date.toDateString() === new Date().toDateString()
  if (mesmoDia) return `hoje, ${hora}`
  return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${hora}`
}

function AiBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-coral/15 px-2.5 py-1 text-xs font-semibold text-ink">
      <SparkleIcon className="text-coral" width={13} height={13} />
      Análise do Finny
    </span>
  )
}

function AiSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-2.5" aria-hidden="true">
      <div className="h-4 w-4/5 rounded-full bg-ink/10" />
      <div className="h-3 w-full rounded-full bg-ink/[0.07]" />
      <div className="h-3 w-11/12 rounded-full bg-ink/[0.07]" />
      <div className="h-3 w-3/4 rounded-full bg-ink/[0.07]" />
    </div>
  )
}

// O card da IA. É o único bloco da tela cujo texto vem de fora — por isso a
// borda coral e o carimbo de horário: deixa explícito o que foi gerado e
// quando, em vez de misturar com os números calculados aqui.
function AiAnalysis({ status, analise, erro, onRetry }) {
  return (
    <article className="flex flex-col gap-3 rounded-[1.75rem] border-2 border-coral/35 bg-surface p-5 shadow-[0_12px_30px_-16px_rgba(30,30,30,0.25)]">
      <div className="flex items-center gap-2">
        <AiBadge />
        {status === 'ready' && (
          <span className="ml-auto text-[0.7rem] text-gray">{stamp(analise.geradoEm)}</span>
        )}
      </div>

      {status === 'loading' && (
        <div aria-live="polite">
          <span className="sr-only">Gerando a análise…</span>
          <AiSkeleton />
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-gray">{erro.message}</p>
          {erro.code !== 'quota' && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 px-4 py-2 text-xs font-medium text-ink transition hover:bg-ink/10 active:scale-[0.98]"
            >
              <RepeatIcon width={13} height={13} />
              Tentar de novo
            </button>
          )}
        </div>
      )}

      {status === 'ready' && (
        <>
          <h3 className="font-display text-base font-semibold leading-snug text-ink text-balance">
            {analise.titulo}
          </h3>

          <div className="flex flex-col gap-2.5">
            {analise.paragrafos.map((paragrafo) => (
              <p key={paragrafo} className="text-sm leading-relaxed text-ink">
                {paragrafo}
              </p>
            ))}
          </div>

          <p className="border-t border-ink/8 pt-3 text-[0.7rem] leading-snug text-gray">
            Uma análise nova por dia, a partir de totais por categoria e do progresso das metas.
            Nenhuma descrição de lançamento ou nome de conta saiu do app.
          </p>
        </>
      )}
    </article>
  )
}

// Cada ação carrega o id da aba que resolve aquilo (escolhido pelo modelo
// dentro de uma lista fechada). Sem destino válido, vira card estático em vez
// de botão que não leva a lugar nenhum.
function ActionCard({ acao, onNavigate }) {
  const conteudo = (
    <>
      <span className="text-xl leading-none">{acao.emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{acao.texto}</span>
        <span className="mt-0.5 block text-xs font-medium text-mint">{acao.impacto}</span>
      </span>
    </>
  )

  const classes =
    'flex w-full items-center gap-3 rounded-3xl bg-surface p-4 text-left shadow-[0_12px_30px_-18px_rgba(30,30,30,0.28)]'

  if (!acao.destino || !onNavigate) {
    return <div className={classes}>{conteudo}</div>
  }

  return (
    <button
      type="button"
      onClick={() => onNavigate(acao.destino)}
      className={`${classes} transition hover:brightness-[0.99] active:scale-[0.985]`}
    >
      {conteudo}
      <span className="shrink-0 text-gray" aria-hidden="true">
        <svg viewBox="0 0 24 24" width={17} height={17} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </span>
    </button>
  )
}

function Insights({ accounts, transactions, categories, goals, onNavigate }) {
  const insights = computeInsights(accounts, transactions, categories, goals)

  const summary = useMemo(
    () => buildAiSummary(transactions, categories, goals),
    [transactions, categories, goals],
  )
  const podeUsarIa = hasEnoughDataForAi(summary)

  const [ia, setIa] = useState({ status: 'idle', analise: null, erro: null })

  // Só a recuperação de falha: quando a geração dá erro nada é guardado em
  // cache, então tentar de novo não fura o limite de uma análise por dia.
  const tentarDeNovo = useCallback(async () => {
    setIa({ status: 'loading', analise: null, erro: null })
    try {
      const analise = await fetchAiInsights(summary)
      setIa({ status: 'ready', analise, erro: null })
    } catch (err) {
      setIa({ status: 'error', analise: null, erro: { code: err.code, message: err.message } })
    }
  }, [summary])

  useEffect(() => {
    if (!podeUsarIa) return
    let ativo = true

    // Segura a análise anterior enquanto revalida: os dados mudaram, mas o
    // texto de antes ainda é melhor que um esqueleto piscando na tela.
    setIa((atual) =>
      atual.status === 'ready' ? atual : { status: 'loading', analise: null, erro: null },
    )

    fetchAiInsights(summary)
      .then((analise) => {
        if (ativo) setIa({ status: 'ready', analise, erro: null })
      })
      .catch((err) => {
        if (ativo) {
          setIa({ status: 'error', analise: null, erro: { code: err.code, message: err.message } })
        }
      })

    return () => {
      ativo = false
    }
  }, [podeUsarIa, summary])

  if (insights.length === 0 && !podeUsarIa) {
    return (
      <EmptyState
        icon={<SparkleIcon className="text-coral" width={32} height={32} />}
        title="Ainda sem insights"
        description="Lance e categorize algumas transações pra Finny começar a notar padrões nos seus gastos."
      />
    )
  }

  const acoes = ia.status === 'ready' ? (ia.analise.acoes ?? []) : []

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-xl font-semibold text-ink">Insights</h2>
        <p className="text-xs text-gray">
          A leitura do Finny sobre o mês, e os números que ele usou pra chegar nela.
        </p>
      </div>

      {podeUsarIa && (
        <AiAnalysis
          status={ia.status === 'idle' ? 'loading' : ia.status}
          analise={ia.analise}
          erro={ia.erro}
          onRetry={tentarDeNovo}
        />
      )}

      {acoes.length > 0 && (
        <>
          <div className="flex items-baseline gap-2">
            <h3 className="font-display text-base font-semibold text-ink">O que dá pra fazer</h3>
            <span className="text-xs text-gray">
              {acoes.length} {acoes.length === 1 ? 'sugestão' : 'sugestões'}
            </span>
          </div>

          {acoes.map((acao, index) => (
            <ActionCard key={`${index}-${acao.texto}`} acao={acao} onNavigate={onNavigate} />
          ))}
        </>
      )}

      {insights.length > 0 && (
        <>
          {podeUsarIa && (
            <div className="mt-1 flex items-center gap-3 text-gray">
              <span className="h-px flex-1 bg-ink/10" />
              <span className="text-[0.65rem] uppercase tracking-wider">Os números</span>
              <span className="h-px flex-1 bg-ink/10" />
            </div>
          )}

          {insights.map((insight) => (
            <div
              key={insight.id}
              className={`flex items-start gap-3 rounded-[1.75rem] p-5 shadow-[0_12px_30px_-16px_rgba(30,30,30,0.25)] ${toneClasses[insight.tone]}`}
            >
              <span className="text-2xl leading-none">{insight.emoji}</span>
              <p className="text-sm text-ink">{insight.text}</p>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

export default Insights

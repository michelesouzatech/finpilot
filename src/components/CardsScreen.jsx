import { useMemo, useState } from 'react'
import { formatMoney, formatDate, categoryMeta } from '../lib/constants'
import {
  listInvoicePeriods,
  invoiceItems,
  invoiceTotal,
  invoiceDueDate,
  invoiceMonthLabel,
  isPeriodClosed,
  cardSpendingByCategory,
  cardAvailableLimit,
  currentPeriodKey,
  subscriptionActiveIn,
} from '../lib/invoices'
import { Card, Select, GhostButton, PrimaryButton, EmptyState } from './ui'
import CardPurchaseForm from './CardPurchaseForm'
import { ArrowDownIcon, ArrowUpIcon, CardIcon, PlusIcon, RepeatIcon, TrashIcon } from './icons'

function InvoiceItem({ tx, onDelete }) {
  const isEntrada = tx.type === 'entrada'
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink/5 py-2.5 last:border-0">
      <div className="flex items-center gap-2.5">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
            isEntrada ? 'bg-mint/15 text-mint' : 'bg-ink/5 text-ink'
          }`}
        >
          {isEntrada ? <ArrowUpIcon width={14} height={14} /> : <ArrowDownIcon width={14} height={14} />}
        </div>
        <div>
          <p className="text-sm font-medium text-ink">{tx.description}</p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-gray">
            {formatDate(tx.date)}
            {tx.isSubscription && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-ink/5 px-1.5 py-0.5">
                <RepeatIcon /> assinatura
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <span className={`text-sm font-semibold ${isEntrada ? 'text-mint' : 'text-ink'}`}>
          {isEntrada ? '- ' : ''}
          {formatMoney(tx.amount)}
        </span>
        {/* Cobrança de assinatura não é um lançamento salvo — ela é calculada a
            partir da regra, então quem "apaga" é o botão de interromper lá
            embaixo, não um X aqui. */}
        {!tx.isSubscription && (
          <button
            type="button"
            onClick={() => onDelete(tx)}
            className="rounded-full p-1.5 text-gray hover:bg-rose/15 hover:text-rose"
            aria-label={`Apagar ${tx.description}`}
          >
            <TrashIcon />
          </button>
        )}
      </div>
    </div>
  )
}

// Ficha do cartão preenchida sozinha com o que já foi cadastrado na conta —
// a pessoa não precisa digitar de novo banco, vencimento, fechamento ou
// limite aqui, só ver o resumo.
function CardInfoSummary({ card, transactions, bills, billPayments, subscriptions }) {
  const available = cardAvailableLimit(card, transactions, bills, billPayments, subscriptions)
  const fields = [
    { label: 'Banco emissor', value: card.name },
    { label: 'Fechamento da fatura', value: card.closingDay ? `Dia ${card.closingDay}` : '—' },
    { label: 'Vencimento da fatura', value: card.dueDay ? `Dia ${card.dueDay}` : '—' },
    { label: 'Limite do cartão', value: formatMoney(card.amount) },
    { label: 'Limite disponível', value: formatMoney(available) },
  ]

  return (
    <Card className="grid grid-cols-2 gap-3">
      {fields.map((field) => (
        <div key={field.label} className="flex flex-col gap-0.5">
          <span className="text-xs text-gray">{field.label}</span>
          <span className="font-display text-sm font-semibold text-ink">{field.value}</span>
        </div>
      ))}
    </Card>
  )
}

// Assinaturas são regras, não lançamentos — então ganham uma lista própria,
// separada da fatura, pra poder interromper/reativar sem caçar a cobrança de
// cada mês. A lista acompanha a fatura que está sendo vista: uma assinatura
// interrompida em outubro some da listagem a partir da fatura de novembro,
// em vez de continuar aparecendo pra sempre.
function SubscriptionsCard({ card, subscriptions, categories, periodKey, onStop, onResume }) {
  const cardSubs = subscriptions.filter(
    (s) => s.cardId === card.id && subscriptionActiveIn(s, periodKey),
  )
  if (cardSubs.length === 0) return null

  return (
    <Card className="flex flex-col gap-2">
      <h3 className="font-display text-sm font-semibold text-ink">Assinaturas nesse cartão</h3>
      {cardSubs.map((sub) => {
        const ended = Boolean(sub.endPeriodKey)
        const isLastCharge = ended && sub.endPeriodKey === periodKey
        const category = categoryMeta(categories, sub.category)
        return (
          <div
            key={sub.id}
            className="flex items-center justify-between gap-3 border-b border-ink/5 py-2 last:border-0"
          >
            <div>
              <p className="text-sm font-medium text-ink">{sub.description}</p>
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-gray">
                Todo dia {sub.chargeDay}
                {category && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-coral/15 px-1.5 py-0.5 text-coral">
                    {category.emoji} {category.label}
                  </span>
                )}
                {isLastCharge && (
                  <span className="inline-flex items-center rounded-full bg-rose/10 px-1.5 py-0.5 text-rose">
                    última cobrança na fatura de {invoiceMonthLabel(card, sub.endPeriodKey)}
                  </span>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-semibold text-ink">{formatMoney(sub.amount)}</span>
              <GhostButton
                type="button"
                onClick={() => (ended ? onResume(sub) : onStop(sub))}
                className="px-3 py-1.5 text-xs"
              >
                {ended ? 'Reativar' : 'Interromper'}
              </GhostButton>
            </div>
          </div>
        )
      })}
    </Card>
  )
}

function CardInvoiceView({
  card,
  transactions,
  categories,
  subscriptions,
  periods,
  period,
  index,
  setIndex,
  onDeleteItem,
}) {
  const items = useMemo(
    () =>
      invoiceItems(transactions, card.id, period, subscriptions).sort((a, b) =>
        a.date < b.date ? 1 : -1,
      ),
    [transactions, card.id, period, subscriptions],
  )
  const total = invoiceTotal(transactions, card.id, period, subscriptions)
  const dueDate = invoiceDueDate(card, period.periodKey)
  const closed = isPeriodClosed(period)
  const future = period.periodKey > currentPeriodKey(card)
  const categoryBreakdown = useMemo(
    () => cardSpendingByCategory(transactions, card.id, period, categories, subscriptions),
    [transactions, card.id, period, categories, subscriptions],
  )

  const prevPeriod = periods[index - 1]
  const prevTotal = prevPeriod ? invoiceTotal(transactions, card.id, prevPeriod, subscriptions) : null

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <GhostButton
            type="button"
            onClick={() => setIndex(Math.max(0, index - 1))}
            disabled={index === 0}
            className="px-3 py-1.5 text-xs"
          >
            ‹ Anterior
          </GhostButton>
          <span className="text-sm font-medium text-gray">
            {invoiceMonthLabel(card, period.periodKey)}
          </span>
          <GhostButton
            type="button"
            onClick={() => setIndex(Math.min(periods.length - 1, index + 1))}
            disabled={index === periods.length - 1}
            className="px-3 py-1.5 text-xs"
          >
            Próxima ›
          </GhostButton>
        </div>

        <div className="flex flex-col items-center gap-1 py-2">
          <span className="text-sm font-medium text-gray">
            {closed
              ? 'Total da fatura'
              : future
                ? 'Já comprometido nessa fatura'
                : 'Total em aberto (fatura ainda não fechou)'}
          </span>
          <span className="font-display text-3xl font-bold text-ink">{formatMoney(total)}</span>
          <span className="text-xs text-gray">
            Fecha dia {card.closingDay} · Vence {formatDate(dueDate)}
          </span>
        </div>

        {prevTotal !== null && (
          <p className="text-center text-xs text-gray">
            Fatura anterior ({invoiceMonthLabel(card, prevPeriod.periodKey)}):{' '}
            {formatMoney(prevTotal)}
          </p>
        )}
      </Card>

      {categoryBreakdown.length > 0 && (
        <Card className="flex flex-col gap-2">
          <h3 className="font-display text-sm font-semibold text-ink">Gastos por categoria nessa fatura</h3>
          {categoryBreakdown.map(({ category, total: catTotal }) => (
            <div key={category.id} className="flex items-center justify-between text-sm">
              <span className="text-gray">
                {category.emoji} {category.label}
              </span>
              <span className="font-medium text-ink">{formatMoney(catTotal)}</span>
            </div>
          ))}
        </Card>
      )}

      <Card className="flex flex-col">
        <h3 className="mb-1 font-display text-sm font-semibold text-ink">Lançamentos dessa fatura</h3>
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray">Nenhum lançamento nesse período.</p>
        ) : (
          items.map((tx) => <InvoiceItem key={tx.id} tx={tx} onDelete={onDeleteItem} />)
        )}
      </Card>
    </div>
  )
}

function CardsScreen({
  accounts,
  transactions,
  categories,
  bills = [],
  billPayments = [],
  subscriptions = [],
  selectedCardId,
  onSelectCard,
  onAddPurchase,
  onDeleteCardItem,
  onStopSubscription,
  onResumeSubscription,
  onAddCategory,
}) {
  const cards = accounts.filter((a) => a.type === 'cartao')
  // A seleção pode vir de fora (ex: link de "Faturas em aberto" em
  // Lançamentos) — sem `onSelectCard`, essa tela cuida da própria seleção.
  const [internalSelectedId, setInternalSelectedId] = useState(cards[0]?.id ?? '')
  const [showPurchaseForm, setShowPurchaseForm] = useState(false)
  const isControlled = Boolean(onSelectCard)
  const selectedId = isControlled ? selectedCardId : internalSelectedId
  const setSelectedId = isControlled ? onSelectCard : setInternalSelectedId
  const selectedCard = cards.find((c) => c.id === selectedId) ?? cards[0]

  // Estado da fatura em navegação mora aqui (não dentro de CardInvoiceView)
  // pra poder ser compartilhado com SubscriptionsCard — a lista de
  // assinaturas precisa saber qual fatura está sendo vista pra filtrar quem
  // ainda estava ativo naquele mês.
  const periods = useMemo(
    () => (selectedCard ? listInvoicePeriods(selectedCard, { pastCount: 6, futureCount: 12 }) : []),
    [selectedCard],
  )
  const currentIndex = periods.findIndex((p) => !isPeriodClosed(p))
  const [index, setIndex] = useState(currentIndex === -1 ? periods.length - 1 : currentIndex)
  const period = periods[index]

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={<CardIcon className="text-coral" width={28} height={28} />}
        title="Nenhum cartão cadastrado"
        description='Cadastre um cartão de crédito na aba "Contas" pra acompanhar a fatura por aqui.'
      />
    )
  }

  // Sem dia de fechamento não dá pra dizer em qual fatura a compra cai — em
  // vez de chutar (e jogar o gasto na fatura errada), a tela pede pra
  // completar o cadastro do cartão antes de lançar.
  const canLaunch = selectedCard.closingDay != null

  return (
    <div className="flex flex-col gap-4">
      {cards.length > 1 && (
        <Select
          value={selectedCard.id}
          onChange={(e) => {
            setSelectedId(e.target.value)
            setShowPurchaseForm(false)
          }}
        >
          {cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      )}

      {showPurchaseForm ? (
        <CardPurchaseForm
          card={selectedCard}
          categories={categories}
          onAddCategory={onAddCategory}
          onSave={(data) => {
            onAddPurchase(selectedCard, data)
            setShowPurchaseForm(false)
          }}
          onCancel={() => setShowPurchaseForm(false)}
        />
      ) : canLaunch ? (
        <PrimaryButton onClick={() => setShowPurchaseForm(true)}>
          <PlusIcon /> Nova compra no cartão
        </PrimaryButton>
      ) : (
        <p className="rounded-2xl bg-rose/10 px-4 py-3 text-sm text-ink">
          Informe o dia de fechamento desse cartão na aba <strong>Contas</strong> pra poder lançar
          compras aqui.
        </p>
      )}

      <CardInfoSummary
        card={selectedCard}
        transactions={transactions}
        bills={bills}
        billPayments={billPayments}
        subscriptions={subscriptions}
      />

      <CardInvoiceView
        card={selectedCard}
        transactions={transactions}
        categories={categories}
        subscriptions={subscriptions}
        periods={periods}
        period={period}
        index={index}
        setIndex={setIndex}
        onDeleteItem={onDeleteCardItem}
      />

      <SubscriptionsCard
        card={selectedCard}
        subscriptions={subscriptions}
        categories={categories}
        periodKey={period.periodKey}
        onStop={onStopSubscription}
        onResume={onResumeSubscription}
      />
    </div>
  )
}

export default CardsScreen

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatMoney, formatDate, monthLabel, categoryMeta, todayIso } from '../lib/constants'
import {
  billsSummaryInsight,
  buildOccurrences,
  buildOccurrencesForMonth,
  currentMonthKey,
  monthKeyOffset,
} from '../lib/bills'
import { Card, EmptyState, TextInput, Select, PrimaryButton, GhostButton } from './ui'
import InsightNote from './InsightNote'
import SwipeToDelete from './SwipeToDelete'
import {
  ReceiptIcon,
  PencilIcon,
  TrashIcon,
  RepeatIcon,
  CheckIcon,
  BellIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ChevronDownIcon,
  SwapIcon,
} from './icons'

const STATUS_META = {
  vencida: { label: 'Vencida', className: 'bg-rose/20 text-rose' },
  'vence-em-breve': { label: 'Vence em breve', className: 'bg-rose/10 text-rose' },
  'a-vencer': { label: 'A vencer', className: 'bg-ink/5 text-gray' },
}

// Recebido (entrada) e pago (saída) usam cores diferentes de propósito — a
// mesma cor pros dois já causou confusão na hora de registrar o lançamento
// errado.
function paidMeta(isEntrada) {
  return isEntrada
    ? { label: 'Recebida', className: 'bg-mint/15 text-mint' }
    : { label: 'Paga', className: 'bg-rose/15 text-rose' }
}

function PayForm({ occurrence, onConfirm, onCancel }) {
  const { bill } = occurrence
  const isEntrada = bill.type === 'entrada'
  const payableAccounts = occurrence.accounts.filter((a) => a.type !== 'cartao')
  const [amount, setAmount] = useState(bill.amount ?? '')
  const [accountId, setAccountId] = useState(bill.accountId)
  const [paidDate, setPaidDate] = useState(todayIso())

  // Conta marcada como "valor variável" e cadastrada sem estimativa (ex:
  // roupas do brechó, que só dá pra somar no dia): o valor nasce em branco e
  // o formulário existe justamente pra ele ser informado antes da baixa.
  const undefinedAmount = bill.amount == null

  function handleSubmit(e) {
    e.preventDefault()
    if (amount === '' || !accountId) return
    onConfirm({ amount: Number(amount), accountId, paidDate })
  }

  return (
    <form className="flex flex-col gap-3 rounded-2xl bg-ink/5 p-3" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-0.5">
        <p className="font-display text-sm font-semibold text-ink">
          Quanto você {isEntrada ? 'recebeu' : 'pagou'}?
        </p>
        {undefinedAmount && (
          <p className="text-xs text-gray">
            Essa conta foi cadastrada sem valor definido — informe o valor real pra dar baixa e
            atualizar o saldo.
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TextInput
          type="number"
          step="0.01"
          inputMode="decimal"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={isEntrada ? 'Valor recebido' : 'Valor pago'}
          required
        />
        <TextInput
          type="date"
          value={paidDate}
          onChange={(e) => setPaidDate(e.target.value)}
          required
        />
      </div>
      <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
        {payableAccounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </Select>
      <div className="flex gap-2">
        <PrimaryButton type="submit" className="flex-1 px-4 py-2.5 text-sm">
          Confirmar {isEntrada ? 'recebimento' : 'pagamento'}
        </PrimaryButton>
        <GhostButton type="button" onClick={onCancel} className="px-3 py-2.5 text-sm">
          Cancelar
        </GhostButton>
      </div>
    </form>
  )
}

function BillCard({
  occurrence,
  accounts,
  categories,
  onEdit,
  onDelete,
  onPay,
  onUnpay,
  onStopRecurring,
  onResumeRecurring,
  highlighted,
}) {
  const [paying, setPaying] = useState(false)
  const { bill, dueDate, status, paid, payment, installmentIndex, installmentTotal } = occurrence
  const recurrenceEnded = bill.recurring && Boolean(bill.recurringEndMonthKey)
  const account = accounts.find((a) => a.id === bill.accountId)
  const category = categoryMeta(categories, bill.category)
  const isEntrada = bill.type === 'entrada'
  // Enquanto não tem baixa, uma conta de valor variável sem estimativa não tem
  // valor nenhum pra mostrar — "R$ 0,00" passaria a ideia errada de que não
  // custa nada.
  const undefinedAmount = !paid && bill.amount == null
  const meta =
    status === 'paga'
      ? paidMeta(isEntrada)
      : status === 'vencida' && isEntrada
        ? { label: 'Não recebida', className: STATUS_META.vencida.className }
        : STATUS_META[status]

  const cardRef = useRef(null)
  useEffect(() => {
    if (highlighted) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlighted])

  return (
    <div ref={cardRef}>
    <SwipeToDelete onDelete={() => onDelete(bill.id)} deleteLabel={`Apagar ${bill.name}`}>
    <Card
      className={`flex flex-col gap-3 transition-shadow ${
        highlighted ? 'ring-2 ring-coral' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
              isEntrada ? 'bg-mint/15 text-mint' : 'bg-rose/15 text-rose'
            }`}
          >
            {isEntrada ? <ArrowUpIcon /> : <ArrowDownIcon />}
          </div>
          <div>
            <p className="font-display font-semibold text-ink">{bill.name}</p>
            {/* Vencimento discreto, logo abaixo do nome. Quando a conta já foi
                paga, quem interessa é a data do pagamento — destacada no rodapé
                do card. */}
            <p className="text-[11px] leading-tight text-gray">Vence {formatDate(dueDate)}</p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray">
              {account?.name ?? 'Conta removida'}
              {installmentTotal > 1 ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-ink/5 px-1.5 py-0.5">
                  Parcela {installmentIndex}/{installmentTotal}
                </span>
              ) : (
                bill.recurring && (
                  <span
                    className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 ${
                      recurrenceEnded ? 'bg-rose/10 text-rose' : 'bg-ink/5'
                    }`}
                  >
                    <RepeatIcon /> {recurrenceEnded ? 'recorrência encerrada' : 'recorrente'}
                  </span>
                )
              )}
              {bill.person && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-ink/5 px-1.5 py-0.5">
                  {bill.person}
                </span>
              )}
              {category && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-coral/15 px-1.5 py-0.5 text-coral">
                  {category.emoji} {category.label}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(bill)}
            className="rounded-full p-2 text-gray hover:bg-ink/5 hover:text-ink"
            aria-label={`Editar ${bill.name}`}
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            onClick={() => onDelete(bill.id)}
            className="rounded-full p-2 text-gray hover:bg-rose/15 hover:text-rose"
            aria-label={`Apagar ${bill.name}`}
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}
        >
          {status === 'vencida' && <BellIcon />}
          {meta.label}
        </span>
        {undefinedAmount ? (
          <span className="font-display text-sm font-semibold text-gray">A definir</span>
        ) : (
          <span className={`font-display font-semibold ${isEntrada ? 'text-mint' : 'text-ink'}`}>
            {isEntrada ? '+ ' : '- '}
            {formatMoney(paid ? payment.amount : bill.amount)}
            {!paid && bill.variableAmount && (
              <span className="ml-1 text-xs font-normal text-gray">(estimado)</span>
            )}
          </span>
        )}
      </div>

      {bill.recurring && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <label
            className={`flex items-center gap-2 ${recurrenceEnded ? 'text-rose' : 'text-gray'}`}
          >
            <input
              type="checkbox"
              checked={recurrenceEnded}
              disabled={recurrenceEnded}
              onChange={(e) => {
                // Só liga: uma vez marcada, a caixinha some (via disabled)
                // pra ninguém reativar sem querer clicando de novo em cima —
                // reativar de propósito é o botão ao lado.
                if (e.target.checked) onStopRecurring(bill)
              }}
              className="h-3.5 w-3.5 rounded border-ink/20 accent-coral disabled:opacity-70"
            />
            {recurrenceEnded
              ? 'Lançamentos futuros interrompidos'
              : 'Interromper lançamentos futuros'}
          </label>
          {recurrenceEnded && (
            <GhostButton
              type="button"
              onClick={() => onResumeRecurring(bill)}
              className="px-3 py-1.5 text-xs"
            >
              Reativar
            </GhostButton>
          )}
        </div>
      )}

      {paid ? (
        <div className="flex items-center justify-between gap-2">
          {/* Mint nos dois casos: aqui a cor comunica "resolvida", não
              entrada/saída — essa distinção já está no sinal e na cor do valor. */}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/15 px-3 py-1.5 font-display text-sm font-semibold text-mint">
            <CheckIcon /> {isEntrada ? 'Recebida' : 'Paga'} em {formatDate(payment.paidDate)}
          </span>
          <GhostButton
            type="button"
            onClick={() => onUnpay(payment)}
            className="px-3 py-1.5 text-xs"
          >
            Desfazer
          </GhostButton>
        </div>
      ) : paying ? (
        <PayForm
          occurrence={{ ...occurrence, accounts }}
          onConfirm={(data) => {
            onPay(occurrence, data)
            setPaying(false)
          }}
          onCancel={() => setPaying(false)}
        />
      ) : (
        <PrimaryButton type="button" onClick={() => setPaying(true)}>
          <CheckIcon />{' '}
          {undefinedAmount
            ? `Informar valor ${isEntrada ? 'recebido' : 'pago'}`
            : `Marcar como ${isEntrada ? 'recebida' : 'paga'}`}
        </PrimaryButton>
      )}
    </Card>
    </SwipeToDelete>
    </div>
  )
}

// Lançamento avulso (entrada/saída sem vencimento nem status de pagamento —
// já aconteceu) exibido dentro do mesmo menu suspenso das contas, já que
// pra quem usa o app as duas coisas são "o que eu pago" e "o que eu recebo".
function TransactionCard({ tx, accounts, categories, onEdit, onDelete }) {
  const account = accounts.find((a) => a.id === tx.accountId)
  const category = categoryMeta(categories, tx.category)
  const isEntrada = tx.type === 'entrada'

  return (
    <SwipeToDelete onDelete={() => onDelete(tx.id)} deleteLabel={`Apagar ${tx.description}`}>
    <Card className="flex items-center justify-between gap-3">
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
            isEntrada ? 'bg-mint/15 text-mint' : 'bg-rose/15 text-rose'
          }`}
        >
          {isEntrada ? <ArrowUpIcon /> : <ArrowDownIcon />}
        </div>
        <div>
          <p className="font-display font-semibold text-ink">{tx.description}</p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-gray">
            {formatDate(tx.date)} · {account?.name ?? 'Conta removida'}
            {tx.recurring && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-ink/5 px-1.5 py-0.5">
                <RepeatIcon /> recorrente
              </span>
            )}
            {tx.transferId && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-ink/5 px-1.5 py-0.5">
                <SwapIcon /> transferência
              </span>
            )}
            {category && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-coral/15 px-1.5 py-0.5 text-coral">
                {category.emoji} {category.label}
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`font-display font-semibold ${isEntrada ? 'text-mint' : 'text-ink'}`}>
          {isEntrada ? '+ ' : '- '}
          {formatMoney(tx.amount)}
        </span>
        <div className="flex items-center gap-1">
          {!tx.transferId && (
            <button
              type="button"
              onClick={() => onEdit(tx)}
              className="rounded-full p-2 text-gray hover:bg-ink/5 hover:text-ink"
              aria-label={`Editar ${tx.description}`}
            >
              <PencilIcon />
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(tx.id)}
            className="rounded-full p-2 text-gray hover:bg-rose/15 hover:text-rose"
            aria-label={`Apagar ${tx.description}`}
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </Card>
    </SwipeToDelete>
  )
}

function occurrenceTotal(occurrence) {
  return occurrence.paid ? occurrence.payment.amount : occurrence.bill.amount ?? 0
}

function itemTotal(item) {
  return item.kind === 'bill' ? occurrenceTotal(item.occurrence) : Number(item.tx.amount) || 0
}

function TimelineGroup({
  title,
  subtitle,
  icon,
  accentClass,
  items,
  isOpen,
  onToggle,
  highlightKey,
  accounts,
  categories,
  onEdit,
  onDelete,
  onPay,
  onUnpay,
  onStopRecurring,
  onResumeRecurring,
  onEditTx,
  onDeleteTx,
}) {
  const total = items.reduce((sum, item) => sum + itemTotal(item), 0)

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3.5 text-left shadow-[0_12px_30px_-16px_rgba(30,30,30,0.25)]"
      >
        <span className="flex items-center gap-2.5">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${accentClass}`}>
            {icon}
          </span>
          <span className="flex flex-col">
            <span className="font-display font-semibold text-ink">{title}</span>
            <span className="text-xs text-gray">{subtitle}</span>
          </span>
          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-medium text-gray">
            {items.length}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray">{formatMoney(total)}</span>
          <ChevronDownIcon
            className={`text-gray transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {isOpen && (
        <div className="flex flex-col gap-3">
          {items.length === 0 ? (
            <p className="rounded-2xl bg-ink/5 px-4 py-3 text-sm text-gray">
              Nada por aqui ainda.
            </p>
          ) : (
            items.map((item) =>
              item.kind === 'bill' ? (
                <BillCard
                  key={item.occurrence.key}
                  occurrence={item.occurrence}
                  accounts={accounts}
                  categories={categories}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onPay={onPay}
                  onUnpay={onUnpay}
                  onStopRecurring={onStopRecurring}
                  onResumeRecurring={onResumeRecurring}
                  highlighted={item.occurrence.key === highlightKey}
                />
              ) : (
                <TransactionCard
                  key={item.tx.id}
                  tx={item.tx}
                  accounts={accounts}
                  categories={categories}
                  onEdit={onEditTx}
                  onDelete={onDeleteTx}
                />
              ),
            )
          )}
        </div>
      )}
    </div>
  )
}

function MonthNav({ monthKey, onChange }) {
  const isCurrent = monthKey === currentMonthKey()
  return (
    <div className="flex items-center justify-between gap-2">
      <GhostButton
        type="button"
        onClick={() => onChange(monthKeyOffset(monthKey, -1))}
        className="px-3 py-1.5 text-xs"
      >
        ‹ Anterior
      </GhostButton>
      <div className="flex flex-col items-center">
        <span className="font-display text-sm font-semibold text-ink">{monthLabel(monthKey)}</span>
        {!isCurrent && (
          <button
            type="button"
            onClick={() => onChange(currentMonthKey())}
            className="text-[11px] font-medium text-coral hover:underline"
          >
            Voltar pro mês atual
          </button>
        )}
      </div>
      <GhostButton
        type="button"
        onClick={() => onChange(monthKeyOffset(monthKey, 1))}
        className="px-3 py-1.5 text-xs"
      >
        Próxima ›
      </GhostButton>
    </div>
  )
}

// Linha do tempo com o mais novo em cima, igual à fatura do cartão, à lista de
// lançamentos e à Caixa de entrada — todo registro financeiro do app segue a
// mesma ordem, pra não obrigar a pessoa a reaprender a leitura a cada tela.
function sortByDate(items) {
  return [...items].sort((a, b) => {
    const dateA = a.kind === 'bill' ? a.occurrence.dueDate : a.tx.date
    const dateB = b.kind === 'bill' ? b.occurrence.dueDate : b.tx.date
    return dateA < dateB ? 1 : dateA > dateB ? -1 : 0
  })
}

function BillList({
  bills = [],
  billPayments = [],
  transactions = [],
  accounts,
  categories = [],
  onEdit,
  onDelete,
  onPay,
  onUnpay,
  onStopRecurring,
  onResumeRecurring,
  onEditTx,
  onDeleteTx,
  highlightKey,
}) {
  const [openGroup, setOpenGroup] = useState(null)
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey())

  // Notificação clicada em outra tela: pula direto pro mês e pro grupo
  // (a pagar/a receber) daquela ocorrência específica.
  useEffect(() => {
    if (!highlightKey) return
    const [billId, monthKey] = highlightKey.split(':')
    const bill = bills.find((b) => b.id === billId)
    if (!bill) return
    setSelectedMonth(monthKey)
    setOpenGroup(bill.type === 'entrada' ? 'entrada' : 'saida')
  }, [highlightKey, bills])

  const overviewOccurrences = useMemo(() => buildOccurrences(bills, billPayments), [bills, billPayments])
  const monthOccurrences = useMemo(
    () => buildOccurrencesForMonth(bills, billPayments, selectedMonth),
    [bills, billPayments, selectedMonth],
  )
  // Marcar uma conta como paga cria um lançamento automático só pra debitar o
  // saldo da conta escolhida (ver handlePayBill em App.jsx). Esse lançamento
  // não entra na lista: quem representa a conta paga aqui é o próprio card da
  // ocorrência — senão o mesmo gasto aparecia duas vezes e somava em dobro no
  // total do grupo.
  const monthTransactions = useMemo(
    () =>
      transactions.filter(
        (t) => t.date?.slice(0, 7) === selectedMonth && !t.billPaymentId && !t.billId,
      ),
    [transactions, selectedMonth],
  )

  if (bills.length === 0 && transactions.length === 0) {
    return (
      <EmptyState
        icon={<ReceiptIcon className="text-coral" width={32} height={32} />}
        title="Nenhum lançamento ainda"
        description="Cadastre contas fixas, pontuais ou registre uma entrada/saída pra acompanhar tudo aqui."
      />
    )
  }

  const insight = billsSummaryInsight(overviewOccurrences)

  const payable = sortByDate([
    ...monthOccurrences.filter((o) => o.bill.type !== 'entrada').map((occurrence) => ({ kind: 'bill', occurrence })),
    ...monthTransactions.filter((t) => t.type !== 'entrada').map((tx) => ({ kind: 'tx', tx })),
  ])
  const receivable = sortByDate([
    ...monthOccurrences.filter((o) => o.bill.type === 'entrada').map((occurrence) => ({ kind: 'bill', occurrence })),
    ...monthTransactions.filter((t) => t.type === 'entrada').map((tx) => ({ kind: 'tx', tx })),
  ])

  const groupProps = {
    accounts,
    categories,
    onEdit,
    onDelete,
    onPay,
    onUnpay,
    onStopRecurring,
    onResumeRecurring,
    onEditTx,
    onDeleteTx,
    highlightKey,
  }

  return (
    <div className="flex flex-col gap-3">
      <InsightNote insight={insight} />

      <MonthNav monthKey={selectedMonth} onChange={setSelectedMonth} />

      <TimelineGroup
        title="Saídas"
        subtitle="Gastos realizados e contas a pagar"
        icon={<ArrowDownIcon className="text-rose" />}
        accentClass="bg-rose/15"
        items={payable}
        isOpen={openGroup === 'saida'}
        onToggle={() => setOpenGroup((g) => (g === 'saida' ? null : 'saida'))}
        {...groupProps}
      />

      <TimelineGroup
        title="Entradas"
        subtitle="Valores recebidos e contas a receber"
        icon={<ArrowUpIcon className="text-mint" />}
        accentClass="bg-mint/15"
        items={receivable}
        isOpen={openGroup === 'entrada'}
        onToggle={() => setOpenGroup((g) => (g === 'entrada' ? null : 'entrada'))}
        {...groupProps}
      />
    </div>
  )
}

export default BillList

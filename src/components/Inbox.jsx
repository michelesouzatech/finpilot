import { useMemo, useState } from 'react'
import { formatMoney, formatDate, categoryMeta, monthLabel, slugify } from '../lib/constants'
import { emojiForLabel } from '../lib/emoji'
import { uncategorizedInsight, topCategoryInsight } from '../lib/insights'
import { Card, EmptyState, Field, Select, TextInput } from './ui'
import InsightNote from './InsightNote'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  InboxIcon,
  PlusIcon,
} from './icons'

function CategoryPicker({ categories, activeId, onPick, onAddCategory, onClose }) {
  const [newLabel, setNewLabel] = useState('')

  function handleAdd(e) {
    e.preventDefault()
    const label = newLabel.trim()
    if (!label) return
    onAddCategory(label)
    setNewLabel('')
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-ink/5 p-3">
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => {
          const active = cat.id === activeId
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onPick(cat.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition active:scale-95 ${
                active
                  ? 'bg-coral text-surface'
                  : 'bg-surface text-ink hover:bg-coral/15'
              }`}
            >
              <span>{cat.emoji}</span>
              {cat.label}
              {active && <CheckIcon />}
            </button>
          )
        })}
      </div>
      <form className="flex gap-2" onSubmit={handleAdd}>
        {/* Prévia do emoji escolhido automaticamente pelo nome digitado. */}
        <span
          aria-hidden="true"
          className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-surface px-3 text-xl leading-none"
        >
          {emojiForLabel(newLabel)}
        </span>
        <TextInput
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Nova categoria"
          className="flex-1"
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-2xl bg-ink/10 px-3 text-ink transition hover:bg-ink/15 active:scale-95"
          aria-label="Adicionar categoria"
        >
          <PlusIcon />
        </button>
      </form>
      <button
        type="button"
        onClick={onClose}
        className="self-start text-xs font-medium text-gray hover:text-ink"
      >
        Fechar
      </button>
    </div>
  )
}

function InboxRow({ tx, account, categories, isOpen, onToggle, onPick, onAddCategory }) {
  const isEntrada = tx.type === 'entrada'
  const category = categoryMeta(categories, tx.category)

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
              isEntrada ? 'bg-mint/15 text-mint' : 'bg-rose/15 text-rose'
            }`}
          >
            {isEntrada ? <ArrowUpIcon /> : <ArrowDownIcon />}
          </div>
          <div>
            <p className="font-display font-semibold text-ink">{tx.description}</p>
            <p className="text-xs text-gray">
              {formatDate(tx.date)} · {account?.name ?? 'Conta removida'}
            </p>
          </div>
        </div>
        <span
          className={`font-display font-semibold ${isEntrada ? 'text-mint' : 'text-ink'}`}
        >
          {isEntrada ? '+' : '-'} {formatMoney(tx.amount)}
        </span>
      </div>

      <button
        type="button"
        onClick={onToggle}
        className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition active:scale-95 ${
          category ? 'bg-coral/15 text-coral' : 'bg-rose/15 text-rose'
        }`}
      >
        {category ? (
          <>
            <span>{category.emoji}</span> {category.label}
          </>
        ) : (
          'Sem categoria · toque pra escolher'
        )}
      </button>

      {isOpen && (
        <CategoryPicker
          categories={categories}
          activeId={tx.category}
          onPick={onPick}
          onAddCategory={onAddCategory}
          onClose={onToggle}
        />
      )}
    </Card>
  )
}

function GroupHeader({ meta, count, total, isOpen, onToggle, muted }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3.5 text-left shadow-[0_12px_30px_-16px_rgba(30,30,30,0.25)]"
    >
      <span className="flex items-center gap-2">
        <span className="text-lg">{meta.emoji}</span>
        <span className={`font-display font-semibold ${muted ? 'text-rose' : 'text-ink'}`}>
          {meta.label}
        </span>
        <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-medium text-gray">
          {count}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray">{formatMoney(total)}</span>
        <ChevronDownIcon
          className={`text-gray transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </span>
    </button>
  )
}

function CategoryGroup({
  id,
  meta,
  transactions,
  accounts,
  categories,
  isOpen,
  onToggleGroup,
  openTxId,
  onToggleTx,
  onAssignCategory,
  onAddCategory,
}) {
  const total = transactions.reduce(
    (sum, t) => sum + (t.type === 'entrada' ? Number(t.amount) || 0 : -(Number(t.amount) || 0)),
    0,
  )

  return (
    <div className="flex flex-col gap-2">
      <GroupHeader
        meta={meta}
        count={transactions.length}
        total={total}
        isOpen={isOpen}
        onToggle={onToggleGroup}
        muted={id === '__none__'}
      />
      {isOpen && (
        <div className="flex flex-col gap-3 pl-1">
          {transactions.map((tx) => (
            <InboxRow
              key={tx.id}
              tx={tx}
              account={accounts.find((a) => a.id === tx.accountId)}
              categories={categories}
              isOpen={openTxId === tx.id}
              onToggle={() => onToggleTx(tx.id)}
              onPick={(categoryId) => {
                onAssignCategory(tx.id, categoryId)
                onToggleTx(null)
              }}
              onAddCategory={(label) => onAddCategory(label, tx.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Inbox({ transactions: allTransactions, accounts, categories, onAssignCategory, onAddCategory }) {
  // Transferência entre contas próprias não precisa de categoria — não é
  // gasto nem receita, então nem entra na revisão.
  const transactions = useMemo(
    () => allTransactions.filter((t) => !t.transferId),
    [allTransactions],
  )
  const [filter, setFilter] = useState('todas')
  const [period, setPeriod] = useState('all')
  const [openGroupId, setOpenGroupId] = useState(null)
  const [openTxId, setOpenTxId] = useState(null)

  const periods = useMemo(() => {
    const set = new Set(transactions.map((t) => t.date?.slice(0, 7)).filter(Boolean))
    return [...set].sort().reverse()
  }, [transactions])

  const periodFiltered =
    period === 'all' ? transactions : transactions.filter((t) => t.date?.slice(0, 7) === period)
  const uncategorizedCount = periodFiltered.filter((t) => !t.category).length

  const visible =
    filter === 'sem-categoria' ? periodFiltered.filter((t) => !t.category) : periodFiltered
  const sorted = [...visible].sort((a, b) => (a.date < b.date ? 1 : -1))

  const groups = useMemo(() => {
    const map = new Map()
    for (const tx of sorted) {
      const key = tx.category || '__none__'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(tx)
    }
    const ordered = []
    if (map.has('__none__')) {
      ordered.push({
        id: '__none__',
        meta: { emoji: '🗂️', label: 'Sem categoria' },
        transactions: map.get('__none__'),
      })
    }
    for (const cat of categories) {
      if (map.has(cat.id)) ordered.push({ id: cat.id, meta: cat, transactions: map.get(cat.id) })
    }
    return ordered
  }, [sorted, categories])

  function handleAddCategory(label, txId) {
    const id = slugify(label)
    if (!id) return
    if (!categories.some((c) => c.id === id)) {
      onAddCategory({ id, label, emoji: emojiForLabel(label) })
    }
    if (txId) onAssignCategory(txId, id)
  }

  if (transactions.length === 0) {
    return (
      <EmptyState
        icon={<InboxIcon className="text-coral" width={32} height={32} />}
        title="Nenhum lançamento pra revisar"
        description="Assim que você registrar entradas ou saídas, elas aparecem aqui pra categorizar."
      />
    )
  }

  const insight = uncategorizedInsight(transactions) ?? topCategoryInsight(transactions, categories)

  return (
    <div className="flex flex-col gap-4">
      <InsightNote insight={insight} />

      <div className="inline-flex w-fit gap-1 rounded-full bg-ink/5 p-1">
        <button
          type="button"
          onClick={() => setFilter('todas')}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
            filter === 'todas' ? 'bg-surface text-ink shadow-sm' : 'text-gray'
          }`}
        >
          Todas
        </button>
        <button
          type="button"
          onClick={() => setFilter('sem-categoria')}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
            filter === 'sem-categoria' ? 'bg-surface text-ink shadow-sm' : 'text-gray'
          }`}
        >
          Sem categoria ({uncategorizedCount})
        </button>
      </div>

      <Field label="Período">
        <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="all">Todos os períodos</option>
          {periods.map((p) => (
            <option key={p} value={p}>
              {monthLabel(p)}
            </option>
          ))}
        </Select>
      </Field>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<InboxIcon className="text-coral" width={32} height={32} />}
          title={filter === 'sem-categoria' ? 'Tudo categorizado!' : 'Nada neste período'}
          description={
            filter === 'sem-categoria'
              ? 'Todos os lançamentos desse período já têm uma categoria.'
              : 'Não há lançamentos no período selecionado.'
          }
        />
      ) : filter === 'sem-categoria' ? (
        <div className="flex flex-col gap-3">
          {sorted.map((tx) => (
            <InboxRow
              key={tx.id}
              tx={tx}
              account={accounts.find((a) => a.id === tx.accountId)}
              categories={categories}
              isOpen={openTxId === tx.id}
              onToggle={() => setOpenTxId(openTxId === tx.id ? null : tx.id)}
              onPick={(categoryId) => {
                onAssignCategory(tx.id, categoryId)
                setOpenTxId(null)
              }}
              onAddCategory={(label) => handleAddCategory(label, tx.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <CategoryGroup
              key={g.id}
              id={g.id}
              meta={g.meta}
              transactions={g.transactions}
              accounts={accounts}
              categories={categories}
              isOpen={openGroupId === g.id}
              onToggleGroup={() => setOpenGroupId(openGroupId === g.id ? null : g.id)}
              openTxId={openTxId}
              onToggleTx={(id) => setOpenTxId(openTxId === id ? null : id)}
              onAssignCategory={onAssignCategory}
              onAddCategory={handleAddCategory}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default Inbox

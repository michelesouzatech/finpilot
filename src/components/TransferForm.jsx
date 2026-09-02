import { useState } from 'react'
import { Field, TextInput, Select, PrimaryButton, GhostButton, Card } from './ui'
import { CloseIcon } from './icons'
import { todayIso } from '../lib/constants'

function emptyForm(accounts) {
  return {
    fromAccountId: accounts[0]?.id ?? '',
    toAccountId: accounts[1]?.id ?? accounts[0]?.id ?? '',
    amount: '',
    date: todayIso(),
    description: '',
  }
}

// Transferência entre contas próprias: conta corrente e investimento — não
// cartão, que segue outro fluxo (compra/pagamento de fatura).
function TransferForm({ accounts, onSave, onCancel }) {
  const [form, setForm] = useState(() => emptyForm(accounts))
  const sameAccount = form.fromAccountId && form.fromAccountId === form.toAccountId

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.fromAccountId || !form.toAccountId || sameAccount || Number(form.amount) <= 0) return
    onSave({ ...form, amount: Number(form.amount), description: form.description.trim() })
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold text-ink">Transferir entre contas</h2>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full p-1.5 text-gray hover:bg-ink/5"
          aria-label="Fechar"
        >
          <CloseIcon />
        </button>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <Field label="De">
          <Select
            value={form.fromAccountId}
            onChange={(e) => setForm({ ...form, fromAccountId: e.target.value })}
            required
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Para">
          <Select
            value={form.toAccountId}
            onChange={(e) => setForm({ ...form, toAccountId: e.target.value })}
            required
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        {sameAccount && (
          <p className="text-sm font-medium text-rose">Escolha duas contas diferentes.</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor">
            <TextInput
              type="number"
              step="0.01"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0,00"
              required
            />
          </Field>

          <Field label="Data">
            <TextInput
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </Field>
        </div>

        <Field label="Descrição (opcional)">
          <TextInput
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Ex: Reserva do mês"
          />
        </Field>

        <div className="flex gap-3 pt-1">
          <PrimaryButton type="submit" className="flex-1">
            Transferir
          </PrimaryButton>
          <GhostButton type="button" onClick={onCancel}>
            Cancelar
          </GhostButton>
        </div>
      </form>
    </Card>
  )
}

export default TransferForm

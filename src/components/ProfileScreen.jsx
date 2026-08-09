import { useEffect, useRef, useState } from 'react'
import { Card, DangerLink, Field, TextInput, Select, PrimaryButton, GhostButton } from './ui.jsx'
import { UserIcon, BankIcon, ListIcon, CatIcon, PencilIcon, UploadIcon } from './icons.jsx'
import Insights from './Insights.jsx'
import { supabase } from '../lib/supabaseClient.js'
import { loadProfile, saveProfile, uploadAvatar, deleteAccountForever } from '../lib/storage.js'

function ProfileScreen({
  accounts,
  transactions,
  categories,
  goals,
  onNavigate,
  userEmail,
  userId,
}) {
  const totalContas = accounts.length
  const totalLancamentos = transactions.length
  const totalGatinhos = goals.length

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [gender, setGender] = useState('')
  const [grossSalary, setGrossSalary] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    loadProfile().then((profile) => {
      if (cancelled || !profile) return
      setName(profile.name)
      setGender(profile.gender)
      setGrossSalary(profile.grossSalary ? String(profile.grossSalary) : '')
      setAvatarUrl(profile.avatarUrl)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function handleSignOut() {
    if (!confirm('Sair da sua conta?')) return
    supabase.auth.signOut()
  }

  function handlePickAvatar(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  async function handleSaveProfile() {
    setError('')
    setSaving(true)
    try {
      let finalAvatarUrl = avatarUrl
      if (avatarFile) {
        finalAvatarUrl = await uploadAvatar(userId, avatarFile)
      }
      await saveProfile(userId, { name, gender, avatarUrl: finalAvatarUrl, grossSalary: Number(grossSalary) || null })
      setAvatarUrl(finalAvatarUrl)
      setAvatarFile(null)
      setAvatarPreview('')
      setEditing(false)
    } catch (err) {
      setError('Não deu pra salvar. Tenta de novo em instantes.')
    } finally {
      setSaving(false)
    }
  }

  function handleCancelEdit() {
    setAvatarFile(null)
    setAvatarPreview('')
    setError('')
    setEditing(false)
  }

  async function handleDeleteAccount() {
    if (!confirm('Excluir seu cadastro apaga todos os seus dados (contas, lançamentos, metas) para sempre. Essa ação não pode ser desfeita. Quer continuar?'))
      return
    if (!confirm('Tem certeza mesmo? Não tem como recuperar depois.')) return

    setDeleting(true)
    try {
      await deleteAccountForever()
      await supabase.auth.signOut()
    } catch (err) {
      setError('Não deu pra excluir o cadastro agora. Tenta de novo em instantes.')
      setDeleting(false)
    }
  }

  const displayedAvatar = avatarPreview || avatarUrl

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col items-center gap-3 text-center">
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-coral/15 text-coral">
          {displayedAvatar ? (
            <img src={displayedAvatar} alt="" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <UserIcon width={36} height={36} strokeWidth={1.6} />
          )}
          {editing && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-coral text-surface shadow-[0_6px_14px_-6px_rgba(249,135,111,0.7)]"
              aria-label="Trocar foto"
            >
              <UploadIcon width={16} height={16} />
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePickAvatar}
          />
        </div>

        {!editing && (
          <div>
            <p className="font-display text-lg font-semibold text-ink">{name || 'Minha conta'}</p>
            <p className="text-sm text-gray">{userEmail ?? 'Gerencie seus dados no FinPilot'}</p>
          </div>
        )}

        {editing && (
          <div className="flex w-full flex-col gap-3">
            <Field label="Nome">
              <TextInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
              />
            </Field>
            <Field label="Gênero">
              <Select value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">Prefiro não dizer</option>
                <option value="feminino">Feminino</option>
                <option value="masculino">Masculino</option>
                <option value="outro">Outro</option>
              </Select>
            </Field>
            <Field label="Salário bruto mensal">
              <TextInput
                type="number"
                step="0.01"
                inputMode="decimal"
                value={grossSalary}
                onChange={(e) => setGrossSalary(e.target.value)}
                placeholder="0,00"
              />
            </Field>
            <p className="text-xs text-gray">
              Usado na aba <strong>E se?</strong> pra calcular quantas horas de trabalho uma
              compra custa (salário ÷ 220h).
            </p>
            {error && <p className="text-sm font-medium text-rose">{error}</p>}
            <div className="flex gap-2">
              <PrimaryButton className="flex-1" onClick={handleSaveProfile} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </PrimaryButton>
              <GhostButton className="flex-1" onClick={handleCancelEdit} disabled={saving}>
                Cancelar
              </GhostButton>
            </div>
          </div>
        )}

        {!editing && (
          <div className="flex items-center gap-4">
            <GhostButton type="button" onClick={() => setEditing(true)}>
              <PencilIcon width={16} height={16} /> Editar perfil
            </GhostButton>
            <DangerLink type="button" onClick={handleSignOut}>
              Sair da conta
            </DangerLink>
          </div>
        )}
      </Card>

      <Card className="grid grid-cols-3 gap-2 text-center">
        <button
          type="button"
          onClick={() => onNavigate?.('contas')}
          className="flex flex-col items-center gap-1 rounded-2xl p-1 transition hover:bg-ink/5 active:scale-95"
        >
          <BankIcon className="text-coral" />
          <span className="font-display text-base font-semibold text-ink">{totalContas}</span>
          <span className="text-xs text-gray">Contas</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.('lancamentos')}
          className="flex flex-col items-center gap-1 rounded-2xl p-1 transition hover:bg-ink/5 active:scale-95"
        >
          <ListIcon className="text-coral" />
          <span className="font-display text-base font-semibold text-ink">{totalLancamentos}</span>
          <span className="text-xs text-gray">Lançamentos</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.('porquinhos')}
          className="flex flex-col items-center gap-1 rounded-2xl p-1 transition hover:bg-ink/5 active:scale-95"
        >
          <CatIcon className="text-coral" />
          <span className="font-display text-base font-semibold text-ink">{totalGatinhos}</span>
          <span className="text-xs text-gray">Gatinhos</span>
        </button>
      </Card>

      {/* Os insights moram aqui, e não numa aba própria: eles falam sobre a
          pessoa (o mês dela, os hábitos, as metas), então ficam junto do
          resto do "sobre você" em vez de disputarem espaço no menu. */}
      <Insights
        accounts={accounts}
        transactions={transactions}
        categories={categories}
        goals={goals}
        onNavigate={onNavigate}
      />

      <Card className="flex flex-col gap-1">
        <p className="font-display text-sm font-semibold text-ink">Sobre o FinPilot</p>
        <p className="text-sm text-gray">
          Seu copiloto financeiro: organize contas, cartões e metas em um só lugar. Feito com
          carinho (e um gatinho) para ajudar você a decidir melhor com o seu dinheiro.
        </p>
      </Card>

      <Card className="flex flex-col gap-2">
        <p className="font-display text-sm font-semibold text-ink">Zona de risco</p>
        <p className="text-sm text-gray">
          Excluir seu cadastro apaga permanentemente suas contas, lançamentos, metas e faturas.
        </p>
        <DangerLink type="button" onClick={handleDeleteAccount} disabled={deleting}>
          {deleting ? 'Excluindo...' : 'Excluir meu cadastro'}
        </DangerLink>
      </Card>
    </div>
  )
}

export default ProfileScreen

import { CloseIcon } from './icons.jsx'

function MoreMenu({ items, activeTab, onSelect, onClose }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md rounded-t-[2rem] bg-surface p-5 pb-8 shadow-[0_-20px_40px_-16px_rgba(30,30,30,0.35)]">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-base font-semibold text-ink">Mais funcionalidades</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full p-2 text-ink/60 hover:bg-ink/5"
          >
            <CloseIcon />
          </button>
        </div>
        {/* Com 4 itens, três colunas deixariam um sozinho na segunda linha —
            2x2 fecha o quadro. */}
        <div className={`grid gap-3 ${items.length === 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {items.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-center transition active:scale-95 ${
                  active ? 'bg-coral/15 text-coral' : 'bg-ink/5 text-ink hover:bg-ink/10'
                }`}
              >
                <Icon width={24} height={24} strokeWidth={active ? 2.1 : 1.8} />
                <span className="text-xs font-medium leading-tight">{label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

export default MoreMenu

import Link from 'next/link';

type Action = { label: string; href: string } | { label: string; onClick: () => void };

/** "Nothing here yet" with the action that fixes it, instead of a dead end. */
export function EmptyState({ icon, title, text, actions = [], compact = false }: {
  icon?: React.ReactNode;
  title: string;
  text?: string;
  actions?: Action[];
  compact?: boolean;
}) {
  const buttonClass = (primary: boolean) =>
    primary
      ? 'btn-brand px-5 py-2 text-sm font-bold text-white'
      : 'rounded-xl border border-slate-700 px-5 py-2 text-sm font-bold text-slate-300 hover:bg-slate-800';
  return (
    <div className={`flex flex-col items-center text-center rounded-2xl border border-dashed border-slate-700 bg-slate-800/20 ${compact ? 'px-4 py-6' : 'px-6 py-12'}`}>
      {icon && <div className="mb-3 text-slate-500">{icon}</div>}
      <p className="font-bold text-white">{title}</p>
      {text && <p className="mt-1 max-w-md text-sm text-slate-400">{text}</p>}
      {actions.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {actions.map((action, i) => 'href' in action ? (
            <Link key={action.label} href={action.href} className={buttonClass(i === 0)}>{action.label}</Link>
          ) : (
            <button key={action.label} onClick={action.onClick} className={buttonClass(i === 0)}>{action.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

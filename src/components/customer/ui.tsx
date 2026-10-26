import { forwardRef, useId, type ComponentProps, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import type { ApiErrorCode } from '../../types/api';
import type { Copy } from '../../locales';

const focusRing = 'focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-brass';
const base = `inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-6 py-2.5 text-center text-sm font-bold uppercase tracking-[0.08em] [&:lang(th)]:normal-case [&:lang(th)]:tracking-normal [&:lang(th)]:text-base transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
const variants = {
  primary: 'bg-ink text-paper hover:bg-brass',
  ghost: 'border border-ink/30 bg-transparent text-ink hover:border-brass hover:text-brass',
  danger: 'border border-[#c0392b] bg-transparent text-[#a3261a] hover:bg-[#c0392b]/10',
} as const;
type Variant = keyof typeof variants;

export function Button({ variant = 'primary', className = '', ...rest }: ComponentProps<'button'> & { variant?: Variant }) {
  return <button type="button" className={`${base} ${variants[variant]} ${className}`} {...rest} />;
}

export function ButtonLink({ variant = 'primary', className = '', ...rest }: LinkProps & { variant?: Variant }) {
  return <Link className={`${base} ${variants[variant]} ${className}`} {...rest} />;
}

/** Plain anchor styled as a button (tel:, maps, downloads). */
export function ButtonAnchor({ variant = 'primary', className = '', ...rest }: ComponentProps<'a'> & { variant?: Variant }) {
  return <a className={`${base} ${variants[variant]} ${className}`} {...rest} />;
}

const tones = {
  error: { box: 'border-[#c0392b] bg-[#c0392b]/10', title: 'text-[#a3261a]', role: 'alert' as const },
  warn: { box: 'border-brass bg-brass/10', title: 'text-brass', role: 'status' as const },
  info: { box: 'border-ink/25 bg-panel', title: 'text-ink', role: 'status' as const },
  success: { box: 'border-[#2e8b57] bg-[#2e8b57]/10', title: 'text-[#1f6b3a]', role: 'status' as const },
};

interface NoticeProps { tone?: keyof typeof tones; title: string; children?: ReactNode; actions?: ReactNode; className?: string }

/** Focusable (tabIndex -1) so callers can move focus to it after a failed action. */
export const Notice = forwardRef<HTMLDivElement, NoticeProps>(function Notice({ tone = 'info', title, children, actions, className = '' }, ref) {
  const t = tones[tone];
  return (
    <div ref={ref} tabIndex={-1} role={t.role} className={`rounded-lg border p-4 ${t.box} ${className}`}>
      <p className={`font-bold ${t.title}`}>{title}</p>
      {children ? <div className="mt-1 text-sm text-ink/90">{children}</div> : null}
      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
});

export function ErrorNotice({ copy, code, extra, actions, className, noticeRef }: { copy: Copy; code: ApiErrorCode; extra?: ReactNode; actions?: ReactNode; className?: string; noticeRef?: React.Ref<HTMLDivElement> }) {
  const message = copy.errors[code];
  return (
    <Notice ref={noticeRef} tone="error" title={message.title} actions={actions} className={className}>
      <p>{message.body}</p>
      {extra}
    </Notice>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-3 text-muted">
      <svg className="hm-spinner h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
      <span>{label}</span>
    </div>
  );
}

export function SkeletonCards({ count = 3, label }: { count?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-lg bg-panel motion-reduce:animate-none" />)}
    </div>
  );
}

export function PlaceholderTag({ copy }: { copy: Copy }) {
  return <span title={copy.common.placeholderHelp} className="inline-block rounded-full border border-brass/60 px-2 py-0.5 text-xs font-bold text-brass">{copy.common.placeholderTag}</span>;
}

export function DraftTag({ copy }: { copy: Copy }) {
  return <span className="inline-block rounded-full border border-brass/60 px-2 py-0.5 text-xs font-bold text-brass">{copy.common.draftTag}</span>;
}

export function SectionHeading({ id, title, lead }: { id: string; title: string; lead?: string }) {
  return (
    <header className="mb-8">
      <h2 id={id} className="hm-display text-4xl text-ink sm:text-5xl">{title}</h2>
      <span className="hm-rule mt-3" />
      {lead ? <p className="mt-3 max-w-xl text-muted">{lead}</p> : null}
    </header>
  );
}

interface FieldProps {
  label: string;
  error?: string | null;
  hint?: string;
  optionalText?: string;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/** Label + hint + error wired with aria-describedby / aria-invalid. */
export function Field({ label, error, hint, optionalText, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-medium">
        {label}
        {optionalText ? <span className="ml-2 text-sm font-normal text-muted">({optionalText})</span> : null}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint ? <p id={hintId} className="mt-1 text-sm text-muted">{hint}</p> : null}
      {error ? <p id={errorId} className="mt-1 text-sm font-medium text-[#a3261a]">{error}</p> : null}
    </div>
  );
}

export const inputClass =
  'block min-h-11 w-full rounded-md border border-ink/30 bg-panel px-3 py-2 text-base text-ink placeholder:text-muted/70 aria-[invalid=true]:border-[#c0392b] focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-brass';

/** Visually-hidden native input + styled label card, so radios/checkboxes keep native keyboard behaviour. Callers add alignment and padding. */
export const choiceCard =
  'flex min-h-11 cursor-pointer rounded-lg border border-ink/20 bg-panel p-4 transition-colors hover:border-brass/70 has-[:checked]:border-brass has-[:checked]:bg-brass/10 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brass has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50';

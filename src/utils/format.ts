import { normalizeCurrency } from '@/domain/portfolio';

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: string, digits: number): Intl.NumberFormat {
  const id = `${currency}:${digits}`;
  let f = currencyFormatters.get(id);
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    } catch {
      f = new Intl.NumberFormat(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }
    currencyFormatters.set(id, f);
  }
  return f;
}

export function formatMoney(value: number, currency: string, digits = 2): string {
  // Minor-unit quotes (e.g. London `GBp`) aren't ISO codes; show the raw number with its unit.
  if (normalizeCurrency(currency).factor !== 1) {
    return `${value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${currency}`;
  }
  return currencyFormatter(currency, digits).format(value);
}

/** `+€12.34` / `−€5.00` */
export function formatSignedMoney(value: number, currency: string, digits = 2): string {
  const abs = formatMoney(Math.abs(value), currency, digits);
  if (Math.abs(value) < 0.005) return abs;
  return `${value > 0 ? '+' : '−'}${abs}`;
}

export function formatPercent(ratio: number, digits = 2): string {
  const pct = ratio * 100;
  if (!Number.isFinite(pct)) return '—';
  const sign = pct > 0.0049 ? '+' : pct < -0.0049 ? '−' : '';
  return `${sign}${Math.abs(pct).toFixed(digits)}%`;
}

/** Short signed number for tight spaces like calendar cells: `+1.2k`, `−340`, `+2.1M`. */
export function formatCompactSigned(value: number): string {
  const abs = Math.abs(value);
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  if (abs >= 1e6) return `${sign}${trim(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}${trim(abs / 1e3)}k`;
  if (abs >= 100) return `${sign}${Math.round(abs)}`;
  return `${sign}${abs.toFixed(abs >= 10 ? 0 : 1)}`;
}

function trim(n: number): string {
  return n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, '');
}

export function formatQuantity(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
});

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

export const formatDay = (iso: string) => dayFormatter.format(utc(iso));
export const formatShortDate = (iso: string) => shortDateFormatter.format(utc(iso));
export const formatMonth = (year: number, month: number) =>
  monthFormatter.format(new Date(Date.UTC(year, month - 1, 1)));

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const minutes = Math.round((now - timestamp) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

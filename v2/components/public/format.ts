import type {PublicData} from '@/lib/public-data';

export type Match = PublicData['matches'][number];
export function dateNL(value: string | Date | null | undefined, full = false) {
  if (!value) return 'Datum volgt';
  const date = typeof value === 'string' ? new Date(value.length === 10 ? `${value}T12:00:00Z` : value) : value;
  if (Number.isNaN(date.valueOf())) return 'Datum onbekend';
  return new Intl.DateTimeFormat('nl-NL', {day: 'numeric', month: full ? 'long' : 'short', year: full ? 'numeric' : undefined, timeZone: 'Europe/Amsterdam'}).format(date);
}
export function numberNL(value: string | number | null | undefined, digits = 2) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('nl-NL', {maximumFractionDigits: digits}) : '—';
}
export function contextHref(path: string, data: Pick<PublicData, 'context'>) {
  return data.context ? `${path}?context=${encodeURIComponent(data.context.id)}` : path;
}
export function matchGroup(match: Match, today: string) {
  if (match.status === 'completed') return 'completed';
  if (match.status === 'cancelled') return 'cancelled';
  if (match.status === 'awaiting_result') return 'pending';
  return match.scheduledDate && match.scheduledDate < today ? 'pending' : 'upcoming';
}

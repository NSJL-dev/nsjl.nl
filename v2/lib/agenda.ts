import type {getAgendaData} from './public-data';

export type AgendaItem = Awaited<ReturnType<typeof getAgendaData>>[number];
export const AGENDA_TIME_ZONE = 'Europe/Amsterdam';
const timeOptions = {timeZone: AGENDA_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'} as const;
const timeFormat = new Intl.DateTimeFormat('nl-NL', timeOptions);
const zonedTimeFormat = new Intl.DateTimeFormat('nl-NL', {...timeOptions, timeZoneName: 'short'});

export function agendaTime(value: Date, withZone = false) {
  return (withZone ? zonedTimeFormat : timeFormat).format(value);
}
export function agendaZone(value: Date) {
  return zonedTimeFormat.formatToParts(value).find(part => part.type === 'timeZoneName')?.value;
}
export function agendaTypeLabel(value: string) {
  switch (value) {
    case 'training': return 'Training';
    case 'tournament': return 'Toernooi';
    case 'team_event': return 'Teamactiviteit';
    case 'other': return 'Overig';
    default: return 'Soort onbekend';
  }
}
export function agendaInProgress(item: AgendaItem, now: Date) {
  return Boolean(item.endsAt && item.startsAt <= now && item.endsAt > now);
}
export function groupAgenda(items: readonly AgendaItem[], now: Date) {
  const upcoming: AgendaItem[] = [], past: AgendaItem[] = [];
  for (const item of items) {
    // An explicit end keeps an ongoing activity visible. Without one, do not
    // invent a duration: its known start is the cutoff for the past section.
    const isUpcoming = item.endsAt ? item.endsAt > now : item.startsAt >= now;
    if (isUpcoming) upcoming.push(item);
    else past.push(item);
  }
  const byStart = (a: AgendaItem, b: AgendaItem) => a.startsAt.valueOf() - b.startsAt.valueOf() || a.id.localeCompare(b.id);
  return {upcoming: upcoming.sort(byStart), past: past.sort((a, b) => byStart(b, a))};
}

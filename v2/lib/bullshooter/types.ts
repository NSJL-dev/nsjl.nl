export type ReportMeta = { leagueCode: string; leagueName: string; seasonName: string; sourceDivision: string; reportDateLocal: string; reportTimezone: null };
export type StandingRow = { team: string; position: number; games: number; wins: number; losses: number; winPercentage: number };
export type ResultRow = { team: string; against: string; date: string; week: number; games: number; wins: number; losses: number; forfeits: number };
export type PlayerStatRow = { player: string; team: string; metrics: Record<string, number | null> };
export type ScheduleRow = { week: number; date: string; home: string; away: string; venue: string | null; notes: string; startTime: string | null };
export type ResultsReport = { meta: ReportMeta; standings: StandingRow[]; results: ResultRow[]; x01: PlayerStatRow[]; cricket: PlayerStatRow[]; messages: string[]; warnings: string[] };
export type ScheduleReport = { meta: ReportMeta; matches: ScheduleRow[]; teams: string[]; warnings: string[] };
export type FetchedReport = { url: string; html: string; sha256: string };
export type SourceBundle = { results: FetchedReport; schedule: FetchedReport };
export class SourceError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'SourceError'; }
}

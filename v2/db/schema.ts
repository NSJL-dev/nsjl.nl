import { sql } from 'drizzle-orm';
import { pgTable, pgEnum, uuid, text, integer, numeric, boolean, timestamp, date, time, uniqueIndex, index, check, foreignKey } from 'drizzle-orm/pg-core';

const stamps = () => ({ createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow() });
const id = () => uuid('id').primaryKey().defaultRandom();
export const matchStatus = pgEnum('match_status', ['scheduled', 'completed', 'postponed', 'cancelled', 'awaiting_result']);
export const runStatus = pgEnum('run_status', ['running', 'success', 'warning', 'failed']);
export const postStatus = pgEnum('post_status', ['draft', 'published', 'archived']);
export const userRole = pgEnum('user_role', ['admin', 'editor']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull(), role: userRole('role').notNull().default('admin'), isActive: boolean('is_active').notNull().default(true), lastLoginAt: timestamp('last_login_at', { withTimezone: true }), ...stamps(),
}, t => [uniqueIndex('users_email_unique').on(t.email)]);

export const media = pgTable('media', {
  id: id(), filename: text('filename').notNull(), storagePath: text('storage_path').notNull(), bucket: text('bucket').notNull(), mimeType: text('mime_type').notNull(), size: integer('size').notNull(), width: integer('width'), height: integer('height'), altText: text('alt_text').notNull().default(''), status: text('status').notNull().default('private'), uploadedBy: uuid('uploaded_by').references(() => users.id), ...stamps(),
}, t => [uniqueIndex('media_path_unique').on(t.bucket, t.storagePath), check('media_size_positive', sql`${t.size} > 0`), check('media_status_valid', sql`${t.status} in ('private','published','archived')`)]);

export const players = pgTable('players', {
  id: id(), firstName: text('first_name').notNull(), lastName: text('last_name').notNull(), displayName: text('display_name').notNull(), nickname: text('nickname'), slug: text('slug').notNull(), photoMediaId: uuid('photo_media_id').references(() => media.id), bio: text('bio').notNull().default(''), isActive: boolean('is_active').notNull().default(true), sortOrder: integer('sort_order').notNull().default(0), ...stamps(),
}, t => [uniqueIndex('players_slug_unique').on(t.slug)]);

export const competitions = pgTable('competitions', {
  id: id(), name: text('name').notNull(), slug: text('slug').notNull(), source: text('source').notNull(), externalIdentifier: text('external_identifier'), ...stamps(),
}, t => [uniqueIndex('competitions_slug_unique').on(t.slug)]);
export const seasons = pgTable('seasons', {
  id: id(), competitionId: uuid('competition_id').notNull().references(() => competitions.id), name: text('name').notNull(), startsAt: date('starts_at'), endsAt: date('ends_at'), isCurrent: boolean('is_current').notNull().default(false), status: text('status').notNull().default('active'), ...stamps(),
}, t => [uniqueIndex('seasons_context_unique').on(t.competitionId,t.name), uniqueIndex('seasons_one_current').on(t.competitionId).where(sql`${t.isCurrent}`), index('seasons_competition_idx').on(t.competitionId), check('season_dates_valid',sql`${t.endsAt} is null or ${t.startsAt} is null or ${t.endsAt} >= ${t.startsAt}`)]);
export const divisions = pgTable('divisions', {
  id: id(), seasonId: uuid('season_id').notNull().references(() => seasons.id), name: text('name').notNull(), slug: text('slug').notNull(), externalIdentifier: text('external_identifier'), sourceUrl: text('source_url'), ...stamps(),
}, t => [uniqueIndex('divisions_context_unique').on(t.seasonId,t.slug),index('divisions_season_idx').on(t.seasonId)]);
export const teams = pgTable('teams', {
  id: id(), name: text('name').notNull(), normalizedName: text('normalized_name').notNull(), slug: text('slug').notNull(), isNsjl: boolean('is_nsjl').notNull().default(false), ...stamps(),
}, t => [uniqueIndex('teams_slug_unique').on(t.slug)]);
export const venues = pgTable('venues', {
  id: id(), name: text('name').notNull(), address: text('address'), postalCode: text('postal_code'), city: text('city'), country: text('country').notNull().default('NL'), isActive: boolean('is_active').notNull().default(true), ...stamps(),
});
export const teamSeasons = pgTable('team_seasons', {
  id: id(), teamId: uuid('team_id').notNull().references(() => teams.id), divisionId: uuid('division_id').notNull().references(() => divisions.id), externalIdentifier: text('external_identifier'), isPrimaryNsjl: boolean('is_primary_nsjl').notNull().default(false), venueId: uuid('venue_id').references(() => venues.id), ...stamps(),
}, t => [uniqueIndex('team_seasons_unique').on(t.teamId,t.divisionId),uniqueIndex('team_seasons_id_division').on(t.id,t.divisionId), uniqueIndex('team_seasons_primary').on(t.divisionId).where(sql`${t.isPrimaryNsjl}`), index('team_seasons_division_idx').on(t.divisionId)]);
export const teamAliases = pgTable('team_aliases', {
  id: id(), divisionId: uuid('division_id').notNull().references(() => divisions.id), teamSeasonId: uuid('team_season_id').notNull(), source: text('source').notNull(), externalName: text('external_name').notNull(), normalizedName: text('normalized_name').notNull(), ...stamps(),
}, t => [uniqueIndex('team_aliases_unique').on(t.divisionId,t.source,t.normalizedName),foreignKey({columns:[t.teamSeasonId,t.divisionId],foreignColumns:[teamSeasons.id,teamSeasons.divisionId]})]);
export const venueAliases = pgTable('venue_aliases', {
  id:id(), competitionId:uuid('competition_id').notNull().references(()=>competitions.id),source:text('source').notNull(), externalName:text('external_name').notNull(),normalizedName:text('normalized_name').notNull(),venueId:uuid('venue_id').notNull().references(()=>venues.id),...stamps(),
},t=>[uniqueIndex('venue_aliases_unique').on(t.competitionId,t.source,t.normalizedName)]);
export const playerTeamSeasons = pgTable('player_team_seasons', {
  id:id(),playerId:uuid('player_id').notNull().references(()=>players.id),teamSeasonId:uuid('team_season_id').notNull().references(()=>teamSeasons.id),joinedOn:date('joined_on'),leftOn:date('left_on'),role:text('role').notNull().default('player'),...stamps(),
},t=>[uniqueIndex('player_membership_unique').on(t.playerId,t.teamSeasonId), index('memberships_team_idx').on(t.teamSeasonId),check('membership_dates_valid',sql`${t.leftOn} is null or ${t.joinedOn} is null or ${t.leftOn} >= ${t.joinedOn}`)]);
export const playerAliases = pgTable('player_aliases', {
  id:id(),playerId:uuid('player_id').notNull().references(()=>players.id), source:text('source').notNull(),divisionId:uuid('division_id').notNull().references(()=>divisions.id), teamSeasonId:uuid('team_season_id').notNull(), externalIdentifier:text('external_identifier'),externalName:text('external_name').notNull(), normalizedName:text('normalized_name').notNull(),...stamps(),
},t=>[uniqueIndex('player_aliases_unique').on(t.source,t.teamSeasonId,t.normalizedName),foreignKey({columns:[t.teamSeasonId,t.divisionId],foreignColumns:[teamSeasons.id,teamSeasons.divisionId]}),index('player_aliases_player_idx').on(t.playerId)]);

export const sourceConfigs = pgTable('source_configs', {
  id:id(),divisionId:uuid('division_id').notNull().references(()=>divisions.id),provider:text('provider').notNull().default('bullshooter'),resultsEntryUrl:text('results_entry_url').notNull(),scheduleEntryUrl:text('schedule_entry_url').notNull(),teaminfoEntryUrl:text('teaminfo_entry_url'),enabled:boolean('enabled').notNull().default(false), expectedLeagueCode:text('expected_league_code').notNull(),expectedSourceDivision:text('expected_source_division').notNull().default('A'),...stamps(),
},t=>[uniqueIndex('source_configs_unique').on(t.provider,t.divisionId)]);
export const sourceReports = pgTable('source_reports', {
  id:id(),sourceConfigId:uuid('source_config_id').notNull().references(()=>sourceConfigs.id),reportType:text('report_type').notNull(),discoveredUrl:text('discovered_url').notNull(),reportDatetimeLocal:timestamp('report_datetime_local').notNull(),reportTimezone:text('report_timezone'),reportedAtUtc:timestamp('reported_at_utc',{withTimezone:true}),fetchedAt:timestamp('fetched_at',{withTimezone:true}).notNull().defaultNow(),sha256:text('sha256').notNull(),parserVersion:text('parser_version').notNull(),snapshotStoragePath:text('snapshot_storage_path'),status:text('status').notNull().default('accepted'),...stamps(),
},t=>[uniqueIndex('source_reports_unique').on(t.sourceConfigId,t.reportType,t.sha256),index('source_reports_config_idx').on(t.sourceConfigId),check('report_type_valid',sql`${t.reportType} in ('results','schedule','teaminfo')`)]);
export const externalPlayers = pgTable('external_players', {
  id:id(),source:text('source').notNull(),teamSeasonId:uuid('team_season_id').notNull().references(()=>teamSeasons.id),externalIdentifier:text('external_identifier'),externalName:text('external_name').notNull(),normalizedName:text('normalized_name').notNull(),playerId:uuid('player_id').references(()=>players.id),firstSeenReportId:uuid('first_seen_report_id').references(()=>sourceReports.id),lastSeenReportId:uuid('last_seen_report_id').references(()=>sourceReports.id),...stamps(),
},t=>[uniqueIndex('external_players_unique').on(t.source,t.teamSeasonId,t.normalizedName),uniqueIndex('external_players_id_team').on(t.id,t.teamSeasonId),uniqueIndex('external_players_person_team').on(t.playerId,t.teamSeasonId).where(sql`${t.playerId} is not null`),index('external_players_team_idx').on(t.teamSeasonId)]);

const standingFields=()=>({position:integer('position'),positionBasis:text('position_basis').notNull().default('source_order'),games:integer('games').notNull(),wins:integer('wins').notNull(),losses:integer('losses'),winPercentage:numeric('win_percentage',{precision:5,scale:2}).notNull()});
export const standings = pgTable('standings', {
  id:id(),teamSeasonId:uuid('team_season_id').notNull().references(()=>teamSeasons.id),...standingFields(),sourceReportId:uuid('source_report_id').references(()=>sourceReports.id),syncedAt:timestamp('synced_at',{withTimezone:true}).notNull().defaultNow(),...stamps(),
},t=>[uniqueIndex('standings_team_unique').on(t.teamSeasonId),check('standings_numbers_valid',sql`${t.games} >= 0 and ${t.wins} >= 0 and ${t.wins} <= ${t.games} and (${t.losses} is null or ${t.losses} >= 0) and ${t.winPercentage} between 0 and 100`)]);
export const standingsHistory = pgTable('standings_history', {
  id:id(),teamSeasonId:uuid('team_season_id').notNull().references(()=>teamSeasons.id),...standingFields(),sourceReportId:uuid('source_report_id').notNull().references(()=>sourceReports.id),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('standings_history_unique').on(t.teamSeasonId,t.sourceReportId)]);

export const matches = pgTable('matches', {
  id:id(),slug:text('slug').notNull(),divisionId:uuid('division_id').notNull().references(()=>divisions.id),weekNumber:integer('week_number'),roundKey:text('round_key').notNull(),importKey:text('import_key').notNull(),pairingNumber:integer('pairing_number').notNull().default(1),scheduledDate:date('scheduled_date'),playedDate:date('played_date'),startTime:time('start_time'),homeTeamSeasonId:uuid('home_team_season_id'),awayTeamSeasonId:uuid('away_team_season_id'),homeScore:integer('home_score'),awayScore:integer('away_score'),status:matchStatus('status').notNull().default('scheduled'),venueId:uuid('venue_id').references(()=>venues.id),notes:text('notes').notNull().default(''),source:text('source').notNull(),externalIdentifier:text('external_identifier'),resultReportId:uuid('result_report_id').references(()=>sourceReports.id),scheduleReportId:uuid('schedule_report_id').references(()=>sourceReports.id),syncedAt:timestamp('synced_at',{withTimezone:true}).notNull().defaultNow(),...stamps(),
},t=>[uniqueIndex('matches_import_unique').on(t.source,t.divisionId,t.importKey),uniqueIndex('matches_slug_unique').on(t.slug),index('matches_date_idx').on(t.divisionId,t.scheduledDate),foreignKey({columns:[t.homeTeamSeasonId,t.divisionId],foreignColumns:[teamSeasons.id,teamSeasons.divisionId]}),foreignKey({columns:[t.awayTeamSeasonId,t.divisionId],foreignColumns:[teamSeasons.id,teamSeasons.divisionId]}),check('matches_teams_differ',sql`${t.homeTeamSeasonId} is null or ${t.awayTeamSeasonId} is null or ${t.homeTeamSeasonId} <> ${t.awayTeamSeasonId}`),check('matches_scores_valid',sql`(${t.homeScore} is null or ${t.homeScore} >= 0) and (${t.awayScore} is null or ${t.awayScore} >= 0)`)]);
export const matchResultSides = pgTable('match_result_sides', {
  id:id(),matchId:uuid('match_id').notNull().references(()=>matches.id),teamSeasonId:uuid('team_season_id').notNull().references(()=>teamSeasons.id),games:integer('games').notNull(),wins:integer('wins').notNull(),losses:integer('losses').notNull(),forfeits:integer('forfeits').notNull(),sourceReportId:uuid('source_report_id').notNull().references(()=>sourceReports.id),...stamps(),
},t=>[uniqueIndex('match_result_side_unique').on(t.matchId,t.teamSeasonId),check('match_sides_numbers_valid',sql`${t.games} >= 0 and ${t.wins} >= 0 and ${t.losses} >= 0 and ${t.forfeits} >= 0 and ${t.wins}+${t.losses}=${t.games}`)]);

const statsFields=()=>({
  x01Ppd:numeric('x01_ppd',{precision:6,scale:2}),x01Games:integer('x01_games'),x01Wins:integer('x01_wins'),x01Hats:integer('x01_hats'),x013bd:integer('x01_3bd'),x01Ton80:integer('x01_ton80'),x01Hton:integer('x01_hton'),x01Lton:integer('x01_lton'),x016do:integer('x01_6do'),x017do:integer('x01_7do'),x018do:integer('x01_8do'),x019do:integer('x01_9do'),x0110do:integer('x01_10do'),x0111do:integer('x01_11do'),x0112do:integer('x01_12do'),x0113do:integer('x01_13do'),x0114do:integer('x01_14do'),x0115do:integer('x01_15do'),
  cricketMpr:numeric('cricket_mpr',{precision:5,scale:2}),cricketGames:integer('cricket_games'),cricketWins:integer('cricket_wins'),cricketAssists:integer('cricket_assists'),cricketHats:integer('cricket_hats'),cricketWhorse:integer('cricket_whorse'),cricket5mr:integer('cricket_5mr'),cricket6mr:integer('cricket_6mr'),cricket7mr:integer('cricket_7mr'),cricket8mr:integer('cricket_8mr'),cricket9mr:integer('cricket_9mr'),
});
export const playerSeasonStats = pgTable('player_season_stats', {
  id:id(),externalPlayerId:uuid('external_player_id').notNull(),playerId:uuid('player_id').references(()=>players.id),teamSeasonId:uuid('team_season_id').notNull().references(()=>teamSeasons.id),...statsFields(),sourceReportId:uuid('source_report_id').notNull().references(()=>sourceReports.id),syncedAt:timestamp('synced_at',{withTimezone:true}).notNull().defaultNow(),...stamps(),
},t=>[uniqueIndex('player_stats_external_unique').on(t.externalPlayerId),uniqueIndex('player_stats_person_team').on(t.playerId,t.teamSeasonId).where(sql`${t.playerId} is not null`),foreignKey({columns:[t.externalPlayerId,t.teamSeasonId],foreignColumns:[externalPlayers.id,externalPlayers.teamSeasonId]}),check('player_stats_valid',sql`(${t.x01Games} is null or ${t.x01Games} >= 0) and (${t.x01Wins} is null or ${t.x01Wins} between 0 and ${t.x01Games}) and (${t.cricketGames} is null or ${t.cricketGames} >= 0) and (${t.cricketWins} is null or ${t.cricketWins} between 0 and ${t.cricketGames}) and (${t.x01Ppd} is null or ${t.x01Ppd} >= 0) and (${t.cricketMpr} is null or ${t.cricketMpr} >= 0)`)]);
export const playerStatsHistory = pgTable('player_stats_history', {
  id:id(),externalPlayerId:uuid('external_player_id').notNull().references(()=>externalPlayers.id),playerId:uuid('player_id').references(()=>players.id),teamSeasonId:uuid('team_season_id').notNull().references(()=>teamSeasons.id),...statsFields(),sourceReportId:uuid('source_report_id').notNull().references(()=>sourceReports.id),createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('player_stats_history_unique').on(t.externalPlayerId,t.sourceReportId)]);
export const legacyPlayerStats = pgTable('legacy_player_stats', {
  id:id(),playerId:uuid('player_id').notNull().references(()=>players.id),originFile:text('origin_file').notNull(),claimedCompetitionId:uuid('claimed_competition_id').references(()=>competitions.id),claimedSeasonId:uuid('claimed_season_id').references(()=>seasons.id),ppd:numeric('ppd',{precision:6,scale:2}),mpr:numeric('mpr',{precision:5,scale:2}),wins:integer('wins'),hats:integer('hats'),verificationStatus:text('verification_status').notNull().default('unverified'),verifiedBy:uuid('verified_by').references(()=>users.id),...stamps(),
},t=>[uniqueIndex('legacy_stats_origin_unique').on(t.playerId,t.originFile)]);

export const newsPosts = pgTable('news_posts', {
  id:id(),title:text('title').notNull(),slug:text('slug').notNull(),excerpt:text('excerpt').notNull(),content:text('content').notNull(),featuredMediaId:uuid('featured_media_id').references(()=>media.id),category:text('category').notNull(),status:postStatus('status').notNull().default('draft'),publishedAt:timestamp('published_at',{withTimezone:true}),authorId:uuid('author_id').references(()=>users.id),...stamps(),
},t=>[uniqueIndex('news_slug_unique').on(t.slug),index('news_publication_idx').on(t.status,t.publishedAt)]);
export const events = pgTable('events', {
  id:id(),title:text('title').notNull(),description:text('description').notNull().default(''),startsAt:timestamp('starts_at',{withTimezone:true}).notNull(),endsAt:timestamp('ends_at',{withTimezone:true}),location:text('location').notNull().default(''),eventType:text('event_type').notNull(),isActive:boolean('is_active').notNull().default(true),createdBy:uuid('created_by').references(()=>users.id),...stamps(),
},t=>[check('event_type_valid',sql`${t.eventType} in ('training','tournament','team_event','other')`),check('event_dates_valid',sql`${t.endsAt} is null or ${t.endsAt} >= ${t.startsAt}`)]);
export const sponsors = pgTable('sponsors', {
  id:id(),name:text('name').notNull(),logoMediaId:uuid('logo_media_id').references(()=>media.id),websiteUrl:text('website_url'),description:text('description').notNull().default(''),isActive:boolean('is_active').notNull().default(true),sortOrder:integer('sort_order').notNull().default(0),...stamps(),
});
export const syncRuns = pgTable('sync_runs', {
  id:id(),sourceConfigId:uuid('source_config_id').notNull().references(()=>sourceConfigs.id),triggerType:text('trigger_type').notNull(),status:runStatus('status').notNull().default('running'),startedAt:timestamp('started_at',{withTimezone:true}).notNull().defaultNow(),finishedAt:timestamp('finished_at',{withTimezone:true}),resultReportId:uuid('result_report_id').references(()=>sourceReports.id),scheduleReportId:uuid('schedule_report_id').references(()=>sourceReports.id),recordsFound:integer('records_found').notNull().default(0),recordsCreated:integer('records_created').notNull().default(0),recordsUpdated:integer('records_updated').notNull().default(0),recordsSkipped:integer('records_skipped').notNull().default(0),errorCode:text('error_code'),errorMessage:text('error_message'),actorUserId:uuid('actor_user_id').references(()=>users.id),...stamps(),
},t=>[index('sync_runs_source_idx').on(t.sourceConfigId,t.startedAt)]);
export const syncLocks = pgTable('sync_locks', {
  sourceConfigId:uuid('source_config_id').primaryKey().references(()=>sourceConfigs.id),ownerRunId:uuid('owner_run_id').notNull(),leaseUntil:timestamp('lease_until',{withTimezone:true}).notNull(),
});
export const dataOverrides = pgTable('data_overrides', {
  id:id(),matchId:uuid('match_id').references(()=>matches.id),teamSeasonId:uuid('team_season_id').references(()=>teamSeasons.id),playerStatId:uuid('player_stat_id').references(()=>playerSeasonStats.id),fieldName:text('field_name').notNull(),numericValue:numeric('numeric_value'),textValue:text('text_value'),dateValue:date('date_value'),reason:text('reason').notNull(),expiresAt:timestamp('expires_at',{withTimezone:true}),createdBy:uuid('created_by').notNull().references(()=>users.id),isActive:boolean('is_active').notNull().default(true),...stamps(),
},t=>[check('override_exactly_one_target',sql`num_nonnulls(${t.matchId},${t.teamSeasonId},${t.playerStatId})=1`),check('override_exactly_one_value',sql`num_nonnulls(${t.numericValue},${t.textValue},${t.dateValue})=1`),check('override_field_valid',sql`${t.fieldName} in ('scheduledDate','startTime','status','notes','homeScore','awayScore','position','wins','games','x01Ppd','cricketMpr')`)]);
export const auditLogs = pgTable('audit_logs', {
  id:id(),actorUserId:uuid('actor_user_id').references(()=>users.id),action:text('action').notNull(),entityType:text('entity_type').notNull(),entityId:uuid('entity_id'),occurredAt:timestamp('occurred_at',{withTimezone:true}).notNull().defaultNow(),summary:text('summary').notNull(),
});
export const siteSettings = pgTable('site_settings', {
  key:text('key').primaryKey(),valueText:text('value_text'),valueNumber:numeric('value_number'),valueBoolean:boolean('value_boolean'),valueMediaId:uuid('value_media_id').references(()=>media.id),...stamps(),
},t=>[check('setting_exactly_one_value',sql`num_nonnulls(${t.valueText},${t.valueNumber},${t.valueBoolean},${t.valueMediaId})=1`)]);
export const rateLimits = pgTable('rate_limits', {
  key:text('key').primaryKey(),windowStart:timestamp('window_start',{withTimezone:true}).notNull(),count:integer('count').notNull(),
});

-- Custom SQL migration file, put your code below! --
-- Supabase API roles get no direct table access. Next.js is the authorization boundary.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',r.tablename);
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon',r.tablename);
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated',r.tablename);
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='auth' AND table_name='users') THEN
    ALTER TABLE public.users ADD CONSTRAINT users_auth_id_fk FOREIGN KEY(id) REFERENCES auth.users(id);
  END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.protect_audit_log() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit logs are append-only'; END $$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.protect_audit_log();
--> statement-breakpoint
CREATE FUNCTION public.validate_player_stat_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE external_record record;
BEGIN
  SELECT player_id, team_season_id INTO external_record FROM public.external_players WHERE id=NEW.external_player_id;
  IF external_record.team_season_id IS DISTINCT FROM NEW.team_season_id
     OR external_record.player_id IS DISTINCT FROM NEW.player_id THEN
    RAISE EXCEPTION 'External player/stat context mismatch';
  END IF;
  IF NEW.player_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.player_team_seasons WHERE player_id=NEW.player_id AND team_season_id=NEW.team_season_id
  ) THEN RAISE EXCEPTION 'Explicit team membership required'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER player_stats_context BEFORE INSERT OR UPDATE ON public.player_season_stats
FOR EACH ROW EXECUTE FUNCTION public.validate_player_stat_context();

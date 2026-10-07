-- Approved security correction only; preserve existing trigger bodies and privileges.
ALTER FUNCTION public.protect_audit_log() SET search_path = '';
--> statement-breakpoint
ALTER FUNCTION public.validate_player_stat_context() SET search_path = '';

-- Firmo's foundation: the organization every RLS policy compares against. It is set per
-- transaction by the application after verifying a proof (src/platform/tenancy.ts), and is empty
-- otherwise — so a query outside an organization sees nothing.
CREATE FUNCTION public.current_organization_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('kete.organization_id', true), '') $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.current_organization_id() TO firmo_app;

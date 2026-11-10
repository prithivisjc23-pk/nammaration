CREATE OR REPLACE FUNCTION public.simulate_next_month_reset()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g bigint;
  n integer;
  m text := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM');
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(2319, 1);
  INSERT INTO public.quota_reset_events(calendar_month, actor_id)
  VALUES (m, auth.uid()) RETURNING id INTO g;
  -- Target every customer explicitly: the authenticated API enforces safeupdate.
  UPDATE public.customers
  SET status = 'pending', monthly_status = 'Pending', distribution_month = m,
      collected_at = NULL, quota_generation = g
  WHERE id IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'count', n, 'generation', g);
END;
$$;
REVOKE ALL ON FUNCTION public.simulate_next_month_reset() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.simulate_next_month_reset() TO authenticated, service_role;
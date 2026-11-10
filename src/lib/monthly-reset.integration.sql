-- Transactional integration checks: no live data changes survive this test.
BEGIN;
DO $$
DECLARE
  sid uuid; other_sid uuid; owner uuid; other_owner uuid; admin_id uuid;
  cid uuid:=gen_random_uuid(); result jsonb; history_before bigint; g bigint;
BEGIN
  SELECT id,owner_id INTO sid,owner FROM public.shops WHERE shop_number='TNV-FPS-001';
  SELECT id,owner_id INTO other_sid,other_owner FROM public.shops WHERE shop_number='TNV-FPS-002';
  SELECT user_id INTO admin_id FROM public.user_roles WHERE role='super_admin' LIMIT 1;
  IF sid IS NULL OR other_sid IS NULL OR admin_id IS NULL THEN RAISE EXCEPTION 'Missing required accounts'; END IF;
  INSERT INTO public.customers(id,shop_id,card,card_norm,name,mobile,distribution_month)
  VALUES(cid,sid,'RESETCHECK202611','RESETCHECK202611','Reset integration fixture','6990002319','2026-10');
  PERFORM public.renew_monthly_quotas();
  IF NOT EXISTS(SELECT 1 FROM public.customers WHERE id=cid AND distribution_month=to_char(now() AT TIME ZONE 'Asia/Kolkata','YYYY-MM') AND monthly_status='Pending') THEN RAISE EXCEPTION 'Automatic renewal failed'; END IF;
  PERFORM set_config('request.jwt.claim.sub',owner::text,true);
  result:=public.collect_monthly_ration(cid,sid);
  IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Initial collection failed'; END IF;
  BEGIN
    PERFORM public.simulate_next_month_reset();
    RAISE EXCEPTION 'Shopkeeper reset improperly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.sub',other_owner::text,true);
  IF public.lookup_ration_card('RESETCHECK202611')->>'collected'<>'true' THEN RAISE EXCEPTION 'Foreign branch lock absent'; END IF;
  IF public.collect_monthly_ration(cid,other_sid)->>'error'<>'already_collected' THEN RAISE EXCEPTION 'Duplicate improperly allowed'; END IF;
  SELECT count(*) INTO history_before FROM public.ration_collections;
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  result:=public.simulate_next_month_reset();
  IF result->>'ok'<>'true' OR EXISTS(SELECT 1 FROM public.customers WHERE monthly_status<>'Pending' OR status<>'pending') THEN RAISE EXCEPTION 'Global reset failed'; END IF;
  IF (SELECT count(*) FROM public.ration_collections)<>history_before THEN RAISE EXCEPTION 'Reset destroyed history'; END IF;
  g:=(result->>'generation')::bigint;
  IF NOT EXISTS(SELECT 1 FROM public.quota_reset_events WHERE id=g AND actor_id=admin_id) THEN RAISE EXCEPTION 'Audit missing'; END IF;
  PERFORM set_config('request.jwt.claim.sub',other_owner::text,true);
  IF public.lookup_ration_card('6990002319')->>'collected'<>'false' THEN RAISE EXCEPTION 'Mobile did not reopen'; END IF;
  IF public.collect_monthly_ration(cid,other_sid)->>'ok'<>'true' THEN RAISE EXCEPTION 'New-cycle collection failed'; END IF;
  IF public.collect_monthly_ration(cid,other_sid)->>'error'<>'already_collected' THEN RAISE EXCEPTION 'New-cycle duplicate improperly allowed'; END IF;
  IF (SELECT count(*) FROM public.ration_collections WHERE customer_id=cid)<>2 THEN RAISE EXCEPTION 'Both generations must remain in history'; END IF;
END $$;
-- Match the authenticated API session, including its safe-update protection.
SELECT set_config('test.expected_reset_count', (SELECT count(*)::text FROM public.customers), true);
SELECT set_config('request.jwt.claim.sub', (SELECT user_id::text FROM public.user_roles WHERE role='super_admin' LIMIT 1), true);
LOAD 'safeupdate';
SET LOCAL ROLE authenticated;
DO $$
DECLARE result jsonb;
BEGIN
  result := public.simulate_next_month_reset();
  IF result->>'ok' IS DISTINCT FROM 'true'
     OR (result->>'count')::bigint <> current_setting('test.expected_reset_count')::bigint THEN
    RAISE EXCEPTION 'Authenticated global reset failed';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
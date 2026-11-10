CREATE TABLE public.quota_reset_events (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, calendar_month text NOT NULL, actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.quota_reset_events TO authenticated;
GRANT ALL ON public.quota_reset_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.quota_reset_events_id_seq TO service_role;
ALTER TABLE public.quota_reset_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super Admin reads reset audit" ON public.quota_reset_events FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'super_admin'));
ALTER TABLE public.customers ADD COLUMN quota_generation bigint NOT NULL DEFAULT 0;
ALTER TABLE public.ration_collections ADD COLUMN quota_generation bigint NOT NULL DEFAULT 0;
ALTER TABLE public.ration_collections DROP CONSTRAINT ration_collections_card_norm_distribution_month_key;
ALTER TABLE public.ration_collections DROP CONSTRAINT ration_collections_mobile_distribution_month_key;
ALTER TABLE public.ration_collections ADD CONSTRAINT ration_card_cycle_unique UNIQUE(card_norm,distribution_month,quota_generation);
ALTER TABLE public.ration_collections ADD CONSTRAINT ration_mobile_cycle_unique UNIQUE(mobile,distribution_month,quota_generation);
CREATE FUNCTION public.current_quota_generation() RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT coalesce(max(id),0) FROM public.quota_reset_events WHERE calendar_month=to_char(now() AT TIME ZONE 'Asia/Kolkata','YYYY-MM') $$;
REVOKE ALL ON FUNCTION public.current_quota_generation() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_quota_generation() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.protect_monthly_distribution() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
IF current_user NOT IN ('postgres','service_role','supabase_admin') THEN
IF TG_OP='UPDATE' THEN
NEW.card:=OLD.card; NEW.card_norm:=OLD.card_norm; NEW.mobile:=OLD.mobile; NEW.shop_id:=OLD.shop_id;
NEW.status:=OLD.status; NEW.monthly_status:=OLD.monthly_status; NEW.distribution_month:=OLD.distribution_month; NEW.collected_at:=OLD.collected_at; NEW.quota_generation:=OLD.quota_generation;
ELSE NEW.status:='pending'; NEW.monthly_status:='Pending'; NEW.distribution_month:=to_char(now() AT TIME ZONE 'Asia/Kolkata','YYYY-MM'); NEW.collected_at:=NULL; NEW.quota_generation:=public.current_quota_generation(); END IF;
END IF; RETURN NEW; END $$;
CREATE FUNCTION public.renew_monthly_quotas() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE m text:=to_char(now() AT TIME ZONE 'Asia/Kolkata','YYYY-MM'); n integer; BEGIN
PERFORM pg_advisory_xact_lock(2319,1);
UPDATE public.customers SET status='pending',monthly_status='Pending',distribution_month=m,collected_at=NULL,quota_generation=public.current_quota_generation() WHERE distribution_month<>m;
GET DIAGNOSTICS n=ROW_COUNT; RETURN n; END $$;
REVOKE ALL ON FUNCTION public.renew_monthly_quotas() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.renew_monthly_quotas() TO service_role;
CREATE FUNCTION public.simulate_next_month_reset() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE g bigint; n integer; m text:=to_char(now() AT TIME ZONE 'Asia/Kolkata','YYYY-MM'); BEGIN
IF NOT public.has_role(auth.uid(),'super_admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
PERFORM pg_advisory_xact_lock(2319,1);
INSERT INTO public.quota_reset_events(calendar_month,actor_id) VALUES(m,auth.uid()) RETURNING id INTO g;
UPDATE public.customers SET status='pending',monthly_status='Pending',distribution_month=m,collected_at=NULL,quota_generation=g;
GET DIAGNOSTICS n=ROW_COUNT; RETURN jsonb_build_object('ok',true,'count',n,'generation',g); END $$;
REVOKE ALL ON FUNCTION public.simulate_next_month_reset() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.simulate_next_month_reset() TO authenticated;
CREATE OR REPLACE FUNCTION public.lookup_ration_card(_identifier text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE c public.customers; m text:=to_char(now() AT TIME ZONE 'Asia/Kolkata','YYYY-MM'); g bigint; BEGIN
IF NOT EXISTS(SELECT 1 FROM public.shops s WHERE public.owns_shop(s.id)) THEN RAISE EXCEPTION 'Forbidden'; END IF;
PERFORM pg_advisory_xact_lock_shared(2319,1); g:=public.current_quota_generation();
SELECT * INTO c FROM public.customers WHERE card_norm=regexp_replace(upper(_identifier),'[^A-Z0-9]','','g') OR mobile=regexp_replace(_identifier,'[^0-9]','','g') LIMIT 1;
IF c.id IS NULL THEN RETURN jsonb_build_object('found',false); END IF;
RETURN jsonb_build_object('found',true,'customer_id',c.id,'name',c.name,'family_members',c.family_members,'monthly_quota',c.monthly_quota,'collected',EXISTS(SELECT 1 FROM public.ration_collections r WHERE r.distribution_month=m AND r.quota_generation=g AND (r.card_norm=c.card_norm OR r.mobile=c.mobile)) OR (c.distribution_month=m AND c.quota_generation=g AND c.monthly_status='Collected'),'own_shop',public.owns_shop(c.shop_id)); END $$;
CREATE OR REPLACE FUNCTION public.collect_monthly_ration(_customer_id uuid,_shop_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE c public.customers; m text:=to_char(now() AT TIME ZONE 'Asia/Kolkata','YYYY-MM'); g bigint; BEGIN
IF NOT public.owns_shop(_shop_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
PERFORM pg_advisory_xact_lock_shared(2319,1); g:=public.current_quota_generation();
SELECT * INTO c FROM public.customers WHERE id=_customer_id FOR UPDATE;
IF c.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
IF c.distribution_month=m AND c.quota_generation=g AND c.monthly_status='Collected' THEN RETURN jsonb_build_object('ok',false,'error','already_collected'); END IF;
BEGIN INSERT INTO public.ration_collections(customer_id,card_norm,mobile,shop_id,distribution_month,quota_generation) VALUES(c.id,c.card_norm,c.mobile,_shop_id,m,g); EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('ok',false,'error','already_collected'); END;
UPDATE public.customers SET status='collected',monthly_status='Collected',distribution_month=m,collected_at=now(),quota_generation=g WHERE id=c.id;
RETURN jsonb_build_object('ok',true); END $$;
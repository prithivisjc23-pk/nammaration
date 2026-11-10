ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS monthly_status text NOT NULL DEFAULT 'Pending';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS distribution_month text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata','YYYY-MM');
CREATE TABLE public.ration_collections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid NOT NULL, card_norm text NOT NULL, mobile text NOT NULL,
 shop_id uuid NOT NULL REFERENCES public.shops(id), distribution_month text NOT NULL, collected_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(card_norm, distribution_month), UNIQUE(mobile, distribution_month)
);
GRANT SELECT ON public.ration_collections TO authenticated;
GRANT ALL ON public.ration_collections TO service_role;
ALTER TABLE public.ration_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners and cardholders read collection history" ON public.ration_collections FOR SELECT TO authenticated USING (public.owns_shop(shop_id) OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id=customer_id AND c.user_id=auth.uid()));
INSERT INTO public.ration_collections(customer_id,card_norm,mobile,shop_id,distribution_month,collected_at)
 SELECT id,card_norm,mobile,shop_id,to_char(collected_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM'),collected_at FROM public.customers WHERE status='collected' AND collected_at IS NOT NULL ON CONFLICT DO NOTHING;
UPDATE public.customers SET distribution_month=CASE WHEN collected_at IS NOT NULL THEN to_char(collected_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM') ELSE to_char(now() AT TIME ZONE 'Asia/Kolkata','YYYY-MM') END, monthly_status=CASE WHEN status='collected' AND collected_at IS NOT NULL AND to_char(collected_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM')=to_char(now() AT TIME ZONE 'Asia/Kolkata','YYYY-MM') THEN 'Collected' ELSE 'Pending' END;
CREATE OR REPLACE FUNCTION public.owns_shop(_shop_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.shops WHERE id=_shop_id AND owner_id=auth.uid() AND is_active AND shop_number IN ('TNV-FPS-001','TNV-FPS-002','TNV-FPS-003')) $$;
DROP POLICY IF EXISTS "Owners read their shop" ON public.shops;
CREATE POLICY "Owners read their shop" ON public.shops FOR SELECT TO authenticated USING(public.owns_shop(id));
DROP POLICY IF EXISTS "Owners update their shop" ON public.shops;
CREATE POLICY "Owners update their shop" ON public.shops FOR UPDATE TO authenticated USING(public.owns_shop(id)) WITH CHECK(public.owns_shop(id));
CREATE OR REPLACE FUNCTION public.handle_new_shopkeeper() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.list_shops_public() RETURNS TABLE(shop_number text,shop_name text,district text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT shop_number,shop_name,district FROM public.shops WHERE is_active AND shop_number IN ('TNV-FPS-001','TNV-FPS-002','TNV-FPS-003') ORDER BY district,shop_number $$;
CREATE OR REPLACE FUNCTION public.shops_protect_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.owner_id:=OLD.owner_id; NEW.shop_number:=OLD.shop_number; NEW.username:=OLD.username; NEW.created_at:=OLD.created_at; NEW.is_active:=OLD.is_active; NEW.updated_at:=now(); RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.protect_monthly_distribution() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF current_user NOT IN ('postgres','service_role','supabase_admin') THEN
  IF TG_OP='UPDATE' THEN
   NEW.card:=OLD.card; NEW.card_norm:=OLD.card_norm; NEW.mobile:=OLD.mobile; NEW.shop_id:=OLD.shop_id;
   NEW.status:=OLD.status; NEW.monthly_status:=OLD.monthly_status; NEW.distribution_month:=OLD.distribution_month; NEW.collected_at:=OLD.collected_at;
  ELSE NEW.status:='pending'; NEW.monthly_status:='Pending'; NEW.distribution_month:=to_char(now() AT TIME ZONE 'Asia/Kolkata','YYYY-MM'); NEW.collected_at:=NULL;
  END IF;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER protect_monthly_distribution BEFORE INSERT OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.protect_monthly_distribution();
CREATE OR REPLACE FUNCTION public.lookup_ration_card(_identifier text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.customers; m text:=to_char(now() AT TIME ZONE 'Asia/Kolkata','YYYY-MM');
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.shops s WHERE public.owns_shop(s.id)) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO c FROM public.customers WHERE card_norm=regexp_replace(upper(_identifier),'[^A-Z0-9]','','g') OR mobile=_identifier LIMIT 1;
 IF c.id IS NULL THEN RETURN jsonb_build_object('found',false); END IF;
 RETURN jsonb_build_object('found',true,'customer_id',c.id,'collected',EXISTS(SELECT 1 FROM public.ration_collections r WHERE r.distribution_month=m AND (r.card_norm=c.card_norm OR r.mobile=c.mobile)),'own_shop',public.owns_shop(c.shop_id));
END $$;
REVOKE ALL ON FUNCTION public.lookup_ration_card(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lookup_ration_card(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.collect_monthly_ration(_customer_id uuid,_shop_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.customers; m text:=to_char(now() AT TIME ZONE 'Asia/Kolkata','YYYY-MM');
BEGIN
 IF NOT public.owns_shop(_shop_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO c FROM public.customers WHERE id=_customer_id FOR UPDATE;
 IF c.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
 BEGIN
 INSERT INTO public.ration_collections(customer_id,card_norm,mobile,shop_id,distribution_month) VALUES(c.id,c.card_norm,c.mobile,_shop_id,m);
 EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('ok',false,'error','already_collected'); END;
 UPDATE public.customers SET status='collected',monthly_status='Collected',distribution_month=m,collected_at=now() WHERE id=c.id;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.collect_monthly_ration(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.collect_monthly_ration(uuid,uuid) TO authenticated;
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, role text NOT NULL CHECK (role IN ('super_admin','shopkeeper')), UNIQUE(user_id,role));
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own role" ON public.user_roles FOR SELECT TO authenticated USING(user_id=auth.uid());
INSERT INTO public.user_roles(user_id,role) SELECT s.owner_id,'shopkeeper' FROM public.shops s JOIN auth.users u ON u.id=s.owner_id ON CONFLICT DO NOTHING;
CREATE FUNCTION public.has_role(_user_id uuid,_role text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;
REVOKE ALL ON FUNCTION public.has_role(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,text) TO authenticated,service_role;
CREATE TABLE public.admin_credentials (login_id text PRIMARY KEY, user_id uuid NOT NULL UNIQUE, password_hash text NOT NULL);
GRANT ALL ON public.admin_credentials TO service_role;
ALTER TABLE public.admin_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ADD COLUMN family_members jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.customers ADD COLUMN monthly_quota jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE OR REPLACE FUNCTION public.owns_shop(_shop_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.shops WHERE id=_shop_id AND owner_id=auth.uid() AND is_active) $$;
CREATE OR REPLACE FUNCTION public.list_shops_public() RETURNS TABLE(shop_number text,shop_name text,district text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT shop_number,shop_name,district FROM public.shops WHERE is_active ORDER BY district,shop_number $$;
CREATE OR REPLACE FUNCTION public.verify_shop_credentials(_shop_number text,_password text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$ DECLARE attempts public.shop_login_attempts; uid uuid; ph text; BEGIN
IF length(_shop_number)>40 OR length(_password)>200 OR length(_password)<1 THEN RETURN NULL; END IF;
INSERT INTO public.shop_login_attempts(shop_number) VALUES (_shop_number) ON CONFLICT DO NOTHING;
SELECT * INTO attempts FROM public.shop_login_attempts WHERE shop_number=_shop_number FOR UPDATE;
IF attempts.window_start < now()-interval '5 minutes' THEN UPDATE public.shop_login_attempts SET failures=0,window_start=now() WHERE shop_number=_shop_number; attempts.failures:=0; END IF;
IF attempts.failures>=10 THEN RETURN NULL; END IF;
SELECT owner_id,password_hash INTO uid,ph FROM public.shops WHERE shop_number=_shop_number AND is_active;
IF uid IS NULL THEN SELECT a.user_id,a.password_hash INTO uid,ph FROM public.admin_credentials a JOIN public.user_roles r ON r.user_id=a.user_id AND r.role='super_admin' WHERE a.login_id=_shop_number; END IF;
IF ph IS NOT NULL AND extensions.crypt(_password,ph)=ph THEN UPDATE public.shop_login_attempts SET failures=0 WHERE shop_number=_shop_number; RETURN uid; END IF;
UPDATE public.shop_login_attempts SET failures=failures+1 WHERE shop_number=_shop_number; RETURN NULL;
END $$;
CREATE FUNCTION public.set_admin_credential(_user_id uuid,_login_id text,_password text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role='super_admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
INSERT INTO public.admin_credentials(login_id,user_id,password_hash) VALUES(_login_id,_user_id,extensions.crypt(_password,extensions.gen_salt('bf',10))) ON CONFLICT(login_id) DO UPDATE SET user_id=EXCLUDED.user_id,password_hash=EXCLUDED.password_hash;
END $$;
REVOKE ALL ON FUNCTION public.set_admin_credential(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_credential(uuid,text,text) TO service_role;
CREATE FUNCTION public.provision_shop(_owner_id uuid,_shop_number text,_shop_name text,_district text,_taluk text,_ward text,_mobile text,_password text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$ DECLARE sid uuid; BEGIN
INSERT INTO public.shops(owner_id,shop_number,shop_name,district,taluk,ward,mobile,username,is_active,password_hash) VALUES(_owner_id,_shop_number,_shop_name,_district,_taluk,_ward,_mobile,_shop_number,true,extensions.crypt(_password,extensions.gen_salt('bf',10))) RETURNING id INTO sid;
INSERT INTO public.user_roles(user_id,role) VALUES(_owner_id,'shopkeeper'); RETURN sid;
END $$;
REVOKE ALL ON FUNCTION public.provision_shop(uuid,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.provision_shop(uuid,text,text,text,text,text,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.lookup_ration_card(_identifier text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE c public.customers; m text:=to_char(now() AT TIME ZONE 'Asia/Kolkata','YYYY-MM'); BEGIN
IF NOT EXISTS(SELECT 1 FROM public.shops s WHERE public.owns_shop(s.id)) THEN RAISE EXCEPTION 'Forbidden'; END IF;
SELECT * INTO c FROM public.customers WHERE card_norm=regexp_replace(upper(_identifier),'[^A-Z0-9]','','g') OR mobile=regexp_replace(_identifier,'[^0-9]','','g') LIMIT 1;
IF c.id IS NULL THEN RETURN jsonb_build_object('found',false); END IF;
RETURN jsonb_build_object('found',true,'customer_id',c.id,'name',c.name,'family_members',c.family_members,'monthly_quota',c.monthly_quota,'collected',EXISTS(SELECT 1 FROM public.ration_collections r WHERE r.distribution_month=m AND (r.card_norm=c.card_norm OR r.mobile=c.mobile)) OR (c.distribution_month=m AND c.monthly_status='Collected'),'own_shop',public.owns_shop(c.shop_id)); END $$;
CREATE OR REPLACE FUNCTION public.collect_monthly_ration(_customer_id uuid,_shop_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE c public.customers; m text:=to_char(now() AT TIME ZONE 'Asia/Kolkata','YYYY-MM'); BEGIN
IF NOT public.owns_shop(_shop_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
SELECT * INTO c FROM public.customers WHERE id=_customer_id FOR UPDATE;
IF c.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
IF c.distribution_month=m AND c.monthly_status='Collected' THEN RETURN jsonb_build_object('ok',false,'error','already_collected'); END IF;
BEGIN INSERT INTO public.ration_collections(customer_id,card_norm,mobile,shop_id,distribution_month) VALUES(c.id,c.card_norm,c.mobile,_shop_id,m); EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('ok',false,'error','already_collected'); END;
UPDATE public.customers SET status='collected',monthly_status='Collected',distribution_month=m,collected_at=now() WHERE id=c.id;
RETURN jsonb_build_object('ok',true); END $$;
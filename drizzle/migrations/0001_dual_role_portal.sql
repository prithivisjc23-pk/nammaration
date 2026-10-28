-- Shop profile, live status and timings
ALTER TABLE public.shops
  ADD COLUMN shop_name text NOT NULL DEFAULT '',
  ADD COLUMN mobile text NOT NULL DEFAULT '',
  ADD COLUMN status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','lunch','closed')),
  ADD COLUMN morning_open text NOT NULL DEFAULT '08:30' CHECK (morning_open ~ '^[0-2][0-9]:[0-5][0-9]$'),
  ADD COLUMN morning_close text NOT NULL DEFAULT '12:00' CHECK (morning_close ~ '^[0-2][0-9]:[0-5][0-9]$'),
  ADD COLUMN evening_open text NOT NULL DEFAULT '15:00' CHECK (evening_open ~ '^[0-2][0-9]:[0-5][0-9]$'),
  ADD COLUMN evening_close text NOT NULL DEFAULT '18:00' CHECK (evening_close ~ '^[0-2][0-9]:[0-5][0-9]$');

UPDATE public.shops SET status = CASE WHEN is_open THEN 'open' ELSE 'closed' END;
COMMENT ON COLUMN public.shops.is_open IS 'DEPRECATED: replaced by status (kept in sync by trigger)';

CREATE OR REPLACE FUNCTION public.shops_sync_is_open()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.is_open := (NEW.status = 'open');
  RETURN NEW;
END;
$$;
CREATE TRIGGER shops_sync_is_open BEFORE INSERT OR UPDATE ON public.shops FOR EACH ROW EXECUTE FUNCTION public.shops_sync_is_open();

-- Cardholder link + district
ALTER TABLE public.customers
  ADD COLUMN user_id uuid UNIQUE,
  ADD COLUMN district text;

-- Strict 1:1: a smart card and a mobile number can each be registered only once
CREATE UNIQUE INDEX customers_card_norm_key ON public.customers (card_norm);
CREATE UNIQUE INDEX customers_mobile_key ON public.customers (mobile);

-- Only trusted server code may link a cardholder account to a card
CREATE OR REPLACE FUNCTION public.customers_protect_user_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.user_id := NULL;
    ELSE
      NEW.user_id := OLD.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER customers_protect_user_id BEFORE INSERT OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.customers_protect_user_id();

CREATE OR REPLACE FUNCTION public.is_shop_customer(_shop_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.customers WHERE shop_id = _shop_id AND user_id = auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.is_shop_customer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_shop_customer(uuid) TO authenticated;

CREATE POLICY "Cardholders read own card" ON public.customers FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Cardholders read their shop" ON public.shops FOR SELECT TO authenticated USING (public.is_shop_customer(id));

-- Public shop directory for the cardholder registration dropdown (safe columns only)
CREATE OR REPLACE FUNCTION public.list_shops_public()
RETURNS TABLE (shop_number text, shop_name text, district text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT shop_number, shop_name, district FROM public.shops ORDER BY district, shop_number
$$;
GRANT EXECUTE ON FUNCTION public.list_shops_public() TO anon, authenticated;

-- Shop creation from sign-up metadata now includes name + mobile; taluk/ward optional
CREATE OR REPLACE FUNCTION public.handle_new_shopkeeper()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.raw_user_meta_data ? 'shop_number' THEN
    INSERT INTO public.shops (owner_id, shop_number, district, taluk, ward, username, shop_name, mobile)
    VALUES (
      NEW.id,
      upper(NEW.raw_user_meta_data->>'shop_number'),
      NEW.raw_user_meta_data->>'district',
      coalesce(NEW.raw_user_meta_data->>'taluk', ''),
      coalesce(NEW.raw_user_meta_data->>'ward', ''),
      NEW.raw_user_meta_data->>'username',
      coalesce(NEW.raw_user_meta_data->>'shop_name', ''),
      coalesce(NEW.raw_user_meta_data->>'mobile', '')
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Live updates for the cardholder portal and shopkeeper dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE public.shops;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
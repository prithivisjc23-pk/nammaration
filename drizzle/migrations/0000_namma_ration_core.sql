CREATE TABLE public.shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE,
  shop_number text NOT NULL UNIQUE CHECK (shop_number ~ '^[A-Z0-9-]{1,12}$'),
  district text NOT NULL,
  taluk text NOT NULL,
  ward text NOT NULL,
  username text NOT NULL,
  is_open boolean NOT NULL DEFAULT true,
  crowd text NOT NULL DEFAULT 'low' CHECK (crowd IN ('low','medium','heavy')),
  stock jsonb NOT NULL DEFAULT '{"rice":true,"sugar":true,"oil":true,"wheat":false,"kerosene":false}'::jsonb,
  cycle text NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX shops_username_lower_key ON public.shops (lower(username));

GRANT SELECT, UPDATE ON public.shops TO authenticated;
GRANT ALL ON public.shops TO service_role;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read their shop" ON public.shops FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owners update their shop" ON public.shops FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Shop identity fields cannot be changed by the owner through the app
CREATE OR REPLACE FUNCTION public.shops_protect_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.owner_id := OLD.owner_id;
  NEW.shop_number := OLD.shop_number;
  NEW.username := OLD.username;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER shops_protect_identity BEFORE UPDATE ON public.shops FOR EACH ROW EXECUTE FUNCTION public.shops_protect_identity();

CREATE OR REPLACE FUNCTION public.owns_shop(_shop_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.shops WHERE id = _shop_id AND owner_id = auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.owns_shop(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_shop(uuid) TO authenticated;

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  card text NOT NULL,
  card_norm text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  mobile text NOT NULL CHECK (mobile ~ '^[6-9][0-9]{9}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','collected')),
  collected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, card_norm)
);
CREATE INDEX customers_shop_idx ON public.customers (shop_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read customers" ON public.customers FOR SELECT TO authenticated USING (public.owns_shop(shop_id));
CREATE POLICY "Owners add customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.owns_shop(shop_id));
CREATE POLICY "Owners update customers" ON public.customers FOR UPDATE TO authenticated USING (public.owns_shop(shop_id)) WITH CHECK (public.owns_shop(shop_id));
CREATE POLICY "Owners delete customers" ON public.customers FOR DELETE TO authenticated USING (public.owns_shop(shop_id));

CREATE TABLE public.sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('morning','evening')),
  recipient_count integer NOT NULL CHECK (recipient_count >= 0),
  recipient_ids uuid[] NOT NULL DEFAULT '{}',
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sms_logs_shop_created_idx ON public.sms_logs (shop_id, created_at DESC);

GRANT SELECT, INSERT ON public.sms_logs TO authenticated;
GRANT ALL ON public.sms_logs TO service_role;
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read sms logs" ON public.sms_logs FOR SELECT TO authenticated USING (public.owns_shop(shop_id));
CREATE POLICY "Owners add sms logs" ON public.sms_logs FOR INSERT TO authenticated WITH CHECK (public.owns_shop(shop_id));

-- Registration availability check (reveals only whether a shop number / username is taken)
CREATE OR REPLACE FUNCTION public.check_shop_registration(_shop_number text, _username text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'shop_taken', EXISTS (SELECT 1 FROM public.shops WHERE shop_number = upper(_shop_number)),
    'username_taken', EXISTS (SELECT 1 FROM public.shops WHERE lower(username) = lower(_username))
  )
$$;
GRANT EXECUTE ON FUNCTION public.check_shop_registration(text, text) TO anon, authenticated;

-- Create the shop when a shopkeeper signs up
CREATE OR REPLACE FUNCTION public.handle_new_shopkeeper()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.raw_user_meta_data ? 'shop_number' THEN
    INSERT INTO public.shops (owner_id, shop_number, district, taluk, ward, username)
    VALUES (
      NEW.id,
      upper(NEW.raw_user_meta_data->>'shop_number'),
      NEW.raw_user_meta_data->>'district',
      NEW.raw_user_meta_data->>'taluk',
      NEW.raw_user_meta_data->>'ward',
      NEW.raw_user_meta_data->>'username'
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_shopkeeper() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created_shop AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_shopkeeper();
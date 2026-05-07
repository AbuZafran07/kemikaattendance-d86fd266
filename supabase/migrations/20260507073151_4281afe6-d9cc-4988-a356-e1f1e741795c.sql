
CREATE TABLE public.notification_last_seen (
  user_id uuid PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_last_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own last seen"
  ON public.notification_last_seen FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own last seen"
  ON public.notification_last_seen FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own last seen"
  ON public.notification_last_seen FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.mark_notifications_seen()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  ts timestamptz := now();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.notification_last_seen (user_id, last_seen_at, updated_at)
  VALUES (uid, ts, ts)
  ON CONFLICT (user_id) DO UPDATE
    SET last_seen_at = ts, updated_at = ts;
  RETURN ts;
END;
$$;

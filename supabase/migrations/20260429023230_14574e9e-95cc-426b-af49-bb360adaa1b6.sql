
-- Remove permissive "Deny anonymous access" SELECT policies that actually grant
-- all authenticated users access (auth.uid() IS NOT NULL is permissive, ORs with others).
-- Keep the scoped owner/admin/HR policies in place.

DROP POLICY IF EXISTS "Deny anonymous access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Deny anonymous access to user_roles" ON public.user_roles;

-- Replace with proper RESTRICTIVE policies that only deny anonymous (anon role)
-- without expanding access for authenticated users.
CREATE POLICY "Restrict profiles to authenticated"
ON public.profiles
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Restrict user_roles to authenticated"
ON public.user_roles
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Realtime channel authorization: lock down realtime.messages so only
-- authenticated users can subscribe/broadcast, and per-channel checks may be added later.
-- Without policies, anyone authenticated can subscribe to any topic.
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read realtime messages" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated can write realtime messages" ON realtime.messages;

-- Only authenticated users may receive (SELECT) realtime broadcast messages.
CREATE POLICY "Authenticated can read realtime messages"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);

-- Only authenticated users may broadcast (INSERT) realtime messages.
CREATE POLICY "Authenticated can write realtime messages"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (true);

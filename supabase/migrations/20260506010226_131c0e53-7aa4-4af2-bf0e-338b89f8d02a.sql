CREATE OR REPLACE FUNCTION public.get_delegation_colleagues()
RETURNS TABLE(id uuid, full_name text, jabatan text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.full_name, p.jabatan
  FROM public.profiles p
  WHERE p.departemen = (SELECT departemen FROM public.profiles WHERE id = auth.uid())
    AND p.status = 'Active'
    AND p.id <> auth.uid()
  ORDER BY p.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_delegation_colleagues() TO authenticated;
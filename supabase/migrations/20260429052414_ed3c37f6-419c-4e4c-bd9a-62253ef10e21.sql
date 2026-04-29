-- Fix 1: Restrict user self-update on profiles to non-sensitive fields only.
-- Sensitive fields (salary, role-related, tax, leave quota, status, etc.) can only
-- be changed by admins/HR. Users can still update contact info (phone, address,
-- bank info, photo, fcm_token, NPWP).
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND basic_salary IS NOT DISTINCT FROM (SELECT p.basic_salary FROM public.profiles p WHERE p.id = auth.uid())
  AND tunjangan_jabatan IS NOT DISTINCT FROM (SELECT p.tunjangan_jabatan FROM public.profiles p WHERE p.id = auth.uid())
  AND tunjangan_komunikasi IS NOT DISTINCT FROM (SELECT p.tunjangan_komunikasi FROM public.profiles p WHERE p.id = auth.uid())
  AND tunjangan_operasional IS NOT DISTINCT FROM (SELECT p.tunjangan_operasional FROM public.profiles p WHERE p.id = auth.uid())
  AND ptkp_status IS NOT DISTINCT FROM (SELECT p.ptkp_status FROM public.profiles p WHERE p.id = auth.uid())
  AND jabatan IS NOT DISTINCT FROM (SELECT p.jabatan FROM public.profiles p WHERE p.id = auth.uid())
  AND departemen IS NOT DISTINCT FROM (SELECT p.departemen FROM public.profiles p WHERE p.id = auth.uid())
  AND nik IS NOT DISTINCT FROM (SELECT p.nik FROM public.profiles p WHERE p.id = auth.uid())
  AND status IS NOT DISTINCT FROM (SELECT p.status FROM public.profiles p WHERE p.id = auth.uid())
  AND contract_type IS NOT DISTINCT FROM (SELECT p.contract_type FROM public.profiles p WHERE p.id = auth.uid())
  AND join_date IS NOT DISTINCT FROM (SELECT p.join_date FROM public.profiles p WHERE p.id = auth.uid())
  AND resign_date IS NOT DISTINCT FROM (SELECT p.resign_date FROM public.profiles p WHERE p.id = auth.uid())
  AND annual_leave_quota IS NOT DISTINCT FROM (SELECT p.annual_leave_quota FROM public.profiles p WHERE p.id = auth.uid())
  AND remaining_leave IS NOT DISTINCT FROM (SELECT p.remaining_leave FROM public.profiles p WHERE p.id = auth.uid())
  AND bpjs_kesehatan_enabled IS NOT DISTINCT FROM (SELECT p.bpjs_kesehatan_enabled FROM public.profiles p WHERE p.id = auth.uid())
  AND bpjs_ketenagakerjaan_enabled IS NOT DISTINCT FROM (SELECT p.bpjs_ketenagakerjaan_enabled FROM public.profiles p WHERE p.id = auth.uid())
  AND work_type IS NOT DISTINCT FROM (SELECT p.work_type FROM public.profiles p WHERE p.id = auth.uid())
  AND email IS NOT DISTINCT FROM (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
);

-- Fix 2: Allow users to UPDATE and DELETE their own attendance photos in their own folder.
CREATE POLICY "Users can update own attendance photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'attendance-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'attendance-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own attendance photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'attendance-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

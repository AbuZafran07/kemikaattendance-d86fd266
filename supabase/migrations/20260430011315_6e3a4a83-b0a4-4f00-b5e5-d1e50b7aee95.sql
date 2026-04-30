-- Remove duplicate policies on storage.objects for employee-photos bucket
DROP POLICY IF EXISTS "Users can delete their own photo" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own photo" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own photo" ON storage.objects;
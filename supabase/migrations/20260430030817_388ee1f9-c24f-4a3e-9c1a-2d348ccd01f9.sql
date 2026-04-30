-- Tabel lampiran laporan KPI bulanan
CREATE TABLE public.kpi_monthly_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL DEFAULT '',
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kpi_attach_user_period ON public.kpi_monthly_attachments(user_id, year, month);

ALTER TABLE public.kpi_monthly_attachments ENABLE ROW LEVEL SECURITY;

-- Require authentication
CREATE POLICY "Require authentication" ON public.kpi_monthly_attachments
AS RESTRICTIVE FOR ALL TO public USING (auth.uid() IS NOT NULL);

-- Employees can manage their own attachments
CREATE POLICY "Employees can view own attachments" ON public.kpi_monthly_attachments
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Employees can insert own attachments" ON public.kpi_monthly_attachments
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Employees can delete own attachments" ON public.kpi_monthly_attachments
FOR DELETE USING (auth.uid() = user_id);

-- Admin & HR full access
CREATE POLICY "Admins manage all attachments" ON public.kpi_monthly_attachments
FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "HR manage all attachments" ON public.kpi_monthly_attachments
FOR ALL USING (public.has_role(auth.uid(), 'hr'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'hr'::public.app_role));

-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('kpi-attachments', 'kpi-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: file path = {user_id}/{year}/{month}/{filename}
CREATE POLICY "KPI attach: users view own files"
ON storage.objects FOR SELECT
USING (bucket_id = 'kpi-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "KPI attach: users upload own files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'kpi-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "KPI attach: users delete own files"
ON storage.objects FOR DELETE
USING (bucket_id = 'kpi-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "KPI attach: admins view all"
ON storage.objects FOR SELECT
USING (bucket_id = 'kpi-attachments' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "KPI attach: admins manage all"
ON storage.objects FOR ALL
USING (bucket_id = 'kpi-attachments' AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (bucket_id = 'kpi-attachments' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "KPI attach: hr view all"
ON storage.objects FOR SELECT
USING (bucket_id = 'kpi-attachments' AND public.has_role(auth.uid(), 'hr'::public.app_role));

CREATE POLICY "KPI attach: hr manage all"
ON storage.objects FOR ALL
USING (bucket_id = 'kpi-attachments' AND public.has_role(auth.uid(), 'hr'::public.app_role))
WITH CHECK (bucket_id = 'kpi-attachments' AND public.has_role(auth.uid(), 'hr'::public.app_role));
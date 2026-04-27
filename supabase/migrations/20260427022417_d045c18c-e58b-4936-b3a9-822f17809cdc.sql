-- Tabel untuk mencatat semua aksi revisi payroll yang sudah difinalisasi
CREATE TABLE public.payroll_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id UUID NOT NULL,
  period_month INTEGER NOT NULL,
  period_year INTEGER NOT NULL,
  action_type TEXT NOT NULL, -- 'unlock', 'regenerate', 'refinalize'
  performed_by UUID NOT NULL,
  reason TEXT NOT NULL,
  affected_user_id UUID, -- nullable; null jika aksi global (unlock period)
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index untuk pencarian cepat
CREATE INDEX idx_payroll_audit_logs_period ON public.payroll_audit_logs(period_id);
CREATE INDEX idx_payroll_audit_logs_user ON public.payroll_audit_logs(affected_user_id);
CREATE INDEX idx_payroll_audit_logs_created_at ON public.payroll_audit_logs(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.payroll_audit_logs ENABLE ROW LEVEL SECURITY;

-- Hanya admin yang bisa view
CREATE POLICY "Admins can view payroll audit logs"
ON public.payroll_audit_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Hanya admin yang bisa insert
CREATE POLICY "Admins can insert payroll audit logs"
ON public.payroll_audit_logs
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Tolak akses anonim
CREATE POLICY "Deny anonymous access to payroll_audit_logs"
ON public.payroll_audit_logs
FOR SELECT
TO public
USING (auth.uid() IS NOT NULL);

-- Tidak ada policy UPDATE/DELETE => audit log immutable
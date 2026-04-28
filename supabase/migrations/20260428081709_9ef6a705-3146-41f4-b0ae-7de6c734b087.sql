-- Tabel indikator KPI
CREATE TABLE IF NOT EXISTS public.kpi_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  weight NUMERIC NOT NULL DEFAULT 0,
  target TEXT NOT NULL DEFAULT '100',
  unit TEXT NOT NULL DEFAULT '%',
  formula_type TEXT NOT NULL DEFAULT 'ratio',
  thresholds JSONB DEFAULT '[]'::jsonb,
  custom_vars JSONB DEFAULT '[]'::jsonb,
  custom_expr TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabel realisasi KPI
CREATE TABLE IF NOT EXISTS public.kpi_realizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id UUID REFERENCES public.kpi_indicators(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  value NUMERIC,
  custom_values JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(indicator_id, month, year)
);

-- Tabel pengaturan grade KPI
CREATE TABLE IF NOT EXISTS public.kpi_grade_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade TEXT NOT NULL UNIQUE,
  min_score NUMERIC NOT NULL,
  bonus_percent NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Seed default grade
INSERT INTO public.kpi_grade_settings (grade, min_score, bonus_percent) VALUES
  ('A', 90, 15),
  ('B', 75, 10),
  ('C', 60, 5),
  ('D', 0, 0)
ON CONFLICT (grade) DO NOTHING;

-- Index untuk performa query
CREATE INDEX IF NOT EXISTS idx_kpi_indicators_user_year ON public.kpi_indicators(user_id, year);
CREATE INDEX IF NOT EXISTS idx_kpi_realizations_user_period ON public.kpi_realizations(user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_kpi_realizations_indicator ON public.kpi_realizations(indicator_id);

-- Enable RLS
ALTER TABLE public.kpi_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_realizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_grade_settings ENABLE ROW LEVEL SECURITY;

-- ===== RLS: kpi_indicators =====
CREATE POLICY "Deny anonymous access to kpi_indicators"
  ON public.kpi_indicators FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage kpi_indicators"
  ON public.kpi_indicators FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "HR can manage kpi_indicators"
  ON public.kpi_indicators FOR ALL
  USING (public.has_role(auth.uid(), 'hr'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'hr'::public.app_role));

CREATE POLICY "Employees can view own kpi_indicators"
  ON public.kpi_indicators FOR SELECT
  USING (auth.uid() = user_id);

-- ===== RLS: kpi_realizations =====
CREATE POLICY "Deny anonymous access to kpi_realizations"
  ON public.kpi_realizations FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage kpi_realizations"
  ON public.kpi_realizations FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "HR can manage kpi_realizations"
  ON public.kpi_realizations FOR ALL
  USING (public.has_role(auth.uid(), 'hr'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'hr'::public.app_role));

CREATE POLICY "Employees can view own kpi_realizations"
  ON public.kpi_realizations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Employees can insert own kpi_realizations"
  ON public.kpi_realizations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Employees can update own kpi_realizations"
  ON public.kpi_realizations FOR UPDATE
  USING (auth.uid() = user_id);

-- ===== RLS: kpi_grade_settings =====
CREATE POLICY "Deny anonymous access to kpi_grade_settings"
  ON public.kpi_grade_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can view kpi_grade_settings"
  ON public.kpi_grade_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage kpi_grade_settings"
  ON public.kpi_grade_settings FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "HR can manage kpi_grade_settings"
  ON public.kpi_grade_settings FOR ALL
  USING (public.has_role(auth.uid(), 'hr'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'hr'::public.app_role));

-- Triggers untuk updated_at
CREATE TRIGGER update_kpi_indicators_updated_at
  BEFORE UPDATE ON public.kpi_indicators
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_kpi_realizations_updated_at
  BEFORE UPDATE ON public.kpi_realizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_kpi_grade_settings_updated_at
  BEFORE UPDATE ON public.kpi_grade_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kpi_realizations_indicator_month_year_key'
  ) THEN
    ALTER TABLE public.kpi_realizations
      ADD CONSTRAINT kpi_realizations_indicator_month_year_key UNIQUE (indicator_id, month, year);
  END IF;
END $$;

INSERT INTO public.kpi_grade_settings (grade, min_score, bonus_percent) VALUES
  ('A', 90, 15),
  ('B', 75, 10),
  ('C', 60, 5),
  ('D', 0, 0)
ON CONFLICT (grade) DO NOTHING;
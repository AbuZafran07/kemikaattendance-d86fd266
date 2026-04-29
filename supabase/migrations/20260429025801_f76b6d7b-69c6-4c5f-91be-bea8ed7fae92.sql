
-- Drop overly permissive "Deny anonymous access" SELECT policies that actually grant
-- read access to ALL authenticated users due to OR-ing of PERMISSIVE policies.
-- The restrictive policies and scoped (own/admin/hr) policies remain in effect.

DROP POLICY IF EXISTS "Deny anonymous access to payroll" ON public.payroll;
DROP POLICY IF EXISTS "Deny anonymous access to payroll_overrides" ON public.payroll_overrides;
DROP POLICY IF EXISTS "Deny anonymous access to payroll_audit_logs" ON public.payroll_audit_logs;
DROP POLICY IF EXISTS "Deny anon loans" ON public.employee_loans;
DROP POLICY IF EXISTS "Deny anon installments" ON public.loan_installments;
DROP POLICY IF EXISTS "Deny anonymous access to attendance" ON public.attendance;
DROP POLICY IF EXISTS "Deny anonymous access to biometric_consent_records" ON public.biometric_consent_records;
DROP POLICY IF EXISTS "Deny anonymous access to leave_requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Deny anonymous access to overtime_requests" ON public.overtime_requests;
DROP POLICY IF EXISTS "Deny anonymous access to business_travel_requests" ON public.business_travel_requests;
DROP POLICY IF EXISTS "Deny anonymous access to kpi_indicators" ON public.kpi_indicators;
DROP POLICY IF EXISTS "Deny anonymous access to kpi_realizations" ON public.kpi_realizations;
DROP POLICY IF EXISTS "Deny anonymous access to approval_audit_logs" ON public.approval_audit_logs;
DROP POLICY IF EXISTS "Deny anonymous access to attendance_audit_logs" ON public.attendance_audit_logs;
DROP POLICY IF EXISTS "Deny anonymous access to system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "Deny anonymous access to payroll_periods" ON public.payroll_periods;
DROP POLICY IF EXISTS "Deny anonymous access to pph21_ter_rates" ON public.pph21_ter_rates;
DROP POLICY IF EXISTS "Deny anonymous access to kpi_grade_settings" ON public.kpi_grade_settings;
DROP POLICY IF EXISTS "Deny anonymous access to company_events" ON public.company_events;

-- Add a missing employee-scoped SELECT policy on payroll_overrides so employees can still see their own
CREATE POLICY "Employees can view own payroll overrides"
ON public.payroll_overrides
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Add RESTRICTIVE policies to enforce authentication on all affected tables
-- (replaces the role of the deleted permissive policies, but correctly via RESTRICTIVE)
CREATE POLICY "Require authentication" ON public.payroll AS RESTRICTIVE FOR ALL TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require authentication" ON public.payroll_overrides AS RESTRICTIVE FOR ALL TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require authentication" ON public.payroll_audit_logs AS RESTRICTIVE FOR ALL TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require authentication" ON public.employee_loans AS RESTRICTIVE FOR ALL TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require authentication" ON public.loan_installments AS RESTRICTIVE FOR ALL TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require authentication" ON public.attendance AS RESTRICTIVE FOR ALL TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require authentication" ON public.biometric_consent_records AS RESTRICTIVE FOR ALL TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require authentication" ON public.leave_requests AS RESTRICTIVE FOR ALL TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require authentication" ON public.overtime_requests AS RESTRICTIVE FOR ALL TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require authentication" ON public.business_travel_requests AS RESTRICTIVE FOR ALL TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require authentication" ON public.kpi_indicators AS RESTRICTIVE FOR ALL TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require authentication" ON public.kpi_realizations AS RESTRICTIVE FOR ALL TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require authentication" ON public.approval_audit_logs AS RESTRICTIVE FOR ALL TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require authentication" ON public.attendance_audit_logs AS RESTRICTIVE FOR ALL TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require authentication" ON public.payroll_periods AS RESTRICTIVE FOR ALL TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require authentication" ON public.pph21_ter_rates AS RESTRICTIVE FOR ALL TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require authentication" ON public.kpi_grade_settings AS RESTRICTIVE FOR ALL TO public USING (auth.uid() IS NOT NULL);
CREATE POLICY "Require authentication" ON public.company_events AS RESTRICTIVE FOR ALL TO public USING (auth.uid() IS NOT NULL);

-- system_settings: keep existing scoped policies (admin/hr full + employees only calendar keys)
-- Add restrictive auth requirement
CREATE POLICY "Require authentication" ON public.system_settings AS RESTRICTIVE FOR ALL TO public USING (auth.uid() IS NOT NULL);

-- Realtime: scope subscription to user's own broadcast topic
DROP POLICY IF EXISTS "Authenticated can read realtime messages" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated can write realtime messages" ON realtime.messages;

CREATE POLICY "Users can subscribe to own topic"
ON realtime.messages
FOR SELECT
TO authenticated
USING (realtime.topic() LIKE 'user:' || auth.uid()::text || ':%' OR realtime.topic() = auth.uid()::text);

CREATE POLICY "Users can broadcast to own topic"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (realtime.topic() LIKE 'user:' || auth.uid()::text || ':%' OR realtime.topic() = auth.uid()::text);

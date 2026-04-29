-- Revoke EXECUTE from anon on all public SECURITY DEFINER functions (anon should never call them)
REVOKE EXECUTE ON FUNCTION public.approve_business_travel_request(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.approve_leave_request(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.approve_overtime_request(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reject_business_travel_request(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reject_leave_request(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reject_overtime_request(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_biaya_jabatan_config() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_bpjs_config() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_ptkp_config() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_pph21_brackets_config() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_office_locations() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_work_hours() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_effective_work_hours() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_low_leave_quota_employees(integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;

-- Internal trigger/auth functions: revoke from both anon and authenticated (only triggers/system call them)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.deduct_leave_balance() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;

-- Re-grant EXECUTE to authenticated for functions intended for signed-in app use
GRANT EXECUTE ON FUNCTION public.approve_business_travel_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_leave_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_overtime_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_business_travel_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_leave_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_overtime_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_biaya_jabatan_config() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bpjs_config() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ptkp_config() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pph21_brackets_config() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_office_locations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_work_hours() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_work_hours() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_low_leave_quota_employees(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
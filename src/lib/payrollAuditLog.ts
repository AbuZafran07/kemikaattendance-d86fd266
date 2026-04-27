import { supabase } from "@/integrations/supabase/client";
import logger from "@/lib/logger";

export type PayrollAuditAction = "unlock" | "regenerate" | "refinalize";

interface PayrollAuditEntry {
  period_id: string;
  period_month: number;
  period_year: number;
  action_type: PayrollAuditAction;
  performed_by: string;
  reason: string;
  affected_user_id?: string | null;
  before_data?: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
}

export const logPayrollAction = async (entry: PayrollAuditEntry) => {
  try {
    const { error } = await supabase.from("payroll_audit_logs" as any).insert({
      period_id: entry.period_id,
      period_month: entry.period_month,
      period_year: entry.period_year,
      action_type: entry.action_type,
      performed_by: entry.performed_by,
      reason: entry.reason,
      affected_user_id: entry.affected_user_id ?? null,
      before_data: entry.before_data ?? null,
      after_data: entry.after_data ?? null,
    } as any);

    if (error) {
      logger.error("Failed to log payroll action:", error);
    }
  } catch (err) {
    logger.error("Error logging payroll action:", err);
  }
};

/**
 * Snapshot relevant payroll fields for audit log diffing.
 */
export const snapshotPayrollRow = (row: Record<string, any>) => ({
  basic_salary: row.basic_salary,
  allowance: row.allowance,
  overtime_total: row.overtime_total,
  bruto_income: row.bruto_income,
  bpjs_kesehatan: row.bpjs_kesehatan,
  bpjs_ketenagakerjaan: row.bpjs_ketenagakerjaan,
  pph21_monthly: row.pph21_monthly,
  loan_deduction: row.loan_deduction,
  other_deduction: row.other_deduction,
  thr: row.thr,
  bonus_tahunan: row.bonus_tahunan,
  bonus_lainnya: row.bonus_lainnya,
  insentif_kinerja: row.insentif_kinerja,
  insentif_penjualan: row.insentif_penjualan,
  pengembalian_employee: row.pengembalian_employee,
  take_home_pay: row.take_home_pay,
});

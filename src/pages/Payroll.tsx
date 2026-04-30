import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import PayrollOverrideHistory from "@/components/PayrollOverrideHistory";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Calculator, FileText, Loader2, DollarSign, Users, TrendingUp, Lock, Download, Building2, FileSpreadsheet, Printer, Landmark, AlertTriangle, Gift, Info, Search, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { exportToExcelFile } from "@/lib/excelExport";
import {
  calculatePayroll,
  calculateOvertimePay,
  calculateOvertimePayPP35,
  formatRupiah,
  TERRate,
  BPJSRatesConfig,
} from "@/lib/payrollCalculation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isWeekend } from "@/hooks/usePolicySettings";
import { format, eachDayOfInterval } from "date-fns";
import { calculateCutoffTenure, calculateProrateFactor, calculateProrateFactorWithResign, getCutoffPeriodBounds, validateCutoffPeriodForPayroll } from "@/lib/tenureCalculation";
import logo from "@/assets/logo.png";
import { UnlockPayrollDialog } from "@/components/UnlockPayrollDialog";
import { logPayrollAction, snapshotPayrollRow } from "@/lib/payrollAuditLog";
import { useAuth } from "@/contexts/AuthContext";
import { Unlock } from "lucide-react";

/** Parse "YYYY-MM-DD" as local date (avoids UTC-shift timezone bug) */
const parseLocalDate = (s: string): Date => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

interface PayrollData {
  id: string;
  user_id: string;
  basic_salary: number;
  allowance: number;
  overtime_total: number;
  overtime_hours: number;
  bruto_income: number;
  bpjs_kesehatan: number;
  bpjs_ketenagakerjaan: number;
  bpjs_kes_employer: number;
  bpjs_jht_employer: number;
  bpjs_jp_employer: number;
  bpjs_jkk_employer: number;
  bpjs_jkm_employer: number;
  netto_income: number;
  ptkp_status: string;
  ptkp_value: number;
  pkp: number;
  pph21_monthly: number;
  take_home_pay: number;
  loan_deduction: number;
  other_deduction: number;
  deduction_notes: string | null;
  pph21_mode: string;
  pph21_ter_rate: number;
  employee_name?: string;
  departemen?: string;
  jabatan?: string;
  nik?: string;
  // Fixed allowances
  tunjangan_komunikasi?: number;
  tunjangan_jabatan?: number;
  tunjangan_operasional?: number;
  // Incidental income
  tunjangan_kesehatan?: number;
  bonus_tahunan?: number;
  thr?: number;
  insentif_kinerja?: number;
  bonus_lainnya?: number;
  pengembalian_employee?: number;
  insentif_penjualan?: number;
}

interface PayrollPeriod {
  id: string;
  month: number;
  year: number;
  status: string;
}

// Deduction overrides per employee before generating
interface DeductionOverride {
  loan_deduction: number;
  other_deduction: number;
  deduction_notes: string;
}

// Income additions per employee before generating
interface IncomeAddition {
  tunjangan_kehadiran: number;
  tunjangan_kesehatan: number;
  bonus_tahunan: number;
  thr: number;
  insentif_kinerja: number;
  bonus_lainnya: number;
  pengembalian_employee: number;
  insentif_penjualan: number;
  overtime_override: number;
}

const MONTHS = [
  { value: 1, label: "Januari" }, { value: 2, label: "Februari" }, { value: 3, label: "Maret" },
  { value: 4, label: "April" }, { value: 5, label: "Mei" }, { value: 6, label: "Juni" },
  { value: 7, label: "Juli" }, { value: 8, label: "Agustus" }, { value: 9, label: "September" },
  { value: 10, label: "Oktober" }, { value: 11, label: "November" }, { value: 12, label: "Desember" },
];

const currentDate = new Date();
const currentMonth = currentDate.getMonth() + 1;
const currentYear = currentDate.getFullYear();


const Payroll = () => {
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [period, setPeriod] = useState<PayrollPeriod | null>(null);
  const [payrollData, setPayrollData] = useState<PayrollData[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [detailItem, setDetailItem] = useState<PayrollData | null>(null);
  const [showDeductionDialog, setShowDeductionDialog] = useState(false);
  const [showIncomeDialog, setShowIncomeDialog] = useState(false);
  const [deductionOverrides, setDeductionOverrides] = useState<Map<string, DeductionOverride>>(new Map());
  const [incomeAdditions, setIncomeAdditions] = useState<Map<string, IncomeAddition>>(new Map());
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [deductionSearch, setDeductionSearch] = useState("");
  const [incomeSearch, setIncomeSearch] = useState("");
  const [selectedDeductionEmp, setSelectedDeductionEmp] = useState<string | null>(null);
  const [selectedIncomeEmp, setSelectedIncomeEmp] = useState<string | null>(null);
  const [calculatingThr, setCalculatingThr] = useState(false);
  const [thrConfirmData, setThrConfirmData] = useState<{
    idulFitriDate: string;
    idulFitriName: string;
    cutoffDay: number;
    profiles: { id: string; full_name: string; join_date: string; basic_salary: number }[];
  } | null>(null);
  const [idulFitriAvailability, setIdulFitriAvailability] = useState({ month: selectedMonth, year: selectedYear, found: false });
  const hasIdulFitriInPeriod =
    idulFitriAvailability.month === selectedMonth &&
    idulFitriAvailability.year === selectedYear &&
    idulFitriAvailability.found;
  const [payrollSearch, setPayrollSearch] = useState("");
  const [payrollPage, setPayrollPage] = useState(1);
  const payrollPerPage = 10;
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [preGenerateSnapshot, setPreGenerateSnapshot] = useState<Map<string, any> | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  useEffect(() => { fetchPayrollData(); loadOverridesFromDB(); checkIdulFitriInPeriod(); }, [selectedMonth, selectedYear]);

  const checkIdulFitriInPeriod = async () => {
    const month = selectedMonth;
    const year = selectedYear;
    setIdulFitriAvailability({ month, year, found: false });
    try {
      const { data: settingsData } = await supabase
        .from("system_settings").select("value").eq("key", "overtime_policy").maybeSingle();
      const holidays: { name: string; date: string }[] = (settingsData?.value as any)?.holidays || [];
      const idulFitriKeywords = ["idul fitri", "lebaran", "eid al-fitr", "idulfitri"];
      const found = holidays.some((h) => {
        const d = parseLocalDate(h.date);
        return d.getMonth() + 1 === month && d.getFullYear() === year &&
          idulFitriKeywords.some((kw) => h.name.toLowerCase().includes(kw));
      });
      setIdulFitriAvailability({ month, year, found });
    } catch {
      setIdulFitriAvailability({ month, year, found: false });
    }
  };

  const loadOverridesFromDB = async () => {
    try {
      const { data } = await supabase
        .from("payroll_overrides")
        .select("*")
        .eq("period_month", selectedMonth)
        .eq("period_year", selectedYear);

      const newIncome = new Map<string, IncomeAddition>();
      const newDeductions = new Map<string, DeductionOverride>();

      for (const row of data || []) {
        newIncome.set(row.user_id, {
          tunjangan_kehadiran: Number(row.tunjangan_kehadiran) || 0,
          tunjangan_kesehatan: Number(row.tunjangan_kesehatan) || 0,
          bonus_tahunan: Number(row.bonus_tahunan) || 0,
          thr: Number(row.thr) || 0,
          insentif_kinerja: Number(row.insentif_kinerja) || 0,
          bonus_lainnya: Number(row.bonus_lainnya) || 0,
          pengembalian_employee: Number(row.pengembalian_employee) || 0,
          insentif_penjualan: Number(row.insentif_penjualan) || 0,
          overtime_override: Number((row as any).overtime_override) || 0,
        });
        newDeductions.set(row.user_id, {
          loan_deduction: Number(row.loan_deduction) || 0,
          other_deduction: Number(row.other_deduction) || 0,
          deduction_notes: row.deduction_notes || "",
        });
      }

      setIncomeAdditions(newIncome);
      setDeductionOverrides(newDeductions);
    } catch (error) {
      console.error("Error loading overrides:", error);
    }
  };

  const saveOverridesToDB = async (type: 'income' | 'deduction' | 'both') => {
    try {
      // Merge both income and deduction maps into upsert records
      const allUserIds = new Set<string>();
      if (type === 'income' || type === 'both') {
        incomeAdditions.forEach((_, uid) => allUserIds.add(uid));
      }
      if (type === 'deduction' || type === 'both') {
        deductionOverrides.forEach((_, uid) => allUserIds.add(uid));
      }

      const records = Array.from(allUserIds).map(userId => {
        const inc = incomeAdditions.get(userId) || { tunjangan_kehadiran: 0, tunjangan_kesehatan: 0, bonus_tahunan: 0, thr: 0, insentif_kinerja: 0, bonus_lainnya: 0, pengembalian_employee: 0, insentif_penjualan: 0, overtime_override: 0 };
        const ded = deductionOverrides.get(userId) || { loan_deduction: 0, other_deduction: 0, deduction_notes: "" };
        // Only save if there's any non-zero value
        const hasData = Object.values(inc).some(v => Number(v) > 0) || ded.loan_deduction > 0 || ded.other_deduction > 0 || ded.deduction_notes.trim().length > 0;
        return hasData ? {
          user_id: userId,
          period_month: selectedMonth,
          period_year: selectedYear,
          ...inc,
          ...ded,
        } : null;
      }).filter(Boolean);

      // Delete old records for this period, then insert new ones
      await supabase
        .from("payroll_overrides")
        .delete()
        .eq("period_month", selectedMonth)
        .eq("period_year", selectedYear);

      if (records.length > 0) {
        const { error } = await supabase
          .from("payroll_overrides")
          .insert(records as any[]);
        if (error) throw error;
      }

      // Mirror perubahan ke tabel `payroll` agar Detail langsung refresh
      // tanpa harus Generate ulang. Hanya kolom breakdown income yang diupdate.
      if (type === 'income' || type === 'both') {
        const { data: existingPeriod } = await supabase
          .from("payroll_periods")
          .select("id")
          .eq("month", selectedMonth)
          .eq("year", selectedYear)
          .maybeSingle();

        if (existingPeriod?.id) {
          for (const userId of allUserIds) {
            const inc = incomeAdditions.get(userId) || {
              tunjangan_kehadiran: 0, tunjangan_kesehatan: 0, bonus_tahunan: 0,
              thr: 0, insentif_kinerja: 0, bonus_lainnya: 0,
              pengembalian_employee: 0, insentif_penjualan: 0, overtime_override: 0,
            };
            await supabase
              .from("payroll")
              .update({
                tunjangan_kesehatan: Number(inc.tunjangan_kesehatan) || 0,
                bonus_tahunan: Number(inc.bonus_tahunan) || 0,
                thr: Number(inc.thr) || 0,
                insentif_kinerja: Number(inc.insentif_kinerja) || 0,
                bonus_lainnya: Number(inc.bonus_lainnya) || 0,
                pengembalian_employee: Number(inc.pengembalian_employee) || 0,
                insentif_penjualan: Number(inc.insentif_penjualan) || 0,
              })
              .eq("user_id", userId)
              .eq("period_id", existingPeriod.id);
          }
          // Refresh tampilan tabel payroll
          await fetchPayrollData();
        }
      }

      toast({
        title: "Data Tersimpan",
        description: `Override ${MONTHS[selectedMonth - 1].label} ${selectedYear} berhasil disimpan. Catatan: total Take Home Pay & PPh21 tetap nilai lama sampai Generate Payroll dijalankan ulang.`,
      });
    } catch (error: any) {
      console.error("Error saving overrides:", error);
      toast({ title: "Gagal Simpan", description: error.message, variant: "destructive" });
    }
  };

  const fetchPayrollData = async () => {
    setLoading(true);
    try {
      const { data: periodData } = await supabase
        .from("payroll_periods").select("*")
        .eq("month", selectedMonth).eq("year", selectedYear).maybeSingle();

      setPeriod(periodData as PayrollPeriod | null);
      if (!periodData) { setPayrollData([]); setLoading(false); return; }

      const { data: payrolls } = await supabase
        .from("payroll").select("*").eq("period_id", periodData.id);

      if (!payrolls || payrolls.length === 0) { setPayrollData([]); setLoading(false); return; }

      const userIds = [...new Set(payrolls.map((p) => p.user_id))];

      // Exclude admin users from payroll display
      const { data: adminRolesDisplay } = await supabase
        .from("user_roles").select("user_id").eq("role", "admin");
      const adminIdsDisplay = new Set((adminRolesDisplay || []).map(r => r.user_id));
      const filteredPayrolls = payrolls.filter(p => !adminIdsDisplay.has(p.user_id));
      const filteredUserIds = [...new Set(filteredPayrolls.map((p) => p.user_id))];

      if (filteredUserIds.length === 0) { setPayrollData([]); setLoading(false); return; }

      const { data: profiles } = await supabase
        .from("profiles").select("id, full_name, departemen, jabatan, nik, tunjangan_komunikasi, tunjangan_jabatan, tunjangan_operasional").in("id", filteredUserIds);

      const profileMap = new Map(
        (profiles || []).map((p: any) => [p.id, { name: p.full_name, dept: p.departemen, jabatan: p.jabatan, nik: p.nik, tunjangan_komunikasi: Number(p.tunjangan_komunikasi) || 0, tunjangan_jabatan: Number(p.tunjangan_jabatan) || 0, tunjangan_operasional: Number(p.tunjangan_operasional) || 0 }])
      );

      const enriched: PayrollData[] = filteredPayrolls.map((p) => ({
        ...p,
        employee_name: profileMap.get(p.user_id)?.name || "Unknown",
        departemen: profileMap.get(p.user_id)?.dept || "-",
        jabatan: profileMap.get(p.user_id)?.jabatan || "-",
        nik: profileMap.get(p.user_id)?.nik || "-",
        tunjangan_komunikasi: profileMap.get(p.user_id)?.tunjangan_komunikasi || 0,
        tunjangan_jabatan: profileMap.get(p.user_id)?.tunjangan_jabatan || 0,
        tunjangan_operasional: profileMap.get(p.user_id)?.tunjangan_operasional || 0,
      }));

      enriched.sort((a, b) => (a.employee_name || "").localeCompare(b.employee_name || ""));
      setPayrollData(enriched);
    } catch (error) {
      console.error("Error fetching payroll:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateAttendanceAllowances = async (): Promise<Map<string, number>> => {
    const allowanceMap = new Map<string, number>();
    const { data: configData } = await supabase
      .from("system_settings").select("value").eq("key", "attendance_allowance").maybeSingle();
    if (!configData?.value) return allowanceMap;
    const config = configData.value as any;
    if (!config.enabled) return allowanceMap;

    const cutoffDay = config.cutoff_day || 21;
    const maxAmount = config.max_amount || 0;
    const workHoursPerDay = config.work_hours_per_day || 8;
    const excludedIds: string[] = config.excluded_employee_ids || [];

    const periodStart = new Date(selectedYear, selectedMonth - 2, cutoffDay);
    const periodEndDay = cutoffDay - 1 || 28;
    const periodEnd = new Date(selectedYear, selectedMonth - 1, periodEndDay);

    const { data: holidayData } = await supabase
      .from("system_settings").select("value").eq("key", "overtime_policy").maybeSingle();
    const holidays: string[] = ((holidayData?.value as any)?.holidays || []).map((h: any) => h.date);
    const holidaySet = new Set(holidays);

    const allDays = eachDayOfInterval({ start: periodStart, end: periodEnd });
    const totalWorkingDays = allDays.filter((d) => {
      const ds = format(d, "yyyy-MM-dd");
      return !isWeekend(ds) && !holidaySet.has(ds);
    }).length;
    if (totalWorkingDays === 0) return allowanceMap;

    const { data: whData } = await supabase.rpc("get_work_hours");
    const wh = whData as Record<string, any> | null;
    const checkInEnd = wh?.check_in_end || "08:00";
    const lateTolerance = wh?.late_tolerance_minutes || 0;
    const [dlH, dlM] = checkInEnd.split(":").map(Number);
    const deadlineMinutes = dlH * 60 + dlM + lateTolerance;
    const checkOutStart = wh?.check_out_start || "17:00";
    const earlyTol = wh?.early_leave_tolerance_minutes || 0;
    const [coH, coM] = checkOutStart.split(":").map(Number);
    const coMinutes = coH * 60 + coM - earlyTol;

    // Fetch special work hours for dynamic deadline (Ramadan, etc.)
    const { data: specialWhData } = await supabase
      .from("system_settings").select("value").eq("key", "special_work_hours").maybeSingle();
    const specialPeriods = (specialWhData?.value as any)?.periods || [];

    // Friday-specific work hours
    const fridayEnabled = wh?.friday_enabled || false;
    const fridayCheckOutStart = wh?.friday_check_out_start || "16:00";
    const [fridayOutH, fridayOutM] = fridayCheckOutStart.split(":").map(Number);
    const fridayCheckOutMinutes = fridayOutH * 60 + fridayOutM - earlyTol;

    // Dynamic check-in deadline per day (handles special periods like Ramadan)
    const getCheckInDeadlineForDate = (dateStr: string): number => {
      for (const sp of specialPeriods) {
        if (sp.is_active && dateStr >= sp.start_date && dateStr <= sp.end_date) {
          const spCheckInEnd = sp.check_in_end || checkInEnd;
          const [h, m] = spCheckInEnd.split(":").map(Number);
          const tol = sp.late_tolerance_minutes || 0;
          return h * 60 + m + tol;
        }
      }
      return deadlineMinutes;
    };

    const getCheckOutMinutesForDate = (dateStr: string): number => {
      for (const sp of specialPeriods) {
        if (sp.is_active && dateStr >= sp.start_date && dateStr <= sp.end_date) {
          const [h, m] = (sp.check_out_start || "17:00").split(":").map(Number);
          const tol = sp.early_leave_tolerance_minutes || 0;
          return h * 60 + m - tol;
        }
      }
      const dayOfWeek = new Date(dateStr).getDay();
      if (fridayEnabled && dayOfWeek === 5) {
        return fridayCheckOutMinutes;
      }
      return coMinutes;
    };

    const { data: attendanceData } = await supabase
      .from("attendance").select("user_id, check_in_time, check_out_time, status")
      .gte("check_in_time", format(periodStart, "yyyy-MM-dd'T'00:00:00"))
      .lte("check_in_time", format(periodEnd, "yyyy-MM-dd'T'23:59:59"));

    const attByUser = new Map<string, { present: number; lateHours: number; earlyHours: number }>();
    for (const r of attendanceData || []) {
      if (!attByUser.has(r.user_id)) attByUser.set(r.user_id, { present: 0, lateHours: 0, earlyHours: 0 });
      const u = attByUser.get(r.user_id)!;

      // Skip attendance on holidays — not counted for allowance
      if (r.check_in_time) {
        const attendanceDateStr = format(new Date(r.check_in_time), "yyyy-MM-dd");
        if (holidaySet.has(attendanceDateStr)) {
          continue;
        }
      }

      // Only count as present if BOTH check_in and check_out exist
      const hasCheckIn = !!r.check_in_time;
      const hasCheckOut = !!r.check_out_time;
      const isValidAttendance = hasCheckIn && hasCheckOut;

      if (isValidAttendance && ["hadir", "terlambat", "pulang_cepat"].includes(r.status)) {
        u.present += 1;
      }

      if (r.status === "terlambat" && r.check_in_time) {
        const d = new Date(r.check_in_time);
        const dateStr = format(d, "yyyy-MM-dd");
        const checkInMinutes = d.getHours() * 60 + d.getMinutes();
        const dailyDeadline = getCheckInDeadlineForDate(dateStr);
        const lateMinutes = Math.max(0, checkInMinutes - dailyDeadline);
        u.lateHours += Math.ceil(lateMinutes / 60);
      }
      if (r.status === "pulang_cepat" && r.check_out_time) {
        const d = new Date(r.check_out_time);
        const dateStr = format(d, "yyyy-MM-dd");
        const expectedCheckOut = getCheckOutMinutesForDate(dateStr);
        const early = Math.max(0, expectedCheckOut - (d.getHours() * 60 + d.getMinutes()));
        if (early > 0) u.earlyHours += Math.ceil(early / 60);
      }
    }

    const ratePerDay = maxAmount / totalWorkingDays;
    const ratePerHour = workHoursPerDay > 0 ? ratePerDay / workHoursPerDay : 0;

    const { data: allProfiles } = await supabase.from("profiles").select("id").eq("status", "Active");
    for (const p of allProfiles || []) {
      if (excludedIds.includes(p.id)) { allowanceMap.set(p.id, 0); continue; }
      const att = attByUser.get(p.id) || { present: 0, lateHours: 0, earlyHours: 0 };
      const base = ratePerDay * att.present;
      allowanceMap.set(p.id, Math.max(0, Math.round(base - ratePerHour * att.lateHours - ratePerHour * att.earlyHours)));
    }

    // Auto-save calculated allowance to payroll_overrides (tunjangan_kehadiran)
    for (const [userId, allowance] of allowanceMap.entries()) {
      const { data: existingOverride } = await supabase
        .from("payroll_overrides")
        .select("id, tunjangan_kehadiran")
        .eq("user_id", userId)
        .eq("period_month", selectedMonth)
        .eq("period_year", selectedYear)
        .maybeSingle();

      if (existingOverride) {
        await supabase.from("payroll_overrides").update({
          tunjangan_kehadiran: allowance,
          updated_at: new Date().toISOString(),
        }).eq("id", existingOverride.id);
      } else {
        await supabase.from("payroll_overrides").insert({
          user_id: userId,
          period_month: selectedMonth,
          period_year: selectedYear,
          tunjangan_kehadiran: allowance,
        });
      }
    }

    return allowanceMap;
  };

  const openDeductionDialog = async () => {
    const [{ data: empsRaw }, { data: adminRoles }] = await Promise.all([
      supabase.from("profiles").select("id, full_name").eq("status", "Active").order("full_name"),
      supabase.from("user_roles").select("user_id").eq("role", "admin"),
    ]);
    const adminIds = new Set((adminRoles || []).map(r => r.user_id));
    const emps = (empsRaw || []).filter(e => !adminIds.has(e.id));
    setEmployees(emps);

    // Merge existing DB overrides with employee list (fill missing with defaults).
    // Always reset loan_deduction to 0 — pinjaman dihitung otomatis dari modul Manajemen Pinjaman,
    // tidak boleh di-override manual dari dialog ini agar tidak double-count.
    const overrides = new Map<string, DeductionOverride>();
    deductionOverrides.forEach((v, k) => {
      overrides.set(k, { ...v, loan_deduction: 0 });
    });
    for (const emp of emps || []) {
      if (!overrides.has(emp.id)) {
        overrides.set(emp.id, { loan_deduction: 0, other_deduction: 0, deduction_notes: "" });
      }
    }
    setDeductionOverrides(overrides);
    setShowDeductionDialog(true);
  };

  const openIncomeDialog = async () => {
    const [{ data: empsRaw }, { data: adminRoles }] = await Promise.all([
      supabase.from("profiles").select("id, full_name").eq("status", "Active").order("full_name"),
      supabase.from("user_roles").select("user_id").eq("role", "admin"),
    ]);
    const adminIds = new Set((adminRoles || []).map(r => r.user_id));
    const emps = (empsRaw || []).filter(e => !adminIds.has(e.id));
    setEmployees(emps);

    const additions = new Map<string, IncomeAddition>(incomeAdditions);
    for (const emp of emps || []) {
      if (!additions.has(emp.id)) {
        additions.set(emp.id, { tunjangan_kehadiran: 0, tunjangan_kesehatan: 0, bonus_tahunan: 0, thr: 0, insentif_kinerja: 0, bonus_lainnya: 0, pengembalian_employee: 0, insentif_penjualan: 0, overtime_override: 0 });
      }
    }
    setIncomeAdditions(additions);
    setShowIncomeDialog(true);
  };

  const updateIncome = (userId: string, field: keyof IncomeAddition, value: string) => {
    setIncomeAdditions(prev => {
      const next = new Map(prev);
      const current = next.get(userId) || { tunjangan_kehadiran: 0, tunjangan_kesehatan: 0, bonus_tahunan: 0, thr: 0, insentif_kinerja: 0, bonus_lainnya: 0, pengembalian_employee: 0, insentif_penjualan: 0, overtime_override: 0 };
      next.set(userId, { ...current, [field]: Number(value) || 0 });
      return next;
    });
  };

  const handleAutoCalculateTHR = async () => {
    setCalculatingThr(true);
    try {
      // 1. Find Idul Fitri date from holidays in overtime_policy
      const { data: settingsData } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "overtime_policy")
        .maybeSingle();

      const holidays: { id: string; name: string; date: string }[] =
        (settingsData?.value as any)?.holidays || [];

      const idulFitriKeywords = ["idul fitri", "lebaran", "eid al-fitr", "idulfitri"];
      const idulFitriHolidays = holidays.filter((h) =>
        idulFitriKeywords.some((kw) => h.name.toLowerCase().includes(kw))
      );

      if (idulFitriHolidays.length === 0) {
        toast({
          title: "Tanggal Idul Fitri Tidak Ditemukan",
          description: "Tambahkan hari libur Idul Fitri di Pengaturan Lembur > Hari Libur Nasional terlebih dahulu.",
          variant: "destructive",
        });
        return;
      }

      // Use the earliest Idul Fitri date as reference
      const sorted = idulFitriHolidays.sort((a, b) => a.date.localeCompare(b.date));
      const idulFitriDate = sorted[0].date;
      const idulFitriName = sorted[0].name;

      // 2. Fetch employee profiles and cutoff setting
      const empIds = employees.map((e) => e.id);
      const [profilesResult, cutoffResult] = await Promise.all([
        supabase.from("profiles").select("id, full_name, join_date, basic_salary").in("id", empIds),
        supabase.from("system_settings").select("value").eq("key", "attendance_allowance").maybeSingle(),
      ]);
      const profiles = profilesResult.data;
      const cutoffDay = (cutoffResult.data?.value as any)?.cutoff_day || 21;

      if (!profiles || profiles.length === 0) {
        toast({ title: "Gagal", description: "Data karyawan tidak ditemukan.", variant: "destructive" });
        return;
      }

      // Filter out employees with < 1 month tenure using cutoff-based calculation
      const refDate = parseLocalDate(idulFitriDate);
      const eligibleProfiles = profiles
        .map((p) => {
          const joinDate = parseLocalDate(p.join_date);
          if (refDate.getTime() < joinDate.getTime()) return null;
          const { totalMonthsFraction } = calculateCutoffTenure(joinDate, refDate, cutoffDay);
          if (totalMonthsFraction < 1) return null;
          return {
            id: p.id,
            full_name: p.full_name,
            join_date: p.join_date,
            basic_salary: Number(p.basic_salary) || 0,
          };
        })
        .filter(Boolean) as { id: string; full_name: string; join_date: string; basic_salary: number }[];

      if (eligibleProfiles.length === 0) {
        toast({ title: "Tidak Ada Karyawan Berhak", description: "Semua karyawan memiliki masa kerja < 1 bulan sebelum Idul Fitri.", variant: "destructive" });
        return;
      }

      setThrConfirmData({
        idulFitriDate,
        idulFitriName,
        cutoffDay,
        profiles: eligibleProfiles,
      });
    } catch (error: any) {
      console.error("Error fetching THR data:", error);
      toast({ title: "Gagal", description: error.message, variant: "destructive" });
    } finally {
      setCalculatingThr(false);
    }
  };

  const confirmCalculateTHR = () => {
    if (!thrConfirmData) return;
    const refDate = parseLocalDate(thrConfirmData.idulFitriDate);
    const cutoffDay = thrConfirmData.cutoffDay || 21;
    let updatedCount = 0;

    setIncomeAdditions((prev) => {
      const next = new Map(prev);
      for (const profile of thrConfirmData.profiles) {
        const joinDate = parseLocalDate(profile.join_date);
        const basicSalary = profile.basic_salary;

        if (refDate.getTime() < joinDate.getTime()) continue;

        const { totalMonthsFraction } = calculateCutoffTenure(joinDate, refDate, cutoffDay);

        let thrAmount = 0;
        if (totalMonthsFraction >= 12) {
          thrAmount = basicSalary;
        } else if (totalMonthsFraction >= 1) {
          thrAmount = Math.round((totalMonthsFraction / 12) * basicSalary);
        }

        if (thrAmount > 0) {
          const current = next.get(profile.id) || {
            tunjangan_kehadiran: 0, tunjangan_kesehatan: 0, bonus_tahunan: 0,
            thr: 0, insentif_kinerja: 0, bonus_lainnya: 0,
            pengembalian_employee: 0, insentif_penjualan: 0, overtime_override: 0,
          };
          next.set(profile.id, { ...current, thr: thrAmount });
          updatedCount++;
        }
      }
      return next;
    });

    const formattedDate = format(refDate, "dd MMM yyyy");
    toast({
      title: "THR Berhasil Dihitung",
      description: `${updatedCount} karyawan dihitung berdasarkan ${thrConfirmData.idulFitriName} (${formattedDate}). Basis: Gaji Pokok.`,
    });
    setThrConfirmData(null);
  };

  const updateDeduction = (userId: string, field: keyof DeductionOverride, value: string) => {
    setDeductionOverrides(prev => {
      const next = new Map(prev);
      const current = next.get(userId) || { loan_deduction: 0, other_deduction: 0, deduction_notes: "" };
      if (field === "deduction_notes") {
        next.set(userId, { ...current, deduction_notes: value });
      } else {
        next.set(userId, { ...current, [field]: Number(value) || 0 });
      }
      return next;
    });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      let periodId: string;
      const { data: existingPeriod } = await supabase
        .from("payroll_periods").select("id, status")
        .eq("month", selectedMonth).eq("year", selectedYear).maybeSingle();

      if (existingPeriod?.status === "finalized") {
        toast({ title: "Payroll Terkunci", description: "Payroll periode ini sudah difinalisasi.", variant: "destructive" });
        setGenerating(false); return;
      }

      if (existingPeriod) {
        periodId = existingPeriod.id;
        await supabase.from("payroll").delete().eq("period_id", periodId);

        // Revert any previously scheduled/paid loan installments for this period back to pending,
        // so re-generate is idempotent and doesn't double-count cicilan.
        const { data: prevInstallments } = await supabase
          .from("loan_installments")
          .select("id, loan_id, amount, status")
          .eq("payroll_period_id", periodId)
          .in("status", ["scheduled", "paid"]);

        if (prevInstallments && prevInstallments.length > 0) {
          // Group reverts per loan to recompute counters
          const revertByLoan = new Map<string, { paidCount: number; totalAmount: number }>();
          for (const inst of prevInstallments) {
            const cur = revertByLoan.get(inst.loan_id) || { paidCount: 0, totalAmount: 0 };
            // Only previously "paid" rows actually decremented loan counters
            if (inst.status === "paid") {
              cur.paidCount += 1;
              cur.totalAmount += Number(inst.amount) || 0;
            }
            revertByLoan.set(inst.loan_id, cur);
          }

          // Reset installments rows
          await supabase
            .from("loan_installments")
            .update({ status: "pending", payment_date: null, payroll_period_id: null })
            .eq("payroll_period_id", periodId);

          // Restore loan counters where needed
          for (const [loanId, { paidCount, totalAmount }] of revertByLoan.entries()) {
            if (paidCount === 0 && totalAmount === 0) continue;
            const { data: lr } = await supabase
              .from("employee_loans")
              .select("paid_installments, remaining_amount, total_amount, total_installments")
              .eq("id", loanId)
              .single();
            if (lr) {
              const newPaid = Math.max(0, lr.paid_installments - paidCount);
              const newRemaining = Math.min(Number(lr.total_amount), Number(lr.remaining_amount) + totalAmount);
              await supabase.from("employee_loans").update({
                paid_installments: newPaid,
                remaining_amount: newRemaining,
                status: newPaid >= lr.total_installments ? "completed" : "active",
              }).eq("id", loanId);
            }
          }
        }
      } else {
        const { data: newPeriod, error } = await supabase
          .from("payroll_periods").insert({ month: selectedMonth, year: selectedYear, status: "draft" })
          .select("id").single();
        if (error) throw error;
        periodId = newPeriod.id;
      }

      // Fetch cutoff day first to determine the active period bounds
      const { data: cutoffSettingDataPre } = await supabase
        .from("system_settings").select("value").eq("key", "attendance_allowance").maybeSingle();
      const cutoffDayPre = (cutoffSettingDataPre?.value as any)?.cutoff_day || 21;
      const { start: periodStartDate, end: periodEndDate } = getCutoffPeriodBounds(selectedMonth, selectedYear, cutoffDayPre);
      const periodStartStr = format(periodStartDate, "yyyy-MM-dd");
      const periodEndStr = format(periodEndDate, "yyyy-MM-dd");

      // Active employees + Resigned employees whose resign_date falls within this cutoff period
      const { data: empsRaw } = await supabase
        .from("profiles")
        .select("id, full_name, basic_salary, ptkp_status, status, tunjangan_komunikasi, tunjangan_jabatan, tunjangan_operasional, bpjs_kesehatan_enabled, bpjs_ketenagakerjaan_enabled, join_date, resign_date")
        .or(`status.eq.Active,and(status.eq.Resigned,resign_date.gte.${periodStartStr},resign_date.lte.${periodEndStr})`);

      // Exclude admin users from payroll
      const { data: adminRoles } = await supabase
        .from("user_roles").select("user_id").eq("role", "admin");
      const adminIds = new Set((adminRoles || []).map(r => r.user_id));
      const emps = (empsRaw || []).filter(e => !adminIds.has(e.id));

      if (!emps || emps.length === 0) {
        toast({ title: "Tidak ada karyawan", description: "Tidak ditemukan karyawan aktif.", variant: "destructive" });
        setGenerating(false); return;
      }

      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
      const endDate = new Date(selectedYear, selectedMonth, 0);
      const endDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

      // Fetch overtime with date for PP 35 day-type calculation
      const { data: overtimeData } = await supabase
        .from("overtime_requests").select("user_id, hours, overtime_date")
        .eq("status", "approved").gte("overtime_date", startDate).lte("overtime_date", endDateStr);

      // Fetch holidays and work_days_per_week for day-type detection
      const { data: holidaySettings } = await supabase
        .from("system_settings").select("value").eq("key", "overtime_policy").maybeSingle();
      const overtimePolicy = holidaySettings?.value as any;
      const holidaysList: string[] = (overtimePolicy?.holidays || []).map((h: any) => h.date);
      const holidaySet = new Set(holidaysList);
      const workDaysPerWeek: 5 | 6 = overtimePolicy?.work_days_per_week === 6 ? 6 : 5;

      // Store overtime entries per user with day type for PP 35 calculation
      const overtimeEntriesMap = new Map<string, { hours: number; dayType: 'weekday' | 'weekend' | 'holiday' }[]>();
      const overtimeHoursMap = new Map<string, number>();
      (overtimeData || []).forEach((ot) => {
        const dateStr = ot.overtime_date;
        let dayType: 'weekday' | 'weekend' | 'holiday' = 'weekday';
        if (holidaySet.has(dateStr)) {
          dayType = 'holiday';
        } else if (isWeekend(dateStr)) {
          dayType = 'weekend';
        }

        if (!overtimeEntriesMap.has(ot.user_id)) overtimeEntriesMap.set(ot.user_id, []);
        overtimeEntriesMap.get(ot.user_id)!.push({ hours: ot.hours, dayType });
        overtimeHoursMap.set(ot.user_id, (overtimeHoursMap.get(ot.user_id) || 0) + ot.hours);
      });

      const allowanceMap = await calculateAttendanceAllowances();

      // === Pull Medical Reimbursement dari Budget Expense ===
      // Match by email (priority) → fallback full_name. Period mengikuti cut-off (21-20).
      // Hasil DITAMBAHKAN (Add) ke tunjangan_kesehatan manual yang sudah ada di payroll_overrides.
      const medicalMap = new Map<string, { total: number; count: number; matched_by: string; source_name?: string }>();
      try {
        const { data: empProfilesForMatch } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", emps.map((e: any) => e.id));

        // Guard: pastikan periode klaim cocok dengan bulan payroll yang dipilih
        const periodCheck = validateCutoffPeriodForPayroll(
          periodStartStr, periodEndStr, selectedMonth, selectedYear, cutoffDayPre
        );
        if (!periodCheck.valid) {
          console.error("Medical reimbursement period mismatch:", periodCheck.reason);
          toast({
            title: "Periode klaim tidak sinkron",
            description: periodCheck.reason,
            variant: "destructive",
          });
          throw new Error(periodCheck.reason);
        }

        const { data: medRes, error: medErr } = await supabase.functions.invoke(
          "fetch-medical-reimbursements",
          {
            body: {
              start_date: periodCheck.expected.start,
              end_date: periodCheck.expected.end,
              employees: empProfilesForMatch || [],
            },
          }
        );

        if (medErr) {
          console.warn("Medical reimbursement fetch failed:", medErr);
        } else if (medRes?.success && medRes?.data) {
          for (const [uid, info] of Object.entries(medRes.data as Record<string, any>)) {
            medicalMap.set(uid, {
              total: Number(info.total) || 0,
              count: Number(info.count) || 0,
              matched_by: info.matched_by || "email",
              source_name: info.source_name,
            });
          }

          // REPLACE behavior (idempotent): hasil sync Budget Expense untuk periode cut-off
          // ini langsung menggantikan tunjangan_kesehatan, sehingga generate berulang
          // tidak membuat nilai berlipat.
          if (medicalMap.size > 0) {
            setIncomeAdditions((prev) => {
              const next = new Map(prev);
              for (const [uid, info] of medicalMap.entries()) {
                const cur = next.get(uid) || {
                  tunjangan_kehadiran: 0, tunjangan_kesehatan: 0, bonus_tahunan: 0,
                  thr: 0, insentif_kinerja: 0, bonus_lainnya: 0,
                  pengembalian_employee: 0, insentif_penjualan: 0, overtime_override: 0,
                };
                // REPLACE: nilai sync = single source of truth untuk periode ini
                cur.tunjangan_kesehatan = info.total;
                next.set(uid, cur);
              }
              return next;
            });

            // Mirror ke local Map agar payrollRecords.map (yang baca incomeAdditions via getter)
            // segera melihat nilai terbaru tanpa menunggu re-render.
            for (const [uid, info] of medicalMap.entries()) {
              const cur = incomeAdditions.get(uid) || {
                tunjangan_kehadiran: 0, tunjangan_kesehatan: 0, bonus_tahunan: 0,
                thr: 0, insentif_kinerja: 0, bonus_lainnya: 0,
                pengembalian_employee: 0, insentif_penjualan: 0, overtime_override: 0,
              };
              cur.tunjangan_kesehatan = info.total;
              incomeAdditions.set(uid, cur);
            }

            // Persist nilai sync ke payroll_overrides (REPLACE, bukan accumulate)
            for (const [uid, info] of medicalMap.entries()) {
              const newTk = info.total;
              const { data: existing } = await supabase
                .from("payroll_overrides")
                .select("id")
                .eq("user_id", uid)
                .eq("period_year", selectedYear)
                .eq("period_month", selectedMonth)
                .maybeSingle();
              if (existing) {
                await supabase.from("payroll_overrides")
                  .update({ tunjangan_kesehatan: newTk, updated_at: new Date().toISOString() })
                  .eq("id", existing.id);
              } else {
                await supabase.from("payroll_overrides").insert({
                  user_id: uid,
                  period_year: selectedYear,
                  period_month: selectedMonth,
                  tunjangan_kesehatan: newTk,
                });
              }
            }

            toast({
              title: "Medical Reimbursement Disinkronkan",
              description: `${medicalMap.size} karyawan menerima total ${[...medicalMap.values()].reduce((s, v) => s + v.count, 0)} klaim dari Budget Expense.`,
            });
          }
        }
      } catch (e) {
        console.warn("Medical reimbursement integration error:", e);
      }


      // Fetch dynamic BPJS config
      let bpjsConfig: BPJSRatesConfig | undefined;
      const { data: bpjsData } = await supabase.rpc("get_bpjs_config");
      if (bpjsData) bpjsConfig = bpjsData as unknown as BPJSRatesConfig;

      // Fetch dynamic PTKP config
      let ptkpConfig: Record<string, number> | undefined;
      const { data: ptkpData } = await supabase.rpc("get_ptkp_config");
      if (ptkpData) ptkpConfig = ptkpData as unknown as Record<string, number>;

      // Fetch dynamic Biaya Jabatan config
      let biayaJabatanConfig: { rate_percent: number; max_yearly: number } | undefined;
      const { data: bjData } = await supabase.rpc("get_biaya_jabatan_config");
      if (bjData) biayaJabatanConfig = bjData as unknown as { rate_percent: number; max_yearly: number };

      // Fetch dynamic PPh 21 brackets config
      let taxBrackets: { limit: number; rate: number }[] | undefined;
      const { data: bracketsData } = await supabase.rpc("get_pph21_brackets_config");
      if (bracketsData) {
        const parsed = bracketsData as any;
        if (parsed?.brackets && Array.isArray(parsed.brackets)) {
          taxBrackets = parsed.brackets.map((b: any) => ({
            limit: b.limit === 0 ? Infinity : b.limit,
            rate: b.rate / 100,
          }));
        }
      }

      // Fetch TER rates from database
      const { data: allTERRates } = await supabase
        .from("pph21_ter_rates")
        .select("kategori_ptkp, bruto_min, bruto_max, tarif_efektif")
        .order("bruto_min");

      // Group TER rates by PTKP category
      const terRatesByCategory = new Map<string, TERRate[]>();
      for (const r of (allTERRates as any[]) || []) {
        const cat = r.kategori_ptkp;
        if (!terRatesByCategory.has(cat)) terRatesByCategory.set(cat, []);
        terRatesByCategory.get(cat)!.push({
          bruto_min: Number(r.bruto_min),
          bruto_max: Number(r.bruto_max),
          tarif_efektif: Number(r.tarif_efektif),
        });
      }

      // For December reconciliation: fetch actual yearly data from Jan-Nov
      let pphJanNovMap = new Map<string, number>();
      let brutoJanNovMap = new Map<string, number>();
      let bpjsKtJanNovMap = new Map<string, number>();
      if (selectedMonth === 12) {
        // Get all period IDs for Jan-Nov of this year
        const { data: prevPeriods } = await supabase
          .from("payroll_periods").select("id")
          .eq("year", selectedYear).lt("month", 12);
        
        if (prevPeriods && prevPeriods.length > 0) {
          const prevPeriodIds = prevPeriods.map(p => p.id);
          const { data: prevPayrolls } = await supabase
            .from("payroll").select("user_id, pph21_monthly, bruto_income, bpjs_ketenagakerjaan")
            .in("period_id", prevPeriodIds);
          
          for (const pp of prevPayrolls || []) {
            pphJanNovMap.set(pp.user_id, (pphJanNovMap.get(pp.user_id) || 0) + pp.pph21_monthly);
            brutoJanNovMap.set(pp.user_id, (brutoJanNovMap.get(pp.user_id) || 0) + pp.bruto_income);
            bpjsKtJanNovMap.set(pp.user_id, (bpjsKtJanNovMap.get(pp.user_id) || 0) + pp.bpjs_ketenagakerjaan);
          }
        }
      }

      // Fetch active loans for auto-deduction
      const { data: activeLoans } = await supabase
        .from("employee_loans")
        .select("id, user_id, monthly_installment, paid_installments, total_installments, remaining_amount")
        .eq("status", "active");

      // Build loan deduction map: sum of all active loan installments per employee
      const loanDeductionMap = new Map<string, { amount: number; loanIds: { id: string; amount: number }[] }>();
      for (const loan of activeLoans || []) {
        if (loan.paid_installments >= loan.total_installments) continue;
        const installmentAmount = Math.min(loan.monthly_installment, loan.remaining_amount);
        const existing = loanDeductionMap.get(loan.user_id) || { amount: 0, loanIds: [] };
        existing.amount += installmentAmount;
        existing.loanIds.push({ id: loan.id, amount: installmentAmount });
        loanDeductionMap.set(loan.user_id, existing);
      }

      // Cutoff already fetched above; reuse cutoffDayPre
      const cutoffDay = cutoffDayPre;

      const payrollRecords = emps.map((emp: any) => {
        // Calculate prorate factor for employees joining mid-period AND/OR resigning mid-period
        const joinDate = emp.join_date ? parseLocalDate(emp.join_date) : new Date(2000, 0, 1);
        const resignDate = emp.resign_date ? parseLocalDate(emp.resign_date) : null;
        const prorateFactor = calculateProrateFactorWithResign(joinDate, resignDate, selectedMonth, selectedYear, cutoffDay);

        const fullBasicSalary = Number(emp.basic_salary) || 0;
        const basicSalary = Math.round(fullBasicSalary * prorateFactor);
        const overtimeHours = overtimeHoursMap.get(emp.id) || 0;
        const ded = deductionOverrides.get(emp.id);
        const inc = incomeAdditions.get(emp.id);
        const loanDed = loanDeductionMap.get(emp.id);
        // Use manual overtime override if provided, otherwise calculate per PP 35
        let overtimeTotal = 0;
        if (inc?.overtime_override && inc.overtime_override > 0) {
          overtimeTotal = inc.overtime_override;
        } else {
          const entries = overtimeEntriesMap.get(emp.id) || [];
          for (const entry of entries) {
            overtimeTotal += calculateOvertimePayPP35(fullBasicSalary, entry.hours, entry.dayType, workDaysPerWeek).total;
          }
        }
        const ptkpStatus = emp.ptkp_status || "TK/0";
        const autoAttendanceAllowance = allowanceMap.get(emp.id) || 0;

        // Use manual override for attendance allowance if provided, otherwise auto-calculated
        const attendanceAllowance = (inc?.tunjangan_kehadiran && inc.tunjangan_kehadiran > 0) ? inc.tunjangan_kehadiran : autoAttendanceAllowance;

        // Fixed allowances from profile (prorated)
        const tunjanganKomunikasi = Math.round((Number(emp.tunjangan_komunikasi) || 0) * prorateFactor);
        const tunjanganJabatan = Math.round((Number(emp.tunjangan_jabatan) || 0) * prorateFactor);
        const tunjanganOperasional = Math.round((Number(emp.tunjangan_operasional) || 0) * prorateFactor);
        const fixedAllowances = tunjanganKomunikasi + tunjanganJabatan + tunjanganOperasional;

        // Incidental income from dialog (exclude tunjangan_kehadiran as it's handled separately)
        const tunjanganKesehatan = inc?.tunjangan_kesehatan || 0;
        const bonusTahunan = inc?.bonus_tahunan || 0;
        const thr = inc?.thr || 0;
        const insentifKinerja = inc?.insentif_kinerja || 0;
        const bonusLainnya = inc?.bonus_lainnya || 0;
        const pengembalianEmployee = inc?.pengembalian_employee || 0;
        const insentifPenjualan = inc?.insentif_penjualan || 0;
        const incidentalIncome = tunjanganKesehatan + bonusTahunan + thr + insentifKinerja + bonusLainnya + pengembalianEmployee + insentifPenjualan;

        // Total allowance = attendance + fixed + incidental
        const totalAllowance = attendanceAllowance + fixedAllowances + incidentalIncome;

        // Loan deduction strictly from auto-calc (modul Manajemen Pinjaman),
        // manual override pinjaman dihapus untuk mencegah double-count.
        const finalLoanDeduction = loanDed?.amount || 0;

        // Map PTKP status to TER category (e.g. K/I/0 -> K/0 for TER lookup)
        const terCategory = ptkpStatus.replace("/I", "");
        const terRatesForEmp = terRatesByCategory.get(terCategory) || terRatesByCategory.get(ptkpStatus) || [];

        const result = calculatePayroll({
          basicSalary, allowance: totalAllowance, overtimeTotal, ptkpStatus, overtimeHours,
          loanDeduction: finalLoanDeduction,
          otherDeduction: ded?.other_deduction || 0,
          deductionNotes: ded?.deduction_notes || (finalLoanDeduction > 0 ? "Cicilan pinjaman otomatis" : ""),
          month: selectedMonth,
          terRates: terRatesForEmp,
          totalPphJanNov: pphJanNovMap.get(emp.id) || 0,
          bpjsKesehatanEnabled: emp.bpjs_kesehatan_enabled !== false,
          bpjsKetenagakerjaanEnabled: emp.bpjs_ketenagakerjaan_enabled !== false,
          prevMonthsBruto: brutoJanNovMap.get(emp.id) || 0,
          prevMonthsBpjsKt: bpjsKtJanNovMap.get(emp.id) || 0,
          bpjsConfig,
          ptkpConfig,
          biayaJabatanConfig,
          taxBrackets,
        });

        return {
          user_id: emp.id, period_id: periodId, ...result,
          // Breakdown data (client-side only, not persisted to DB)
          tunjangan_komunikasi: tunjanganKomunikasi,
          tunjangan_jabatan: tunjanganJabatan,
          tunjangan_operasional: tunjanganOperasional,
          tunjangan_kesehatan: tunjanganKesehatan,
          bonus_tahunan: bonusTahunan,
          thr,
          insentif_kinerja: insentifKinerja,
          bonus_lainnya: bonusLainnya,
          pengembalian_employee: pengembalianEmployee,
          insentif_penjualan: insentifPenjualan,
        };
      });

      const { error: insertError } = await supabase.from("payroll").insert(payrollRecords);
      if (insertError) throw insertError;

      // Schedule loan installments for this period (NOT yet paid).
      // They will be marked "paid" and decrement loan counters only when payroll is finalized.
      for (const [, loanDed] of loanDeductionMap.entries()) {

        for (const { id: loanId, amount } of loanDed.loanIds) {
          // Find next pending installment
          const { data: nextInst } = await supabase
            .from("loan_installments")
            .select("id")
            .eq("loan_id", loanId)
            .eq("status", "pending")
            .order("installment_number")
            .limit(1)
            .maybeSingle();

          if (nextInst) {
            await supabase.from("loan_installments").update({
              status: "scheduled",
              payment_date: null,
              payroll_period_id: periodId,
              amount,
            }).eq("id", nextInst.id);
          }
        }
      }
      toast({
        title: "Payroll Berhasil Di-generate",
        description: `${payrollRecords.length} karyawan dihitung untuk ${MONTHS[selectedMonth - 1].label} ${selectedYear}.`,
      });

      // === AUDIT LOG: regenerate after unlock ===
      if (preGenerateSnapshot && preGenerateSnapshot.size > 0 && user) {
        try {
          // Build map of new payroll rows by user_id
          const newRowsByUser = new Map<string, any>();
          payrollRecords.forEach((r: any) => newRowsByUser.set(r.user_id, r));

          // Get the unlock reason from latest audit log
          const { data: latestUnlock } = await supabase
            .from("payroll_audit_logs" as any)
            .select("reason")
            .eq("period_id", periodId)
            .eq("action_type", "unlock")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const unlockReason = (latestUnlock as any)?.reason || "Generate ulang setelah unlock";

          // Log per-employee diff (only those that changed)
          const auditPromises: Promise<any>[] = [];
          for (const [userId, beforeSnap] of preGenerateSnapshot.entries()) {
            const newRow = newRowsByUser.get(userId);
            if (!newRow) continue;
            const afterSnap = snapshotPayrollRow(newRow);
            // Skip if no changes
            const changed = Object.keys(afterSnap).some(
              (k) => (beforeSnap as any)[k] !== (afterSnap as any)[k]
            );
            if (!changed) continue;
            auditPromises.push(
              logPayrollAction({
                period_id: periodId,
                period_month: selectedMonth,
                period_year: selectedYear,
                action_type: "regenerate",
                performed_by: user.id,
                reason: unlockReason,
                affected_user_id: userId,
                before_data: beforeSnap,
                after_data: afterSnap,
              })
            );
          }
          await Promise.all(auditPromises);
          setPreGenerateSnapshot(null);
        } catch (auditErr) {
          console.error("Failed to log regenerate audit:", auditErr);
        }
      }

      fetchPayrollData();
    } catch (error: any) {
      console.error("Error generating payroll:", error);
      toast({ title: "Gagal Generate Payroll", description: error.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleUnlock = async (reason: string) => {
    if (!period || !user) return;
    try {
      // Snapshot current payroll BEFORE unlocking
      const { data: currentRows } = await supabase
        .from("payroll")
        .select("*")
        .eq("period_id", period.id);

      const snap = new Map<string, any>();
      (currentRows || []).forEach((row: any) => {
        snap.set(row.user_id, snapshotPayrollRow(row));
      });
      setPreGenerateSnapshot(snap);

      // Unlock period (status -> draft)
      const { error } = await supabase
        .from("payroll_periods")
        .update({ status: "draft" })
        .eq("id", period.id);
      if (error) throw error;

      // Revert "paid" loan installments for this period back to "scheduled"
      // and restore loan counters, since payment is no longer finalized.
      const { data: paidInsts } = await supabase
        .from("loan_installments")
        .select("id, loan_id, amount")
        .eq("payroll_period_id", period.id)
        .eq("status", "paid");

      if (paidInsts && paidInsts.length > 0) {
        await supabase
          .from("loan_installments")
          .update({ status: "scheduled", payment_date: null })
          .eq("payroll_period_id", period.id)
          .eq("status", "paid");

        const aggByLoan = new Map<string, { count: number; total: number }>();
        for (const inst of paidInsts) {
          const cur = aggByLoan.get(inst.loan_id) || { count: 0, total: 0 };
          cur.count += 1;
          cur.total += Number(inst.amount) || 0;
          aggByLoan.set(inst.loan_id, cur);
        }
        for (const [loanId, { count, total }] of aggByLoan.entries()) {
          const { data: lr } = await supabase
            .from("employee_loans")
            .select("paid_installments, remaining_amount, total_amount, total_installments")
            .eq("id", loanId)
            .single();
          if (lr) {
            const newPaid = Math.max(0, lr.paid_installments - count);
            const newRemaining = Math.min(Number(lr.total_amount), Number(lr.remaining_amount) + total);
            await supabase.from("employee_loans").update({
              paid_installments: newPaid,
              remaining_amount: newRemaining,
              status: newPaid >= lr.total_installments ? "completed" : "active",
            }).eq("id", loanId);
          }
        }
      }

      // Log unlock action
      await logPayrollAction({
        period_id: period.id,
        period_month: selectedMonth,
        period_year: selectedYear,
        action_type: "unlock",
        performed_by: user.id,
        reason,
        affected_user_id: null,
        before_data: { status: "finalized", total_employees: snap.size },
        after_data: { status: "draft" },
      });

      toast({
        title: "Payroll Berhasil Dibuka",
        description: "Periode kembali ke Draft. Lakukan revisi lalu Generate ulang & Finalisasi.",
      });
      fetchPayrollData();
    } catch (error: any) {
      console.error("Error unlocking payroll:", error);
      toast({ title: "Gagal Membuka Kunci", description: error.message, variant: "destructive" });
      throw error;
    }
  };

  const handleFinalize = async () => {
    if (!period || !user) return;
    try {
      await supabase.from("payroll_periods").update({ status: "finalized" }).eq("id", period.id);

      // Convert all "scheduled" loan installments for this period to "paid",
      // and decrement loan counters now (real disbursement).
      const { data: scheduledInsts } = await supabase
        .from("loan_installments")
        .select("id, loan_id, amount")
        .eq("payroll_period_id", period.id)
        .eq("status", "scheduled");

      if (scheduledInsts && scheduledInsts.length > 0) {
        const todayStr = new Date().toISOString().split("T")[0];
        await supabase
          .from("loan_installments")
          .update({ status: "paid", payment_date: todayStr })
          .eq("payroll_period_id", period.id)
          .eq("status", "scheduled");

        // Aggregate per loan and update employee_loans counters
        const aggByLoan = new Map<string, { count: number; total: number }>();
        for (const inst of scheduledInsts) {
          const cur = aggByLoan.get(inst.loan_id) || { count: 0, total: 0 };
          cur.count += 1;
          cur.total += Number(inst.amount) || 0;
          aggByLoan.set(inst.loan_id, cur);
        }
        for (const [loanId, { count, total }] of aggByLoan.entries()) {
          const { data: lr } = await supabase
            .from("employee_loans")
            .select("paid_installments, remaining_amount, total_installments")
            .eq("id", loanId)
            .single();
          if (lr) {
            const newPaid = lr.paid_installments + count;
            const newRemaining = Math.max(0, Number(lr.remaining_amount) - total);
            await supabase.from("employee_loans").update({
              paid_installments: newPaid,
              remaining_amount: newRemaining,
              status: newPaid >= lr.total_installments ? "completed" : "active",
            }).eq("id", loanId);
          }
        }
      }

      // If this period had been unlocked before, log as refinalize
      const { data: unlockExists } = await supabase
        .from("payroll_audit_logs" as any)
        .select("id")
        .eq("period_id", period.id)
        .eq("action_type", "unlock")
        .limit(1)
        .maybeSingle();

      if (unlockExists) {
        await logPayrollAction({
          period_id: period.id,
          period_month: selectedMonth,
          period_year: selectedYear,
          action_type: "refinalize",
          performed_by: user.id,
          reason: "Finalisasi ulang setelah revisi",
          affected_user_id: null,
        });
      }

      toast({ title: "Payroll Difinalisasi", description: "Payroll periode ini sudah dikunci." });
      fetchPayrollData();
    } catch (error: any) {
      toast({ title: "Gagal", description: error.message, variant: "destructive" });
    }
  };

  const generateSlipPDF = async (item: PayrollData) => {
    // Fetch profile data for service period & bank info
    let joinDate = "";
    let contractType = "permanent";
    let npwp = "";
    let bankName = "";
    let bankAccountNumber = "";
    try {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("join_date, contract_type, npwp, bank_name, bank_account_number")
        .eq("id", item.user_id)
        .single();
      if (profileData) {
        joinDate = profileData.join_date;
        contractType = (profileData as any).contract_type || "permanent";
        npwp = (profileData as any).npwp || "";
        bankName = (profileData as any).bank_name || "";
        bankAccountNumber = (profileData as any).bank_account_number || "";
      }
    } catch {}

    const { generatePayslipPDF } = await import("@/lib/payslipPdfGenerator");
    await generatePayslipPDF({
      employee_name: item.employee_name || "-",
      nik: item.nik || "-",
      jabatan: item.jabatan || "-",
      departemen: item.departemen || "-",
      ptkp_status: item.ptkp_status,
      join_date: joinDate,
      contract_type: contractType,
      npwp: npwp,
      bank_name: bankName,
      bank_account_number: bankAccountNumber,
      basic_salary: item.basic_salary,
      allowance: item.allowance,
      tunjangan_komunikasi: item.tunjangan_komunikasi || 0,
      tunjangan_jabatan: item.tunjangan_jabatan || 0,
      tunjangan_operasional: item.tunjangan_operasional || 0,
      tunjangan_kesehatan: item.tunjangan_kesehatan || 0,
      overtime_total: item.overtime_total,
      overtime_hours: item.overtime_hours,
      thr: item.thr || 0,
      insentif_kinerja: item.insentif_kinerja || 0,
      insentif_penjualan: item.insentif_penjualan || 0,
      bonus_tahunan: item.bonus_tahunan || 0,
      bonus_lainnya: item.bonus_lainnya || 0,
      pengembalian_employee: item.pengembalian_employee || 0,
      bpjs_ketenagakerjaan: item.bpjs_ketenagakerjaan,
      bpjs_kesehatan: item.bpjs_kesehatan,
      loan_deduction: item.loan_deduction,
      other_deduction: item.other_deduction,
      pph21_monthly: item.pph21_monthly,
      bruto_income: item.bruto_income,
      netto_income: item.netto_income,
      take_home_pay: item.take_home_pay,
      bpjs_jht_employer: item.bpjs_jht_employer,
      bpjs_jp_employer: item.bpjs_jp_employer,
      bpjs_jkk_employer: item.bpjs_jkk_employer,
      bpjs_jkm_employer: item.bpjs_jkm_employer,
      bpjs_kes_employer: item.bpjs_kes_employer,
      month: selectedMonth,
      year: selectedYear,
    }, logo);
  };

  // Search & pagination logic
  const filteredPayroll = payrollData.filter((item) => {
    if (!payrollSearch.trim()) return true;
    const q = payrollSearch.toLowerCase();
    return (
      (item.employee_name || "").toLowerCase().includes(q) ||
      (item.nik || "").toLowerCase().includes(q) ||
      (item.departemen || "").toLowerCase().includes(q) ||
      (item.jabatan || "").toLowerCase().includes(q)
    );
  });
  const payrollTotalPages = Math.max(1, Math.ceil(filteredPayroll.length / payrollPerPage));
  const safePage = Math.min(payrollPage, payrollTotalPages);
  const paginatedPayroll = filteredPayroll.slice((safePage - 1) * payrollPerPage, safePage * payrollPerPage);

  const totalBruto = payrollData.reduce((s, p) => s + p.bruto_income, 0);
  const totalTHP = payrollData.reduce((s, p) => s + p.take_home_pay, 0);
  const totalPPh = payrollData.reduce((s, p) => s + p.pph21_monthly, 0);
  const totalEmployerBpjs = payrollData.reduce((s, p) => s + p.bpjs_kes_employer + p.bpjs_jht_employer + p.bpjs_jp_employer + p.bpjs_jkk_employer + p.bpjs_jkm_employer, 0);

  const handleExportExcel = async () => {
    if (payrollData.length === 0) return;
    const data = payrollData.map((item, idx) => ({
      "No": idx + 1,
      "Nama": item.employee_name || "-",
      "NIK": item.nik || "-",
      "Departemen": item.departemen || "-",
      "Jabatan": item.jabatan || "-",
      "Status PTKP": item.ptkp_status,
      "Gaji Pokok": item.basic_salary,
      "Tunj. Komunikasi": item.tunjangan_komunikasi || 0,
      "Tunj. Jabatan": item.tunjangan_jabatan || 0,
      "Tunj. Operasional": item.tunjangan_operasional || 0,
      "Tunj. Kehadiran": item.allowance - (item.tunjangan_komunikasi || 0) - (item.tunjangan_jabatan || 0) - (item.tunjangan_operasional || 0) - (item.tunjangan_kesehatan || 0) - (item.bonus_tahunan || 0) - (item.thr || 0) - (item.insentif_kinerja || 0) - (item.bonus_lainnya || 0) - (item.pengembalian_employee || 0) - (item.insentif_penjualan || 0),
      "Tunj. Kesehatan": item.tunjangan_kesehatan || 0,
      "Bonus Tahunan": item.bonus_tahunan || 0,
      "THR": item.thr || 0,
      "Insentif Kinerja": item.insentif_kinerja || 0,
      "Insentif Penjualan": item.insentif_penjualan || 0,
      "Bonus Lainnya": item.bonus_lainnya || 0,
      "Pengembalian": item.pengembalian_employee || 0,
      "Lembur (Jam)": item.overtime_hours,
      "Lembur (Rp)": item.overtime_total,
      "Bruto": item.bruto_income,
      "BPJS Kes (1%)": item.bpjs_kesehatan,
      "BPJS TK+JP (3%)": item.bpjs_ketenagakerjaan,
      "Pot. Pinjaman": item.loan_deduction,
      "Pot. Lainnya": item.other_deduction,
      "Netto": item.netto_income,
      "Nilai PTKP": item.ptkp_value,
      "PKP": item.pkp,
      "PPh 21 Mode": item.pph21_mode === 'TER' && item.pph21_ter_rate != null ? `TER (${item.pph21_ter_rate.toFixed(2)}%)` : item.pph21_mode,
      "PPh 21": item.pph21_monthly,
      "Take Home Pay": item.take_home_pay,
      "BPJS Kes Perusahaan (4%)": item.bpjs_kes_employer,
      "JHT Perusahaan (3.7%)": item.bpjs_jht_employer,
      "JP Perusahaan (2%)": item.bpjs_jp_employer,
      "JKK Perusahaan (0.24%)": item.bpjs_jkk_employer,
      "JKM Perusahaan (0.3%)": item.bpjs_jkm_employer,
    }));
    const monthLabel = MONTHS[selectedMonth - 1].label;
    await exportToExcelFile(
      data,
      `Payroll ${monthLabel} ${selectedYear}`,
      `Payroll_${monthLabel}_${selectedYear}.xlsx`,
      [
        ["PT. KEMIKA KARYA PRATAMA"],
        [`Data Payroll — ${monthLabel} ${selectedYear}`],
        [`Digenerate: ${new Date().toLocaleString("id-ID")}`],
      ]
    );
    toast({ title: "Export Berhasil", description: `Data payroll ${monthLabel} ${selectedYear} berhasil diexport ke Excel.` });
  };

  const [downloadingAllPDF, setDownloadingAllPDF] = useState(false);
  const handleDownloadAllPDF = async () => {
    if (payrollData.length === 0) return;
    setDownloadingAllPDF(true);
    try {
      for (const item of payrollData) {
        await generateSlipPDF(item);
        await new Promise(r => setTimeout(r, 300));
      }
      toast({ title: "Download Selesai", description: `${payrollData.length} slip gaji berhasil di-download.` });
    } catch (error: any) {
      toast({ title: "Gagal Download", description: error.message, variant: "destructive" });
    } finally {
      setDownloadingAllPDF(false);
    }
  };

  // ── e-Payroll Bank Preview ──
  const [showBankPreview, setShowBankPreview] = useState(false);
  const [bankPreviewData, setBankPreviewData] = useState<{ bankAccountNumber: string; fullName: string; amount: number; nik: string; email: string; bankName: string; seqNumber: number }[]>([]);
  const [bankCompanyConfig, setBankCompanyConfig] = useState<{ account_number: string; bank_name: string } | null>(null);
  const [exportingBankPayroll, setExportingBankPayroll] = useState(false);
  const [loadingBankPreview, setLoadingBankPreview] = useState(false);

  const handleOpenBankPreview = async () => {
    if (payrollData.length === 0) return;
    setLoadingBankPreview(true);
    try {
      // Fetch company bank config
      const { data: settingsData } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "company_bank_config")
        .single();

      const companyConfig = settingsData?.value as any;
      if (!companyConfig?.account_number) {
        toast({
          title: "Konfigurasi Belum Lengkap",
          description: "Silakan atur nomor rekening perusahaan di menu Settings > Pengaturan Bank Perusahaan terlebih dahulu.",
          variant: "destructive",
        });
        return;
      }
      setBankCompanyConfig(companyConfig);

      // Fetch bank details for all employees
      const userIds = payrollData.map((p) => p.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, bank_account_number, bank_name, full_name, nik, email")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      const employees = payrollData.map((item, idx) => {
        const profile = profileMap.get(item.user_id);
        return {
          bankAccountNumber: profile?.bank_account_number || "",
          fullName: profile?.full_name || item.employee_name || "-",
          amount: item.take_home_pay - (item.thr || 0),
          nik: profile?.nik || item.nik || "",
          email: profile?.email || "",
          bankName: profile?.bank_name || "",
          seqNumber: idx + 1,
        };
      });

      setBankPreviewData(employees);
      setShowBankPreview(true);
    } catch (error: any) {
      toast({ title: "Gagal", description: error.message, variant: "destructive" });
    } finally {
      setLoadingBankPreview(false);
    }
  };

  const bankIncompleteEmployees = bankPreviewData.filter((e) => !e.bankAccountNumber || !e.bankName);

  const handleConfirmBankExport = async () => {
    if (!bankCompanyConfig) return;
    setExportingBankPayroll(true);
    try {
      const { generateBankPayrollCSV, downloadBankPayrollFile } = await import("@/lib/bankPayrollExport");
      const csvContent = generateBankPayrollCSV(
        { companyAccountNumber: bankCompanyConfig.account_number, companyBankName: bankCompanyConfig.bank_name },
        bankPreviewData,
        selectedMonth,
        selectedYear
      );
      downloadBankPayrollFile(csvContent, selectedMonth, selectedYear);
      toast({ title: "Export Berhasil", description: "File e-Payroll bank berhasil di-download." });
      setShowBankPreview(false);
    } catch (error: any) {
      toast({ title: "Gagal Export", description: error.message, variant: "destructive" });
    } finally {
      setExportingBankPayroll(false);
    }
  };

  // ── e-Payroll THR Bank Preview ──
  const [showThrBankPreview, setShowThrBankPreview] = useState(false);
  const [thrBankPreviewData, setThrBankPreviewData] = useState<{ bankAccountNumber: string; fullName: string; amount: number; nik: string; email: string; bankName: string; seqNumber: number }[]>([]);
  const [thrBankCompanyConfig, setThrBankCompanyConfig] = useState<{ account_number: string; bank_name: string } | null>(null);
  const [exportingThrBank, setExportingThrBank] = useState(false);
  const [loadingThrBankPreview, setLoadingThrBankPreview] = useState(false);

  const handleOpenThrBankPreview = async () => {
    if (payrollData.length === 0) return;
    const thrRecipients = payrollData.filter(p => (p.thr || 0) > 0);
    if (thrRecipients.length === 0) {
      toast({ title: "Tidak Ada Data THR", description: "Belum ada karyawan yang memiliki THR pada periode ini.", variant: "destructive" });
      return;
    }
    setLoadingThrBankPreview(true);
    try {
      const { data: settingsData } = await supabase
        .from("system_settings").select("value").eq("key", "company_bank_config").single();
      const companyConfig = settingsData?.value as any;
      if (!companyConfig?.account_number) {
        toast({ title: "Konfigurasi Belum Lengkap", description: "Silakan atur nomor rekening perusahaan di menu Settings > Pengaturan Bank Perusahaan terlebih dahulu.", variant: "destructive" });
        return;
      }
      setThrBankCompanyConfig(companyConfig);

      const userIds = thrRecipients.map(p => p.user_id);
      const { data: profiles } = await supabase
        .from("profiles").select("id, bank_account_number, bank_name, full_name, nik, email").in("id", userIds);
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      const employees = thrRecipients.map((item, idx) => {
        const profile = profileMap.get(item.user_id);
        return {
          bankAccountNumber: profile?.bank_account_number || "",
          fullName: profile?.full_name || item.employee_name || "-",
          amount: item.thr || 0,
          nik: profile?.nik || item.nik || "",
          email: profile?.email || "",
          bankName: profile?.bank_name || "",
          seqNumber: idx + 1,
        };
      });

      setThrBankPreviewData(employees);
      setShowThrBankPreview(true);
    } catch (error: any) {
      toast({ title: "Gagal", description: error.message, variant: "destructive" });
    } finally {
      setLoadingThrBankPreview(false);
    }
  };

  const thrBankIncompleteEmployees = thrBankPreviewData.filter(e => !e.bankAccountNumber || !e.bankName);

  const handleConfirmThrBankExport = async () => {
    if (!thrBankCompanyConfig) return;
    setExportingThrBank(true);
    try {
      const { generateBankPayrollCSV, downloadBankPayrollFile } = await import("@/lib/bankPayrollExport");
      const csvContent = generateBankPayrollCSV(
        { companyAccountNumber: thrBankCompanyConfig.account_number, companyBankName: thrBankCompanyConfig.bank_name },
        thrBankPreviewData,
        selectedMonth,
        selectedYear,
        'THR'
      );
      downloadBankPayrollFile(csvContent, selectedMonth, selectedYear, 'e-payroll-THR');
      toast({ title: "Export Berhasil", description: "File e-Payroll THR berhasil di-download." });
      setShowThrBankPreview(false);
    } catch (error: any) {
      toast({ title: "Gagal Export", description: error.message, variant: "destructive" });
    } finally {
      setExportingThrBank(false);
    }
  };

  const [generatingThrPdf, setGeneratingThrPdf] = useState(false);
  const handleExportThrPDF = async () => {
    if (payrollData.length === 0) return;
    // Check if any employee has THR > 0
    const thrRecipients = payrollData.filter(p => (p.thr || 0) > 0);
    if (thrRecipients.length === 0) {
      toast({ title: "Tidak Ada Data THR", description: "Belum ada karyawan yang memiliki THR pada periode ini. Hitung THR terlebih dahulu melalui Tambahan Penghasilan.", variant: "destructive" });
      return;
    }
    setGeneratingThrPdf(true);
    try {
      // Fetch Idul Fitri date for the report
      const { data: settingsData } = await supabase
        .from("system_settings").select("value").eq("key", "overtime_policy").maybeSingle();
      const holidays: { name: string; date: string }[] = (settingsData?.value as any)?.holidays || [];
      const idulFitriKeywords = ["idul fitri", "hari raya", "lebaran", "eid al-fitr"];
      const idulFitriHoliday = holidays
        .filter(h => idulFitriKeywords.some(kw => h.name.toLowerCase().includes(kw)))
        .sort((a, b) => a.date.localeCompare(b.date))[0];

      const idulFitriDate = idulFitriHoliday?.date || `${selectedYear}-01-01`;
      const idulFitriName = idulFitriHoliday?.name || "Hari Raya";

      // Fetch profiles for join_date, bank info
      const userIds = thrRecipients.map(p => p.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, join_date, basic_salary, jabatan, departemen, nik, bank_name, bank_account_number")
        .in("id", userIds);

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      const refDate = parseLocalDate(idulFitriDate);

      // Fetch cutoff day for tenure calculation
      const { data: cutoffData } = await supabase
        .from("system_settings").select("value").eq("key", "attendance_allowance").maybeSingle();
      const cutoffDay = (cutoffData?.value as any)?.cutoff_day || 21;

      const { generateThrDisbursementPDF } = await import("@/lib/thrDisbursementPdfGenerator");

      const thrEmployees = thrRecipients.map(p => {
        const profile = profileMap.get(p.user_id);
        const joinDate = profile ? parseLocalDate(profile.join_date) : new Date();
        const { fullMonths, remainingDays } = calculateCutoffTenure(joinDate, refDate, cutoffDay);
        return {
          employee_name: p.employee_name || profile?.full_name || "-",
          nik: p.nik || profile?.nik || "-",
          jabatan: p.jabatan || profile?.jabatan || "-",
          departemen: p.departemen || profile?.departemen || "-",
          join_date: profile?.join_date || "",
          basic_salary: p.basic_salary,
          thr_amount: p.thr || 0,
          tenure_months: fullMonths,
          tenure_days: remainingDays,
          bank_name: profile?.bank_name || "",
          bank_account_number: profile?.bank_account_number || "",
        };
      });

      await generateThrDisbursementPDF(thrEmployees, selectedMonth, selectedYear, idulFitriDate, idulFitriName, logo);
      toast({ title: "PDF THR Berhasil", description: "Dokumen pengajuan pembayaran THR berhasil di-download." });
    } catch (error: any) {
      console.error("Error generating THR PDF:", error);
      toast({ title: "Gagal Generate PDF", description: error.message, variant: "destructive" });
    } finally {
      setGeneratingThrPdf(false);
    }
  };

  const [generatingReport, setGeneratingReport] = useState(false);
  const handleExportPayrollReport = async () => {
    if (payrollData.length === 0) return;
    setGeneratingReport(true);
    try {
      const { generatePayrollReportPDF } = await import("@/lib/payrollReportPdfGenerator");
      await generatePayrollReportPDF(
        payrollData.map((item) => ({
          employee_name: item.employee_name || "-",
          nik: item.nik || "-",
          jabatan: item.jabatan || "-",
          departemen: item.departemen || "-",
          ptkp_status: item.ptkp_status,
          basic_salary: item.basic_salary,
          allowance: item.allowance,
          tunjangan_komunikasi: item.tunjangan_komunikasi || 0,
          tunjangan_jabatan: item.tunjangan_jabatan || 0,
          tunjangan_operasional: item.tunjangan_operasional || 0,
          tunjangan_kesehatan: item.tunjangan_kesehatan || 0,
          overtime_total: item.overtime_total,
          overtime_hours: item.overtime_hours,
          thr: item.thr || 0,
          insentif_kinerja: item.insentif_kinerja || 0,
          insentif_penjualan: item.insentif_penjualan || 0,
          bonus_tahunan: item.bonus_tahunan || 0,
          bonus_lainnya: item.bonus_lainnya || 0,
          pengembalian_employee: item.pengembalian_employee || 0,
          bpjs_ketenagakerjaan: item.bpjs_ketenagakerjaan,
          bpjs_kesehatan: item.bpjs_kesehatan,
          loan_deduction: item.loan_deduction,
          other_deduction: item.other_deduction,
          pph21_monthly: item.pph21_monthly,
          pph21_mode: item.pph21_mode,
          pph21_ter_rate: item.pph21_ter_rate,
          bruto_income: item.bruto_income,
          netto_income: item.netto_income,
          take_home_pay: item.take_home_pay,
          bpjs_jht_employer: item.bpjs_jht_employer,
          bpjs_jp_employer: item.bpjs_jp_employer,
          bpjs_jkk_employer: item.bpjs_jkk_employer,
          bpjs_jkm_employer: item.bpjs_jkm_employer,
          bpjs_kes_employer: item.bpjs_kes_employer,
        })),
        selectedMonth,
        selectedYear,
        logo
      );
      toast({ title: "Export Berhasil", description: "Laporan payroll detail berhasil di-download." });
    } catch (error: any) {
      toast({ title: "Gagal Export", description: error.message, variant: "destructive" });
    } finally {
      setGeneratingReport(false);
    }
  };

  return (
    <DashboardLayout>
      <Tabs defaultValue="payroll" className="space-y-6">
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <DollarSign className="h-7 w-7 text-primary" /> Payroll
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Kelola penggajian karyawan dengan perhitungan PPh 21 & tunjangan kehadiran otomatis
            </p>
            <TabsList className="mt-3">
              <TabsTrigger value="payroll">Payroll</TabsTrigger>
              <TabsTrigger value="overrides">Riwayat Override</TabsTrigger>
            </TabsList>
          </div>

          {/* All actions in one row */}
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
              <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m) => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger className="w-[90px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" onClick={handleGenerate} disabled={generating || period?.status === "finalized"} className="gap-1.5">
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calculator className="h-3.5 w-3.5" />}
              Generate
            </Button>
            <Button variant="outline" size="sm" onClick={openDeductionDialog} disabled={period?.status === "finalized"} className="gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Potongan
            </Button>
            <Button variant="outline" size="sm" onClick={openIncomeDialog} disabled={period?.status === "finalized"} className="gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Tambahan Penghasilan
            </Button>
            {period?.status === "draft" && payrollData.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleFinalize} className="gap-1.5">
                <Lock className="h-3.5 w-3.5" /> Finalisasi
              </Button>
            )}
            {period?.status === "finalized" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUnlockDialog(true)}
                className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Unlock className="h-3.5 w-3.5" /> Buka Kunci untuk Revisi
              </Button>
            )}
            {payrollData.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Download className="h-3.5 w-3.5" /> Export
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={handleExportExcel} className="gap-2">
                    <FileSpreadsheet className="h-4 w-4" /> Export Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportPayrollReport} disabled={generatingReport} className="gap-2">
                    <Printer className="h-4 w-4" /> Laporan PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDownloadAllPDF} disabled={downloadingAllPDF} className="gap-2">
                    <Download className="h-4 w-4" /> Semua Slip PDF
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleOpenBankPreview} disabled={loadingBankPreview} className="gap-2">
                    <Landmark className="h-4 w-4" /> e-Payroll Bank
                  </DropdownMenuItem>
                  {hasIdulFitriInPeriod && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleExportThrPDF} disabled={generatingThrPdf} className="gap-2">
                        <Gift className="h-4 w-4" /> PDF THR
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleOpenThrBankPreview} disabled={loadingThrBankPreview} className="gap-2">
                        <Landmark className="h-4 w-4" /> e-Payroll THR
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <TabsContent value="payroll" className="space-y-6 mt-0">
        {period && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status Periode:</span>
            <Badge variant={period.status === "finalized" ? "default" : "secondary"}>
              {period.status === "finalized" ? "🔒 Finalized" : "📝 Draft"}
            </Badge>
          </div>
        )}

        {payrollData.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Users className="h-8 w-8 text-primary/60" /><div><p className="text-2xl font-bold">{payrollData.length}</p><p className="text-xs text-muted-foreground">Total Karyawan</p></div></div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><TrendingUp className="h-8 w-8 text-primary/40" /><div><p className="text-lg font-bold">{formatRupiah(totalBruto)}</p><p className="text-xs text-muted-foreground">Total Bruto</p></div></div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><FileText className="h-8 w-8 text-destructive/40" /><div><p className="text-lg font-bold">{formatRupiah(totalPPh)}</p><p className="text-xs text-muted-foreground">Total PPh 21</p></div></div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><DollarSign className="h-8 w-8 text-primary/40" /><div><p className="text-lg font-bold">{formatRupiah(totalTHP)}</p><p className="text-xs text-muted-foreground">Total THP</p></div></div></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Building2 className="h-8 w-8 text-muted-foreground/40" /><div><p className="text-lg font-bold">{formatRupiah(totalEmployerBpjs)}</p><p className="text-xs text-muted-foreground">BPJS Perusahaan</p></div></div></CardContent></Card>
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Data Payroll — {MONTHS[selectedMonth - 1].label} {selectedYear}</CardTitle>
                <CardDescription>Daftar penggajian karyawan beserta tunjangan, potongan, dan pajak</CardDescription>
              </div>
              {payrollData.length > 0 && (
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari nama, NIK, dept..."
                    value={payrollSearch}
                    onChange={(e) => { setPayrollSearch(e.target.value); setPayrollPage(1); }}
                    className="pl-9"
                  />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : payrollData.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Calculator className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Belum ada data payroll</p>
                <p className="text-sm mt-1">Klik "Generate Payroll" untuk menghitung gaji periode ini</p>
              </div>
            ) : filteredPayroll.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Tidak ada hasil</p>
                <p className="text-sm mt-1">Coba kata kunci lain</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]">No</TableHead>
                        <TableHead>Nama</TableHead>
                        <TableHead>Dept</TableHead>
                        <TableHead className="text-right">Gaji Pokok</TableHead>
                        <TableHead className="text-right">Tunjangan</TableHead>
                        <TableHead className="text-right">Lembur</TableHead>
                        <TableHead className="text-right">Bruto</TableHead>
                        <TableHead className="text-right">BPJS</TableHead>
                        <TableHead className="text-right">Potongan</TableHead>
                        <TableHead className="text-center">PPh 21 Mode</TableHead>
                        <TableHead className="text-right">PPh 21</TableHead>
                        <TableHead className="text-right">THP</TableHead>
                        <TableHead className="w-[100px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedPayroll.map((item, idx) => (
                        <TableRow key={item.id} className="cursor-pointer hover:bg-accent/50" onClick={() => setDetailItem(item)}>
                          <TableCell className="text-muted-foreground">{(safePage - 1) * payrollPerPage + idx + 1}</TableCell>
                          <TableCell className="font-medium">{item.employee_name}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{item.departemen}</Badge></TableCell>
                          <TableCell className="text-right text-sm">{formatRupiah(item.basic_salary)}</TableCell>
                          <TableCell className="text-right text-sm">{item.allowance > 0 ? formatRupiah(item.allowance) : <span className="text-muted-foreground">-</span>}</TableCell>
                          <TableCell className="text-right text-sm">{item.overtime_hours > 0 ? <span title={`${item.overtime_hours} jam`}>{formatRupiah(item.overtime_total)}</span> : <span className="text-muted-foreground">-</span>}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{formatRupiah(item.bruto_income)}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{formatRupiah(item.bpjs_kesehatan + item.bpjs_ketenagakerjaan)}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {(item.loan_deduction + item.other_deduction) > 0 ? formatRupiah(item.loan_deduction + item.other_deduction) : <span>-</span>}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {item.pph21_mode === "TER" && item.pph21_ter_rate != null ? (
                              <Badge variant="outline" className="text-[10px]">TER {item.pph21_ter_rate.toFixed(2)}%</Badge>
                            ) : item.pph21_mode === "REKONSILIASI" ? (
                              <Badge variant="secondary" className="text-[10px]">Rekonsiliasi</Badge>
                            ) : (
                              <span className="text-muted-foreground">{item.pph21_mode}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm text-destructive">{formatRupiah(item.pph21_monthly)}</TableCell>
                          <TableCell className="text-right text-sm font-bold text-primary">{formatRupiah(item.take_home_pay)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={(e) => { e.stopPropagation(); setDetailItem(item); }}>Detail</Button>
                              <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={(e) => { e.stopPropagation(); generateSlipPDF(item); }} title="Download Slip PDF">
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-semibold">
                        <TableCell colSpan={3}>Total ({filteredPayroll.length} karyawan)</TableCell>
                        <TableCell className="text-right">{formatRupiah(filteredPayroll.reduce((s, p) => s + p.basic_salary, 0))}</TableCell>
                        <TableCell className="text-right">{formatRupiah(filteredPayroll.reduce((s, p) => s + p.allowance, 0))}</TableCell>
                        <TableCell className="text-right">{formatRupiah(filteredPayroll.reduce((s, p) => s + p.overtime_total, 0))}</TableCell>
                        <TableCell className="text-right">{formatRupiah(filteredPayroll.reduce((s, p) => s + p.bruto_income, 0))}</TableCell>
                        <TableCell className="text-right">{formatRupiah(filteredPayroll.reduce((s, p) => s + p.bpjs_kesehatan + p.bpjs_ketenagakerjaan, 0))}</TableCell>
                        <TableCell className="text-right">{formatRupiah(filteredPayroll.reduce((s, p) => s + p.loan_deduction + p.other_deduction, 0))}</TableCell>
                        <TableCell />
                        <TableCell className="text-right text-destructive">{formatRupiah(filteredPayroll.reduce((s, p) => s + p.pph21_monthly, 0))}</TableCell>
                        <TableCell className="text-right text-primary">{formatRupiah(filteredPayroll.reduce((s, p) => s + p.take_home_pay, 0))}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                {/* Pagination */}
                {payrollTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Menampilkan {(safePage - 1) * payrollPerPage + 1}–{Math.min(safePage * payrollPerPage, filteredPayroll.length)} dari {filteredPayroll.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPayrollPage(safePage - 1)}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      {Array.from({ length: payrollTotalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === payrollTotalPages || Math.abs(p - safePage) <= 1)
                        .reduce<(number | string)[]>((acc, p, i, arr) => {
                          if (i > 0 && (arr[i - 1] as number) < p - 1) acc.push("...");
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((p, i) =>
                          typeof p === "string" ? (
                            <span key={`e${i}`} className="px-2 text-muted-foreground text-sm">…</span>
                          ) : (
                            <Button key={p} variant={p === safePage ? "default" : "outline"} size="sm" className="h-8 w-8 p-0" onClick={() => setPayrollPage(p)}>
                              {p}
                            </Button>
                          )
                        )}
                      <Button variant="outline" size="sm" disabled={safePage >= payrollTotalPages} onClick={() => setPayrollPage(safePage + 1)}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Detail Dialog */}
        <Dialog open={!!detailItem} onOpenChange={(open) => !open && setDetailItem(null)}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detail Slip Gaji</DialogTitle>
              <DialogDescription>{detailItem?.employee_name} — {MONTHS[selectedMonth - 1].label} {selectedYear}</DialogDescription>
            </DialogHeader>
            {detailItem && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2 border-b border-border pb-3">
                  <span className="text-muted-foreground">Gaji Pokok</span>
                  <span className="text-right font-medium">{formatRupiah(detailItem.basic_salary)}</span>
                  <span className="text-muted-foreground">Tunjangan Kehadiran</span>
                  <span className="text-right">{formatRupiah(detailItem.allowance - (detailItem.tunjangan_komunikasi || 0) - (detailItem.tunjangan_jabatan || 0) - (detailItem.tunjangan_operasional || 0) - (detailItem.tunjangan_kesehatan || 0) - (detailItem.bonus_tahunan || 0) - (detailItem.thr || 0) - (detailItem.insentif_kinerja || 0) - (detailItem.bonus_lainnya || 0) - (detailItem.pengembalian_employee || 0) - (detailItem.insentif_penjualan || 0))}</span>
                  <span className="text-muted-foreground">Lembur ({detailItem.overtime_hours} jam)</span>
                  <span className="text-right">{formatRupiah(detailItem.overtime_total)}</span>
                </div>
                {/* Fixed Allowances Breakdown */}
                {((detailItem.tunjangan_komunikasi || 0) + (detailItem.tunjangan_jabatan || 0) + (detailItem.tunjangan_operasional || 0)) > 0 && (
                  <div className="grid grid-cols-2 gap-2 border-b border-border pb-3 bg-muted/30 rounded p-2">
                    <span className="col-span-2 text-xs font-semibold text-muted-foreground mb-1">📋 Tunjangan Tetap</span>
                    {(detailItem.tunjangan_komunikasi || 0) > 0 && <>
                      <span className="text-muted-foreground text-xs">Tunjangan Komunikasi</span>
                      <span className="text-right text-xs">{formatRupiah(detailItem.tunjangan_komunikasi!)}</span>
                    </>}
                    {(detailItem.tunjangan_jabatan || 0) > 0 && <>
                      <span className="text-muted-foreground text-xs">Tunjangan Jabatan</span>
                      <span className="text-right text-xs">{formatRupiah(detailItem.tunjangan_jabatan!)}</span>
                    </>}
                    {(detailItem.tunjangan_operasional || 0) > 0 && <>
                      <span className="text-muted-foreground text-xs">Tunjangan Operasional</span>
                      <span className="text-right text-xs">{formatRupiah(detailItem.tunjangan_operasional!)}</span>
                    </>}
                  </div>
                )}
                {/* Incidental Income Breakdown */}
                {((detailItem.tunjangan_kesehatan || 0) + (detailItem.bonus_tahunan || 0) + (detailItem.thr || 0) + (detailItem.insentif_kinerja || 0) + (detailItem.bonus_lainnya || 0) + (detailItem.pengembalian_employee || 0) + (detailItem.insentif_penjualan || 0)) > 0 && (
                  <div className="grid grid-cols-2 gap-2 border-b border-border pb-3 bg-primary/5 rounded p-2">
                    <span className="col-span-2 text-xs font-semibold text-muted-foreground mb-1">💰 Penghasilan Insidental</span>
                    {(detailItem.tunjangan_kesehatan || 0) > 0 && <>
                      <span className="text-muted-foreground text-xs">Tunjangan Kesehatan</span>
                      <span className="text-right text-xs">{formatRupiah(detailItem.tunjangan_kesehatan!)}</span>
                    </>}
                    {(detailItem.bonus_tahunan || 0) > 0 && <>
                      <span className="text-muted-foreground text-xs">Bonus Tahunan</span>
                      <span className="text-right text-xs">{formatRupiah(detailItem.bonus_tahunan!)}</span>
                    </>}
                    {(detailItem.thr || 0) > 0 && <>
                      <span className="text-muted-foreground text-xs">THR</span>
                      <span className="text-right text-xs">{formatRupiah(detailItem.thr!)}</span>
                    </>}
                    {(detailItem.insentif_kinerja || 0) > 0 && <>
                      <span className="text-muted-foreground text-xs">Insentif Kinerja</span>
                      <span className="text-right text-xs">{formatRupiah(detailItem.insentif_kinerja!)}</span>
                    </>}
                    {(detailItem.bonus_lainnya || 0) > 0 && <>
                      <span className="text-muted-foreground text-xs">Bonus Lainnya</span>
                      <span className="text-right text-xs">{formatRupiah(detailItem.bonus_lainnya!)}</span>
                    </>}
                    {(detailItem.pengembalian_employee || 0) > 0 && <>
                      <span className="text-muted-foreground text-xs">Pengembalian Employee</span>
                      <span className="text-right text-xs">{formatRupiah(detailItem.pengembalian_employee!)}</span>
                    </>}
                    {(detailItem.insentif_penjualan || 0) > 0 && <>
                      <span className="text-muted-foreground text-xs">Insentif Penjualan</span>
                      <span className="text-right text-xs">{formatRupiah(detailItem.insentif_penjualan!)}</span>
                    </>}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 border-b border-border pb-3">
                  <span className="font-semibold">Bruto</span>
                  <span className="text-right font-semibold">{formatRupiah(detailItem.bruto_income)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 border-b border-border pb-3">
                  <span className="text-muted-foreground">BPJS Kesehatan (1%)</span>
                  <span className="text-right text-destructive">-{formatRupiah(detailItem.bpjs_kesehatan)}</span>
                  <span className="text-muted-foreground">BPJS TK + JP (3%)</span>
                  <span className="text-right text-destructive">-{formatRupiah(detailItem.bpjs_ketenagakerjaan)}</span>
                  {detailItem.loan_deduction > 0 && <>
                    <span className="text-muted-foreground">Pinjaman/Kasbon</span>
                    <span className="text-right text-destructive">-{formatRupiah(detailItem.loan_deduction)}</span>
                  </>}
                  {detailItem.other_deduction > 0 && <>
                    <span className="text-muted-foreground">Potongan Lain</span>
                    <span className="text-right text-destructive">-{formatRupiah(detailItem.other_deduction)}</span>
                  </>}
                  {detailItem.deduction_notes && (
                    <span className="col-span-2 text-xs text-muted-foreground italic">Catatan: {detailItem.deduction_notes}</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 border-b border-border pb-3">
                  <span className="font-semibold">Netto</span>
                  <span className="text-right font-semibold">{formatRupiah(detailItem.netto_income)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 border-b border-border pb-3">
                  <span className="text-muted-foreground">PTKP ({detailItem.ptkp_status})</span>
                  <span className="text-right">{formatRupiah(detailItem.ptkp_value)}</span>
                  <span className="text-muted-foreground">PKP (Tahunan)</span>
                  <span className="text-right">{formatRupiah(detailItem.pkp)}</span>
                  <span className="text-muted-foreground">
                    PPh 21 / bulan
                    {detailItem.pph21_mode === "TER" && <Badge variant="outline" className="ml-1 text-[9px]">TER {detailItem.pph21_ter_rate}%</Badge>}
                    {detailItem.pph21_mode === "REKONSILIASI" && <Badge variant="secondary" className="ml-1 text-[9px]">Rekonsiliasi</Badge>}
                  </span>
                  <span className="text-right text-destructive font-medium">-{formatRupiah(detailItem.pph21_monthly)}</span>
                </div>

                {/* Employer BPJS */}
                <div className="grid grid-cols-2 gap-2 border-b border-border pb-3 bg-muted/30 rounded p-2">
                  <span className="col-span-2 text-xs font-semibold text-muted-foreground mb-1">Kontribusi Perusahaan</span>
                  <span className="text-muted-foreground text-xs">BPJS Kes (4%)</span>
                  <span className="text-right text-xs">{formatRupiah(detailItem.bpjs_kes_employer)}</span>
                  <span className="text-muted-foreground text-xs">JHT (3.7%)</span>
                  <span className="text-right text-xs">{formatRupiah(detailItem.bpjs_jht_employer)}</span>
                  <span className="text-muted-foreground text-xs">JP (2%)</span>
                  <span className="text-right text-xs">{formatRupiah(detailItem.bpjs_jp_employer)}</span>
                  <span className="text-muted-foreground text-xs">JKK (0.24%)</span>
                  <span className="text-right text-xs">{formatRupiah(detailItem.bpjs_jkk_employer)}</span>
                  <span className="text-muted-foreground text-xs">JKM (0.3%)</span>
                  <span className="text-right text-xs">{formatRupiah(detailItem.bpjs_jkm_employer)}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <span className="text-base font-bold">Take Home Pay</span>
                  <span className="text-right text-base font-bold text-primary">{formatRupiah(detailItem.take_home_pay)}</span>
                </div>
                <div className="pt-3 border-t border-border">
                  <Button onClick={() => generateSlipPDF(detailItem)} className="w-full gap-2">
                    <Download className="h-4 w-4" /> Download Slip Gaji PDF
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Deduction Dialog */}
        <Dialog open={showDeductionDialog} onOpenChange={(open) => { setShowDeductionDialog(open); if (!open) { setDeductionSearch(""); setSelectedDeductionEmp(null); } }}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Potongan Tambahan Karyawan</DialogTitle>
              <DialogDescription>Klik nama karyawan untuk mengisi potongan. Karyawan dengan potongan akan ditandai.</DialogDescription>
            </DialogHeader>
            <Input
              placeholder="🔍 Cari karyawan..."
              value={deductionSearch}
              onChange={(e) => setDeductionSearch(e.target.value)}
              className="mb-2"
            />
            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
              {(() => {
                const loanMap = new Map<string, number>();
                payrollData.forEach(p => loanMap.set(p.user_id, Number(p.loan_deduction) || 0));
                return employees
                .filter(emp => emp.full_name.toLowerCase().includes(deductionSearch.toLowerCase()))
                .map((emp) => {
                  const ded = deductionOverrides.get(emp.id) || { loan_deduction: 0, other_deduction: 0, deduction_notes: "" };
                  const autoLoan = loanMap.get(emp.id) || 0;
                  const hasValue = (autoLoan > 0 || ded.other_deduction > 0);
                  const isExpanded = selectedDeductionEmp === emp.id;
                  return (
                    <div key={emp.id} className={`border rounded-lg transition-colors ${hasValue ? 'border-primary/50 bg-primary/5' : 'border-border'}`}>
                      <button
                        type="button"
                        className="w-full flex items-center justify-between p-3 text-left hover:bg-accent/50 rounded-lg"
                        onClick={() => setSelectedDeductionEmp(isExpanded ? null : emp.id)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{emp.full_name}</span>
                          {hasValue && <Badge variant="outline" className="text-[10px]">Ada potongan</Badge>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {hasValue && (
                            <span>{formatRupiah(autoLoan + ded.other_deduction)}</span>
                          )}
                          <span className="text-muted-foreground">{isExpanded ? "▲" : "▼"}</span>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">Pinjaman/Kasbon</Label>
                              <Input
                                type="text"
                                value={autoLoan > 0 ? formatRupiah(autoLoan) : "Tidak ada cicilan"}
                                readOnly
                                disabled
                                className="bg-muted/50 cursor-not-allowed"
                                title="Otomatis dari modul Manajemen Pinjaman — sudah dihitung di tabel payroll, tidak akan dijumlahkan ulang."
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Potongan Lain</Label>
                              <Input type="number" value={ded.other_deduction || ""} placeholder="0"
                                onChange={(e) => updateDeduction(emp.id, "other_deduction", e.target.value)} />
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground italic">
                            ℹ️ Pinjaman/Kasbon hanya ditampilkan (read-only) — sudah otomatis dipotong dari modul Manajemen Pinjaman. Hanya <strong>Potongan Lain</strong> yang akan ditambahkan sebagai potongan manual.
                          </p>
                          <div>
                            <Label className="text-xs">Catatan</Label>
                            <Textarea rows={1} value={ded.deduction_notes} placeholder="Keterangan potongan..."
                              onChange={(e) => updateDeduction(emp.id, "deduction_notes", e.target.value)} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
            <Button onClick={async () => { await saveOverridesToDB('deduction'); setShowDeductionDialog(false); }} className="w-full mt-2">Simpan & Tutup</Button>
          </DialogContent>
        </Dialog>

        {/* Income Additions Dialog */}
        <Dialog open={showIncomeDialog} onOpenChange={(open) => { setShowIncomeDialog(open); if (!open) { setIncomeSearch(""); setSelectedIncomeEmp(null); } }}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Tambahan Penghasilan Insidental</DialogTitle>
              <DialogDescription>Klik nama karyawan untuk mengisi tambahan penghasilan. Tunjangan tetap diambil otomatis dari data karyawan.</DialogDescription>
            </DialogHeader>
            {hasIdulFitriInPeriod && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 mb-1"
                disabled={calculatingThr}
                onClick={handleAutoCalculateTHR}
              >
                {calculatingThr ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
                Hitung THR Otomatis (Permenaker No.6/2016)
              </Button>
            )}
            <Input
              placeholder="🔍 Cari karyawan..."
              value={incomeSearch}
              onChange={(e) => setIncomeSearch(e.target.value)}
              className="mb-2"
            />
            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
              {employees
                .filter(emp => emp.full_name.toLowerCase().includes(incomeSearch.toLowerCase()))
                .map((emp) => {
                  const inc = incomeAdditions.get(emp.id) || { tunjangan_kehadiran: 0, tunjangan_kesehatan: 0, bonus_tahunan: 0, thr: 0, insentif_kinerja: 0, bonus_lainnya: 0, pengembalian_employee: 0, insentif_penjualan: 0, overtime_override: 0 };
                  const totalInc = Object.values(inc).reduce((s, v) => s + (Number(v) || 0), 0);
                  const hasValue = totalInc > 0;
                  const isExpanded = selectedIncomeEmp === emp.id;
                  return (
                    <div key={emp.id} className={`border rounded-lg transition-colors ${hasValue ? 'border-primary/50 bg-primary/5' : 'border-border'}`}>
                      <button
                        type="button"
                        className="w-full flex items-center justify-between p-3 text-left hover:bg-accent/50 rounded-lg"
                        onClick={() => setSelectedIncomeEmp(isExpanded ? null : emp.id)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{emp.full_name}</span>
                          {hasValue && <Badge variant="outline" className="text-[10px]">Ada tambahan</Badge>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {hasValue && (
                            <span>{formatRupiah(totalInc)}</span>
                          )}
                          <span className="text-muted-foreground">{isExpanded ? "▲" : "▼"}</span>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div>
                              <Label className="text-xs">Tunj. Kehadiran</Label>
                              <Input type="number" value={inc.tunjangan_kehadiran || ""} placeholder="0 (otomatis)"
                                onChange={(e) => updateIncome(emp.id, "tunjangan_kehadiran", e.target.value)} />
                              <span className="text-[10px] text-muted-foreground">Kosongkan untuk hitung otomatis</span>
                            </div>
                            <div>
                              <Label className="text-xs">Tunj. Kesehatan</Label>
                              <Input type="number" value={inc.tunjangan_kesehatan || ""} placeholder="0"
                                onChange={(e) => updateIncome(emp.id, "tunjangan_kesehatan", e.target.value)} />
                            </div>
                            <div>
                              <Label className="text-xs">Bonus Tahunan</Label>
                              <Input type="number" value={inc.bonus_tahunan || ""} placeholder="0"
                                onChange={(e) => updateIncome(emp.id, "bonus_tahunan", e.target.value)} />
                            </div>
                            <div>
                              <Label className="text-xs">THR</Label>
                              <Input type="number" value={inc.thr || ""} placeholder="0"
                                onChange={(e) => updateIncome(emp.id, "thr", e.target.value)} />
                            </div>
                            <div>
                              <Label className="text-xs">Insentif Kinerja</Label>
                              <Input type="number" value={inc.insentif_kinerja || ""} placeholder="0"
                                onChange={(e) => updateIncome(emp.id, "insentif_kinerja", e.target.value)} />
                            </div>
                            <div>
                              <Label className="text-xs">Bonus Lainnya</Label>
                              <Input type="number" value={inc.bonus_lainnya || ""} placeholder="0"
                                onChange={(e) => updateIncome(emp.id, "bonus_lainnya", e.target.value)} />
                            </div>
                            <div>
                              <Label className="text-xs">Pengembalian</Label>
                              <Input type="number" value={inc.pengembalian_employee || ""} placeholder="0"
                                onChange={(e) => updateIncome(emp.id, "pengembalian_employee", e.target.value)} />
                            </div>
                            <div>
                              <Label className="text-xs">Insentif Penjualan</Label>
                              <Input type="number" value={inc.insentif_penjualan || ""} placeholder="0"
                                onChange={(e) => updateIncome(emp.id, "insentif_penjualan", e.target.value)} />
                            </div>
                            <div>
                              <Label className="text-xs">Override Lembur</Label>
                              <Input type="number" value={inc.overtime_override || ""} placeholder="0 (otomatis)"
                                onChange={(e) => updateIncome(emp.id, "overtime_override", e.target.value)} />
                              <span className="text-[10px] text-muted-foreground">Kosongkan untuk hitung otomatis PP 35</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
            <Button onClick={async () => { await saveOverridesToDB('income'); setShowIncomeDialog(false); }} className="w-full mt-2">Simpan & Tutup</Button>
          </DialogContent>
        </Dialog>

        {/* THR Confirmation Dialog */}
        <Dialog open={!!thrConfirmData} onOpenChange={(open) => { if (!open) setThrConfirmData(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-primary" /> Konfirmasi Perhitungan THR
              </DialogTitle>
              <DialogDescription>
                Periksa data berikut sebelum menghitung THR otomatis berdasarkan Permenaker No. 6 Tahun 2016.
              </DialogDescription>
            </DialogHeader>
            {thrConfirmData && (
              <div className="space-y-4">
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Hari Raya</span>
                    <span className="font-semibold">{thrConfirmData.idulFitriName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Tanggal Acuan</span>
                    <span className="font-semibold">{format(parseLocalDate(thrConfirmData.idulFitriDate), "dd MMMM yyyy")}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Basis Perhitungan</span>
                    <Badge variant="secondary">Gaji Pokok</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Jumlah Karyawan</span>
                    <span className="font-semibold">{thrConfirmData.profiles.length} orang</span>
                  </div>
                </div>

                <div className="rounded-lg border p-3 max-h-48 overflow-y-auto">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Preview Perhitungan:</p>
                  <div className="space-y-1">
                    {thrConfirmData.profiles
                      .map((p) => {
                        const refDate = parseLocalDate(thrConfirmData.idulFitriDate);
                        const joinDate = parseLocalDate(p.join_date);
                        if (refDate.getTime() < joinDate.getTime()) return null;
                        const { fullMonths, remainingDays, totalMonthsFraction } = calculateCutoffTenure(joinDate, refDate, thrConfirmData.cutoffDay || 21);
                        let thrAmount = 0;
                        let label = "";
                        const tenureLabel = `${fullMonths} bln ${remainingDays} hr`;
                        if (totalMonthsFraction >= 12) {
                          thrAmount = p.basic_salary;
                          label = "1× gaji";
                        } else if (totalMonthsFraction >= 1) {
                          thrAmount = Math.round((totalMonthsFraction / 12) * p.basic_salary);
                          label = `${totalMonthsFraction.toFixed(2)}/12`;
                        }
                        if (thrAmount <= 0) return null;
                        return { name: p.full_name, thrAmount, label, tenureLabel };
                      })
                      .filter(Boolean)
                      .sort((a, b) => a!.name.localeCompare(b!.name))
                      .map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0">
                          <div className="flex flex-col">
                            <span>{item!.name}</span>
                            <span className="text-[10px] text-muted-foreground">Masa kerja: {item!.tenureLabel}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{item!.label}</Badge>
                            <span className="font-mono font-medium">{formatRupiah(item!.thrAmount)}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setThrConfirmData(null)}>Batal</Button>
                  <Button className="flex-1 gap-2" onClick={confirmCalculateTHR}>
                    <Gift className="h-4 w-4" /> Terapkan THR
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={showBankPreview} onOpenChange={setShowBankPreview}>
          <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Landmark className="h-5 w-5" /> Preview e-Payroll Bank
              </DialogTitle>
              <DialogDescription>
                Review data transfer gaji sebelum download file — {MONTHS[selectedMonth - 1].label} {selectedYear}
              </DialogDescription>
            </DialogHeader>

            {bankIncompleteEmployees.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm text-destructive">
                    {bankIncompleteEmployees.length} karyawan belum memiliki data rekening bank lengkap:
                  </p>
                  <ul className="text-xs text-destructive/80 mt-1 list-disc list-inside">
                    {bankIncompleteEmployees.map((e) => (
                      <li key={e.nik}>{e.fullName} — {!e.bankAccountNumber ? "No. Rekening kosong" : "Nama Bank kosong"}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground mt-1">Lengkapi data di halaman Karyawan sebelum export.</p>
                </div>
              </div>
            )}

            {bankCompanyConfig && (
              <div className="flex items-center gap-4 text-sm bg-muted/50 rounded-lg p-3">
                <div><span className="text-muted-foreground">Rekening Pengirim:</span> <span className="font-medium">{bankCompanyConfig.account_number}</span></div>
                <div><span className="text-muted-foreground">Bank:</span> <span className="font-medium">{bankCompanyConfig.bank_name}</span></div>
                <div><span className="text-muted-foreground">Total:</span> <span className="font-bold">{formatRupiah(bankPreviewData.reduce((s, e) => s + Math.round(e.amount), 0))}</span></div>
              </div>
            )}

            {payrollData.some(p => (p.thr || 0) > 0) && (
              <div className="flex items-start gap-2 text-sm bg-primary/10 border border-primary/20 rounded-lg p-3">
                <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-primary">
                  <span className="font-semibold">Catatan:</span> Nominal THP sudah dikurangi THR karena THR dibayarkan terpisah melalui e-Payroll THR.
                </p>
              </div>
            )}

            <div className="flex-1 overflow-auto min-h-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">No</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>No. Rekening</TableHead>
                    <TableHead>Bank</TableHead>
                    <TableHead>NIK</TableHead>
                    <TableHead className="text-right">THP</TableHead>
                    <TableHead className="w-16 text-center">Tipe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bankPreviewData.map((emp, idx) => {
                    const isIncomplete = !emp.bankAccountNumber || !emp.bankName;
                    return (
                      <TableRow key={idx} className={isIncomplete ? "bg-destructive/5" : ""}>
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-medium">{emp.fullName}</TableCell>
                        <TableCell className={!emp.bankAccountNumber ? "text-destructive font-medium" : ""}>
                          {emp.bankAccountNumber || "⚠ Belum diisi"}
                        </TableCell>
                        <TableCell className={!emp.bankName ? "text-destructive font-medium" : ""}>
                          {emp.bankName || "⚠ Belum diisi"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{emp.nik}</TableCell>
                        <TableCell className="text-right font-medium">{formatRupiah(Math.round(emp.amount))}</TableCell>
                        <TableCell className="text-center">
                          {bankCompanyConfig && (
                            <Badge variant={emp.bankName?.toLowerCase().includes(bankCompanyConfig.bank_name.toLowerCase().split(' ')[0]) ? "secondary" : "outline"} className="text-[10px]">
                              {emp.bankName?.toLowerCase().includes(bankCompanyConfig.bank_name.toLowerCase().split(' ')[0]) ? "OBU" : "IBU"}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <p className="text-xs text-muted-foreground">{bankPreviewData.length} karyawan • Format: TXT (semicolon-separated)</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowBankPreview(false)}>Batal</Button>
                <Button onClick={handleConfirmBankExport} disabled={exportingBankPayroll || bankIncompleteEmployees.length > 0} className="gap-2">
                  {exportingBankPayroll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download e-Payroll
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* THR Bank Preview Dialog */}
        <Dialog open={showThrBankPreview} onOpenChange={setShowThrBankPreview}>
          <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-primary" /> Preview e-Payroll THR
              </DialogTitle>
              <DialogDescription>
                Review data transfer THR sebelum download file — {MONTHS[selectedMonth - 1].label} {selectedYear}
              </DialogDescription>
            </DialogHeader>

            {thrBankIncompleteEmployees.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm text-destructive">
                    {thrBankIncompleteEmployees.length} karyawan belum memiliki data rekening bank lengkap:
                  </p>
                  <ul className="text-xs text-destructive/80 mt-1 list-disc list-inside">
                    {thrBankIncompleteEmployees.map((e) => (
                      <li key={e.nik}>{e.fullName} — {!e.bankAccountNumber ? "No. Rekening kosong" : "Nama Bank kosong"}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground mt-1">Lengkapi data di halaman Karyawan sebelum export.</p>
                </div>
              </div>
            )}

            {thrBankCompanyConfig && (
              <div className="flex items-center gap-4 text-sm bg-muted/50 rounded-lg p-3">
                <div><span className="text-muted-foreground">Rekening Pengirim:</span> <span className="font-medium">{thrBankCompanyConfig.account_number}</span></div>
                <div><span className="text-muted-foreground">Bank:</span> <span className="font-medium">{thrBankCompanyConfig.bank_name}</span></div>
                <div><span className="text-muted-foreground">Total THR:</span> <span className="font-bold">{formatRupiah(thrBankPreviewData.reduce((s, e) => s + Math.round(e.amount), 0))}</span></div>
              </div>
            )}

            <div className="flex-1 overflow-auto min-h-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">No</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>No. Rekening</TableHead>
                    <TableHead>Bank</TableHead>
                    <TableHead>NIK</TableHead>
                    <TableHead className="text-right">THR</TableHead>
                    <TableHead className="w-16 text-center">Tipe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {thrBankPreviewData.map((emp, idx) => {
                    const isIncomplete = !emp.bankAccountNumber || !emp.bankName;
                    return (
                      <TableRow key={idx} className={isIncomplete ? "bg-destructive/5" : ""}>
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-medium">{emp.fullName}</TableCell>
                        <TableCell className={!emp.bankAccountNumber ? "text-destructive font-medium" : ""}>
                          {emp.bankAccountNumber || "⚠ Belum diisi"}
                        </TableCell>
                        <TableCell className={!emp.bankName ? "text-destructive font-medium" : ""}>
                          {emp.bankName || "⚠ Belum diisi"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{emp.nik}</TableCell>
                        <TableCell className="text-right font-medium">{formatRupiah(Math.round(emp.amount))}</TableCell>
                        <TableCell className="text-center">
                          {thrBankCompanyConfig && (
                            <Badge variant={emp.bankName?.toLowerCase().includes(thrBankCompanyConfig.bank_name.toLowerCase().split(' ')[0]) ? "secondary" : "outline"} className="text-[10px]">
                              {emp.bankName?.toLowerCase().includes(thrBankCompanyConfig.bank_name.toLowerCase().split(' ')[0]) ? "OBU" : "IBU"}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <p className="text-xs text-muted-foreground">{thrBankPreviewData.length} karyawan • Format: TXT (semicolon-separated)</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowThrBankPreview(false)}>Batal</Button>
                <Button onClick={handleConfirmThrBankExport} disabled={exportingThrBank || thrBankIncompleteEmployees.length > 0} className="gap-2">
                  {exportingThrBank ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download e-Payroll THR
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </TabsContent>

        <TabsContent value="overrides" className="mt-0">
          <PayrollOverrideHistory />
        </TabsContent>
      </Tabs>

      <UnlockPayrollDialog
        open={showUnlockDialog}
        onOpenChange={setShowUnlockDialog}
        onConfirm={handleUnlock}
        periodLabel={period ? `${MONTHS[selectedMonth - 1].label} ${selectedYear}` : ""}
      />
    </DashboardLayout>
  );
};

export default Payroll;

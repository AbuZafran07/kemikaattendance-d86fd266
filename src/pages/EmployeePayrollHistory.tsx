import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmployeeBottomNav } from "@/components/EmployeeBottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatRupiah } from "@/lib/payrollCalculation";
import { ArrowLeft, DollarSign, Download, Loader2, LogOut } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import logo from "@/assets/logo.png";



interface PayrollItem {
  id: string;
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
  period_id: string;
  thr: number;
  tunjangan_kesehatan: number;
  insentif_kinerja: number;
  insentif_penjualan: number;
  bonus_tahunan: number;
  bonus_lainnya: number;
  pengembalian_employee: number;
}

interface PeriodInfo {
  id: string;
  month: number;
  year: number;
  status: string;
}

const EmployeePayrollHistory = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const monthsLong = (t("common.monthsLong", { returnObjects: true }) as string[]) || [];
  const { user, profile, signOut } = useAuth();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [payrolls, setPayrolls] = useState<(PayrollItem & { month: number; year: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailItem, setDetailItem] = useState<(PayrollItem & { month: number; year: number }) | null>(null);

  const years = Array.from({ length: 3 }, (_, i) => new Date().getFullYear() - i);

  useEffect(() => {
    if (user) fetchPayrolls();
  }, [user, selectedYear]);

  const fetchPayrolls = async () => {
    setLoading(true);
    try {
      // Get finalized periods for selected year
      const { data: periods } = await supabase
        .from("payroll_periods")
        .select("id, month, year, status")
        .eq("year", selectedYear)
        .eq("status", "finalized")
        .order("month", { ascending: false });

      if (!periods || periods.length === 0) { setPayrolls([]); setLoading(false); return; }

      const periodIds = periods.map(p => p.id);
      const periodMap = new Map(periods.map(p => [p.id, p]));

      const { data: payrollData } = await supabase
        .from("payroll")
        .select("*")
        .eq("user_id", user!.id)
        .in("period_id", periodIds);

      const enriched = (payrollData || []).map(p => {
        const per = periodMap.get(p.period_id)!;
        return { ...p, month: per.month, year: per.year };
      });

      enriched.sort((a, b) => b.month - a.month);
      setPayrolls(enriched);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const generateSlipPDF = async (item: PayrollItem & { month: number; year: number }) => {
    const tunjanganKomunikasi = Number((profile as any)?.tunjangan_komunikasi) || 0;
    const tunjanganJabatan = Number((profile as any)?.tunjangan_jabatan) || 0;
    const tunjanganOperasional = Number((profile as any)?.tunjangan_operasional) || 0;

    const { generatePayslipPDF } = await import("@/lib/payslipPdfGenerator");
    await generatePayslipPDF({
      employee_name: profile?.full_name || "-",
      nik: profile?.nik || "-",
      jabatan: profile?.jabatan || "-",
      departemen: profile?.departemen || "-",
      ptkp_status: item.ptkp_status,
      join_date: profile?.join_date || "",
      contract_type: (profile as any)?.contract_type || "permanent",
      npwp: (profile as any)?.npwp || "",
      bank_name: (profile as any)?.bank_name || "",
      bank_account_number: (profile as any)?.bank_account_number || "",
      basic_salary: item.basic_salary,
      allowance: item.allowance,
      tunjangan_komunikasi: tunjanganKomunikasi,
      tunjangan_jabatan: tunjanganJabatan,
      tunjangan_operasional: tunjanganOperasional,
      tunjangan_kesehatan: detailItem.tunjangan_kesehatan || 0,
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
      month: item.month,
      year: item.year,
    }, logo);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 pb-24">
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/employee/self-service")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <img src={logo} alt="Kemika" className="h-8 object-contain" />
          </div>
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-lg space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <DollarSign className="h-6 w-6 text-primary" /> {t("empPayroll.title")}
            </h1>
            <p className="text-sm text-muted-foreground">{t("empPayroll.subtitle")}</p>
          </div>
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : payrolls.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">{t("empPayroll.empty")}</p>
              <p className="text-sm">{t("empPayroll.emptyDesc")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {payrolls.map((p) => (
              <Card key={p.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDetailItem(p)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{monthsLong[p.month - 1]} {p.year}</p>
                      <p className="text-sm text-muted-foreground">{t("empPayroll.basicSalary")}: {formatRupiah(p.basic_salary)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">{formatRupiah(p.take_home_pay)}</p>
                      <Badge variant="outline" className="text-[10px]">{t("empPayroll.thp")}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!detailItem} onOpenChange={(open) => !open && setDetailItem(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("empPayroll.detailTitle")}</DialogTitle>
            <DialogDescription>{profile?.full_name} — {detailItem && `${monthsLong[detailItem.month - 1]} ${detailItem.year}`}</DialogDescription>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 border-b border-border pb-3">
                <span className="text-muted-foreground">Gaji Pokok</span>
                <span className="text-right font-medium">{formatRupiah(detailItem.basic_salary)}</span>
                <span className="text-muted-foreground">Tunjangan Kehadiran</span>
                <span className="text-right">{formatRupiah(Math.max(0, detailItem.allowance - (Number(profile?.tunjangan_komunikasi) || 0) - (Number(profile?.tunjangan_jabatan) || 0) - (Number(profile?.tunjangan_operasional) || 0) - (detailItem.thr || 0) - (detailItem.tunjangan_kesehatan || 0) - (detailItem.insentif_kinerja || 0) - (detailItem.insentif_penjualan || 0) - (detailItem.bonus_tahunan || 0) - (detailItem.bonus_lainnya || 0) - (detailItem.pengembalian_employee || 0)))}</span>
                {(detailItem.thr || 0) > 0 && <>
                  <span className="text-muted-foreground">THR</span>
                  <span className="text-right">{formatRupiah(detailItem.thr)}</span>
                </>}
                {(detailItem.tunjangan_kesehatan || 0) > 0 && <>
                  <span className="text-muted-foreground">Tunjangan Kesehatan</span>
                  <span className="text-right">{formatRupiah(detailItem.tunjangan_kesehatan)}</span>
                </>}
                {(detailItem.insentif_kinerja || 0) > 0 && <>
                  <span className="text-muted-foreground">Insentif Kinerja</span>
                  <span className="text-right">{formatRupiah(detailItem.insentif_kinerja)}</span>
                </>}
                {(detailItem.insentif_penjualan || 0) > 0 && <>
                  <span className="text-muted-foreground">Insentif Penjualan</span>
                  <span className="text-right">{formatRupiah(detailItem.insentif_penjualan)}</span>
                </>}
                {(detailItem.bonus_tahunan || 0) > 0 && <>
                  <span className="text-muted-foreground">Bonus Tahunan</span>
                  <span className="text-right">{formatRupiah(detailItem.bonus_tahunan)}</span>
                </>}
                {(detailItem.bonus_lainnya || 0) > 0 && <>
                  <span className="text-muted-foreground">Bonus Lainnya</span>
                  <span className="text-right">{formatRupiah(detailItem.bonus_lainnya)}</span>
                </>}
                {(detailItem.pengembalian_employee || 0) > 0 && <>
                  <span className="text-muted-foreground">Pengembalian Karyawan</span>
                  <span className="text-right">{formatRupiah(detailItem.pengembalian_employee)}</span>
                </>}
                <span className="text-muted-foreground">Lembur ({detailItem.overtime_hours} jam)</span>
                <span className="text-right">{formatRupiah(detailItem.overtime_total)}</span>
              </div>
              {/* Fixed Allowances Breakdown */}
              {((Number((profile as any)?.tunjangan_komunikasi) || 0) + (Number((profile as any)?.tunjangan_jabatan) || 0) + (Number((profile as any)?.tunjangan_operasional) || 0)) > 0 && (
                <div className="grid grid-cols-2 gap-2 border-b border-border pb-3 bg-muted/30 rounded p-2">
                  <span className="col-span-2 text-xs font-semibold text-muted-foreground mb-1">📋 Tunjangan Tetap</span>
                  {(Number((profile as any)?.tunjangan_komunikasi) || 0) > 0 && <>
                    <span className="text-muted-foreground text-xs">Tunjangan Komunikasi</span>
                    <span className="text-right text-xs">{formatRupiah(Number((profile as any)?.tunjangan_komunikasi))}</span>
                  </>}
                  {(Number((profile as any)?.tunjangan_jabatan) || 0) > 0 && <>
                    <span className="text-muted-foreground text-xs">Tunjangan Jabatan</span>
                    <span className="text-right text-xs">{formatRupiah(Number((profile as any)?.tunjangan_jabatan))}</span>
                  </>}
                  {(Number((profile as any)?.tunjangan_operasional) || 0) > 0 && <>
                    <span className="text-muted-foreground text-xs">Tunjangan Operasional</span>
                    <span className="text-right text-xs">{formatRupiah(Number((profile as any)?.tunjangan_operasional))}</span>
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
                <span className="text-muted-foreground">PPh 21 / bulan</span>
                <span className="text-right text-destructive font-medium">-{formatRupiah(detailItem.pph21_monthly)}</span>
              </div>

              {/* Employer BPJS section */}
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

      <EmployeeBottomNav />
    </div>
  );
};

export default EmployeePayrollHistory;

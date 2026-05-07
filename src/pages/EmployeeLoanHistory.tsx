import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, LogOut, Wallet, CreditCard, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { EmployeeBottomNav } from "@/components/EmployeeBottomNav";
import logo from "@/assets/logo.png";

interface Loan {
  id: string;
  loan_type: string;
  total_amount: number;
  monthly_installment: number;
  total_installments: number;
  paid_installments: number;
  remaining_amount: number;
  start_date: string;
  status: string;
  description: string | null;
  created_at: string;
}

interface Installment {
  id: string;
  installment_number: number;
  amount: number;
  status: string;
  payment_date: string | null;
  payroll_period_id: string | null;
  period_label?: string | null;
}

const EmployeeLoanHistory = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { t, i18n } = useTranslation();
  const dateLocaleStr = i18n.resolvedLanguage?.startsWith("en") ? "en-US" : "id-ID";
  const monthsLong = (t("common.monthsLong", { returnObjects: true }) as string[]) || [];
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loadingInstallments, setLoadingInstallments] = useState(false);

  useEffect(() => {
    fetchLoans();
  }, []);

  const fetchLoans = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("employee_loans")
      .select("*")
      .order("created_at", { ascending: false });
    setLoans(data || []);
    setLoading(false);
  };

  const openDetail = async (loan: Loan) => {
    setSelectedLoan(loan);
    setLoadingInstallments(true);
    const { data } = await supabase
      .from("loan_installments")
      .select("*")
      .eq("loan_id", loan.id)
      .order("installment_number", { ascending: true });
    const insts = (data || []) as Installment[];

    const periodIds = Array.from(new Set(insts.map(i => i.payroll_period_id).filter(Boolean) as string[]));
    const periodMap = new Map<string, string>();
    if (periodIds.length > 0) {
      const { data: periods } = await supabase
        .from("payroll_periods")
        .select("id, month, year")
        .in("id", periodIds);
      (periods || []).forEach((p: any) => {
        periodMap.set(p.id, `${monthsLong[p.month - 1]} ${p.year}`);
      });
    }
    setInstallments(insts.map(i => ({
      ...i,
      period_label: i.payroll_period_id ? (periodMap.get(i.payroll_period_id) || null) : null,
    })));
    setLoadingInstallments(false);
  };

  const fmt = (n: number) => new Intl.NumberFormat(dateLocaleStr).format(n);

  const statusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200">{t("empLoan.active")}</Badge>;
      case "completed": return <Badge className="bg-green-500/10 text-green-600 border-green-200">{t("empLoan.completed")}</Badge>;
      case "cancelled": return <Badge variant="destructive">{t("empLoan.cancelled")}</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const totalActive = loans.filter(l => l.status === "active").reduce((s, l) => s + Number(l.remaining_amount), 0);

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
        <div>
          <h1 className="text-2xl font-bold">Pinjaman Saya</h1>
          <p className="text-muted-foreground">Lihat daftar pinjaman dan progress cicilan</p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <Wallet className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Total Pinjaman</p>
              <p className="font-bold">{loans.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <CreditCard className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Sisa Pinjaman</p>
              <p className="font-bold text-sm">Rp {fmt(totalActive)}</p>
            </CardContent>
          </Card>
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground py-8">Memuat...</p>
        ) : loans.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">Belum ada pinjaman</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {loans.map(loan => {
              const progress = loan.total_installments > 0 ? (loan.paid_installments / loan.total_installments) * 100 : 0;
              return (
                <Card key={loan.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openDetail(loan)}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold capitalize">{loan.loan_type}</p>
                        <p className="text-xs text-muted-foreground">{new Date(loan.start_date).toLocaleDateString("id-ID")}</p>
                      </div>
                      {statusBadge(loan.status)}
                    </div>
                    {loan.description && <p className="text-sm text-muted-foreground">{loan.description}</p>}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">Total</p>
                        <p className="font-medium">Rp {fmt(Number(loan.total_amount))}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Cicilan/bln</p>
                        <p className="font-medium">Rp {fmt(Number(loan.monthly_installment))}</p>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{loan.paid_installments}/{loan.total_installments} cicilan</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLoan} onOpenChange={() => setSelectedLoan(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detail Pinjaman</DialogTitle>
          </DialogHeader>
          {selectedLoan && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted-foreground">Jenis</p><p className="font-medium capitalize">{selectedLoan.loan_type}</p></div>
                <div><p className="text-muted-foreground">Status</p>{statusBadge(selectedLoan.status)}</div>
                <div><p className="text-muted-foreground">Total Pinjaman</p><p className="font-medium">Rp {fmt(Number(selectedLoan.total_amount))}</p></div>
                <div><p className="text-muted-foreground">Sisa</p><p className="font-medium">Rp {fmt(Number(selectedLoan.remaining_amount))}</p></div>
                <div><p className="text-muted-foreground">Cicilan/bulan</p><p className="font-medium">Rp {fmt(Number(selectedLoan.monthly_installment))}</p></div>
                <div><p className="text-muted-foreground">Mulai</p><p className="font-medium">{new Date(selectedLoan.start_date).toLocaleDateString("id-ID")}</p></div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Riwayat Cicilan</h4>
                {loadingInstallments ? (
                  <p className="text-sm text-muted-foreground">Memuat...</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Periode</TableHead>
                        <TableHead>Jumlah</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {installments.map(inst => (
                        <TableRow key={inst.id}>
                          <TableCell>{inst.installment_number}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{inst.period_label || "-"}</TableCell>
                          <TableCell>Rp {fmt(Number(inst.amount))}</TableCell>
                          <TableCell>
                            {inst.status === "paid" ? (
                              <span className="flex items-center gap-1 text-green-600 text-xs">
                                <CheckCircle className="h-3 w-3" /> Lunas
                              </span>
                            ) : inst.status === "scheduled" ? (
                              <span className="text-xs text-blue-600">Terjadwal</span>
                            ) : inst.status === "skipped" ? (
                              <span className="text-xs text-muted-foreground">Skip</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Belum</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <EmployeeBottomNav />
    </div>
  );
};

export default EmployeeLoanHistory;

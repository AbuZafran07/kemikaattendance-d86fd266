import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatRupiah } from "@/lib/payrollCalculation";
import { Plus, Loader2, CreditCard, Eye, Ban, CheckCircle2, Clock, Trash2, Pencil } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface Loan {
  id: string;
  user_id: string;
  loan_type: string;
  description: string | null;
  total_amount: number;
  monthly_installment: number;
  total_installments: number;
  paid_installments: number;
  remaining_amount: number;
  status: string;
  start_date: string;
  created_at: string;
  employee_name?: string;
  departemen?: string;
}

interface Installment {
  id: string;
  loan_id: string;
  installment_number: number;
  amount: number;
  payment_date: string | null;
  payroll_period_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  period_label?: string | null;
}

const LoanManagement = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [installmentsLoading, setInstallmentsLoading] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; full_name: string; departemen: string }[]>([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [creating, setCreating] = useState(false);
  const [loanToDelete, setLoanToDelete] = useState<Loan | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [loanToEdit, setLoanToEdit] = useState<Loan | null>(null);
  const [updating, setUpdating] = useState(false);
  const [editForm, setEditForm] = useState({
    loan_type: "pinjaman",
    description: "",
    total_amount: "",
    total_installments: "",
    start_date: format(new Date(), "yyyy-MM-dd"),
  });

  const [form, setForm] = useState({
    user_id: "",
    loan_type: "pinjaman",
    description: "",
    total_amount: "",
    total_installments: "",
    start_date: format(new Date(), "yyyy-MM-dd"),
  });

  useEffect(() => { fetchLoans(); fetchEmployees(); }, []);

  const fetchEmployees = async () => {
    const { data } = await supabase.from("profiles").select("id, full_name, departemen").eq("status", "Active").order("full_name");
    setEmployees(data || []);
  };

  const fetchLoans = async () => {
    setLoading(true);
    try {
      let query = supabase.from("employee_loans").select("*").order("created_at", { ascending: false });
      if (filterStatus !== "all") query = query.eq("status", filterStatus);
      const { data: loansData } = await query;

      if (!loansData || loansData.length === 0) { setLoans([]); setLoading(false); return; }

      const userIds = [...new Set(loansData.map(l => l.user_id))];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, departemen").in("id", userIds);
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      setLoans(loansData.map(l => ({
        ...l,
        employee_name: profileMap.get(l.user_id)?.full_name || "Unknown",
        departemen: profileMap.get(l.user_id)?.departemen || "-",
      })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLoans(); }, [filterStatus]);

  const handleCreate = async () => {
    if (!form.user_id || !form.total_amount || !form.total_installments) {
      toast({ title: "Data belum lengkap", description: "Isi semua field yang diperlukan.", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const totalAmount = Number(form.total_amount);
      const totalInstallments = Number(form.total_installments);
      const monthlyInstallment = Math.ceil(totalAmount / totalInstallments);

      const { data: loan, error } = await supabase
        .from("employee_loans")
        .insert({
          user_id: form.user_id,
          loan_type: form.loan_type,
          description: form.description || null,
          total_amount: totalAmount,
          monthly_installment: monthlyInstallment,
          total_installments: totalInstallments,
          paid_installments: 0,
          remaining_amount: totalAmount,
          status: "active",
          start_date: form.start_date,
          created_by: user?.id,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Create installment records
      const installmentRecords = Array.from({ length: totalInstallments }, (_, i) => {
        const isLast = i === totalInstallments - 1;
        const amount = isLast ? totalAmount - monthlyInstallment * (totalInstallments - 1) : monthlyInstallment;
        return {
          loan_id: loan.id,
          installment_number: i + 1,
          amount: Math.max(0, amount),
          status: "pending",
        };
      });

      const { error: instError } = await supabase.from("loan_installments").insert(installmentRecords);
      if (instError) throw instError;

      toast({ title: "Pinjaman Dibuat", description: `${totalInstallments}x cicilan @ ${formatRupiah(monthlyInstallment)}` });
      setShowCreateDialog(false);
      setForm({ user_id: "", loan_type: "pinjaman", description: "", total_amount: "", total_installments: "", start_date: format(new Date(), "yyyy-MM-dd") });
      fetchLoans();
    } catch (e: any) {
      toast({ title: "Gagal", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const openDetail = async (loan: Loan) => {
    setSelectedLoan(loan);
    setShowDetailDialog(true);
    setInstallmentsLoading(true);
    const { data } = await supabase
      .from("loan_installments")
      .select("*")
      .eq("loan_id", loan.id)
      .order("installment_number");
    const insts = (data || []) as Installment[];

    // Fetch period labels (month/year) for installments tied to a payroll period
    const periodIds = Array.from(new Set(insts.map(i => i.payroll_period_id).filter(Boolean) as string[]));
    const periodMap = new Map<string, string>();
    if (periodIds.length > 0) {
      const { data: periods } = await supabase
        .from("payroll_periods")
        .select("id, month, year")
        .in("id", periodIds);
      const monthNames = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
      (periods || []).forEach((p: any) => {
        periodMap.set(p.id, `${monthNames[p.month - 1]} ${p.year}`);
      });
    }
    setInstallments(insts.map(i => ({
      ...i,
      period_label: i.payroll_period_id ? (periodMap.get(i.payroll_period_id) || null) : null,
    })));
    setInstallmentsLoading(false);
  };

  const cancelLoan = async (loanId: string) => {
    try {
      await supabase.from("employee_loans").update({ status: "cancelled" }).eq("id", loanId);
      // Cancel pending installments
      await supabase.from("loan_installments").update({ status: "skipped" }).eq("loan_id", loanId).eq("status", "pending");
      toast({ title: "Pinjaman Dibatalkan" });
      fetchLoans();
      setShowDetailDialog(false);
    } catch (e: any) {
      toast({ title: "Gagal", description: e.message, variant: "destructive" });
    }
  };

  const handleDeleteLoan = async () => {
    if (!loanToDelete) return;
    setDeleting(true);
    try {
      // Revert any "paid" installments first to restore counters on draft payroll periods.
      // Then delete installments (FK ON DELETE CASCADE will also handle this, but we explicitly
      // remove to keep audit clarity).
      await supabase.from("loan_installments").delete().eq("loan_id", loanToDelete.id);
      const { error } = await supabase.from("employee_loans").delete().eq("id", loanToDelete.id);
      if (error) throw error;
      toast({ title: "Pinjaman Dihapus", description: `Pinjaman ${loanToDelete.employee_name || ""} berhasil dihapus.` });
      setLoanToDelete(null);
      setShowDetailDialog(false);
      fetchLoans();
    } catch (e: any) {
      toast({ title: "Gagal Menghapus", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (loan: Loan) => {
    if (loan.paid_installments > 0) {
      toast({
        title: "Tidak Bisa Diedit",
        description: "Pinjaman ini sudah memiliki cicilan yang terbayar. Hapus dan buat ulang jika perlu mengubah.",
        variant: "destructive",
      });
      return;
    }
    setLoanToEdit(loan);
    setEditForm({
      loan_type: loan.loan_type,
      description: loan.description || "",
      total_amount: String(loan.total_amount),
      total_installments: String(loan.total_installments),
      start_date: loan.start_date,
    });
    setShowEditDialog(true);
  };

  const handleUpdateLoan = async () => {
    if (!loanToEdit) return;
    if (!editForm.total_amount || !editForm.total_installments) {
      toast({ title: "Data belum lengkap", description: "Isi semua field yang diperlukan.", variant: "destructive" });
      return;
    }
    setUpdating(true);
    try {
      const totalAmount = Number(editForm.total_amount);
      const totalInstallments = Number(editForm.total_installments);
      const monthlyInstallment = Math.ceil(totalAmount / totalInstallments);

      const { error: updErr } = await supabase
        .from("employee_loans")
        .update({
          loan_type: editForm.loan_type,
          description: editForm.description || null,
          total_amount: totalAmount,
          monthly_installment: monthlyInstallment,
          total_installments: totalInstallments,
          remaining_amount: totalAmount,
          start_date: editForm.start_date,
        })
        .eq("id", loanToEdit.id);
      if (updErr) throw updErr;

      // Regenerate installments (safe: paid_installments = 0)
      await supabase.from("loan_installments").delete().eq("loan_id", loanToEdit.id);
      const installmentRecords = Array.from({ length: totalInstallments }, (_, i) => {
        const isLast = i === totalInstallments - 1;
        const amount = isLast ? totalAmount - monthlyInstallment * (totalInstallments - 1) : monthlyInstallment;
        return {
          loan_id: loanToEdit.id,
          installment_number: i + 1,
          amount: Math.max(0, amount),
          status: "pending",
        };
      });
      const { error: instErr } = await supabase.from("loan_installments").insert(installmentRecords);
      if (instErr) throw instErr;

      toast({ title: "Pinjaman Diperbarui", description: `${totalInstallments}x cicilan @ ${formatRupiah(monthlyInstallment)}` });
      setShowEditDialog(false);
      setLoanToEdit(null);
      fetchLoans();
    } catch (e: any) {
      toast({ title: "Gagal Memperbarui", description: e.message, variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  };
    switch (status) {
      case "active": return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200">Aktif</Badge>;
      case "completed": return <Badge className="bg-green-500/10 text-green-600 border-green-200">Lunas</Badge>;
      case "cancelled": return <Badge variant="destructive">Dibatalkan</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const instStatusBadge = (status: string) => {
    switch (status) {
      case "paid": return <Badge className="bg-green-500/10 text-green-600 border-green-200 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Lunas</Badge>;
      case "scheduled": return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200 text-[10px]"><Clock className="h-3 w-3 mr-1" />Terjadwal</Badge>;
      case "pending": return <Badge variant="outline" className="text-[10px]"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "skipped": return <Badge variant="secondary" className="text-[10px]">Skip</Badge>;
      default: return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
    }
  };

  const totalActiveLoans = loans.filter(l => l.status === "active").length;
  const totalRemainingAmount = loans.filter(l => l.status === "active").reduce((s, l) => s + l.remaining_amount, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CreditCard className="h-7 w-7 text-primary" /> Manajemen Potongan
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Kelola pinjaman, kasbon, dan potongan lain karyawan dengan tracking cicilan otomatis
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua</SelectItem>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="completed">Lunas</SelectItem>
                <SelectItem value="cancelled">Dibatalkan</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Tambah Potongan
            </Button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardContent className="pt-6"><p className="text-2xl font-bold">{loans.length}</p><p className="text-xs text-muted-foreground">Total Potongan</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-2xl font-bold">{totalActiveLoans}</p><p className="text-xs text-muted-foreground">Potongan Aktif</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-lg font-bold">{formatRupiah(totalRemainingAmount)}</p><p className="text-xs text-muted-foreground">Total Sisa Potongan</p></CardContent></Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Daftar Potongan Karyawan</CardTitle>
            <CardDescription>Klik baris untuk melihat detail cicilan</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : loans.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Belum ada data pinjaman</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Karyawan</TableHead>
                      <TableHead>Tipe</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                      <TableHead className="text-right">Cicilan/bln</TableHead>
                      <TableHead className="text-center">Progress</TableHead>
                      <TableHead className="text-right">Sisa</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loans.map((loan) => (
                      <TableRow key={loan.id} className="cursor-pointer hover:bg-accent/50" onClick={() => openDetail(loan)}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{loan.employee_name}</p>
                            <p className="text-xs text-muted-foreground">{loan.departemen}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] capitalize">{loan.loan_type}</Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm">{formatRupiah(loan.total_amount)}</TableCell>
                        <TableCell className="text-right text-sm">{formatRupiah(loan.monthly_installment)}</TableCell>
                        <TableCell className="text-center text-sm">
                          {loan.paid_installments}/{loan.total_installments}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatRupiah(loan.remaining_amount)}</TableCell>
                        <TableCell>{statusBadge(loan.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={(e) => { e.stopPropagation(); openDetail(loan); }}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => { e.stopPropagation(); setLoanToDelete(loan); }}
                              title="Hapus pinjaman"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Tambah Potongan Baru</DialogTitle>
              <DialogDescription>Buat pinjaman atau kasbon baru untuk karyawan</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Karyawan</Label>
                <Select value={form.user_id} onValueChange={(v) => setForm(f => ({ ...f, user_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih karyawan" /></SelectTrigger>
                  <SelectContent>
                    {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name} — {e.departemen}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipe</Label>
                <Select value={form.loan_type} onValueChange={(v) => setForm(f => ({ ...f, loan_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pinjaman">Pinjaman</SelectItem>
                    <SelectItem value="kasbon">Kasbon</SelectItem>
                    <SelectItem value="potongan_lain">Potongan Lain</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Jumlah Pinjaman (Rp)</Label>
                <Input type="number" value={form.total_amount} onChange={(e) => setForm(f => ({ ...f, total_amount: e.target.value }))} placeholder="5000000" />
              </div>
              <div>
                <Label>Jumlah Cicilan (bulan)</Label>
                <Input type="number" value={form.total_installments} onChange={(e) => setForm(f => ({ ...f, total_installments: e.target.value }))} placeholder="12" />
              </div>
              {form.total_amount && form.total_installments && (
                <p className="text-sm text-muted-foreground">
                  Cicilan/bulan: <span className="font-semibold text-foreground">{formatRupiah(Math.ceil(Number(form.total_amount) / Number(form.total_installments)))}</span>
                </p>
              )}
              <div>
                <Label>Tanggal Mulai</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div>
                <Label>Keterangan</Label>
                <Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Keterangan pinjaman..." rows={2} />
              </div>
              <Button onClick={handleCreate} disabled={creating} className="w-full gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Buat Pinjaman
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Detail Dialog */}
        <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detail Pinjaman</DialogTitle>
              <DialogDescription>{selectedLoan?.employee_name}</DialogDescription>
            </DialogHeader>
            {selectedLoan && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Tipe</span>
                  <span className="capitalize font-medium">{selectedLoan.loan_type}</span>
                  <span className="text-muted-foreground">Total Pinjaman</span>
                  <span className="font-medium">{formatRupiah(selectedLoan.total_amount)}</span>
                  <span className="text-muted-foreground">Cicilan/bulan</span>
                  <span>{formatRupiah(selectedLoan.monthly_installment)}</span>
                  <span className="text-muted-foreground">Progress</span>
                  <span>{selectedLoan.paid_installments}/{selectedLoan.total_installments} cicilan</span>
                  <span className="text-muted-foreground">Sisa</span>
                  <span className="font-bold text-primary">{formatRupiah(selectedLoan.remaining_amount)}</span>
                  <span className="text-muted-foreground">Status</span>
                  <span>{statusBadge(selectedLoan.status)}</span>
                  {selectedLoan.description && <>
                    <span className="text-muted-foreground">Keterangan</span>
                    <span>{selectedLoan.description}</span>
                  </>}
                </div>

                {/* Progress bar */}
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary rounded-full h-2 transition-all"
                    style={{ width: `${(selectedLoan.paid_installments / selectedLoan.total_installments) * 100}%` }}
                  />
                </div>

                {/* Installments */}
                <div>
                  <p className="font-semibold text-sm mb-2">Riwayat Cicilan</p>
                  {installmentsLoading ? (
                    <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {installments.map(inst => (
                        <div key={inst.id} className="flex items-center justify-between border border-border rounded-lg p-3">
                          <div>
                            <p className="text-sm font-medium">Cicilan #{inst.installment_number}</p>
                            {inst.period_label && <p className="text-xs text-muted-foreground">Periode {inst.period_label}</p>}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium">{formatRupiah(inst.amount)}</span>
                            {instStatusBadge(inst.status)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedLoan.status === "active" && (
                  <Button variant="destructive" onClick={() => cancelLoan(selectedLoan.id)} className="w-full gap-2">
                    <Ban className="h-4 w-4" /> Batalkan Pinjaman
                  </Button>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!loanToDelete} onOpenChange={(open) => { if (!open) setLoanToDelete(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus Pinjaman?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    Anda akan menghapus pinjaman <strong>{loanToDelete?.employee_name}</strong> sebesar{" "}
                    <strong>{loanToDelete ? formatRupiah(loanToDelete.total_amount) : ""}</strong>.
                  </p>
                  <p className="text-destructive font-medium">
                    Tindakan ini permanen dan akan menghapus seluruh riwayat cicilannya. Tidak dapat dibatalkan.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteLoan}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Hapus Permanen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
};

export default LoanManagement;

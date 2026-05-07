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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, Loader2, CreditCard, Eye, Ban, CheckCircle2, Clock, Trash2, Pencil, Archive, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { id as idLocale, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";

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
  nik?: string;
  archived_at?: string | null;
  archived_reason?: string | null;
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
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.resolvedLanguage?.startsWith("en") ? enUS : idLocale;
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [installmentsLoading, setInstallmentsLoading] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; full_name: string; departemen: string }[]>([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [view, setView] = useState<"active" | "archived">("active");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);
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
      const { data: loansData } = await supabase
        .from("employee_loans")
        .select("*")
        .order("created_at", { ascending: false });

      if (!loansData || loansData.length === 0) { setLoans([]); setLoading(false); return; }

      const userIds = [...new Set(loansData.map(l => l.user_id))];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, departemen, nik").in("id", userIds);
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      // For loans yang sudah completed/cancelled, ambil tanggal arsip (terakhir diubah / terakhir bayar)
      const archivedIds = loansData.filter(l => l.status === "completed" || l.status === "cancelled").map(l => l.id);
      const archivedDateMap = new Map<string, string>();
      if (archivedIds.length > 0) {
        const { data: lastPaid } = await supabase
          .from("loan_installments")
          .select("loan_id, payment_date")
          .in("loan_id", archivedIds)
          .eq("status", "paid")
          .order("payment_date", { ascending: false });
        (lastPaid || []).forEach((r: any) => {
          if (r.payment_date && !archivedDateMap.has(r.loan_id)) {
            archivedDateMap.set(r.loan_id, r.payment_date);
          }
        });
      }

      setLoans(loansData.map(l => {
        const isArchived = l.status === "completed" || l.status === "cancelled";
        return {
          ...l,
          employee_name: profileMap.get(l.user_id)?.full_name || "Unknown",
          departemen: profileMap.get(l.user_id)?.departemen || "-",
          nik: (profileMap.get(l.user_id) as any)?.nik || "",
          archived_at: isArchived ? (archivedDateMap.get(l.id) || (l as any).updated_at || l.created_at) : null,
          archived_reason: l.status === "completed"
            ? t("loanMgmt.archive.completed")
            : l.status === "cancelled"
              ? t("loanMgmt.archive.cancelled")
              : null,
        };
      }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setCurrentPage(1); }, [filterStatus, pageSize, searchQuery, view]);

  const handleCreate = async () => {
    if (!form.user_id || !form.total_amount || !form.total_installments) {
      toast({ title: t("loanMgmt.toast.incompleteTitle"), description: t("loanMgmt.toast.incompleteDesc"), variant: "destructive" });
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

      toast({ title: t("loanMgmt.toast.createdTitle"), description: t("loanMgmt.toast.createdDesc", { n: totalInstallments, amount: formatRupiah(monthlyInstallment) }) });
      setShowCreateDialog(false);
      setForm({ user_id: "", loan_type: "pinjaman", description: "", total_amount: "", total_installments: "", start_date: format(new Date(), "yyyy-MM-dd") });
      fetchLoans();
    } catch (e: any) {
      toast({ title: t("loanMgmt.toast.failedTitle"), description: e.message, variant: "destructive" });
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
      toast({ title: t("loanMgmt.toast.cancelled") });
      fetchLoans();
      setShowDetailDialog(false);
    } catch (e: any) {
      toast({ title: t("loanMgmt.toast.failedTitle"), description: e.message, variant: "destructive" });
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
      toast({ title: t("loanMgmt.toast.deletedTitle"), description: t("loanMgmt.toast.deletedDesc", { name: loanToDelete.employee_name || "" }) });
      setLoanToDelete(null);
      setShowDetailDialog(false);
      fetchLoans();
    } catch (e: any) {
      toast({ title: t("loanMgmt.toast.deleteFailedTitle"), description: e.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (loan: Loan) => {
    if (loan.paid_installments > 0) {
      toast({
        title: t("loanMgmt.toast.cantEditTitle"),
        description: t("loanMgmt.toast.cantEditDesc"),
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
      toast({ title: t("loanMgmt.toast.incompleteTitle"), description: t("loanMgmt.toast.incompleteDesc"), variant: "destructive" });
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

      toast({ title: t("loanMgmt.toast.updatedTitle"), description: t("loanMgmt.toast.createdDesc", { n: totalInstallments, amount: formatRupiah(monthlyInstallment) }) });
      setShowEditDialog(false);
      setLoanToEdit(null);
      fetchLoans();
    } catch (e: any) {
      toast({ title: t("loanMgmt.toast.updateFailedTitle"), description: e.message, variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200">{t("loanMgmt.status.active")}</Badge>;
      case "completed": return <Badge className="bg-green-500/10 text-green-600 border-green-200">{t("loanMgmt.status.completed")}</Badge>;
      case "cancelled": return <Badge variant="destructive">{t("loanMgmt.status.cancelled")}</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const instStatusBadge = (status: string) => {
    switch (status) {
      case "paid": return <Badge className="bg-green-500/10 text-green-600 border-green-200 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />{t("loanMgmt.instStatus.paid")}</Badge>;
      case "scheduled": return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200 text-[10px]"><Clock className="h-3 w-3 mr-1" />{t("loanMgmt.instStatus.scheduled")}</Badge>;
      case "pending": return <Badge variant="outline" className="text-[10px]"><Clock className="h-3 w-3 mr-1" />{t("loanMgmt.instStatus.pending")}</Badge>;
      case "skipped": return <Badge variant="secondary" className="text-[10px]">{t("loanMgmt.instStatus.skipped")}</Badge>;
      default: return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
    }
  };

  const totalActiveLoans = loans.filter(l => l.status === "active").length;
  const totalRemainingAmount = loans.filter(l => l.status === "active").reduce((s, l) => s + l.remaining_amount, 0);
  const archivedCount = loans.filter(l => l.status === "completed" || l.status === "cancelled").length;
  const normalizedQuery = searchQuery.trim().toLowerCase();
  // View split: archived = lunas (completed) + dibatalkan. Active view = aktif saja.
  const viewLoans = view === "archived"
    ? loans.filter(l => l.status === "completed" || l.status === "cancelled")
    : loans.filter(l => l.status === "active");
  const statusFilteredLoans = (view === "active" && filterStatus !== "all")
    ? viewLoans.filter(l => l.status === filterStatus)
    : viewLoans;
  const filteredLoans = normalizedQuery
    ? statusFilteredLoans.filter(l =>
        (l.employee_name || "").toLowerCase().includes(normalizedQuery) ||
        (l.nik || "").toLowerCase().includes(normalizedQuery) ||
        (l.departemen || "").toLowerCase().includes(normalizedQuery)
      )
    : statusFilteredLoans;
  const totalPages = Math.max(1, Math.ceil(filteredLoans.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedLoans = filteredLoans.slice((safePage - 1) * pageSize, safePage * pageSize);
  const startIdx = filteredLoans.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(safePage * pageSize, filteredLoans.length);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CreditCard className="h-7 w-7 text-primary" /> {t("loanMgmt.title")}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {t("loanMgmt.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-3 w-full lg:w-auto">
            <Button onClick={() => setShowCreateDialog(true)} className="gap-2 ml-auto">
              <Plus className="h-4 w-4" /> {t("loanMgmt.addDeduction")}
            </Button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardContent className="pt-6"><p className="text-2xl font-bold">{filteredLoans.length}</p><p className="text-xs text-muted-foreground">{t("loanMgmt.summary.totalDeductions")}{normalizedQuery ? t("loanMgmt.summary.filterSuffix") : ""}</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-2xl font-bold">{totalActiveLoans}</p><p className="text-xs text-muted-foreground">{t("loanMgmt.summary.activeDeductions")}</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-lg font-bold">{formatRupiah(totalRemainingAmount)}</p><p className="text-xs text-muted-foreground">{t("loanMgmt.summary.totalRemaining")}</p></CardContent></Card>
        </div>

        {/* Tabs Active / Archived */}
        <Tabs value={view} onValueChange={(v) => setView(v as "active" | "archived")}>
          <TabsList>
            <TabsTrigger value="active" className="gap-2">
              <CreditCard className="h-4 w-4" /> {t("loanMgmt.tabs.active")}
            </TabsTrigger>
            <TabsTrigger value="archived" className="gap-2">
              <Archive className="h-4 w-4" /> {t("loanMgmt.tabs.archived", { count: archivedCount })}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
              <div>
                <CardTitle className="text-lg">
                  {view === "archived" ? t("loanMgmt.list.archivedTitle") : t("loanMgmt.list.activeTitle")}
                </CardTitle>
                <CardDescription>{t("loanMgmt.list.description")}</CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:justify-end">
                <Input
                  placeholder={t("loanMgmt.list.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-[260px] h-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : filteredLoans.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">{normalizedQuery ? t("loanMgmt.list.noMatch") : t("loanMgmt.list.noData")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("loanMgmt.table.employee")}</TableHead>
                      <TableHead>{t("loanMgmt.table.type")}</TableHead>
                      <TableHead className="text-right">{t("loanMgmt.table.amount")}</TableHead>
                      <TableHead className="text-right">{t("loanMgmt.table.monthly")}</TableHead>
                      <TableHead className="text-center">{t("loanMgmt.table.progress")}</TableHead>
                      <TableHead className="text-right">{t("loanMgmt.table.remaining")}</TableHead>
                      <TableHead>{t("loanMgmt.table.status")}</TableHead>
                      <TableHead className="w-[120px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedLoans.map((loan) => (
                      <TableRow key={loan.id} className="cursor-pointer hover:bg-accent/50" onClick={() => openDetail(loan)}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{loan.employee_name}</p>
                            <p className="text-xs text-muted-foreground">{loan.departemen}</p>
                            {view === "archived" && loan.archived_at && (
                              <p className="text-[10px] text-muted-foreground mt-1 italic">
                                {t("loanMgmt.list.archivedAt", { date: format(new Date(loan.archived_at), "dd MMM yyyy", { locale: dateLocale }) })}
                                {loan.archived_reason ? ` • ${loan.archived_reason}` : ""}
                              </p>
                            )}
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
                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={(e) => { e.stopPropagation(); openDetail(loan); }} title={t("loanMgmt.table.viewDetail")}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={(e) => { e.stopPropagation(); openEdit(loan); }}
                              title={t("loanMgmt.table.edit")}
                              disabled={loan.paid_installments > 0 || loan.status !== "active"}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => { e.stopPropagation(); setLoanToDelete(loan); }}
                              title={t("loanMgmt.table.delete")}
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
            {!loading && filteredLoans.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{t("loanMgmt.pagination.show")}</span>
                  <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                    <SelectTrigger className="w-[80px] h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[10, 20, 30, 50].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span>{t("loanMgmt.pagination.of", { total: filteredLoans.length, from: startIdx, to: endIdx })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(safePage - 1)} disabled={safePage <= 1}>{t("loanMgmt.pagination.prev")}</Button>
                  <span className="text-sm">{t("loanMgmt.pagination.page", { current: safePage, total: totalPages })}</span>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(safePage + 1)} disabled={safePage >= totalPages}>{t("loanMgmt.pagination.next")}</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("loanMgmt.create.title")}</DialogTitle>
              <DialogDescription>{t("loanMgmt.create.description")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t("loanMgmt.create.employee")}</Label>
                <Popover open={employeePickerOpen} onOpenChange={setEmployeePickerOpen} modal={true}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className={cn("w-full justify-between font-normal", !form.user_id && "text-muted-foreground")}
                    >
                      {form.user_id
                        ? (() => {
                            const emp = employees.find(e => e.id === form.user_id);
                            return emp ? `${emp.full_name} — ${emp.departemen}` : t("loanMgmt.create.pickEmployee");
                          })()
                        : t("loanMgmt.create.pickEmployee")}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder={t("loanMgmt.create.searchEmployee")} />
                      <CommandList
                        className="max-h-[260px] overflow-y-auto overscroll-contain"
                        onWheel={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                      >
                        <CommandEmpty>{t("loanMgmt.create.noEmployee")}</CommandEmpty>
                        <CommandGroup>
                          {employees.map(e => (
                            <CommandItem
                              key={e.id}
                              value={`${e.full_name} ${e.departemen}`}
                              onSelect={() => {
                                setForm(f => ({ ...f, user_id: e.id }));
                                setEmployeePickerOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", form.user_id === e.id ? "opacity-100" : "opacity-0")} />
                              <span className="flex-1">{e.full_name}</span>
                              <span className="text-xs text-muted-foreground ml-2">{e.departemen}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>{t("loanMgmt.create.type")}</Label>
                <Select value={form.loan_type} onValueChange={(v) => setForm(f => ({ ...f, loan_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pinjaman">{t("loanMgmt.loanType.pinjaman")}</SelectItem>
                    <SelectItem value="kasbon">{t("loanMgmt.loanType.kasbon")}</SelectItem>
                    <SelectItem value="potongan_lain">{t("loanMgmt.loanType.potongan_lain")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("loanMgmt.create.amount")}</Label>
                <Input type="number" value={form.total_amount} onChange={(e) => setForm(f => ({ ...f, total_amount: e.target.value }))} placeholder={t("loanMgmt.create.amountPlaceholder")} />
              </div>
              <div>
                <Label>{t("loanMgmt.create.installments")}</Label>
                <Input type="number" value={form.total_installments} onChange={(e) => setForm(f => ({ ...f, total_installments: e.target.value }))} placeholder={t("loanMgmt.create.installmentsPlaceholder")} />
              </div>
              {form.total_amount && form.total_installments && (
                <p className="text-sm text-muted-foreground">
                  {t("loanMgmt.create.perMonth")}<span className="font-semibold text-foreground">{formatRupiah(Math.ceil(Number(form.total_amount) / Number(form.total_installments)))}</span>
                </p>
              )}
              <div>
                <Label>{t("loanMgmt.create.startDate")}</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div>
                <Label>{t("loanMgmt.create.notes")}</Label>
                <Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t("loanMgmt.create.notesPlaceholder")} rows={2} />
              </div>
              <Button onClick={handleCreate} disabled={creating} className="w-full gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {t("loanMgmt.create.create")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Detail Dialog */}
        <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("loanMgmt.detail.title")}</DialogTitle>
              <DialogDescription>{selectedLoan?.employee_name}</DialogDescription>
            </DialogHeader>
            {selectedLoan && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">{t("loanMgmt.detail.type")}</span>
                  <span className="capitalize font-medium">{t(`loanMgmt.loanType.${selectedLoan.loan_type}`, selectedLoan.loan_type)}</span>
                  <span className="text-muted-foreground">{t("loanMgmt.detail.totalAmount")}</span>
                  <span className="font-medium">{formatRupiah(selectedLoan.total_amount)}</span>
                  <span className="text-muted-foreground">{t("loanMgmt.detail.perMonth")}</span>
                  <span>{formatRupiah(selectedLoan.monthly_installment)}</span>
                  <span className="text-muted-foreground">{t("loanMgmt.detail.progress")}</span>
                  <span>{t("loanMgmt.detail.installmentsCount", { paid: selectedLoan.paid_installments, total: selectedLoan.total_installments })}</span>
                  <span className="text-muted-foreground">{t("loanMgmt.detail.remaining")}</span>
                  <span className="font-bold text-primary">{formatRupiah(selectedLoan.remaining_amount)}</span>
                  <span className="text-muted-foreground">{t("loanMgmt.detail.status")}</span>
                  <span>{statusBadge(selectedLoan.status)}</span>
                  {selectedLoan.description && <>
                    <span className="text-muted-foreground">{t("loanMgmt.detail.notes")}</span>
                    <span>{selectedLoan.description}</span>
                  </>}
                  {selectedLoan.archived_at && (selectedLoan.status === "completed" || selectedLoan.status === "cancelled") && <>
                    <span className="text-muted-foreground">{t("loanMgmt.detail.archivedAt")}</span>
                    <span>{format(new Date(selectedLoan.archived_at), "dd MMM yyyy", { locale: dateLocale })}</span>
                    <span className="text-muted-foreground">{t("loanMgmt.detail.archiveReason")}</span>
                    <span className="italic text-xs">{selectedLoan.archived_reason}</span>
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
                  <p className="font-semibold text-sm mb-2">{t("loanMgmt.detail.history")}</p>
                  {installmentsLoading ? (
                    <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {installments.map(inst => (
                        <div key={inst.id} className="flex items-center justify-between border border-border rounded-lg p-3">
                          <div>
                            <p className="text-sm font-medium">{t("loanMgmt.detail.installmentNo", { n: inst.installment_number })}</p>
                            {inst.period_label && <p className="text-xs text-muted-foreground">{t("loanMgmt.detail.period", { label: inst.period_label })}</p>}
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
                    <Ban className="h-4 w-4" /> {t("loanMgmt.detail.cancel")}
                  </Button>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={showEditDialog} onOpenChange={(open) => { setShowEditDialog(open); if (!open) setLoanToEdit(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("loanMgmt.edit.title")}</DialogTitle>
              <DialogDescription>
                {t("loanMgmt.edit.description", { name: loanToEdit?.employee_name || "" })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t("loanMgmt.create.type")}</Label>
                <Select value={editForm.loan_type} onValueChange={(v) => setEditForm(f => ({ ...f, loan_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pinjaman">{t("loanMgmt.loanType.pinjaman")}</SelectItem>
                    <SelectItem value="kasbon">{t("loanMgmt.loanType.kasbon")}</SelectItem>
                    <SelectItem value="potongan_lain">{t("loanMgmt.loanType.potongan_lain")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("loanMgmt.edit.amount")}</Label>
                <Input type="number" value={editForm.total_amount} onChange={(e) => setEditForm(f => ({ ...f, total_amount: e.target.value }))} />
              </div>
              <div>
                <Label>{t("loanMgmt.create.installments")}</Label>
                <Input type="number" value={editForm.total_installments} onChange={(e) => setEditForm(f => ({ ...f, total_installments: e.target.value }))} />
              </div>
              {editForm.total_amount && editForm.total_installments && (
                <p className="text-sm text-muted-foreground">
                  {t("loanMgmt.create.perMonth")}<span className="font-semibold text-foreground">{formatRupiah(Math.ceil(Number(editForm.total_amount) / Number(editForm.total_installments)))}</span>
                </p>
              )}
              <div>
                <Label>{t("loanMgmt.create.startDate")}</Label>
                <Input type="date" value={editForm.start_date} onChange={(e) => setEditForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div>
                <Label>{t("loanMgmt.create.notes")}</Label>
                <Textarea value={editForm.description} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))} rows={2} />
              </div>
              <Button onClick={handleUpdateLoan} disabled={updating} className="w-full gap-2">
                {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                {t("loanMgmt.edit.save")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!loanToDelete} onOpenChange={(open) => { if (!open) setLoanToDelete(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("loanMgmt.delete.title")}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    {t("loanMgmt.delete.warning1Prefix")}
                    <strong>{loanToDelete?.employee_name}</strong>
                    {t("loanMgmt.delete.warning1Middle")}
                    <strong>{loanToDelete ? formatRupiah(loanToDelete.total_amount) : ""}</strong>
                    {t("loanMgmt.delete.warning1Suffix")}
                  </p>
                  <p className="text-destructive font-medium">
                    {t("loanMgmt.delete.warning2")}
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>{t("loanMgmt.delete.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteLoan}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                {t("loanMgmt.delete.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
};

export default LoanManagement;

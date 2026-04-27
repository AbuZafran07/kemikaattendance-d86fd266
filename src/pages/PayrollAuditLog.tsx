import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Search, ShieldCheck, Eye, Unlock, RefreshCw, Lock } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { formatRupiah } from "@/lib/payrollCalculation";

interface PayrollAuditEntry {
  id: string;
  period_id: string;
  period_month: number;
  period_year: number;
  action_type: "unlock" | "regenerate" | "refinalize";
  performed_by: string;
  reason: string;
  affected_user_id: string | null;
  before_data: Record<string, any> | null;
  after_data: Record<string, any> | null;
  created_at: string;
  performer_name?: string;
  affected_name?: string;
}

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const FIELD_LABELS: Record<string, string> = {
  basic_salary: "Gaji Pokok",
  allowance: "Tunjangan",
  overtime_total: "Total Lembur",
  bruto_income: "Bruto",
  bpjs_kesehatan: "BPJS Kesehatan",
  bpjs_ketenagakerjaan: "BPJS Ketenagakerjaan",
  pph21_monthly: "PPh 21 Bulanan",
  loan_deduction: "Potongan Pinjaman",
  other_deduction: "Potongan Lain",
  thr: "THR",
  bonus_tahunan: "Bonus Tahunan",
  bonus_lainnya: "Bonus Lainnya",
  insentif_kinerja: "Insentif Kinerja",
  insentif_penjualan: "Insentif Penjualan",
  pengembalian_employee: "Pengembalian",
  take_home_pay: "Take Home Pay",
};

const PayrollAuditLog = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<PayrollAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detailItem, setDetailItem] = useState<PayrollAuditEntry | null>(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data: rawLogs } = await supabase
        .from("payroll_audit_logs" as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (!rawLogs) {
        setLogs([]);
        return;
      }

      const userIds = new Set<string>();
      (rawLogs as any[]).forEach((l) => {
        userIds.add(l.performed_by);
        if (l.affected_user_id) userIds.add(l.affected_user_id);
      });

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", Array.from(userIds));

      const nameMap = new Map<string, string>();
      profiles?.forEach((p) => nameMap.set(p.id, p.full_name));

      const enriched: PayrollAuditEntry[] = (rawLogs as any[]).map((l) => ({
        ...l,
        performer_name: nameMap.get(l.performed_by) || "Unknown",
        affected_name: l.affected_user_id ? nameMap.get(l.affected_user_id) : undefined,
      }));

      setLogs(enriched);
    } catch (err) {
      console.error("Error fetching payroll audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case "unlock":
        return <Badge variant="destructive" className="gap-1"><Unlock className="h-3 w-3" />Buka Kunci</Badge>;
      case "regenerate":
        return <Badge variant="secondary" className="gap-1"><RefreshCw className="h-3 w-3" />Generate Ulang</Badge>;
      case "refinalize":
        return <Badge className="gap-1"><Lock className="h-3 w-3" />Finalisasi Ulang</Badge>;
      default:
        return <Badge variant="outline">{action}</Badge>;
    }
  };

  const filtered = logs.filter((l) => {
    if (filterAction !== "all" && l.action_type !== filterAction) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.performer_name?.toLowerCase().includes(q) ||
      l.affected_name?.toLowerCase().includes(q) ||
      l.reason.toLowerCase().includes(q) ||
      `${MONTHS[l.period_month - 1]} ${l.period_year}`.toLowerCase().includes(q)
    );
  });

  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const renderDiff = (before: Record<string, any> | null, after: Record<string, any> | null) => {
    if (!before && !after) return <p className="text-sm text-muted-foreground">Tidak ada data perubahan.</p>;
    const keys = new Set<string>([...Object.keys(before || {}), ...Object.keys(after || {})]);
    const changes: Array<{ field: string; before: any; after: any }> = [];
    keys.forEach((k) => {
      const b = before?.[k];
      const a = after?.[k];
      if (b !== a) changes.push({ field: k, before: b, after: a });
    });

    if (changes.length === 0) {
      return <p className="text-sm text-muted-foreground">Tidak ada nilai yang berubah.</p>;
    }

    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Field</TableHead>
              <TableHead className="text-right">Sebelum</TableHead>
              <TableHead className="text-right">Sesudah</TableHead>
              <TableHead className="text-right">Selisih</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {changes.map((c) => {
              const isNum = typeof c.before === "number" || typeof c.after === "number";
              const diff = isNum ? (Number(c.after || 0) - Number(c.before || 0)) : null;
              return (
                <TableRow key={c.field}>
                  <TableCell className="font-medium">{FIELD_LABELS[c.field] || c.field}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {isNum ? formatRupiah(Number(c.before || 0)) : String(c.before ?? "-")}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {isNum ? formatRupiah(Number(c.after || 0)) : String(c.after ?? "-")}
                  </TableCell>
                  <TableCell className={`text-right font-medium ${diff && diff > 0 ? "text-primary" : diff && diff < 0 ? "text-destructive" : ""}`}>
                    {diff !== null ? (diff > 0 ? "+" : "") + formatRupiah(diff) : "-"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/payroll")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-primary" />
              Audit Log Payroll
            </h1>
            <p className="text-sm text-muted-foreground">
              Riwayat semua aksi revisi payroll yang sudah difinalisasi
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold">{logs.length}</p>
              <p className="text-xs text-muted-foreground">Total Catatan</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold text-destructive">
                {logs.filter((l) => l.action_type === "unlock").length}
              </p>
              <p className="text-xs text-muted-foreground">Buka Kunci</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold text-foreground">
                {logs.filter((l) => l.action_type === "regenerate").length}
              </p>
              <p className="text-xs text-muted-foreground">Generate Ulang</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold text-primary">
                {logs.filter((l) => l.action_type === "refinalize").length}
              </p>
              <p className="text-xs text-muted-foreground">Finalisasi Ulang</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Riwayat Revisi</CardTitle>
            <CardDescription>
              Setiap perubahan tercatat permanen dan tidak dapat dihapus
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari admin, karyawan, alasan, atau periode..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9"
                />
              </div>
              <Select value={filterAction} onValueChange={(v) => { setFilterAction(v); setPage(1); }}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Aksi</SelectItem>
                  <SelectItem value="unlock">Buka Kunci</SelectItem>
                  <SelectItem value="regenerate">Generate Ulang</SelectItem>
                  <SelectItem value="refinalize">Finalisasi Ulang</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Periode</TableHead>
                    <TableHead>Aksi</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Karyawan Terdampak</TableHead>
                    <TableHead>Alasan</TableHead>
                    <TableHead className="text-right">Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Memuat...
                      </TableCell>
                    </TableRow>
                  ) : paginated.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Belum ada catatan audit log payroll
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginated.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(log.created_at), "dd MMM yyyy HH:mm", { locale: idLocale })}
                        </TableCell>
                        <TableCell className="font-medium">
                          {MONTHS[log.period_month - 1]} {log.period_year}
                        </TableCell>
                        <TableCell>{getActionBadge(log.action_type)}</TableCell>
                        <TableCell>{log.performer_name}</TableCell>
                        <TableCell className="text-sm">
                          {log.affected_name || <span className="text-muted-foreground italic">Semua</span>}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-sm" title={log.reason}>
                          {log.reason}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDetailItem(log)}
                            className="gap-1"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <DataTablePagination
              currentPage={page}
              totalItems={filtered.length}
              itemsPerPage={pageSize}
              onPageChange={setPage}
              onItemsPerPageChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!detailItem} onOpenChange={(o) => !o && setDetailItem(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailItem && getActionBadge(detailItem.action_type)}
              Detail Audit Log
            </DialogTitle>
            <DialogDescription>
              {detailItem && (
                <>
                  Periode <strong>{MONTHS[detailItem.period_month - 1]} {detailItem.period_year}</strong>
                  {" • "}
                  {format(new Date(detailItem.created_at), "dd MMMM yyyy HH:mm", { locale: idLocale })}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {detailItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Dilakukan Oleh</p>
                  <p className="font-medium">{detailItem.performer_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Karyawan Terdampak</p>
                  <p className="font-medium">
                    {detailItem.affected_name || <span className="text-muted-foreground italic">Semua karyawan di periode</span>}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-muted-foreground text-xs mb-1">Alasan Revisi</p>
                <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                  {detailItem.reason}
                </div>
              </div>

              {(detailItem.before_data || detailItem.after_data) && (
                <div>
                  <p className="text-muted-foreground text-xs mb-2">Perubahan Data</p>
                  {renderDiff(detailItem.before_data, detailItem.after_data)}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default PayrollAuditLog;

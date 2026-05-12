import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { ArrowLeft, Search, ClipboardList, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { parseLocalDate } from "@/lib/dateUtils";

interface Row {
  request_id: string;
  user_id: string;
  employee_name: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  approved_at: string | null;
  approved_by_name: string;
  created_count: number;
}

const LupaAbsenAuditLog = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: requests, error } = await supabase
        .from("leave_requests")
        .select("id, user_id, start_date, end_date, total_days, reason, approved_at, approved_by, status, leave_type")
        .eq("leave_type", "lupa_absen")
        .eq("status", "approved")
        .order("approved_at", { ascending: false });

      if (error) throw error;
      if (!requests || requests.length === 0) {
        setRows([]);
        return;
      }

      const userIds = [...new Set(requests.flatMap((r) => [r.user_id, r.approved_by]).filter(Boolean) as string[])];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      const nameMap = new Map(profiles?.map((p) => [p.id, p.full_name]) || []);

      // For each request, count attendance rows that match (user_id within date range with auto-input note)
      const enriched: Row[] = await Promise.all(
        requests.map(async (r) => {
          const { count } = await supabase
            .from("attendance")
            .select("id", { count: "exact", head: true })
            .eq("user_id", r.user_id)
            .gte("check_in_time", `${r.start_date}T00:00:00+07:00`)
            .lte("check_in_time", `${r.end_date}T23:59:59+07:00`)
            .ilike("notes", "Auto-input dari pengajuan%Lupa Absen%");

          return {
            request_id: r.id,
            user_id: r.user_id,
            employee_name: nameMap.get(r.user_id) || "Unknown",
            start_date: r.start_date,
            end_date: r.end_date,
            total_days: r.total_days,
            reason: r.reason,
            approved_at: r.approved_at,
            approved_by_name: r.approved_by ? nameMap.get(r.approved_by) || "Admin" : "-",
            created_count: count || 0,
          };
        })
      );

      setRows(enriched);
    } catch (e) {
      console.error("Error fetching lupa absen logs:", e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = rows.filter((r) => {
    const t = searchTerm.toLowerCase();
    return (
      r.employee_name.toLowerCase().includes(t) ||
      r.reason.toLowerCase().includes(t) ||
      r.approved_by_name.toLowerCase().includes(t)
    );
  });

  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const formatDate = (s: string) => format(parseLocalDate(s), "dd MMM yyyy", { locale: idLocale });
  const formatTs = (s: string | null) =>
    s ? format(new Date(s), "dd MMM yyyy HH:mm", { locale: idLocale }) : "-";

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/attendance")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="h-6 w-6" />
              Audit Log Lupa Absen
            </h1>
            <p className="text-muted-foreground text-sm">
              Riwayat attendance otomatis yang dibuat dari pengajuan "Lupa Absen" yang disetujui
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="text-lg">Pengajuan Lupa Absen Disetujui</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari karyawan, alasan..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Memuat data...</div>
            ) : paginated.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Belum ada pengajuan lupa absen yang disetujui</div>
            ) : (
              <>
                <div className="rounded-md border overflow-auto max-h-[60vh]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Disetujui</TableHead>
                        <TableHead>Karyawan</TableHead>
                        <TableHead>Periode</TableHead>
                        <TableHead className="text-center">Hari Diajukan</TableHead>
                        <TableHead className="text-center">Attendance Dibuat</TableHead>
                        <TableHead>Alasan</TableHead>
                        <TableHead>Disetujui Oleh</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginated.map((r) => (
                        <TableRow key={r.request_id}>
                          <TableCell className="whitespace-nowrap text-sm">{formatTs(r.approved_at)}</TableCell>
                          <TableCell className="text-sm font-medium">{r.employee_name}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {formatDate(r.start_date)}
                            {r.start_date !== r.end_date && <> → {formatDate(r.end_date)}</>}
                          </TableCell>
                          <TableCell className="text-center text-sm">{r.total_days}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={r.created_count > 0 ? "default" : "secondary"} className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              {r.created_count}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm max-w-[260px]">
                            <div className="truncate" title={r.reason}>{r.reason}</div>
                          </TableCell>
                          <TableCell className="text-sm">{r.approved_by_name}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <DataTablePagination
                  currentPage={currentPage}
                  totalItems={filtered.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={setItemsPerPage}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default LupaAbsenAuditLog;

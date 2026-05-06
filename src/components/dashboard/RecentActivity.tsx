import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "react-i18next";

interface AttendanceRecord {
  id: string;
  check_in_time: string;
  check_out_time?: string;
  status: string;
  profiles?: {
    full_name: string;
    departemen: string;
    photo_url?: string;
  };
}

interface AbsentEmployee {
  id: string;
  full_name: string;
  departemen: string;
  photo_url?: string;
  absence_reason: "cuti" | "izin" | "sakit" | "tidak_absen";
  leave_type?: string;
}

interface RecentActivityProps {
  data: AttendanceRecord[];
  absentEmployees?: AbsentEmployee[];
}

const RecentActivity = ({ data, absentEmployees = [] }: RecentActivityProps) => {
  const { t } = useTranslation();
  const formatStatus = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      hadir: { label: t("dashboard.recent.status.onTime"), variant: "default" },
      terlambat: { label: t("dashboard.recent.status.late"), variant: "secondary" },
      pulang_cepat: { label: t("dashboard.recent.status.earlyLeave"), variant: "outline" },
      tidak_hadir: { label: t("dashboard.recent.status.absent"), variant: "destructive" },
    };
    return statusMap[status] || { label: status, variant: "outline" as const };
  };

  const formatAbsenceReason = (reason: string, leaveType?: string) => {
    const reasonMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      cuti: { label: leaveType === "cuti_tahunan" ? t("dashboard.recent.absence.annualLeave") : t("dashboard.recent.absence.leave"), variant: "secondary" },
      izin: { label: t("dashboard.recent.absence.permit"), variant: "outline" },
      sakit: { label: t("dashboard.recent.absence.sick"), variant: "destructive" },
      tidak_absen: { label: t("dashboard.recent.absence.noAttendance"), variant: "destructive" },
    };
    return reasonMap[reason] || { label: t("dashboard.recent.absence.default"), variant: "destructive" as const };
  };

  // Cek apakah tanggal check_in adalah hari ini
  const isToday = (dateString: string) => {
    const d = new Date(dateString);
    const today = new Date();

    return (
      d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
    );
  };

  // Filter hanya record absensi hari ini
  const todayRecords = data.filter((record) => isToday(record.check_in_time));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dashboard.recent.title")}</CardTitle>
        <CardDescription>{t("dashboard.recent.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="hadir" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="hadir">{t("dashboard.recent.tabPresent", { count: todayRecords.length })}</TabsTrigger>
            <TabsTrigger value="tidak_masuk">{t("dashboard.recent.tabAbsent", { count: absentEmployees.length })}</TabsTrigger>
          </TabsList>

          <TabsContent value="hadir">
            <div className="space-y-4 max-h-[400px] overflow-y-auto pb-2">
              {todayRecords.length > 0 ? (
                todayRecords.map((record) => {
                  const status = formatStatus(record.status);
                  return (
                    <div
                      key={record.id}
                      className="flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                    >
                      <EmployeeAvatar
                        src={record.profiles?.photo_url}
                        name={record.profiles?.full_name}
                        fallbackClassName="bg-primary/10 text-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{record.profiles?.full_name}</p>
                        <p className="text-xs text-muted-foreground">{record.profiles?.departemen}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant={status.variant} className="mb-1">
                          {status.label}
                        </Badge>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(record.check_in_time).toLocaleTimeString("id-ID", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {record.check_out_time && (
                            <span>
                              {" - "}
                              {new Date(record.check_out_time).toLocaleTimeString("id-ID", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-center text-muted-foreground py-8">Belum ada karyawan hadir hari ini</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="tidak_masuk">
            <div className="space-y-4 max-h-[400px] overflow-y-auto pb-2">
              {absentEmployees.length > 0 ? (
                absentEmployees.map((employee) => {
                  const reason = formatAbsenceReason(employee.absence_reason, employee.leave_type);
                  return (
                    <div
                      key={employee.id}
                      className="flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                    >
                      <EmployeeAvatar
                        src={employee.photo_url}
                        name={employee.full_name}
                        fallbackClassName="bg-destructive/10 text-destructive"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{employee.full_name}</p>
                        <p className="text-xs text-muted-foreground">{employee.departemen}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant={reason.variant}>
                          {reason.label}
                        </Badge>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8">
                  <UserX className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">Semua karyawan hadir hari ini</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default RecentActivity;

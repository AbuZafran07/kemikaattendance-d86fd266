import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { exportToExcelFile } from '@/lib/excelExport';
import logo from "@/assets/logo.png";
import { EmployeeBottomNav } from "@/components/EmployeeBottomNav";
import { useTranslation } from "react-i18next";

const AttendanceHistory = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const dateLocaleStr = i18n.resolvedLanguage?.startsWith("en") ? "en-US" : "id-ID";
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAttendanceHistory();
  }, []);

  const fetchAttendanceHistory = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', profile?.id)
        .order('check_in_time', { ascending: false });

      if (error) throw error;
      setAttendanceRecords(data || []);
    } catch (error) {
      console.error('Error fetching attendance:', error);
      toast({
        title: t("common.error"),
        description: t("attendanceHistory.fetchFail"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const exportToExcel = async () => {
    const exportData = attendanceRecords.map(record => ({
      [t("common.date")]: new Date(record.check_in_time).toLocaleDateString(dateLocaleStr),
      [t("attendanceHistory.checkIn")]: new Date(record.check_in_time).toLocaleTimeString(dateLocaleStr),
      [t("attendanceHistory.checkOut")]: record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString(dateLocaleStr) : '-',
      [t("common.duration") + " (" + t("common.minutes") + ")"]: record.duration_minutes || '-',
      [t("common.status")]: formatStatus(record.status),
      "GPS": record.gps_validated ? t("common.yes") : t("common.no"),
      "Face": record.face_recognition_validated ? t("common.yes") : t("common.no"),
      [t("common.notes")]: record.notes || '-'
    }));

    const fileName = `Attendance_${profile?.full_name}_${new Date().toISOString().split('T')[0]}.xlsx`;
    await exportToExcelFile(exportData, t("attendanceHistory.title"), fileName);

    toast({
      title: t("common.success"),
      description: t("attendanceHistory.exportSuccess"),
    });
  };

  const formatStatus = (status: string) => {
    const statusMap: Record<string, string> = {
      'hadir': t("common.present"),
      'terlambat': t("common.late"),
      'pulang_cepat': t("common.earlyLeave"),
      'tidak_hadir': t("common.absent"),
    };
    return statusMap[status] || status;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 pb-24">
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/employee')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <img src={logo} alt="Kemika" className="h-10 object-contain" />
          </div>
          <Button onClick={exportToExcel} disabled={attendanceRecords.length === 0} size="sm">
            <Download className="h-4 w-4 mr-2" />
            {t("attendanceHistory.export")}
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>{t("attendanceHistory.title")}</CardTitle>
            <CardDescription>
              {t("attendanceHistory.totalRecord", { count: attendanceRecords.length })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">{t("attendanceHistory.loading")}</div>
            ) : attendanceRecords.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {t("attendanceHistory.empty")}
              </div>
            ) : (
              <div className="space-y-4">
                {attendanceRecords.map((record) => (
                  <div key={record.id} className="border border-border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold">
                          {new Date(record.check_in_time).toLocaleDateString(dateLocaleStr, {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatStatus(record.status)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {t("attendanceHistory.checkIn")}: {new Date(record.check_in_time).toLocaleTimeString(dateLocaleStr)}
                        </p>
                        {record.check_out_time && (
                          <p className="text-sm font-medium">
                            {t("attendanceHistory.checkOut")}: {new Date(record.check_out_time).toLocaleTimeString(dateLocaleStr)}
                          </p>
                        )}
                      </div>
                    </div>
                    {record.duration_minutes && (
                      <p className="text-sm text-muted-foreground">
                        {t("attendanceHistory.workDuration", {
                          hours: Math.floor(record.duration_minutes / 60),
                          minutes: record.duration_minutes % 60,
                        })}
                      </p>
                    )}
                    {record.notes && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {record.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <EmployeeBottomNav />
    </div>
  );
};

export default AttendanceHistory;

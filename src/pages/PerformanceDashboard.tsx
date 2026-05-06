import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, TrendingUp, Calendar, Clock, Award, FileText, Briefcase } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import logo from "@/assets/logo.png";
import { format } from "date-fns";
import { id as idLocale, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";

interface LeaveRequest {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
  total_days: number;
  created_at: string;
}

interface OvertimeRequest {
  id: string;
  overtime_date: string;
  hours: number;
  status: string;
  reason: string;
  created_at: string;
}

const PerformanceDashboard = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { t, i18n } = useTranslation();
  const localeId = i18n.resolvedLanguage?.startsWith("en") ? enUS : idLocale;
  const [stats, setStats] = useState({
    totalPresent: 0,
    totalLate: 0,
    attendanceRate: 0,
    totalOvertimeHours: 0,
    remainingLeave: profile?.remaining_leave || 0,
    usedLeave: (profile?.annual_leave_quota || 12) - (profile?.remaining_leave || 0)
  });
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);

  useEffect(() => {
    fetchPerformanceStats();
    fetchRequestHistory();
  }, []);

  const fetchPerformanceStats = async () => {
    try {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const { data: attendanceData } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', profile?.id)
        .gte('check_in_time', firstDay.toISOString())
        .lte('check_in_time', lastDay.toISOString());

      const { data: overtimeData } = await supabase
        .from('overtime_requests')
        .select('hours')
        .eq('user_id', profile?.id)
        .eq('status', 'approved')
        .gte('overtime_date', firstDay.toISOString().split('T')[0])
        .lte('overtime_date', lastDay.toISOString().split('T')[0]);

      const totalPresent = attendanceData?.filter(a => a.status === 'hadir').length || 0;
      const totalLate = attendanceData?.filter(a => a.status === 'terlambat').length || 0;
      const totalDays = attendanceData?.length || 0;
      const totalOvertimeHours = overtimeData?.reduce((sum, o) => sum + o.hours, 0) || 0;

      setStats({
        totalPresent,
        totalLate,
        attendanceRate: totalDays > 0 ? Math.round((totalPresent / totalDays) * 100) : 0,
        totalOvertimeHours,
        remainingLeave: profile?.remaining_leave || 0,
        usedLeave: (profile?.annual_leave_quota || 12) - (profile?.remaining_leave || 0)
      });
    } catch (error) {
      console.error('Error fetching performance stats:', error);
    }
  };

  const fetchRequestHistory = async () => {
    try {
      const { data: leaveData } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('user_id', profile?.id)
        .order('created_at', { ascending: false })
        .limit(10);

      const { data: overtimeData } = await supabase
        .from('overtime_requests')
        .select('*')
        .eq('user_id', profile?.id)
        .order('created_at', { ascending: false })
        .limit(10);

      setLeaveRequests(leaveData || []);
      setOvertimeRequests(overtimeData || []);
    } catch (error) {
      console.error('Error fetching request history:', error);
    }
  };

  const formatLeaveType = (type: string) => {
    const types: Record<string, string> = {
      cuti_tahunan: t("leavePage.leaveType.cuti_tahunan"),
      izin: t("leavePage.leaveType.izin"),
      sakit: t("leavePage.leaveType.sakit"),
      lupa_absen: t("leavePage.leaveType.lupa_absen"),
    };
    return types[type] || type;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">{t("performance.waiting")}</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">{t("performance.approved")}</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">{t("performance.rejected")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10">
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/employee')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <img src={logo} alt="Kemika" className="h-10 object-contain" />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-4xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("performance.title")}</CardTitle>
            <CardDescription>{t("performance.subtitle")}</CardDescription>
          </CardHeader>
        </Card>

        {/* Attendance Rate */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">{t("performance.attendanceRate")}</p>
                <p className="text-3xl font-bold text-primary">{stats.attendanceRate}%</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold">{stats.totalPresent}</p>
                <p className="text-sm text-muted-foreground">{t("performance.presentOnTime")}</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold">{stats.totalLate}</p>
                <p className="text-sm text-muted-foreground">{t("performance.late")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overtime Hours */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">{t("performance.totalOvertimeHours")}</p>
                <p className="text-3xl font-bold text-primary">{stats.totalOvertimeHours}</p>
                <p className="text-xs text-muted-foreground">{t("performance.monthHoursSuffix")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Leave Balance */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">{t("performance.annualLeaveBalance")}</p>
                <p className="text-3xl font-bold text-primary">{stats.remainingLeave}</p>
                <p className="text-xs text-muted-foreground">{t("performance.daysRemaining", { total: profile?.annual_leave_quota || 12 })}</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all" 
                  style={{ width: `${(stats.remainingLeave / (profile?.annual_leave_quota || 12)) * 100}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {t("performance.used", { n: stats.usedLeave })}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Achievement Badge */}
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="inline-flex h-16 w-16 rounded-full bg-primary/10 items-center justify-center mb-3">
                <Award className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-1">
                {stats.attendanceRate >= 95 ? t("performance.achTeladan") :
                 stats.attendanceRate >= 85 ? t("performance.achGood") :
                 t("performance.achImprove")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {stats.attendanceRate >= 95 ? t("performance.achTeladanDesc") :
                 stats.attendanceRate >= 85 ? t("performance.achGoodDesc") :
                 t("performance.achImproveDesc")}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Leave Request History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t("performance.leaveHistoryTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leaveRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t("performance.noLeave")}</p>
            ) : (
              <div className="space-y-3">
                {leaveRequests.map((request) => (
                  <div key={request.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{formatLeaveType(request.leave_type)}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(request.start_date), 'd MMM yyyy', { locale: localeId })}
                        {request.start_date !== request.end_date && (
                          <> - {format(new Date(request.end_date), 'd MMM yyyy', { locale: localeId })}</>
                        )}
                        {' '}{t("performance.daysShort", { n: request.total_days })}
                      </p>
                    </div>
                    {getStatusBadge(request.status)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Overtime Request History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              {t("performance.overtimeHistoryTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overtimeRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t("performance.noOvertime")}</p>
            ) : (
              <div className="space-y-3">
                {overtimeRequests.map((request) => (
                  <div key={request.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-sm">
                        {format(new Date(request.overtime_date), 'd MMM yyyy', { locale: localeId })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("performance.hoursReason", { n: request.hours, reason: request.reason.length > 30 ? request.reason.substring(0, 30) + '...' : request.reason })}
                      </p>
                    </div>
                    {getStatusBadge(request.status)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PerformanceDashboard;

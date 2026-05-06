import DashboardLayout from "@/components/DashboardLayout";
import { notifyAdmins } from "@/lib/notifications";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import StatsCards from "@/components/dashboard/StatsCards";
import AttendanceChart from "@/components/dashboard/AttendanceChart";
import DepartmentBreakdown from "@/components/dashboard/DepartmentBreakdown";
import RecentActivity from "@/components/dashboard/RecentActivity";
import PendingRequests from "@/components/dashboard/PendingRequests";
import CompanyCalendar from "@/components/dashboard/CompanyCalendar";
import { format, subDays, isWeekend, parseISO } from "date-fns";
import { id } from "date-fns/locale";
import { enUS } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import { isAttendanceExempt } from "@/lib/employeeFilters";

// Helper to get signed URL for employee photos
const getSignedPhotoUrl = async (filePath: string | null): Promise<string | null> => {
  if (!filePath) return null;
  
  // If it's already a full URL (legacy data), try to extract the path
  let path = filePath;
  if (filePath.startsWith('http')) {
    const match = filePath.match(/employee-photos\/(.+)$/);
    if (match) {
      path = match[1];
    } else {
      return filePath; // Return as-is if we can't parse it
    }
  }
  
  const { data, error } = await supabase.storage
    .from('employee-photos')
    .createSignedUrl(path, 3600); // 1 hour expiry
  
  if (error) {
    logger.error('Error creating signed URL:', error);
    return null;
  }
  
  return data.signedUrl;
};

const Dashboard = () => {
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.resolvedLanguage?.startsWith("en") ? enUS : id;

  const [stats, setStats] = useState({
    totalEmployees: 0,
    presentToday: 0,
    absentToday: 0,
    lateToday: 0,
    earlyLeaveToday: 0,
    pendingLeave: 0,
    pendingOvertime: 0,
    pendingTravel: 0,
    totalOvertimeHours: 0,
  });
  const [recentAttendance, setRecentAttendance] = useState<any[]>([]);
  const [absentEmployees, setAbsentEmployees] = useState<any[]>([]);
  const [pendingLeave, setPendingLeave] = useState<any[]>([]);
  const [pendingOvertime, setPendingOvertime] = useState<any[]>([]);
  const [pendingTravel, setPendingTravel] = useState<any[]>([]);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [departmentData, setDepartmentData] = useState<any[]>([]);

  // Auto-activate leave for employees with 12+ months tenure
  const autoActivateLeave = async () => {
    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, join_date, annual_leave_quota, remaining_leave, status')
        .eq('status', 'Active');

      if (!profiles) return;

      const now = new Date();
      const MIN_TENURE_MONTHS = 12;

      // Fetch leave policy for default quota
      const { data: leavePolicySetting } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'leave_policy')
        .single();

      const defaultQuota = (leavePolicySetting?.value as Record<string, unknown>)?.annual_leave_quota as number || 12;

      const activatedEmployees: string[] = [];

      for (const profile of profiles) {
        if (!profile.join_date) continue;
        // Skip if already has quota (leave already active)
        if ((profile.annual_leave_quota || 0) > 0 && (profile.remaining_leave || 0) > 0) continue;

        const joinDate = new Date(profile.join_date + 'T00:00:00');
        const diffMs = now.getTime() - joinDate.getTime();
        const diffMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44));

        if (diffMonths >= MIN_TENURE_MONTHS && (profile.annual_leave_quota === null || profile.annual_leave_quota === 0)) {
          await supabase
            .from('profiles')
            .update({
              annual_leave_quota: defaultQuota,
              remaining_leave: defaultQuota,
            })
            .eq('id', profile.id);

          activatedEmployees.push(profile.full_name);
          logger.info(`Auto-activated leave for employee ${profile.id} (tenure: ${diffMonths} months)`);
        }
      }

      // Notify admins about newly activated employees
      if (activatedEmployees.length > 0) {
        const names = activatedEmployees.join(', ');
        await notifyAdmins(
          '🎉 Cuti Otomatis Diaktifkan',
          `${activatedEmployees.length} karyawan telah memenuhi masa kerja 12 bulan dan cuti mereka otomatis diaktifkan: ${names}`,
          { type: 'leave_auto_activated', url: '/employees' }
        );

        toast({
          title: t("dashboard.toast.leaveActivatedTitle"),
          description: t("dashboard.toast.leaveActivatedDesc", { count: activatedEmployees.length, names }),
        });
      }
    } catch (error) {
      logger.error('Error auto-activating leave:', error);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    autoActivateLeave();

    // Real-time listener for attendance
    const attendanceChannel = supabase
      .channel("realtime:attendance")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, (payload) => {
        logger.debug("Realtime attendance change:", payload);

        if (payload.eventType === "INSERT") {
          setRecentAttendance((prev) => [payload.new, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          setRecentAttendance((prev) => prev.map((r) => (r.id === payload.new.id ? payload.new : r)));
        }

        toast({
          title: t("dashboard.toast.attendanceUpdate"),
          description:
            payload.eventType === "INSERT" ? t("dashboard.toast.checkInDesc") : t("dashboard.toast.checkOutDesc"),
        });

        fetchDashboardData();
      })
      .subscribe();

    // Real-time listener for leave requests
    const leaveChannel = supabase
      .channel("realtime:leave_requests_dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, (payload) => {
        logger.debug("Realtime leave change:", payload);
        
        if (payload.eventType === "INSERT") {
          toast({
            title: t("dashboard.toast.newLeave"),
            description: t("dashboard.toast.newLeaveDesc"),
          });
        }
        
        fetchDashboardData();
      })
      .subscribe();

    // Real-time listener for overtime requests
    const overtimeChannel = supabase
      .channel("realtime:overtime_requests_dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "overtime_requests" }, (payload) => {
        logger.debug("Realtime overtime change:", payload);
        
        if (payload.eventType === "INSERT") {
          toast({
            title: t("dashboard.toast.newOvertime"),
            description: t("dashboard.toast.newOvertimeDesc"),
          });
        }
        
        fetchDashboardData();
      })
      .subscribe();

    // Real-time listener for business travel requests
    const travelChannel = supabase
      .channel("realtime:business_travel_dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "business_travel_requests" }, (payload) => {
        logger.debug("Realtime business travel change:", payload);
        
        if (payload.eventType === "INSERT") {
          toast({
            title: t("dashboard.toast.newTravel"),
            description: t("dashboard.toast.newTravelDesc"),
          });
        }
        
        fetchDashboardData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(attendanceChannel);
      supabase.removeChannel(leaveChannel);
      supabase.removeChannel(overtimeChannel);
      supabase.removeChannel(travelChannel);
    };
  }, []);

  const fetchDashboardData = async () => {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

    // Fetch all data without joins first
    const [
      { data: profiles },
      { data: adminRoles },
      { data: todayAttendance },
      { data: recentData },
      { data: leaveData },
      { data: overtimeData },
      { data: weekAttendance },
      { data: approvedLeaveToday },
      { data: travelData },
    ] = await Promise.all([
      supabase.from("profiles").select("id, full_name, departemen, photo_url, status"),
      supabase.from("user_roles").select("user_id").eq("role", "admin"),
      supabase
        .from("attendance")
        .select("*")
        .gte("check_in_time", startOfToday.toISOString())
        .lte("check_in_time", endOfToday.toISOString()),
      supabase
        .from("attendance")
        .select("*")
        .order("check_in_time", { ascending: false })
        .limit(10),
      supabase
        .from("leave_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("overtime_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("attendance").select("*").gte("check_in_time", subDays(today, 7).toISOString()),
      supabase
        .from("leave_requests")
        .select("*")
        .eq("status", "approved")
        .lte("start_date", format(today, "yyyy-MM-dd"))
        .gte("end_date", format(today, "yyyy-MM-dd")),
      supabase
        .from("business_travel_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    // Create set of admin user IDs - admins are excluded from attendance requirements
    const adminUserIds = new Set((adminRoles || []).map(r => r.user_id));
    
    // Filter out: admins, BOD/Komisaris (exempt from attendance), and Inactive employees
    const nonAdminProfiles = (profiles || []).filter(p => 
      !adminUserIds.has(p.id) && 
      !isAttendanceExempt(p.departemen) &&
      p.status === "Active"
    );
    const employeeCount = nonAdminProfiles.length;

    // Create profiles map with signed URLs for photos
    const profilesWithSignedUrls = await Promise.all(
      (profiles || []).map(async (p) => {
        const signedUrl = await getSignedPhotoUrl(p.photo_url);
        return {
          id: p.id,
          full_name: p.full_name,
          departemen: p.departemen,
          photo_url: signedUrl
        };
      })
    );
    
    const profilesMap = new Map(
      profilesWithSignedUrls.map(p => [p.id, { full_name: p.full_name, departemen: p.departemen, photo_url: p.photo_url }])
    );

    // Combine recent attendance with profiles
    const recentWithProfiles = (recentData || []).map(record => ({
      ...record,
      profiles: profilesMap.get(record.user_id) || null
    }));

    // Combine leave requests with profiles
    const leaveWithProfiles = (leaveData || []).map(request => ({
      ...request,
      profiles: profilesMap.get(request.user_id) || null
    }));

    // Combine overtime requests with profiles
    const overtimeWithProfiles = (overtimeData || []).map(request => ({
      ...request,
      profiles: profilesMap.get(request.user_id) || null
    }));

    // Combine business travel requests with profiles
    const travelWithProfiles = (travelData || []).map(request => ({
      ...request,
      profiles: profilesMap.get(request.user_id) || null
    }));

    const present = todayAttendance?.filter((a) => a.status === "hadir").length || 0;
    const late = todayAttendance?.filter((a) => a.status === "terlambat").length || 0;
    const earlyLeave = todayAttendance?.filter((a) => a.status === "pulang_cepat").length || 0;
    const totalCheckedIn = todayAttendance?.length || 0;
    const absent = (employeeCount || 0) - totalCheckedIn;

    setStats({
      totalEmployees: employeeCount || 0,
      presentToday: present + late,
      absentToday: absent,
      lateToday: late,
      earlyLeaveToday: earlyLeave,
      pendingLeave: leaveData?.length || 0,
      pendingOvertime: overtimeData?.length || 0,
      pendingTravel: travelData?.length || 0,
      totalOvertimeHours: 0,
    });

    // Find employees who are absent today (excluding admins)
    const todayUserIds = new Set(todayAttendance?.map(a => a.user_id) || []);
    const leaveUserIds = new Map((approvedLeaveToday || []).map(l => [l.user_id, l.leave_type]));
    
    const absentList = nonAdminProfiles
      .filter(p => !todayUserIds.has(p.id))
      .map(p => {
        const leaveType = leaveUserIds.get(p.id);
        let absence_reason: "cuti" | "izin" | "sakit" | "tidak_absen" = "tidak_absen";
        
        if (leaveType) {
          if (leaveType === "cuti_tahunan") absence_reason = "cuti";
          else if (leaveType === "izin") absence_reason = "izin";
          else if (leaveType === "sakit") absence_reason = "sakit";
          else absence_reason = "cuti";
        }
        
        return {
          id: p.id,
          full_name: p.full_name,
          departemen: p.departemen,
          photo_url: profilesMap.get(p.id)?.photo_url || null,
          absence_reason,
          leave_type: leaveType || undefined,
        };
      });

    setAbsentEmployees(absentList);
    setRecentAttendance(recentWithProfiles);
    setPendingLeave(leaveWithProfiles);
    setPendingOvertime(overtimeWithProfiles);
    setPendingTravel(travelWithProfiles);

    // Fetch holidays for filtering weekend/holiday from chart
    const { data: overtimePolicySetting } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'overtime_policy')
      .single();
    
    const holidays: string[] = [];
    if (overtimePolicySetting?.value && typeof overtimePolicySetting.value === 'object') {
      const policy = overtimePolicySetting.value as Record<string, unknown>;
      if (Array.isArray(policy.holidays)) {
        policy.holidays.forEach((h: { date?: string }) => {
          if (h.date) holidays.push(h.date);
        });
      }
    }

    const weeklyStats: Record<string, { hadir: number; terlambat: number; tidak_hadir: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const date = subDays(today, i);
      const key = format(date, "yyyy-MM-dd");
      // Skip weekends and holidays
      if (isWeekend(date) || holidays.includes(key)) continue;
      weeklyStats[key] = { hadir: 0, terlambat: 0, tidak_hadir: 0 };
    }

    weekAttendance?.forEach((rec) => {
      const day = format(new Date(rec.check_in_time), "yyyy-MM-dd");
      if (weeklyStats[day]) {
        if (rec.status === "hadir") weeklyStats[day].hadir++;
        else if (rec.status === "terlambat") weeklyStats[day].terlambat++;
      }
    });

    const chartData = Object.entries(weeklyStats).map(([date, d]) => ({
      day: format(new Date(date), "EEE dd/MM", { locale: id }),
      ...d,
      tidak_hadir: Math.max(0, (employeeCount || 0) - d.hadir - d.terlambat),
    }));
    setWeeklyData(chartData);

    // Department breakdown (excluding admins)
    const deptMap: Record<string, { total: number; present: number }> = {};
    nonAdminProfiles.forEach((p) => {
      const dept = p.departemen || "Lainnya";
      if (!deptMap[dept]) deptMap[dept] = { total: 0, present: 0 };
      deptMap[dept].total++;
    });

    todayAttendance?.forEach((a) => {
      // Only count non-admin attendance
      if (adminUserIds.has(a.user_id)) return;
      const profile = nonAdminProfiles.find((p) => p.id === a.user_id);
      const dept = profile?.departemen || "Lainnya";
      if (deptMap[dept]) deptMap[dept].present++;
    });

    const deptData = Object.entries(deptMap)
      .map(([name, d]) => ({ name, value: d.total, present: d.present }))
      .filter((d) => d.value > 0)
      .slice(0, 6);

    setDepartmentData(deptData);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fadeIn">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">Dashboard</h1>
              <span className="text-xs font-medium bg-primary/10 text-primary px-2.5 py-1 rounded-full">Admin</span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{format(new Date(), "EEEE, d MMMM yyyy", { locale: id })}</p>
          </div>
        </div>

        <StatsCards stats={stats} />

        <div className="grid gap-4 lg:grid-cols-3">
          <AttendanceChart data={weeklyData} />
          <DepartmentBreakdown data={departmentData} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <RecentActivity data={recentAttendance} absentEmployees={absentEmployees} />
          <PendingRequests leaveRequests={pendingLeave} overtimeRequests={pendingOvertime} businessTravelRequests={pendingTravel} />
        </div>

        <CompanyCalendar />
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;

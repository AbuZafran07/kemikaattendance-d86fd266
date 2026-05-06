import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Download, FileSpreadsheet, FileText, Loader2, User, Coins, Calculator } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { exportToExcelFile } from "@/lib/excelExport";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, eachDayOfInterval, parseISO, isWithinInterval, startOfMonth, endOfMonth } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useDepartmentJabatan } from "@/hooks/useDepartmentJabatan";
import logoImage from "@/assets/logo.png";
import { formatAttendanceStatus, formatLeaveType } from "@/lib/statusUtils";
import { isWeekend } from "@/hooks/usePolicySettings";
import { isAttendanceExempt } from "@/lib/employeeFilters";

const loadImageAsBase64 = (src: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = src;
  });
};

export default function Reports() {
  const { t } = useTranslation();
  const { departments: DEPARTMENT_OPTIONS } = useDepartmentJabatan();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [reportType, setReportType] = useState<"attendance" | "leave" | "overtime" | "employees" | "business_travel" | "payroll">(
    "attendance",
  );
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [department, setDepartment] = useState<string>("all");

  // Helper function to fetch admin user IDs
  const fetchAdminUserIds = async (): Promise<Set<string>> => {
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    return new Set(adminRoles?.map((r) => r.user_id) || []);
  };

  const exportToExcel = async () => {
    setLoading(true);
    try {
      let data: any[] = [];
      let filename = "";

      // Fetch admin IDs to exclude from reports
      const adminUserIds = await fetchAdminUserIds();

      if (reportType === "attendance") {
        const { data: attendanceData, error: attendanceError } = await supabase
          .from("attendance")
          .select("*")
          .gte("check_in_time", `${startDate}T00:00:00`)
          .lte("check_in_time", `${endDate}T23:59:59`);

        if (attendanceError) throw attendanceError;

        // Fetch approved leave requests within date range
        const { data: leaveData, error: leaveError } = await supabase
          .from("leave_requests")
          .select("*")
          .eq("status", "approved")
          .lte("start_date", endDate)
          .gte("end_date", startDate);

        if (leaveError) throw leaveError;

        // Fetch approved business travel requests within date range
        const { data: travelData, error: travelError } = await supabase
          .from("business_travel_requests")
          .select("*")
          .eq("status", "approved")
          .lte("start_date", endDate)
          .gte("end_date", startDate);

        if (travelError) throw travelError;

        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, departemen, nik, status, resign_date");

        if (profilesError) throw profilesError;

        const profilesMap = new Map(profiles?.map((p) => [p.id, p]) || []);

        // Build set of excluded user IDs (admins + exempt departments + inactive)
        const excludedUserIds = new Set([
          ...Array.from(adminUserIds),
          ...(profiles || []).filter(p => isAttendanceExempt(p.departemen) || p.status !== "Active").map(p => p.id),
        ]);

        // Merge attendance data and exclude admins/exempt/inactive
        let mergedAttendance =
          attendanceData
            ?.filter((record) => !excludedUserIds.has(record.user_id))
            ?.map((record) => ({
              ...record,
              profiles: profilesMap.get(record.user_id),
            }))
            .filter((record) => record.profiles) || [];

        if (department !== "all") {
          mergedAttendance = mergedAttendance.filter((record) => record.profiles?.departemen === department);
        }

        // Convert attendance to report format
        const attendanceRows = mergedAttendance.map((record: any) => {
          const checkIn = new Date(record.check_in_time);
          const checkOut = record.check_out_time ? new Date(record.check_out_time) : null;
          return {
            Date: format(checkIn, "yyyy-MM-dd"),
            NIK: record.profiles?.nik || "-",
            Name: record.profiles?.full_name || "-",
            Department: record.profiles?.departemen || "-",
            "Check In Time": format(checkIn, "HH:mm"),
            "Check Out Time": checkOut ? format(checkOut, "HH:mm") : "-",
            Status: formatAttendanceStatus(record.status),
            "Duration (min)": record.duration_minutes || "-",
          };
        });

        // Add leave records (expand each day within range)
        const leaveRows: any[] = [];
        const dateRangeStart = parseISO(startDate);
        const dateRangeEnd = parseISO(endDate);

        leaveData?.forEach((leave) => {
          // Skip admin users
          if (adminUserIds.has(leave.user_id)) return;
          const profile = profilesMap.get(leave.user_id);
          if (!profile) return;
          if (department !== "all" && profile.departemen !== department) return;

          const leaveStart = parseISO(leave.start_date);
          const leaveEnd = parseISO(leave.end_date);
          const days = eachDayOfInterval({ start: leaveStart, end: leaveEnd });

          days.forEach((day) => {
            if (isWithinInterval(day, { start: dateRangeStart, end: dateRangeEnd })) {
              leaveRows.push({
                Date: format(day, "yyyy-MM-dd"),
                NIK: profile.nik || "-",
                Name: profile.full_name || "-",
                Department: profile.departemen || "-",
                "Check In Time": "-",
                "Check Out Time": "-",
                Status: formatLeaveType(leave.leave_type),
                "Duration (min)": "-",
              });
            }
          });
        });

        // Add business travel records (expand each day within range)
        const travelRows: any[] = [];
        travelData?.forEach((travel) => {
          // Skip admin users
          if (adminUserIds.has(travel.user_id)) return;
          const profile = profilesMap.get(travel.user_id);
          if (!profile) return;
          if (department !== "all" && profile.departemen !== department) return;

          const travelStart = parseISO(travel.start_date);
          const travelEnd = parseISO(travel.end_date);
          const days = eachDayOfInterval({ start: travelStart, end: travelEnd });

          days.forEach((day) => {
            if (isWithinInterval(day, { start: dateRangeStart, end: dateRangeEnd })) {
              travelRows.push({
                Date: format(day, "yyyy-MM-dd"),
                NIK: profile.nik || "-",
                Name: profile.full_name || "-",
                Department: profile.departemen || "-",
                "Check In Time": "-",
                "Check Out Time": "-",
                Status: "Dinas",
                "Duration (min)": "-",
              });
            }
          });
        });

        // Combine and sort by date, then name
        data = [...attendanceRows, ...leaveRows, ...travelRows].sort((a, b) => {
          const dateCompare = a.Date.localeCompare(b.Date);
          if (dateCompare !== 0) return dateCompare;
          return a.Name.localeCompare(b.Name);
        });

        filename = `Attendance_Report_${startDate}_to_${endDate}.xlsx`;
      } else if (reportType === "leave") {
        const { data: leaveData, error: leaveError } = await supabase
          .from("leave_requests")
          .select("*")
          .gte("start_date", startDate)
          .lte("end_date", endDate);

        if (leaveError) throw leaveError;

        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, departemen, nik, status, resign_date");

        if (profilesError) throw profilesError;

        const profilesMap = new Map(profiles?.map((p) => [p.id, p]) || []);

        // Exclude admin users from leave report
        let mergedData =
          leaveData
            ?.filter((record) => !adminUserIds.has(record.user_id))
            ?.map((record) => ({
              ...record,
              profiles: profilesMap.get(record.user_id),
            }))
            .filter((record) => record.profiles) || [];

        if (department !== "all") {
          mergedData = mergedData.filter((record) => record.profiles?.departemen === department);
        }

        data = mergedData.map((record: any) => ({
          NIK: record.profiles?.nik || "-",
          Name: record.profiles?.full_name || "-",
          Department: record.profiles?.departemen || "-",
          "Employee Status": record.profiles?.status || "-",
          "Resign Date": record.profiles?.status === "Resigned" && record.profiles?.resign_date ? record.profiles.resign_date : "-",
          "Leave Type": formatLeaveType(record.leave_type),
          "Start Date": record.start_date,
          "End Date": record.end_date,
          "Total Days": record.total_days,
          Status: formatAttendanceStatus(record.status),
          Reason: record.reason,
        }));
        filename = `Leave_Report_${startDate}_to_${endDate}.xlsx`;
      } else if (reportType === "overtime") {
        const { data: overtimeData, error: overtimeError } = await supabase
          .from("overtime_requests")
          .select("*")
          .gte("overtime_date", startDate)
          .lte("overtime_date", endDate);

        if (overtimeError) throw overtimeError;

        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, departemen, nik, status, resign_date");

        if (profilesError) throw profilesError;

        const profilesMap = new Map(profiles?.map((p) => [p.id, p]) || []);

        // Exclude admin users from overtime report
        let mergedData =
          overtimeData
            ?.filter((record) => !adminUserIds.has(record.user_id))
            ?.map((record) => ({
              ...record,
              profiles: profilesMap.get(record.user_id),
            }))
            .filter((record) => record.profiles) || [];

        if (department !== "all") {
          mergedData = mergedData.filter((record) => record.profiles?.departemen === department);
        }

        data = mergedData.map((record: any) => ({
          NIK: record.profiles?.nik || "-",
          Name: record.profiles?.full_name || "-",
          Department: record.profiles?.departemen || "-",
          "Employee Status": record.profiles?.status || "-",
          "Resign Date": record.profiles?.status === "Resigned" && record.profiles?.resign_date ? record.profiles.resign_date : "-",
          "Overtime Date": record.overtime_date,
          Hours: record.hours,
          Status: formatAttendanceStatus(record.status),
          Reason: record.reason,
        }));
        filename = `Overtime_Report_${startDate}_to_${endDate}.xlsx`;
      } else if (reportType === "business_travel") {
        const { data: travelData, error: travelError } = await supabase
          .from("business_travel_requests")
          .select("*")
          .gte("start_date", startDate)
          .lte("end_date", endDate);

        if (travelError) throw travelError;

        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, departemen, nik, status, resign_date");

        if (profilesError) throw profilesError;

        const profilesMap = new Map(profiles?.map((p) => [p.id, p]) || []);

        // Exclude admin users from business travel report
        let mergedData =
          travelData
            ?.filter((record) => !adminUserIds.has(record.user_id))
            ?.map((record) => ({
              ...record,
              profiles: profilesMap.get(record.user_id),
            }))
            .filter((record) => record.profiles) || [];

        if (department !== "all") {
          mergedData = mergedData.filter((record) => record.profiles?.departemen === department);
        }

        data = mergedData.map((record: any) => ({
          NIK: record.profiles?.nik || "-",
          Name: record.profiles?.full_name || "-",
          Department: record.profiles?.departemen || "-",
          "Employee Status": record.profiles?.status || "-",
          "Resign Date": record.profiles?.status === "Resigned" && record.profiles?.resign_date ? record.profiles.resign_date : "-",
          Destination: record.destination,
          Purpose: record.purpose,
          "Start Date": record.start_date,
          "End Date": record.end_date,
          "Total Days": record.total_days,
          Status: formatAttendanceStatus(record.status),
          Notes: record.notes || "-",
        }));
        filename = `Business_Travel_Report_${startDate}_to_${endDate}.xlsx`;
      } else if (reportType === "payroll") {
        // Payroll report: per-employee summary with attendance allowance
        const monthStart = startDate;
        const monthEnd = endDate;

        // Fetch all needed data in parallel
        const [attendanceRes, leaveRes, travelRes, profilesRes, configRes, holidaysRes, workHoursRes, specialWhRes] = await Promise.all([
          supabase.from("attendance").select("*").gte("check_in_time", `${monthStart}T00:00:00`).lte("check_in_time", `${monthEnd}T23:59:59`),
          supabase.from("leave_requests").select("*").eq("status", "approved").lte("start_date", monthEnd).gte("end_date", monthStart),
          supabase.from("business_travel_requests").select("*").eq("status", "approved").lte("start_date", monthEnd).gte("end_date", monthStart),
          supabase.from("profiles").select("id, full_name, departemen, nik, jabatan, status"),
          supabase.from("system_settings").select("value").eq("key", "attendance_allowance").maybeSingle(),
          supabase.from("system_settings").select("value").eq("key", "overtime_policy").maybeSingle(),
          supabase.rpc("get_work_hours"),
          supabase.from("system_settings").select("value").eq("key", "special_work_hours").maybeSingle(),
        ]);

        if (attendanceRes.error) throw attendanceRes.error;
        if (leaveRes.error) throw leaveRes.error;
        if (profilesRes.error) throw profilesRes.error;

        const profilesMap = new Map(profilesRes.data?.map((p) => [p.id, p]) || []);
        const allowanceConfig = configRes.data?.value as any || { max_amount: 500000, work_hours_per_day: 8, excluded_employee_ids: [], enabled: true };
        const holidaysList = (holidaysRes.data?.value as any)?.holidays || [];
        const holidayDates = new Set(holidaysList.map((h: any) => h.date));
        const whParsed = workHoursRes.data as Record<string, any> | null;
        const checkInEnd = whParsed?.check_in_end || "08:00";
        const lateTolerance = whParsed?.late_tolerance_minutes || 0;
        const [deadlineH, deadlineM] = checkInEnd.split(":").map(Number);
        const deadlineTotalMinutes = deadlineH * 60 + deadlineM + lateTolerance;
        const specialPeriods = (specialWhRes.data?.value as any)?.periods || [];

        // Dynamic check-in deadline per day (handles special periods like Ramadan)
        const getCheckInDeadlineForDate = (dateStr: string): number => {
          for (const sp of specialPeriods) {
            if (sp.is_active && dateStr >= sp.start_date && dateStr <= sp.end_date) {
              const spCheckInEnd = sp.check_in_end || checkInEnd;
              const [h, m] = spCheckInEnd.split(":").map(Number);
              const tol = sp.late_tolerance_minutes || 0;
              return h * 60 + m + tol;
            }
          }
          return deadlineTotalMinutes;
        };

        // Calculate working days
        const rangeStart = parseISO(monthStart);
        const rangeEnd = parseISO(monthEnd);
        const allDays = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
        const totalWorkingDays = allDays.filter((d) => {
          const ds = format(d, "yyyy-MM-dd");
          return !isWeekend(ds) && !holidayDates.has(ds);
        }).length;

        // Group attendance by user
        const attByUser = new Map<string, { present: number; late: number; lateHours: number }>();
        for (const rec of attendanceRes.data || []) {
          if (adminUserIds.has(rec.user_id)) continue;
          if (!attByUser.has(rec.user_id)) attByUser.set(rec.user_id, { present: 0, late: 0, lateHours: 0 });
          const u = attByUser.get(rec.user_id)!;
          if (rec.status === "hadir" || rec.status === "terlambat") u.present++;
          if (rec.status === "terlambat" && rec.check_in_time) {
            const ci = new Date(rec.check_in_time);
            const dateStr = format(ci, "yyyy-MM-dd");
            const ciMin = ci.getHours() * 60 + ci.getMinutes();
            const dailyDeadline = getCheckInDeadlineForDate(dateStr);
            const lateMins = Math.max(0, ciMin - dailyDeadline);
            u.late++;
            u.lateHours += Math.ceil(lateMins / 60);
          }
        }

        // Group leave days by user
        const leaveByUser = new Map<string, { cuti: number; izin: number; sakit: number }>();
        for (const leave of leaveRes.data || []) {
          if (adminUserIds.has(leave.user_id)) continue;
          if (!leaveByUser.has(leave.user_id)) leaveByUser.set(leave.user_id, { cuti: 0, izin: 0, sakit: 0 });
          const u = leaveByUser.get(leave.user_id)!;
          const days = eachDayOfInterval({ start: parseISO(leave.start_date), end: parseISO(leave.end_date) });
          const count = days.filter((d) => isWithinInterval(d, { start: rangeStart, end: rangeEnd })).length;
          if (leave.leave_type === "cuti_tahunan") u.cuti += count;
          else if (leave.leave_type === "izin") u.izin += count;
          else if (leave.leave_type === "sakit") u.sakit += count;
        }

        // Group travel days by user
        const travelByUser = new Map<string, number>();
        for (const t of travelRes.data || []) {
          if (adminUserIds.has(t.user_id)) continue;
          const days = eachDayOfInterval({ start: parseISO(t.start_date), end: parseISO(t.end_date) });
          const count = days.filter((d) => isWithinInterval(d, { start: rangeStart, end: rangeEnd })).length;
          travelByUser.set(t.user_id, (travelByUser.get(t.user_id) || 0) + count);
        }

        // Calculate allowance
        const ratePerDay = totalWorkingDays > 0 ? allowanceConfig.max_amount / totalWorkingDays : 0;
        const ratePerHour = (allowanceConfig.work_hours_per_day || 8) > 0 ? ratePerDay / (allowanceConfig.work_hours_per_day || 8) : 0;

        // Build payroll rows
        const employees = (profilesRes.data || []).filter((p) => !adminUserIds.has(p.id) && !isAttendanceExempt(p.departemen) && p.status === "Active");
        let filteredEmployees = department !== "all" ? employees.filter((p) => p.departemen === department) : employees;

        data = filteredEmployees.map((p) => {
          const att = attByUser.get(p.id) || { present: 0, late: 0, lateHours: 0 };
          const lv = leaveByUser.get(p.id) || { cuti: 0, izin: 0, sakit: 0 };
          const dinas = travelByUser.get(p.id) || 0;
          const isExcluded = (allowanceConfig.excluded_employee_ids || []).includes(p.id);
          const baseAllowance = isExcluded ? 0 : ratePerDay * att.present;
          const lateDeduction = isExcluded ? 0 : ratePerHour * att.lateHours;
          const finalAllowance = Math.max(0, Math.round(baseAllowance - lateDeduction));

          return {
            NIK: p.nik || "-",
            Nama: p.full_name || "-",
            Jabatan: p.jabatan || "-",
            Departemen: p.departemen || "-",
            "Hari Kerja": totalWorkingDays,
            Hadir: att.present,
            Terlambat: att.late,
            "Jam Telat": att.lateHours,
            Cuti: lv.cuti,
            Izin: lv.izin,
            Sakit: lv.sakit,
            Dinas: dinas,
            "Tunjangan Maks": isExcluded ? "Dikecualikan" : allowanceConfig.max_amount,
            "Potongan Terlambat": isExcluded ? "-" : Math.round(lateDeduction),
            "Tunjangan Kehadiran": isExcluded ? "Dikecualikan" : finalAllowance,
          };
        });

        filename = `Laporan_Payroll_${monthStart}_to_${monthEnd}.xlsx`;
      } else {
        let query = supabase.from("profiles").select("*");
        if (department !== "all") query = query.eq("departemen", department);

        const { data: employeeData, error } = await query;
        if (error) throw error;

        // Exclude admin users from employee database report
        const filteredEmployees = employeeData?.filter((emp) => !adminUserIds.has(emp.id)) || [];

        data = filteredEmployees.map((emp: any) => ({
          NIK: emp.nik,
          "Full Name": emp.full_name,
          Email: emp.email,
          Department: emp.departemen,
          Position: emp.jabatan,
          Phone: emp.phone || "-",
          "Join Date": emp.join_date,
          "Annual Leave Quota": emp.annual_leave_quota,
          "Remaining Leave": emp.remaining_leave,
          Status: emp.status,
          "Resign Date": emp.status === "Resigned" && emp.resign_date ? emp.resign_date : "-",
        }));
        filename = `Employee_Database_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      }

      await exportToExcelFile(data, "Report", filename);

      toast({ title: t("common.success"), description: t("reportsPage.toast.excelOk") });
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = async () => {
    setLoading(true);
    try {
      let data: any[] = [];
      let columns: string[] = [];
      let title = "";

      // Fetch admin IDs to exclude from reports
      const adminUserIds = await fetchAdminUserIds();

      if (reportType === "attendance") {
        const { data: attendanceData, error: attendanceError } = await supabase
          .from("attendance")
          .select("*")
          .gte("check_in_time", `${startDate}T00:00:00`)
          .lte("check_in_time", `${endDate}T23:59:59`);

        if (attendanceError) throw attendanceError;

        // Fetch approved leave requests within date range
        const { data: leaveData, error: leaveError } = await supabase
          .from("leave_requests")
          .select("*")
          .eq("status", "approved")
          .lte("start_date", endDate)
          .gte("end_date", startDate);

        if (leaveError) throw leaveError;

        // Fetch approved business travel requests within date range
        const { data: travelData, error: travelError } = await supabase
          .from("business_travel_requests")
          .select("*")
          .eq("status", "approved")
          .lte("start_date", endDate)
          .gte("end_date", startDate);

        if (travelError) throw travelError;

        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, departemen, nik");

        if (profilesError) throw profilesError;

        const profilesMap = new Map(profiles?.map((p) => [p.id, p]) || []);

        // Merge attendance data and exclude admins
        let mergedAttendance =
          attendanceData
            ?.filter((record) => !adminUserIds.has(record.user_id))
            ?.map((record) => ({
              ...record,
              profiles: profilesMap.get(record.user_id),
            }))
            .filter((record) => record.profiles) || [];

        if (department !== "all") {
          mergedAttendance = mergedAttendance.filter((record) => record.profiles?.departemen === department);
        }

        columns = ["Date", "NIK", "Name", "Department", "Check In", "Check Out", "Status"];

        // Convert attendance to report format
        const attendanceRows = mergedAttendance.map((record: any) => {
          const checkIn = new Date(record.check_in_time);
          const checkOut = record.check_out_time ? new Date(record.check_out_time) : null;
          return [
            format(checkIn, "yyyy-MM-dd"),
            record.profiles?.nik || "-",
            record.profiles?.full_name || "-",
            record.profiles?.departemen || "-",
            format(checkIn, "HH:mm"),
            checkOut ? format(checkOut, "HH:mm") : "-",
            formatAttendanceStatus(record.status),
          ];
        });

        // Add leave records (expand each day within range)
        const leaveRows: any[] = [];
        const dateRangeStart = parseISO(startDate);
        const dateRangeEnd = parseISO(endDate);

        leaveData?.forEach((leave) => {
          // Skip admin users
          if (adminUserIds.has(leave.user_id)) return;
          const profile = profilesMap.get(leave.user_id);
          if (!profile) return;
          if (department !== "all" && profile.departemen !== department) return;

          const leaveStart = parseISO(leave.start_date);
          const leaveEnd = parseISO(leave.end_date);
          const days = eachDayOfInterval({ start: leaveStart, end: leaveEnd });

          days.forEach((day) => {
            if (isWithinInterval(day, { start: dateRangeStart, end: dateRangeEnd })) {
              leaveRows.push([
                format(day, "yyyy-MM-dd"),
                profile.nik || "-",
                profile.full_name || "-",
                profile.departemen || "-",
                "-",
                "-",
                formatLeaveType(leave.leave_type),
              ]);
            }
          });
        });

        // Add business travel records (expand each day within range)
        const travelRows: any[] = [];
        travelData?.forEach((travel) => {
          // Skip admin users
          if (adminUserIds.has(travel.user_id)) return;
          const profile = profilesMap.get(travel.user_id);
          if (!profile) return;
          if (department !== "all" && profile.departemen !== department) return;

          const travelStart = parseISO(travel.start_date);
          const travelEnd = parseISO(travel.end_date);
          const days = eachDayOfInterval({ start: travelStart, end: travelEnd });

          days.forEach((day) => {
            if (isWithinInterval(day, { start: dateRangeStart, end: dateRangeEnd })) {
              travelRows.push([
                format(day, "yyyy-MM-dd"),
                profile.nik || "-",
                profile.full_name || "-",
                profile.departemen || "-",
                "-",
                "-",
                "Dinas",
              ]);
            }
          });
        });

        // Combine and sort by date, then name
        data = [...attendanceRows, ...leaveRows, ...travelRows].sort((a, b) => {
          const dateCompare = a[0].localeCompare(b[0]);
          if (dateCompare !== 0) return dateCompare;
          return a[2].localeCompare(b[2]);
        });

        title = `Laporan Absensi (${startDate} s.d ${endDate})`;
      } else if (reportType === "leave") {
        const { data: leaveData, error: leaveError } = await supabase
          .from("leave_requests")
          .select("*")
          .gte("start_date", startDate)
          .lte("end_date", endDate);

        if (leaveError) throw leaveError;

        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, departemen, nik");

        if (profilesError) throw profilesError;

        const profilesMap = new Map(profiles?.map((p) => [p.id, p]) || []);

        // Exclude admin users from leave PDF report
        let mergedData =
          leaveData
            ?.filter((record) => !adminUserIds.has(record.user_id))
            ?.map((record) => ({
              ...record,
              profiles: profilesMap.get(record.user_id),
            }))
            .filter((record) => record.profiles) || [];

        if (department !== "all") {
          mergedData = mergedData.filter((record) => record.profiles?.departemen === department);
        }

        columns = ["NIK", "Name", "Department", "Leave Type", "Start", "End", "Days", "Status"];
        data = mergedData.map((record: any) => [
          record.profiles?.nik || "-",
          record.profiles?.full_name || "-",
          record.profiles?.departemen || "-",
          formatLeaveType(record.leave_type),
          record.start_date,
          record.end_date,
          record.total_days,
          formatAttendanceStatus(record.status),
        ]);
        title = `Laporan Cuti (${startDate} s.d ${endDate})`;
      } else if (reportType === "overtime") {
        const { data: overtimeData, error: overtimeError } = await supabase
          .from("overtime_requests")
          .select("*")
          .gte("overtime_date", startDate)
          .lte("overtime_date", endDate);

        if (overtimeError) throw overtimeError;

        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, departemen, nik");

        if (profilesError) throw profilesError;

        const profilesMap = new Map(profiles?.map((p) => [p.id, p]) || []);

        // Exclude admin users from overtime PDF report
        let mergedData =
          overtimeData
            ?.filter((record) => !adminUserIds.has(record.user_id))
            ?.map((record) => ({
              ...record,
              profiles: profilesMap.get(record.user_id),
            }))
            .filter((record) => record.profiles) || [];

        if (department !== "all") {
          mergedData = mergedData.filter((record) => record.profiles?.departemen === department);
        }

        columns = ["NIK", "Name", "Department", "Date", "Hours", "Status", "Reason"];
        data = mergedData.map((record: any) => [
          record.profiles?.nik || "-",
          record.profiles?.full_name || "-",
          record.profiles?.departemen || "-",
          record.overtime_date,
          record.hours,
          formatAttendanceStatus(record.status),
          record.reason,
        ]);
        title = `Laporan Lembur (${startDate} s.d ${endDate})`;
      } else if (reportType === "business_travel") {
        const { data: travelData, error: travelError } = await supabase
          .from("business_travel_requests")
          .select("*")
          .gte("start_date", startDate)
          .lte("end_date", endDate);

        if (travelError) throw travelError;

        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, departemen, nik");

        if (profilesError) throw profilesError;

        const profilesMap = new Map(profiles?.map((p) => [p.id, p]) || []);

        // Exclude admin users from business travel PDF report
        let mergedData =
          travelData
            ?.filter((record) => !adminUserIds.has(record.user_id))
            ?.map((record) => ({
              ...record,
              profiles: profilesMap.get(record.user_id),
            }))
            .filter((record) => record.profiles) || [];

        if (department !== "all") {
          mergedData = mergedData.filter((record) => record.profiles?.departemen === department);
        }

        columns = ["NIK", "Name", "Department", "Destination", "Purpose", "Start", "End", "Days", "Status"];
        data = mergedData.map((record: any) => [
          record.profiles?.nik || "-",
          record.profiles?.full_name || "-",
          record.profiles?.departemen || "-",
          record.destination,
          record.purpose,
          record.start_date,
          record.end_date,
          record.total_days,
          formatAttendanceStatus(record.status),
        ]);
        title = `Laporan Perjalanan Dinas (${startDate} s.d ${endDate})`;
      } else if (reportType === "payroll") {
        // Reuse same payroll logic for PDF
        const monthStart = startDate;
        const monthEnd = endDate;

        const [attendanceRes, leaveRes, travelRes, profilesRes, configRes, holidaysRes, workHoursRes, specialWhRes] = await Promise.all([
          supabase.from("attendance").select("*").gte("check_in_time", `${monthStart}T00:00:00`).lte("check_in_time", `${monthEnd}T23:59:59`),
          supabase.from("leave_requests").select("*").eq("status", "approved").lte("start_date", monthEnd).gte("end_date", monthStart),
          supabase.from("business_travel_requests").select("*").eq("status", "approved").lte("start_date", monthEnd).gte("end_date", monthStart),
          supabase.from("profiles").select("id, full_name, departemen, nik, jabatan"),
          supabase.from("system_settings").select("value").eq("key", "attendance_allowance").maybeSingle(),
          supabase.from("system_settings").select("value").eq("key", "overtime_policy").maybeSingle(),
          supabase.rpc("get_work_hours"),
          supabase.from("system_settings").select("value").eq("key", "special_work_hours").maybeSingle(),
        ]);

        if (attendanceRes.error) throw attendanceRes.error;
        if (leaveRes.error) throw leaveRes.error;
        if (profilesRes.error) throw profilesRes.error;

        const profilesMap = new Map(profilesRes.data?.map((p) => [p.id, p]) || []);
        const allowanceConfig = configRes.data?.value as any || { max_amount: 500000, work_hours_per_day: 8, excluded_employee_ids: [], enabled: true };
        const holidaysList = (holidaysRes.data?.value as any)?.holidays || [];
        const holidayDates = new Set(holidaysList.map((h: any) => h.date));
        const whParsed = workHoursRes.data as Record<string, any> | null;
        const checkInEnd = whParsed?.check_in_end || "08:00";
        const lateTolerance = whParsed?.late_tolerance_minutes || 0;
        const [deadlineH, deadlineM] = checkInEnd.split(":").map(Number);
        const deadlineTotalMinutes = deadlineH * 60 + deadlineM + lateTolerance;
        const specialPeriods = (specialWhRes.data?.value as any)?.periods || [];

        const getCheckInDeadlineForDate = (dateStr: string): number => {
          for (const sp of specialPeriods) {
            if (sp.is_active && dateStr >= sp.start_date && dateStr <= sp.end_date) {
              const spCheckInEnd = sp.check_in_end || checkInEnd;
              const [h, m] = spCheckInEnd.split(":").map(Number);
              const tol = sp.late_tolerance_minutes || 0;
              return h * 60 + m + tol;
            }
          }
          return deadlineTotalMinutes;
        };

        const rangeStart = parseISO(monthStart);
        const rangeEnd = parseISO(monthEnd);
        const allDays = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
        const totalWorkingDays = allDays.filter((d) => {
          const ds = format(d, "yyyy-MM-dd");
          return !isWeekend(ds) && !holidayDates.has(ds);
        }).length;

        const attByUser = new Map<string, { present: number; late: number; lateHours: number }>();
        for (const rec of attendanceRes.data || []) {
          if (adminUserIds.has(rec.user_id)) continue;
          if (!attByUser.has(rec.user_id)) attByUser.set(rec.user_id, { present: 0, late: 0, lateHours: 0 });
          const u = attByUser.get(rec.user_id)!;
          if (rec.status === "hadir" || rec.status === "terlambat") u.present++;
          if (rec.status === "terlambat" && rec.check_in_time) {
            const ci = new Date(rec.check_in_time);
            const dateStr = format(ci, "yyyy-MM-dd");
            const ciMin = ci.getHours() * 60 + ci.getMinutes();
            const dailyDeadline = getCheckInDeadlineForDate(dateStr);
            const lateMins = Math.max(0, ciMin - dailyDeadline);
            u.late++;
            u.lateHours += Math.ceil(lateMins / 60);
          }
        }

        const leaveByUser = new Map<string, { cuti: number; izin: number; sakit: number }>();
        for (const leave of leaveRes.data || []) {
          if (adminUserIds.has(leave.user_id)) continue;
          if (!leaveByUser.has(leave.user_id)) leaveByUser.set(leave.user_id, { cuti: 0, izin: 0, sakit: 0 });
          const u = leaveByUser.get(leave.user_id)!;
          const days = eachDayOfInterval({ start: parseISO(leave.start_date), end: parseISO(leave.end_date) });
          const count = days.filter((d) => isWithinInterval(d, { start: rangeStart, end: rangeEnd })).length;
          if (leave.leave_type === "cuti_tahunan") u.cuti += count;
          else if (leave.leave_type === "izin") u.izin += count;
          else if (leave.leave_type === "sakit") u.sakit += count;
        }

        const travelByUser = new Map<string, number>();
        for (const t of travelRes.data || []) {
          if (adminUserIds.has(t.user_id)) continue;
          const days = eachDayOfInterval({ start: parseISO(t.start_date), end: parseISO(t.end_date) });
          const count = days.filter((d) => isWithinInterval(d, { start: rangeStart, end: rangeEnd })).length;
          travelByUser.set(t.user_id, (travelByUser.get(t.user_id) || 0) + count);
        }

        const ratePerDay = totalWorkingDays > 0 ? allowanceConfig.max_amount / totalWorkingDays : 0;
        const ratePerHour = (allowanceConfig.work_hours_per_day || 8) > 0 ? ratePerDay / (allowanceConfig.work_hours_per_day || 8) : 0;

        const employees = (profilesRes.data || []).filter((p) => !adminUserIds.has(p.id));
        let filteredEmployees = department !== "all" ? employees.filter((p) => p.departemen === department) : employees;

        const formatCurrency = (val: number) =>
          new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(val);

        columns = ["NIK", "Nama", "Jabatan", "Dept", "Kerja", "Hadir", "Telat", "Jam", "Cuti", "Izin", "Sakit", "Dinas", "Potongan", "Tunjangan"];
        data = filteredEmployees.map((p) => {
          const att = attByUser.get(p.id) || { present: 0, late: 0, lateHours: 0 };
          const lv = leaveByUser.get(p.id) || { cuti: 0, izin: 0, sakit: 0 };
          const dinas = travelByUser.get(p.id) || 0;
          const isExcluded = (allowanceConfig.excluded_employee_ids || []).includes(p.id);
          const baseAllowance = isExcluded ? 0 : ratePerDay * att.present;
          const lateDeduction = isExcluded ? 0 : ratePerHour * att.lateHours;
          const finalAllowance = Math.max(0, Math.round(baseAllowance - lateDeduction));
          return [
            p.nik || "-",
            p.full_name || "-",
            p.jabatan || "-",
            p.departemen || "-",
            totalWorkingDays,
            att.present,
            att.late,
            att.lateHours,
            lv.cuti,
            lv.izin,
            lv.sakit,
            dinas,
            isExcluded ? "-" : formatCurrency(Math.round(lateDeduction)),
            isExcluded ? "Dikecualikan" : formatCurrency(finalAllowance),
          ];
        });
        title = `Laporan Payroll (${startDate} s.d ${endDate})`;
      }

      const doc = new jsPDF({ orientation: reportType === "payroll" ? "landscape" : "portrait" });

      // Add logo
      try {
        const logoBase64 = await loadImageAsBase64(logoImage);
        doc.addImage(logoBase64, "PNG", 14, 10, 30, 12);
      } catch (e) {
        console.log("Could not load logo");
      }

      doc.setFontSize(16);
      doc.text(title, 50, 18);
      doc.setFontSize(10);
      doc.text(`Dibuat: ${format(new Date(), "yyyy-MM-dd HH:mm")}`, 50, 25);

      autoTable(doc, {
        head: [columns],
        body: data,
        startY: 32,
        styles: { fontSize: reportType === "payroll" ? 7 : 8 },
        headStyles: { fillColor: [0, 135, 81] },
      });

      doc.save(`${reportType}_report_${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast({ title: t("common.success"), description: t("reportsPage.toast.pdfOk") });
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("reportsPage.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("reportsPage.subtitle")}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("reportsPage.general.title")}</CardTitle>
              <CardDescription>{t("reportsPage.general.desc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {t("reportsPage.general.hint")}
              </p>
            </CardContent>
          </Card>

          <Card
            className="border-primary/20 hover:border-primary/40 transition-colors cursor-pointer"
            onClick={() => navigate("/dashboard/reports/employee")}
          >
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <CardTitle>{t("reportsPage.perEmployee.title")}</CardTitle>
              </div>
              <CardDescription>{t("reportsPage.perEmployee.desc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t("reportsPage.perEmployee.hint")}
              </p>
              <Button variant="link" className="mt-2 p-0 h-auto">
                {t("reportsPage.perEmployee.cta")}
              </Button>
            </CardContent>
          </Card>

          <Card
            className="border-primary/20 hover:border-primary/40 transition-colors cursor-pointer"
            onClick={() => navigate("/dashboard/reports/attendance-allowance")}
          >
            <CardHeader>
              <div className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-primary" />
                <CardTitle>{t("reportsPage.allowance.title")}</CardTitle>
              </div>
              <CardDescription>{t("reportsPage.allowance.desc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t("reportsPage.allowance.hint")}
              </p>
              <Button variant="link" className="mt-2 p-0 h-auto">
                {t("reportsPage.allowance.cta")}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("reportsPage.config.title")}</CardTitle>
            <CardDescription>{t("reportsPage.config.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reportType">{t("reportsPage.config.reportType")}</Label>
                <Select value={reportType} onValueChange={(value: any) => setReportType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="attendance">{t("reportsPage.types.attendance")}</SelectItem>
                    <SelectItem value="leave">{t("reportsPage.types.leave")}</SelectItem>
                    <SelectItem value="overtime">{t("reportsPage.types.overtime")}</SelectItem>
                    <SelectItem value="business_travel">{t("reportsPage.types.business_travel")}</SelectItem>
                    <SelectItem value="payroll">{t("reportsPage.types.payroll")}</SelectItem>
                    <SelectItem value="employees">{t("reportsPage.types.employees")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">{t("reportsPage.config.department")}</Label>
                <Select value={department} onValueChange={setDepartment}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("reportsPage.config.allDept")}</SelectItem>
                    {DEPARTMENT_OPTIONS.map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {reportType !== "employees" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">{t("common.startDate")}</Label>
                  <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">{t("common.endDate")}</Label>
                  <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                onClick={exportToExcel}
                disabled={loading || (reportType !== "employees" && (!startDate || !endDate))}
                className="bg-primary hover:bg-primary/90"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                )}
                {t("reportsPage.btn.excel")}
              </Button>
              {reportType !== "employees" && (
                <Button onClick={exportToPDF} disabled={loading || !startDate || !endDate} variant="outline">
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                  {t("reportsPage.btn.pdf")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

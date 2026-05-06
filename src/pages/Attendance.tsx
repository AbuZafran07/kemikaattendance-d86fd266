import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, CheckCircle2, XCircle, RefreshCw, Camera, Calendar, Eye, Pencil, Trash2, Search, RotateCcw, UserPlus } from "lucide-react";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import ManualAttendanceDialog from "@/components/ManualAttendanceDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { getAttendancePhotoUrl } from "@/lib/attendancePhotoUpload";
import { isAttendanceExempt } from "@/lib/employeeFilters";

interface AttendanceRecord {
  id: string;
  user_id: string;
  check_in_time: string;
  check_out_time: string | null;
  status: string;
  duration_minutes: number | null;
  gps_validated: boolean;
  check_in_photo_url: string | null;
  check_out_photo_url: string | null;
  full_name?: string;
  departemen?: string;
  photo_url?: string;
}

interface Profile {
  id: string;
  full_name: string;
  departemen: string;
  photo_url: string | null;
}

const Attendance = () => {
  const { t, i18n } = useTranslation();
  const dateLocaleStr = i18n.resolvedLanguage?.startsWith("en") ? "en-US" : "id-ID";
  const navigate = useNavigate();
  const { user, userRole } = useAuth();
  const isAdmin = userRole === 'admin';
  const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]);
  const [stats, setStats] = useState({
    totalRecords: 0,
    lateCount: 0,
    onTimeCount: 0,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; type: string } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const { toast } = useToast();

  // Edit state
  const [editRecord, setEditRecord] = useState<AttendanceRecord | null>(null);
  const [editCheckIn, setEditCheckIn] = useState("");
  const [editCheckOut, setEditCheckOut] = useState("");
  const [editReason, setEditReason] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete state
  const [deleteRecord, setDeleteRecord] = useState<AttendanceRecord | null>(null);
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);


  useEffect(() => {
    // Set default date range to today
    const today = new Date().toISOString().split("T")[0];
    setStartDate(today);
    setEndDate(today);
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      fetchAttendanceData();
    }
  }, [startDate, endDate]);

  const fetchAttendanceData = async () => {
    setIsRefreshing(true);

    const startDateTime = new Date(startDate);
    startDateTime.setHours(0, 0, 0, 0);

    const endDateTime = new Date(endDate);
    endDateTime.setHours(23, 59, 59, 999);

    // Fetch admin user IDs first - admins are excluded from attendance tracking
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    
    const adminUserIds = new Set((adminRoles || []).map(r => r.user_id));

    // Fetch ALL attendance data within date range
    const { data: attendanceRecords, error: attendanceError } = await supabase
      .from("attendance")
      .select("*")
      .gte("check_in_time", startDateTime.toISOString())
      .lte("check_in_time", endDateTime.toISOString())
      .order("check_in_time", { ascending: false });

    if (attendanceError) {
      console.error("Error fetching attendance:", attendanceError);
      toast({
        title: "Error",
        description: t("attendancePage.loadFailDesc"),
        variant: "destructive",
      });
      setIsRefreshing(false);
      return;
    }

    // Filter out admin attendance records and exempt departments/inactive will be filtered after profile merge
    const nonAdminAttendance = (attendanceRecords || []).filter(
      record => !adminUserIds.has(record.user_id)
    );

    if (nonAdminAttendance.length === 0) {
      setAttendanceData([]);
      setStats({ totalRecords: 0, lateCount: 0, onTimeCount: 0 });
      setIsRefreshing(false);
      return;
    }

    // Fetch all profiles (excluding admins for display)
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, departemen, photo_url, status");

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
    }

    const profilesMap = new Map<string, Profile>();
    if (profiles) {
      profiles.forEach((p) => profilesMap.set(p.id, p));
    }

    // Merge attendance with profiles
    const mergedData: AttendanceRecord[] = nonAdminAttendance.map((record) => {
      const profile = profilesMap.get(record.user_id);
      return {
        ...record,
        full_name: profile?.full_name || "Unknown",
        departemen: profile?.departemen || "-",
        photo_url: profile?.photo_url,
      };
    });

    setAttendanceData(mergedData);

    // Calculate statistics
    const totalRecords = mergedData.length;
    const lateCount = mergedData.filter((record) => record.status === "terlambat").length;
    const onTimeCount = mergedData.filter((record) => record.status === "hadir").length;

    setStats({
      totalRecords,
      lateCount,
      onTimeCount,
    });

    setIsRefreshing(false);
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString(dateLocaleStr, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(dateLocaleStr, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  // Filter by search query
  const filteredData = attendanceData.filter((record) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const name = (record.full_name || "").toLowerCase();
    const date = formatDate(record.check_in_time).toLowerCase();
    return name.includes(query) || date.includes(query);
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );


  const calculateDuration = (checkIn: string, checkOut: string | null) => {
    if (!checkOut) return "-";

    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diffMs = end.getTime() - start.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}h ${minutes}m`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "hadir":
        return <Badge className="bg-primary text-white">{t("common.present")}</Badge>;
      case "terlambat":
        return <Badge variant="destructive">{t("common.late")}</Badge>;
      case "pulang cepat":
      case "pulang_cepat":
        return <Badge variant="destructive">{t("common.earlyLeave")}</Badge>;
      default:
        return <Badge variant="outline">{status.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</Badge>;
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const openPhotoDialog = async (url: string | null, type: string) => {
    if (url) {
      // Get signed URL for storage paths
      const signedUrl = await getAttendancePhotoUrl(url);
      if (signedUrl) {
        setSelectedPhoto({ url: signedUrl, type });
      }
    }
  };

  // Open edit dialog
  const openEditDialog = (record: AttendanceRecord) => {
    setEditRecord(record);
    // Format datetime-local value
    const ciDate = new Date(record.check_in_time);
    const ciLocal = new Date(ciDate.getTime() - ciDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setEditCheckIn(ciLocal);
    if (record.check_out_time) {
      const coDate = new Date(record.check_out_time);
      const coLocal = new Date(coDate.getTime() - coDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setEditCheckOut(coLocal);
    } else {
      setEditCheckOut("");
    }
    setEditReason("");
  };

  // Fetch effective work hours for a specific date (considers special work hours)
  const getEffectiveWorkHoursForDate = async (date: Date) => {
    try {
      // Check special work hours first
      const { data: specialSettings } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "special_work_hours")
        .maybeSingle();

      if (specialSettings?.value) {
        const config = specialSettings.value as any;
        const periods = config.periods || [];
        const dateStr = date.toISOString().split("T")[0];
        
        for (const period of periods) {
          if (period.is_active && dateStr >= period.start_date && dateStr <= period.end_date) {
            return {
              check_in_end: period.check_in_end,
              check_out_start: period.check_out_start,
              late_tolerance_minutes: period.late_tolerance_minutes || 0,
              early_leave_tolerance_minutes: period.early_leave_tolerance_minutes || 0,
            };
          }
        }
      }

      // Fallback to normal work hours (with Friday override)
      const { data: normalSettings } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "work_hours")
        .maybeSingle();

      if (normalSettings?.value) {
        const config = normalSettings.value as any;
        const dayOfWeek = date.getDay(); // 0=Sunday, 5=Friday
        
        // Apply Friday overrides if enabled
        if (dayOfWeek === 5 && config.friday_enabled) {
          return {
            check_in_end: config.check_in_end,
            check_out_start: config.friday_check_out_start || config.check_out_start,
            late_tolerance_minutes: config.late_tolerance_minutes || 0,
            early_leave_tolerance_minutes: config.friday_early_leave_tolerance_minutes ?? config.early_leave_tolerance_minutes ?? 0,
          };
        }
        
        return {
          check_in_end: config.check_in_end,
          check_out_start: config.check_out_start,
          late_tolerance_minutes: config.late_tolerance_minutes || 0,
          early_leave_tolerance_minutes: config.early_leave_tolerance_minutes || 0,
        };
      }

      return null;
    } catch {
      return null;
    }
  };

  // Determine status based on check-in/out times and work hours config
  const recalculateStatus = async (checkInTime: Date, checkOutTime: Date | null): Promise<"hadir" | "terlambat" | "pulang_cepat"> => {
    const workHours = await getEffectiveWorkHoursForDate(checkInTime);
    if (!workHours) return "hadir";

    // Check late
    const [lateH, lateM] = workHours.check_in_end.split(":").map(Number);
    const lateDeadline = new Date(checkInTime);
    lateDeadline.setHours(lateH, lateM + (workHours.late_tolerance_minutes || 0), 0, 0);

    if (checkInTime > lateDeadline) return "terlambat";

    // Check early leave
    if (checkOutTime) {
      const [earlyH, earlyM] = workHours.check_out_start.split(":").map(Number);
      const earlyThreshold = new Date(checkOutTime);
      earlyThreshold.setHours(earlyH, earlyM - (workHours.early_leave_tolerance_minutes || 0), 0, 0);

      if (checkOutTime < earlyThreshold) return "pulang_cepat";
    }

    return "hadir";
  };

  const handleSaveEdit = async () => {
    if (!editRecord || !editReason.trim()) {
      toast({ title: t("common.error"), description: t("attendancePage.editDialog.reasonRequired"), variant: "destructive" });
      return;
    }
    setIsSavingEdit(true);
    try {
      const oldData = {
        check_in_time: editRecord.check_in_time,
        check_out_time: editRecord.check_out_time,
        status: editRecord.status,
      };
      const newCheckIn = new Date(editCheckIn).toISOString();
      const newCheckOut = editCheckOut ? new Date(editCheckOut).toISOString() : null;

      // Calculate duration
      let durationMinutes: number | null = null;
      if (newCheckOut) {
        durationMinutes = Math.round((new Date(newCheckOut).getTime() - new Date(newCheckIn).getTime()) / 60000);
      }

      // Recalculate status based on effective work hours (including special work hours)
      const newStatus = await recalculateStatus(new Date(newCheckIn), newCheckOut ? new Date(newCheckOut) : null);

      const newData = { check_in_time: newCheckIn, check_out_time: newCheckOut, status: newStatus };

      // Update attendance record with recalculated status
      const { error: updateError } = await supabase
        .from("attendance")
        .update({ check_in_time: newCheckIn, check_out_time: newCheckOut, duration_minutes: durationMinutes, status: newStatus })
        .eq("id", editRecord.id);

      if (updateError) throw updateError;

      // Insert audit log
      await supabase.from("attendance_audit_logs").insert({
        attendance_id: editRecord.id,
        action_type: "edit",
        changed_by: user!.id,
        old_data: oldData,
        new_data: newData,
        reason: editReason.trim(),
      });

      toast({ title: t("common.success"), description: t("attendancePage.editDialog.successUpdated") + (newStatus === 'hadir' ? t("common.present") : newStatus === 'terlambat' ? t("common.late") : t("common.earlyLeave")) });
      setEditRecord(null);
      fetchAttendanceData();
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message || t("attendancePage.editDialog.failUpdate"), variant: "destructive" });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteRecord = async () => {
    if (!deleteRecord) return;
    setIsDeletingRecord(true);
    try {
      const oldData = {
        id: deleteRecord.id,
        user_id: deleteRecord.user_id,
        full_name: deleteRecord.full_name,
        check_in_time: deleteRecord.check_in_time,
        check_out_time: deleteRecord.check_out_time,
        status: deleteRecord.status,
      };

      // Insert audit log first
      await supabase.from("attendance_audit_logs").insert({
        attendance_id: deleteRecord.id,
        action_type: "delete",
        changed_by: user!.id,
        old_data: oldData,
        new_data: null,
        reason: t("attendancePage.deleteDialog.auditReason"),
      });

      // Delete the record
      const { error } = await supabase.from("attendance").delete().eq("id", deleteRecord.id);
      if (error) throw error;

      toast({ title: t("common.success"), description: t("attendancePage.deleteDialog.successDeleted") });
      setDeleteRecord(null);
      fetchAttendanceData();
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message || t("attendancePage.deleteDialog.failDelete"), variant: "destructive" });
    } finally {
      setIsDeletingRecord(false);
    }
  };

  // Bulk recalculate statuses for all records in current view
  const handleRecalculateAll = async () => {
    if (attendanceData.length === 0) return;
    setIsRecalculating(true);
    let updated = 0;
    try {
      for (const record of attendanceData) {
        const checkIn = new Date(record.check_in_time);
        const checkOut = record.check_out_time ? new Date(record.check_out_time) : null;
        const newStatus = await recalculateStatus(checkIn, checkOut);
        
        if (newStatus !== record.status) {
          const { error } = await supabase
            .from("attendance")
            .update({ status: newStatus })
            .eq("id", record.id);
          if (!error) updated++;
        }
      }
      toast({ title: t("common.success"), description: `${updated} ${t("attendancePage.recalc.successCount")}` });
      fetchAttendanceData();
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message || t("attendancePage.recalc.fail"), variant: "destructive" });
    } finally {
      setIsRecalculating(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("attendancePage.title")}</h1>
            <p className="text-muted-foreground mt-1">{t("attendancePage.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="default" size="sm" onClick={() => setShowManualInput(true)}>
                <UserPlus className="h-4 w-4 mr-1" />
                {t("attendancePage.btn.manualInput")}
              </Button>
            )}
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/attendance/audit-log")}>
                <Calendar className="h-4 w-4 mr-1" />
                {t("attendancePage.btn.auditLog")}
              </Button>
            )}
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={handleRecalculateAll} disabled={isRecalculating || attendanceData.length === 0}>
                <RotateCcw className={`h-4 w-4 mr-1 ${isRecalculating ? "animate-spin" : ""}`} />
                {t("attendancePage.btn.recalculate")}
              </Button>
            )}
            <Button variant="outline" size="icon" onClick={fetchAttendanceData} disabled={isRefreshing}>
              <RefreshCw className={`h-5 w-5 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Date Filter */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t("attendancePage.filterTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-end gap-4">
              <div className="space-y-2">
                <Label>{t("common.startDate")}</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("common.endDate")}</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>

              {/* Tombol Terapkan Filter */}
              <div>
                <Button
                  variant="default"
                  onClick={fetchAttendanceData}
                  disabled={!startDate || !endDate || isRefreshing}
                >
                  {t("common.apply")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("attendancePage.stats.total")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <span className="text-3xl font-bold">{stats.totalRecords}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("attendancePage.stats.onTime")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <span className="text-3xl font-bold">{stats.onTimeCount}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("attendancePage.stats.late")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive" />
                <span className="text-3xl font-bold">{stats.lateCount}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Data {t("attendancePage.title")}</CardTitle>
                <CardDescription>
                  {t("common.period")}: {startDate && formatDate(startDate)} - {endDate && formatDate(endDate)}
                </CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("attendancePage.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {attendanceData.length > 0 ? (
              <>
                <div className="overflow-auto max-h-[calc(100vh-500px)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("attendancePage.cols.employee")}</TableHead>
                        <TableHead>{t("attendancePage.cols.date")}</TableHead>
                        <TableHead>{t("attendancePage.cols.checkIn")}</TableHead>
                        <TableHead>{t("attendancePage.cols.checkOut")}</TableHead>
                        <TableHead>{t("attendancePage.cols.duration")}</TableHead>
                        <TableHead>{t("attendancePage.cols.photo")}</TableHead>
                        <TableHead>{t("attendancePage.cols.location")}</TableHead>
                        <TableHead>{t("attendancePage.cols.status")}</TableHead>
                        {isAdmin && <TableHead>{t("attendancePage.cols.actions")}</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedData.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={record.photo_url || undefined} />
                                <AvatarFallback className="text-xs">
                                  {getInitials(record.full_name || "U")}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{record.full_name}</p>
                                <p className="text-xs text-muted-foreground">{record.departemen}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{formatDate(record.check_in_time)}</TableCell>
                          <TableCell className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            {formatTime(record.check_in_time)}
                          </TableCell>
                          <TableCell>{record.check_out_time ? formatTime(record.check_out_time) : "-"}</TableCell>
                          <TableCell>{calculateDuration(record.check_in_time, record.check_out_time)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {record.check_in_photo_url && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => openPhotoDialog(record.check_in_photo_url, "Check-In")}
                                >
                                  <Camera className="h-4 w-4 text-primary" />
                                </Button>
                              )}
                              {record.check_out_photo_url && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => openPhotoDialog(record.check_out_photo_url, "Check-Out")}
                                >
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              )}
                              {!record.check_in_photo_url && !record.check_out_photo_url && (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <MapPin
                                className={`h-4 w-4 ${record.gps_validated ? "text-primary" : "text-destructive"}`}
                              />
                              <span className="text-sm">{record.gps_validated ? t("common.valid") : t("common.invalid")}</span>
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(record.status)}</TableCell>
                          {isAdmin && (
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditDialog(record)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => setDeleteRecord(record)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <DataTablePagination
                  currentPage={currentPage}
                  totalItems={filteredData.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={setItemsPerPage}
                />
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">{t("attendancePage.noData")}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Photo Preview Dialog */}
      <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("attendancePage.photoDialog.title")} {selectedPhoto?.type}</DialogTitle>
            <DialogDescription>{t("attendancePage.photoDialog.desc")}</DialogDescription>
          </DialogHeader>
          {selectedPhoto && (
            <div className="flex justify-center">
              <img
                src={selectedPhoto.url}
                alt={`Foto ${selectedPhoto.type}`}
                className="max-w-full max-h-[60vh] rounded-lg object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Attendance Dialog */}
      <Dialog open={!!editRecord} onOpenChange={(open) => !open && setEditRecord(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("attendancePage.editDialog.title")}</DialogTitle>
            <DialogDescription>
              {editRecord?.full_name} - {editRecord && formatDate(editRecord.check_in_time)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("attendancePage.cols.checkIn")}</Label>
              <Input type="datetime-local" value={editCheckIn} onChange={(e) => setEditCheckIn(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("attendancePage.cols.checkOut")}</Label>
              <Input type="datetime-local" value={editCheckOut} onChange={(e) => setEditCheckOut(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("attendancePage.editDialog.reasonLabel")} <span className="text-destructive">*</span></Label>
              <Textarea placeholder={t("attendancePage.editDialog.reasonPlaceholder")} value={editReason} onChange={(e) => setEditReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRecord(null)} disabled={isSavingEdit}>{t("common.cancel")}</Button>
            <Button onClick={handleSaveEdit} disabled={isSavingEdit || !editReason.trim()}>
              {isSavingEdit ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Attendance Confirmation */}
      <AlertDialog open={!!deleteRecord} onOpenChange={(open) => !open && setDeleteRecord(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("attendancePage.deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("attendancePage.deleteDialog.desc")} <strong>{deleteRecord?.full_name}</strong> {t("attendancePage.deleteDialog.onDate")} <strong>{deleteRecord && formatDate(deleteRecord.check_in_time)}</strong>? {t("attendancePage.deleteDialog.irreversible")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingRecord}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRecord} disabled={isDeletingRecord} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeletingRecord ? t("common.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Manual Attendance Input Dialog */}
      <ManualAttendanceDialog
        open={showManualInput}
        onOpenChange={setShowManualInput}
        onSuccess={fetchAttendanceData}
      />
    </DashboardLayout>
  );
};

export default Attendance;

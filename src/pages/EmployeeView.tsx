import { useState, useEffect, useRef } from "react";
import logger from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import {
  Camera,
  MapPin,
  LogOut,
  User,
  Calendar,
  FileText,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import logo from "@/assets/logo.png";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CameraCapture } from "@/components/CameraCapture";
import { EmployeeBottomNav } from "@/components/EmployeeBottomNav";
import { useNavigate } from "react-router-dom";
import { uploadAttendancePhoto } from "@/lib/attendancePhotoUpload";
import LateReasonDialog from "@/components/LateReasonDialog";
import CompanyCalendar from "@/components/dashboard/CompanyCalendar";
import { format } from "date-fns";
import MarqueeBanner from "@/components/MarqueeBanner";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import MyDelegatedTasks from "@/components/MyDelegatedTasks";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";

// Office coordinates and work hours will be fetched from system settings

interface WorkHoursConfig {
  check_in_start: string;
  check_in_end: string;
  check_out_start: string;
  check_out_end: string;
  late_tolerance_minutes: number;
  early_leave_tolerance_minutes: number;
}
interface StatsData {
  leaveBalance: number;
  leaveTotal: number;
  attendanceCount: number;
}
const EmployeeView = () => {
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [todayAttendance, setTodayAttendance] = useState<any>(null);
  const [recentAttendance, setRecentAttendance] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState<"checkin" | "checkout">("checkin");
  const [officeLocations, setOfficeLocations] = useState<
    Array<{
      name: string;
      latitude: number;
      longitude: number;
      radius: number;
    }>
  >([]);
  const [workHours, setWorkHours] = useState<WorkHoursConfig | null>(null);
  const [stats, setStats] = useState<StatsData>({
    leaveBalance: 0,
    leaveTotal: 12,
    attendanceCount: 0,
  });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [nearestOffice, setNearestOffice] = useState<{
    name: string;
    distance: number;
  } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [lateReasonDialog, setLateReasonDialog] = useState<{
    open: boolean;
    type: "terlambat" | "pulang_cepat";
    durationText: string;
  }>({ open: false, type: "terlambat", durationText: "" });
  const pendingAttendanceRef = useRef<any>(null);
  const { signOut, profile, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const dateLocaleStr = i18n.resolvedLanguage?.startsWith("en") ? "en-US" : "id-ID";
  useEffect(() => {
    checkAdminStatus();
    fetchOfficeLocation();
    fetchWorkHours();
    fetchTodayAttendance();
    fetchRecentAttendance();
    fetchStats();
    
  }, [profile?.id, user?.id]);


  // Check if user is admin - admins don't need attendance
  const checkAdminStatus = async () => {
    if (!user?.id) return;
    
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();
    
    setIsAdmin(roleData?.role === 'admin');
  };

  // Real-time clock update
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch GPS location on mount
  useEffect(() => {
    const fetchGpsLocation = async () => {
      if (officeLocations.length === 0) return;
      setGpsStatus("loading");
      try {
        const location = await getCurrentLocation();
        setCurrentLocation(location);

        // Find nearest office
        let nearest: {
          name: string;
          distance: number;
        } | null = null;
        for (const office of officeLocations) {
          const distance = calculateDistance(location.latitude, location.longitude, office.latitude, office.longitude);
          if (!nearest || distance < nearest.distance) {
            nearest = {
              name: office.name,
              distance,
            };
          }
        }
        setNearestOffice(nearest);
        setGpsStatus("success");
      } catch (error) {
        logger.error("GPS error:", error);
        setGpsStatus("error");
      }
    };
    if (officeLocations.length > 0) {
      fetchGpsLocation();
    }
  }, [officeLocations]);
  const fetchOfficeLocation = async () => {
    try {
      const { data, error } = await supabase.rpc("get_office_locations");
      if (error) throw error;
      if (data && Array.isArray(data)) {
        const locations = data as Array<{
          name: string;
          latitude: number;
          longitude: number;
          radius: number;
        }>;
        setOfficeLocations(locations);
      }
    } catch (error) {
      logger.error("Error fetching office locations:", error);
    }
  };
  const fetchWorkHours = async () => {
    try {
      // Try effective work hours first (considers special periods like Ramadhan)
      const { data: effectiveData, error: effectiveError } = await supabase.rpc('get_effective_work_hours');
      if (!effectiveError && effectiveData) {
        setWorkHours(effectiveData as unknown as WorkHoursConfig);
        return;
      }
      // Fallback to normal work hours
      const { data, error } = await supabase.rpc('get_work_hours');
      if (error) throw error;
      if (data) {
        setWorkHours(data as unknown as WorkHoursConfig);
      }
    } catch (error) {
      logger.error("Error fetching work hours:", error);
    }
  };
  const fetchTodayAttendance = async () => {
    if (!profile?.id) return;
    
    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", profile.id)
      .gte("check_in_time", `${today}T00:00:00`)
      .lte("check_in_time", `${today}T23:59:59`)
      .order("check_in_time", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (error) {
      logger.error("Error fetching today attendance:", error);
      return;
    }
    
    if (data) {
      setTodayAttendance(data);
      setIsCheckedIn(true);
      setCheckInTime(
        new Date(data.check_in_time).toLocaleTimeString(dateLocaleStr, {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } else {
      // No attendance today - reset state
      setTodayAttendance(null);
      setIsCheckedIn(false);
      setCheckInTime(null);
    }
  };
  const fetchRecentAttendance = async () => {
    if (!profile?.id) return;
    
    const { data, error } = await supabase
      .from("attendance")
      .select("*")
      .eq("user_id", profile.id)
      .order("check_in_time", {
        ascending: false,
      })
      .limit(3);
    
    if (error) {
      logger.error("Error fetching recent attendance:", error);
      return;
    }
    
    if (data) {
      setRecentAttendance(data);
    }
  };
  const fetchStats = async () => {
    if (!profile?.id) return;
    try {
      // Get current month attendance count
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
      const { count: attendanceCount } = await supabase
        .from("attendance")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq("user_id", profile.id)
        .gte("check_in_time", startOfMonth)
        .lte("check_in_time", endOfMonth);
      setStats({
        leaveBalance: profile.remaining_leave || 0,
        leaveTotal: profile.annual_leave_quota || 12,
        attendanceCount: attendanceCount || 0,
      });
    } catch (error) {
      logger.error("Error fetching stats:", error);
    }
  };
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
  };
  const getCurrentLocation = (): Promise<{
    latitude: number;
    longitude: number;
  }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation tidak didukung oleh browser Anda"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          reject(new Error("Tidak dapat mengakses lokasi: " + error.message));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        },
      );
    });
  };
  const handleCheckIn = async (photoUrl: string) => {
    setIsProcessing(true);
    try {
      // Step 1: Convert blob URL to blob for storage upload
      const response = await fetch(photoUrl);
      const blob = await response.blob();
      
      // Step 2: Get current location
      const location = await getCurrentLocation();

      // Step 3: Check distance from all office locations
      if (officeLocations.length === 0) {
        throw new Error("Lokasi kantor belum dikonfigurasi. Hubungi admin.");
      }

      // Check if user is a hybrid worker (can check in from anywhere)
      const isHybridWorker = profile?.work_type === 'wfa';

      let nearestOffice: {
        name: string;
        distance: number;
        radius: number;
      } | null = null;
      
      for (const office of officeLocations) {
        const distance = calculateDistance(
          location.latitude,
          location.longitude,
          office.latitude,
          office.longitude,
        );
        if (!nearestOffice || distance < nearestOffice.distance) {
          nearestOffice = {
            name: office.name,
            distance,
            radius: office.radius,
          };
        }
      }

      // Only validate location for non-hybrid workers
      if (!isHybridWorker) {
        let isWithinRadius = false;
        for (const office of officeLocations) {
          const distance = calculateDistance(
            location.latitude,
            location.longitude,
            office.latitude,
            office.longitude,
          );
          if (distance <= office.radius) {
            isWithinRadius = true;
            break;
          }
        }

        if (!isWithinRadius) {
          const distances = officeLocations
            .map((office) => {
              const d = calculateDistance(location.latitude, location.longitude, office.latitude, office.longitude);
              return `${office.name}: ${Math.round(d)}m`;
            })
            .join(", ");
          toast({
            title: "Lokasi Tidak Valid",
            description: `Anda tidak berada di area kantor manapun. Jarak: ${distances}`,
            variant: "destructive",
          });
          setIsProcessing(false);
          return;
        }
      }

      // Step 4: Upload photo to storage
      const photoPath = await uploadAttendancePhoto(blob, profile?.id!, 'checkin');

      // Step 5: Record check-in with status based on work hours settings
      const now = new Date();
      let status: "hadir" | "terlambat" = "hadir";
      const checkInHour = now.getHours();
      const checkInMinute = now.getMinutes();
      const checkInTotalMinutes = checkInHour * 60 + checkInMinute;
      if (workHours && workHours.check_in_end) {
        // Parse check_in_end time (e.g., "09:00")
        const [endHour, endMinute] = workHours.check_in_end.split(":").map(Number);
        const lateThreshold = endHour * 60 + endMinute + (workHours.late_tolerance_minutes || 0);
        logger.debug("Work hours check:", { isLate: checkInTotalMinutes > lateThreshold });
        if (checkInTotalMinutes > lateThreshold) {
          status = "terlambat";
        }
      } else {
        // Default: jam 09:00 + 15 menit toleransi = 09:15 (555 menit)
        const defaultLateThreshold = 9 * 60 + 15; // 555 menit
        logger.debug("Default check:", { isLate: checkInTotalMinutes > defaultLateThreshold });
        if (checkInTotalMinutes > defaultLateThreshold) {
          status = "terlambat";
        }
      }
      
      let locationNote = isHybridWorker 
        ? `Check-in Hybrid di ${nearestOffice?.name || 'lokasi'} (${nearestOffice ? Math.round(nearestOffice.distance) : 0}m)`
        : `Check-in di ${nearestOffice?.name} (${Math.round(nearestOffice?.distance || 0)}m)`;
      
      // Add lateness detail to notes
      let lateText = "";
      if (status === "terlambat") {
        let lateMinutes = 0;
        if (workHours && workHours.check_in_end) {
          const [endHour, endMinute] = workHours.check_in_end.split(":").map(Number);
          const lateThreshold = endHour * 60 + endMinute + (workHours.late_tolerance_minutes || 0);
          lateMinutes = checkInTotalMinutes - lateThreshold;
        } else {
          const defaultLateThreshold = 9 * 60 + 15;
          lateMinutes = checkInTotalMinutes - defaultLateThreshold;
        }
        if (lateMinutes > 0) {
          const lateHours = Math.floor(lateMinutes / 60);
          const lateRemMins = lateMinutes % 60;
          lateText = lateHours > 0 
            ? `Terlambat ${lateHours} jam ${lateRemMins > 0 ? `${lateRemMins} menit` : ''}`
            : `Terlambat ${lateRemMins} menit`;
          locationNote += ` | ${lateText.trim()}`;
        }
      }

      // If late, show reason dialog before saving
      if (status === "terlambat") {
        pendingAttendanceRef.current = {
          type: "checkin",
          insertData: {
            user_id: profile?.id!,
            check_in_time: now.toISOString(),
            check_in_latitude: location.latitude,
            check_in_longitude: location.longitude,
            check_in_photo_url: photoPath,
            gps_validated: !isHybridWorker ? true : false,
            face_recognition_validated: false,
            status: status,
            notes: locationNote,
          },
          nearestOffice,
          isHybridWorker,
        };
        setLateReasonDialog({
          open: true,
          type: "terlambat",
          durationText: lateText.trim(),
        });
        setIsProcessing(false);
        return;
      }

      // Not late - proceed directly
      await completeCheckIn({
        user_id: profile?.id!,
        check_in_time: now.toISOString(),
        check_in_latitude: location.latitude,
        check_in_longitude: location.longitude,
        check_in_photo_url: photoPath,
        gps_validated: !isHybridWorker ? true : false,
        face_recognition_validated: false,
        status: status,
        notes: locationNote,
      }, nearestOffice, isHybridWorker);
    } catch (error: any) {
      toast({
        title: "Check-In Gagal",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };
  const handleCheckOut = async (photoUrl: string) => {
    setIsProcessing(true);
    try {
      // Step 1: Convert blob URL to blob for storage upload
      const response = await fetch(photoUrl);
      const blob = await response.blob();

      // Step 2: Get location and validate
      const location = await getCurrentLocation();

      // Check if user is a hybrid worker (can check out from anywhere)
      const isHybridWorker = profile?.work_type === 'wfa';

      // Find nearest office for notes
      let nearestOffice: {
        name: string;
        distance: number;
        radius: number;
      } | null = null;
      for (const office of officeLocations) {
        const distance = calculateDistance(
          location.latitude,
          location.longitude,
          office.latitude,
          office.longitude,
        );
        if (!nearestOffice || distance < nearestOffice.distance) {
          nearestOffice = {
            name: office.name,
            distance,
            radius: office.radius,
          };
        }
      }

      // Only validate location for non-hybrid workers
      if (!isHybridWorker) {
        let isWithinRadius = false;
        for (const office of officeLocations) {
          const distance = calculateDistance(
            location.latitude,
            location.longitude,
            office.latitude,
            office.longitude,
          );
          if (distance <= office.radius) {
            isWithinRadius = true;
            break;
          }
        }

        if (!isWithinRadius) {
          const distances = officeLocations
            .map((office) => {
              const d = calculateDistance(location.latitude, location.longitude, office.latitude, office.longitude);
              return `${office.name}: ${Math.round(d)}m`;
            })
            .join(", ");
          toast({
            title: "Lokasi Tidak Valid",
            description: `Anda tidak berada di area kantor manapun. Jarak: ${distances}`,
            variant: "destructive",
          });
          setIsProcessing(false);
          return;
        }
      }

      // Step 3: Upload photo to storage
      const photoPath = await uploadAttendancePhoto(blob, profile?.id!, 'checkout');

      const now = new Date();
      const checkInTime = new Date(todayAttendance.check_in_time);
      const durationMinutes = Math.floor((now.getTime() - checkInTime.getTime()) / 60000);

      // Determine checkout status based on time
      let finalStatus = todayAttendance.status;
      const checkOutHour = now.getHours();
      const checkOutMinute = now.getMinutes();
      const checkOutTotalMinutes = checkOutHour * 60 + checkOutMinute;
      if (workHours && workHours.check_out_start) {
        const [startHour, startMinute] = workHours.check_out_start.split(":").map(Number);
        const earlyLeaveThreshold = startHour * 60 + startMinute - (workHours.early_leave_tolerance_minutes || 0);
        logger.debug("Checkout check:", { isEarly: checkOutTotalMinutes < earlyLeaveThreshold });
        if (checkOutTotalMinutes < earlyLeaveThreshold) {
          finalStatus = "pulang_cepat";
        }
      } else {
        // Default: sebelum 16:45 (17:00 - 15 menit toleransi) = pulang cepat
        const defaultEarlyLeaveThreshold = 17 * 60 - 15; // 1005 menit (16:45)
        logger.debug("Default checkout:", { isEarly: checkOutTotalMinutes < defaultEarlyLeaveThreshold });
        if (checkOutTotalMinutes < defaultEarlyLeaveThreshold) {
          finalStatus = "pulang_cepat";
        }
      }

      let checkoutLocationNote = isHybridWorker
        ? `${todayAttendance.notes}, Check-out Hybrid di ${nearestOffice?.name || 'lokasi'} (${nearestOffice ? Math.round(nearestOffice.distance) : 0}m)`
        : nearestOffice
          ? `${todayAttendance.notes}, Check-out di ${nearestOffice.name} (${Math.round(nearestOffice.distance)}m)`
          : todayAttendance.notes;

      // Add early departure detail to notes
      let earlyText = "";
      if (finalStatus === "pulang_cepat") {
        let earlyMinutes = 0;
        if (workHours && workHours.check_out_start) {
          const [startHour, startMinute] = workHours.check_out_start.split(":").map(Number);
          const earlyLeaveThreshold = startHour * 60 + startMinute - (workHours.early_leave_tolerance_minutes || 0);
          earlyMinutes = earlyLeaveThreshold - checkOutTotalMinutes;
        } else {
          const defaultEarlyLeaveThreshold = 17 * 60 - 15;
          earlyMinutes = defaultEarlyLeaveThreshold - checkOutTotalMinutes;
        }
        if (earlyMinutes > 0) {
          const earlyHours = Math.floor(earlyMinutes / 60);
          const earlyRemMins = earlyMinutes % 60;
          earlyText = earlyHours > 0 
            ? `Pulang cepat ${earlyHours} jam ${earlyRemMins > 0 ? `${earlyRemMins} menit` : ''}`
            : `Pulang cepat ${earlyRemMins} menit`;
          checkoutLocationNote += ` | ${earlyText.trim()}`;
        }
      }

      // If early departure, show reason dialog before saving
      if (finalStatus === "pulang_cepat") {
        pendingAttendanceRef.current = {
          type: "checkout",
          updateData: {
            check_out_time: now.toISOString(),
            check_out_latitude: location.latitude,
            check_out_longitude: location.longitude,
            check_out_photo_url: photoPath,
            duration_minutes: durationMinutes,
            status: finalStatus,
            notes: checkoutLocationNote,
          },
          attendanceId: todayAttendance.id,
        };
        setLateReasonDialog({
          open: true,
          type: "pulang_cepat",
          durationText: earlyText.trim(),
        });
        setIsProcessing(false);
        return;
      }

      // Not early - proceed directly
      await completeCheckOut({
        check_out_time: now.toISOString(),
        check_out_latitude: location.latitude,
        check_out_longitude: location.longitude,
        check_out_photo_url: photoPath,
        duration_minutes: durationMinutes,
        status: finalStatus,
        notes: checkoutLocationNote,
      }, todayAttendance.id);
    } catch (error: any) {
      toast({
        title: "Check-Out Gagal",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };
  const completeCheckIn = async (insertData: any, nearestOffice: any, isHybridWorker: boolean) => {
    try {
      const { data, error } = await supabase
        .from("attendance")
        .insert([insertData])
        .select()
        .single();
      
      if (error) throw error;
      
      setIsCheckedIn(true);
      setTodayAttendance(data);
      setCheckInTime(
        new Date(insertData.check_in_time).toLocaleTimeString(dateLocaleStr, {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      toast({
        title: "Check-In Berhasil",
        description: isHybridWorker 
          ? `Check-in Hybrid berhasil! Lokasi: ${nearestOffice?.name || 'Lokasi saat ini'}`
          : `Terima kasih! Check-in di ${nearestOffice?.name} (${Math.round(nearestOffice?.distance || 0)}m)`,
      });
      fetchRecentAttendance();
    } catch (error: any) {
      toast({
        title: "Check-In Gagal",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const completeCheckOut = async (updateData: any, attendanceId: string) => {
    try {
      const { data: updatedData, error } = await supabase
        .from("attendance")
        .update(updateData)
        .eq("id", attendanceId)
        .select()
        .single();
      
      if (error) throw error;

      setTodayAttendance(updatedData);
      toast({
        title: "Check-Out Berhasil",
        description:
          updateData.status === "pulang_cepat" ? "Anda pulang lebih awal dari jadwal" : "Sampai jumpa besok!",
      });
      fetchRecentAttendance();
    } catch (error: any) {
      toast({
        title: "Check-Out Gagal",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleLateReasonConfirm = async (reason: string) => {
    const pending = pendingAttendanceRef.current;
    if (!pending) return;

    setLateReasonDialog({ ...lateReasonDialog, open: false });
    setIsProcessing(true);

    if (pending.type === "checkin") {
      const insertData = {
        ...pending.insertData,
        notes: `${pending.insertData.notes} | Alasan: ${reason}`,
      };
      await completeCheckIn(insertData, pending.nearestOffice, pending.isHybridWorker);
    } else {
      const updateData = {
        ...pending.updateData,
        notes: `${pending.updateData.notes} | Alasan: ${reason}`,
      };
      await completeCheckOut(updateData, pending.attendanceId);
    }

    pendingAttendanceRef.current = null;
    setIsProcessing(false);
  };

  const handleLateReasonCancel = () => {
    setLateReasonDialog({ ...lateReasonDialog, open: false });
    pendingAttendanceRef.current = null;
    toast({
      title: "Dibatalkan",
      description: "Absensi dibatalkan karena alasan tidak diisi.",
      variant: "destructive",
    });
  };

  const formatStatus = (status: string) => {
    const statusMap: Record<string, string> = {
      hadir: "Hadir",
      terlambat: "Terlambat",
      pulang_cepat: "Pulang Cepat",
      tidak_hadir: "Tidak Hadir",
    };
    return statusMap[status] || status;
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 pb-24">
      {/* Fixed Header with Marquee */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-card" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <MarqueeBanner />
        <header className="bg-card border-b border-border">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <img src={logo} alt="Kemika" className="h-10 object-contain" />
            <div className="flex items-center gap-1">
              <LanguageSwitcher variant="ghost" />
              <Button variant="ghost" size="icon" onClick={signOut}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </header>
      </div>

      <div className="container mx-auto px-4 pt-24 pb-6 max-w-lg space-y-6">
        {/* Welcome Card with Profile */}
        <Card>
          <CardHeader className="pb-4 bg-[#049466]/[0.04]">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 ring-2 ring-primary/20">
                <AvatarImage src={profile?.photo_url || undefined} alt={profile?.full_name} />
                <AvatarFallback className="bg-primary/10 text-primary text-lg">
                  {profile?.full_name
                    ?.split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2) || <User className="h-8 w-8" />}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <CardTitle className="text-xl">
                  {t("employeeHome.greeting")}
                  <br />
                  {profile?.full_name || "User"}!
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">{profile?.jabatan || t("employeeHome.defaultRole")}</p>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Check-In/Out Card - Hidden for Admin */}
        {isAdmin ? (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6 space-y-4">
              {/* Real-time Clock */}
              <div className="text-center">
                <div className="text-4xl font-bold text-primary tabular-nums tracking-wider">
                  {currentTime.getHours().toString().padStart(2, "0")}
                  <span className="animate-pulse">.</span>
                  {currentTime.getMinutes().toString().padStart(2, "0")}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {currentTime.toLocaleDateString(dateLocaleStr, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
              
              <div className="text-center py-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium text-primary">
                    {t("employeeHome.adminNoAttendance")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {t("employeeHome.adminExcluded")}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6 space-y-4">
              {/* Real-time Clock */}
              <div className="text-center">
                <div className="text-4xl font-bold text-primary tabular-nums tracking-wider">
                  {currentTime.getHours().toString().padStart(2, "0")}
                  <span className="animate-pulse">.</span>
                  {currentTime.getMinutes().toString().padStart(2, "0")}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {currentTime.toLocaleDateString(dateLocaleStr, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>

              {/* GPS Status */}
              <div className="flex items-center justify-center gap-2 text-sm">
                {gpsStatus === "loading" && (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-muted-foreground">{t("employeeHome.gpsDetecting")}</span>
                  </>
                )}
                {gpsStatus === "success" && nearestOffice && (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-muted-foreground">
                      {nearestOffice.name} •{" "}
                      <span className={nearestOffice.distance <= 100 ? "text-green-600 font-medium" : "text-destructive"}>
                        {Math.round(nearestOffice.distance)}m
                      </span>
                    </span>
                  </>
                )}
                {gpsStatus === "error" && (
                  <>
                    <XCircle className="h-4 w-4 text-destructive" />
                    <span className="text-destructive">{t("employeeHome.gpsFailed")}</span>
                  </>
                )}
                {gpsStatus === "idle" && (
                  <>
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{t("employeeHome.gpsWillValidate")}</span>
                  </>
                )}
              </div>

              {/* Work Hours Info */}
              {workHours && (
                <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent/50 border border-border">
                  <Clock className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-xs text-muted-foreground">
                    {t("employeeHome.workHoursToday")}{" "}
                    <span className="font-semibold text-foreground">
                      {workHours.check_in_start || "08:00"} - {workHours.check_out_end || "17:00"}
                    </span>
                    <span className="ml-1 text-muted-foreground">
                      {t("employeeHome.lateTolerance", { minutes: workHours.late_tolerance_minutes || 0 })}
                    </span>
                  </span>
                </div>
              )}

              {/* Check-in/Check-out Time Pills */}
              <div className="flex gap-2">
                <div className="flex-1 bg-primary/10 rounded-lg px-5 py-2 pl-[5px] pr-[26px]">
                  <span className="font-medium text-foreground text-xs">
                    Check-in:{" "}
                    {todayAttendance?.check_in_time ? (
                      <span className="text-primary font-semibold">
                        {new Date(todayAttendance.check_in_time).toLocaleTimeString(dateLocaleStr, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </span>
                </div>
                <div className="flex-1 rounded-lg px-5 py-2 pl-[5px] pr-[24px] bg-red-100">
                  <span className="font-medium text-foreground text-xs">
                    Check-out:{" "}
                    {todayAttendance?.check_out_time ? (
                      <span className="text-primary font-semibold">
                        {new Date(todayAttendance.check_out_time).toLocaleTimeString(dateLocaleStr, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Action Button */}
              {todayAttendance?.check_out_time ? (
                <div className="text-center py-3 text-muted-foreground">{t("employeeHome.attendanceDone")}</div>
              ) : todayAttendance ? (
                <Button
                  onClick={() => {
                    setCameraMode("checkout");
                    setShowCamera(true);
                  }}
                  disabled={isProcessing}
                  className="w-full h-10 font-semibold text-lg bg-primary hover:bg-primary/90"
                >
                  <Camera className="h-5 w-5 mr-2" />
                  {isProcessing ? t("common.processing") : t("employeeHome.checkOutBtn")}
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setCameraMode("checkin");
                    setShowCamera(true);
                  }}
                  disabled={isProcessing}
                  className="w-full h-10 font-semibold bg-primary hover:bg-primary/90 text-base"
                >
                  <Camera className="h-5 w-5 mr-2" />
                  {isProcessing ? t("common.processing") : t("employeeHome.checkInBtn")}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Stats Card */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-4">
              <div
                className="flex items-center gap-3 p-3 bg-card rounded-lg cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate("/employee/leave-request")}
              >
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Calendar className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Cuti</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-bold text-primary">
                    {stats.leaveBalance}/{stats.leaveTotal}
                  </p>
                </div>
              </div>
              <div
                className="flex items-center gap-3 p-3 bg-card rounded-lg cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate("/employee/attendance-history")}
              >
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <User className="h-5 w-5 text-green-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Kehadiran</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-bold text-primary">Lihat</p>
                </div>
              </div>
              <div
                className="flex items-center gap-3 p-3 bg-card rounded-lg cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate("/employee/request-history")}
              >
                <div className="p-2 bg-orange-500/10 rounded-lg">
                  <FileText className="h-5 w-5 text-orange-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Riwayat</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-bold text-primary">Lihat</p>
                </div>
              </div>
              <div
                className="flex items-center gap-3 p-3 bg-card rounded-lg cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate("/employee/performance")}
              >
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <User className="h-5 w-5 text-purple-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Performa</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-bold text-primary">Lihat</p>
                </div>
              </div>
        </div>
          </CardContent>
        </Card>


        {/* My Delegated Tasks - Tugas yang didelegasikan ke saya */}
        <MyDelegatedTasks />

        {/* Company Calendar */}
        <CompanyCalendar />
      </div>

      <EmployeeBottomNav />
      <PWAInstallPrompt />

      <CameraCapture
        isOpen={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={(photoUrl) => {
          if (cameraMode === "checkin") {
            handleCheckIn(photoUrl);
          } else {
            handleCheckOut(photoUrl);
          }
        }}
        title={cameraMode === "checkin" ? "Check-In" : "Check-Out"}
      />

      <LateReasonDialog
        open={lateReasonDialog.open}
        type={lateReasonDialog.type}
        durationText={lateReasonDialog.durationText}
        onConfirm={handleLateReasonConfirm}
        onCancel={handleLateReasonCancel}
      />
    </div>
  );
};
export default EmployeeView;

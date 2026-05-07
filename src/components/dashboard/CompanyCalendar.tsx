import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar, ChevronLeft, ChevronRight, Star, Palmtree, Clock, Briefcase, Plane, CalendarDays, Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isToday, parseISO } from "date-fns";
import { id as idLocale, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";

interface Holiday {
  id: string;
  name: string;
  date: string;
}

interface SpecialPeriod {
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  check_in_end?: string;
  check_out_start?: string;
}

interface LeaveDay {
  leave_type: string;
  label: string;
  delegate_name?: string | null;
  delegate_jabatan?: string | null;
  delegation_notes?: string | null;
}

interface TravelDay {
  destination: string;
  purpose: string;
}

interface CompanyEvent {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
}

const CompanyCalendar = () => {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.resolvedLanguage?.startsWith("en") ? enUS : idLocale;
  const leaveTypeLabels: Record<string, string> = {
    cuti_tahunan: t("companyCalendar.leaveTypes.cuti_tahunan"),
    izin: t("companyCalendar.leaveTypes.izin"),
    sakit: t("companyCalendar.leaveTypes.sakit"),
    lupa_absen: t("companyCalendar.leaveTypes.lupa_absen"),
  };
  const { user, userRole } = useAuth();
  const isAdmin = userRole === "admin";
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [specialPeriods, setSpecialPeriods] = useState<SpecialPeriod[]>([]);
  const [leaveDaysMap, setLeaveDaysMap] = useState<Map<string, LeaveDay[]>>(new Map());
  const [travelDaysMap, setTravelDaysMap] = useState<Map<string, TravelDay[]>>(new Map());
  const [companyEventsMap, setCompanyEventsMap] = useState<Map<string, CompanyEvent[]>>(new Map());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [addEventDate, setAddEventDate] = useState<Date | null>(null);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventEndDate, setNewEventEndDate] = useState("");
  const [newEventDescription, setNewEventDescription] = useState("");
  const [addingEvent, setAddingEvent] = useState(false);
  const [addMode, setAddMode] = useState<"event" | "holiday">("event");
  const [editingEvent, setEditingEvent] = useState<CompanyEvent | null>(null);
  const [editEventTitle, setEditEventTitle] = useState("");
  const [editEventDescription, setEditEventDescription] = useState("");
  const [editEventStartDate, setEditEventStartDate] = useState("");
  const [editEventEndDate, setEditEventEndDate] = useState("");
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [editHolidayName, setEditHolidayName] = useState("");
  const [fullOvertimeConfig, setFullOvertimeConfig] = useState<any>(null);

  useEffect(() => {
    fetchCalendarData();
  }, []);

  useEffect(() => {
    if (user) {
      fetchLeaveData();
      fetchTravelData();
    }
    fetchCompanyEvents();
  }, [user, currentMonth]);

  const fetchCalendarData = async () => {
    const [{ data: overtimeSettings }, { data: specialSettings }] = await Promise.all([
      supabase.from("system_settings").select("value").eq("key", "overtime_policy").single(),
      supabase.from("system_settings").select("value").eq("key", "special_work_hours").single(),
    ]);

    if (overtimeSettings?.value) {
      const val = overtimeSettings.value as any;
      setHolidays(val.holidays || []);
      setFullOvertimeConfig(val);
    }

    if (specialSettings?.value) {
      const val = specialSettings.value as any;
      setSpecialPeriods(val.periods || []);
    }
  };

  const fetchLeaveData = async () => {
    if (!user) return;
    const monthStart = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd");

    const { data } = await supabase
      .from("leave_requests")
      .select("start_date, end_date, leave_type, delegated_to, delegation_notes")
      .eq("user_id", user.id)
      .eq("status", "approved")
      .gte("end_date", monthStart)
      .lte("start_date", monthEnd);

    // Fetch delegate profiles
    const delegateIds = [...new Set((data || []).map((d: any) => d.delegated_to).filter(Boolean))];
    let delegateMap = new Map<string, { full_name: string; jabatan: string }>();
    if (delegateIds.length > 0) {
      const { data: delegates } = await supabase
        .from("profiles")
        .select("id, full_name, jabatan")
        .in("id", delegateIds);
      delegateMap = new Map((delegates || []).map((p) => [p.id, { full_name: p.full_name, jabatan: p.jabatan }]));
    }

    const map = new Map<string, LeaveDay[]>();
    if (data) {
      data.forEach((leave: any) => {
        const start = parseISO(leave.start_date);
        const end = parseISO(leave.end_date);
        const days = eachDayOfInterval({ start, end });
        const delegate = leave.delegated_to ? delegateMap.get(leave.delegated_to) : null;
        days.forEach((d) => {
          const key = format(d, "yyyy-MM-dd");
          const existing = map.get(key) || [];
          existing.push({
            leave_type: leave.leave_type,
            label: leaveTypeLabels[leave.leave_type] || leave.leave_type,
            delegate_name: delegate?.full_name || null,
            delegate_jabatan: delegate?.jabatan || null,
            delegation_notes: leave.delegation_notes || null,
          });
          map.set(key, existing);
        });
      });
    }
    setLeaveDaysMap(map);
  };

  const fetchTravelData = async () => {
    if (!user) return;
    const mStart = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const mEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd");

    const { data } = await supabase
      .from("business_travel_requests")
      .select("start_date, end_date, destination, purpose")
      .eq("user_id", user.id)
      .eq("status", "approved")
      .gte("end_date", mStart)
      .lte("start_date", mEnd);

    const map = new Map<string, TravelDay[]>();
    if (data) {
      data.forEach((t) => {
        const start = parseISO(t.start_date);
        const end = parseISO(t.end_date);
        eachDayOfInterval({ start, end }).forEach((d) => {
          const key = format(d, "yyyy-MM-dd");
          const existing = map.get(key) || [];
          existing.push({ destination: t.destination, purpose: t.purpose });
          map.set(key, existing);
        });
      });
    }
    setTravelDaysMap(map);
  };
  const fetchCompanyEvents = async () => {
    const mStart = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const mEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd");

    const { data } = await supabase
      .from("company_events")
      .select("id, title, description, start_date, end_date")
      .gte("end_date", mStart)
      .lte("start_date", mEnd);

    const map = new Map<string, CompanyEvent[]>();
    if (data) {
      data.forEach((e: any) => {
        const start = parseISO(e.start_date);
        const end = parseISO(e.end_date);
        eachDayOfInterval({ start, end }).forEach((d) => {
          const key = format(d, "yyyy-MM-dd");
          const existing = map.get(key) || [];
          existing.push({ id: e.id, title: e.title, description: e.description, start_date: e.start_date, end_date: e.end_date });
          map.set(key, existing);
        });
      });
    }
    setCompanyEventsMap(map);
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const startDayOfWeek = getDay(monthStart);
  const paddingDays = startDayOfWeek;

  const holidayMap = useMemo(() => {
    const map = new Map<string, string>();
    holidays.forEach(h => map.set(h.date, h.name));
    return map;
  }, [holidays]);

  const getSpecialPeriodForDate = (date: Date): SpecialPeriod | null => {
    const dateStr = format(date, "yyyy-MM-dd");
    return specialPeriods.find(p =>
      p.is_active && dateStr >= p.start_date && dateStr <= p.end_date
    ) || null;
  };

  const isWeekend = (date: Date) => {
    const day = getDay(date);
    return day === 0 || day === 6;
  };

  const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

  const handleAddEvent = async () => {
    if (!addEventDate || !newEventTitle.trim() || !user) return;
    setAddingEvent(true);
    try {
      const startDate = format(addEventDate, "yyyy-MM-dd");
      const endDate = newEventEndDate || startDate;
      const { error } = await supabase.from("company_events").insert({
        title: newEventTitle.trim(),
        description: newEventDescription.trim() || null,
        start_date: startDate,
        end_date: endDate,
        created_by: user.id,
      });
      if (error) throw error;
      toast.success("Event berhasil ditambahkan");
      setAddEventDate(null);
      fetchCompanyEvents();
    } catch (err: any) {
      toast.error("Gagal menambah event: " + err.message);
    } finally {
      setAddingEvent(false);
    }
  };

  const handleAddHoliday = async () => {
    if (!addEventDate || !newEventTitle.trim()) return;
    setAddingEvent(true);
    try {
      const dateStr = format(addEventDate, "yyyy-MM-dd");
      const newHoliday: Holiday = { id: crypto.randomUUID(), name: newEventTitle.trim(), date: dateStr };
      const updatedHolidays = [...holidays, newHoliday];
      const updatedConfig = { ...(fullOvertimeConfig || {}), holidays: updatedHolidays };

      const { data: existingData } = await supabase.from("system_settings").select("id").eq("key", "overtime_policy").maybeSingle();
      if (existingData) {
        const { error } = await supabase.from("system_settings").update({ value: updatedConfig, updated_at: new Date().toISOString() }).eq("key", "overtime_policy");
        if (error) throw error;
      } else {
        const { error } = await supabase.from("system_settings").insert({ key: "overtime_policy", value: updatedConfig, description: "Konfigurasi kebijakan lembur" });
        if (error) throw error;
      }
      setHolidays(updatedHolidays);
      setFullOvertimeConfig(updatedConfig);
      toast.success("Hari libur berhasil ditambahkan");
      setAddEventDate(null);
    } catch (err: any) {
      toast.error("Gagal menambah hari libur: " + err.message);
    } finally {
      setAddingEvent(false);
    }
  };

  const handleDeleteHoliday = async (holidayId: string) => {
    try {
      const updatedHolidays = holidays.filter(h => h.id !== holidayId);
      const updatedConfig = { ...(fullOvertimeConfig || {}), holidays: updatedHolidays };
      const { error } = await supabase.from("system_settings").update({ value: updatedConfig, updated_at: new Date().toISOString() }).eq("key", "overtime_policy");
      if (error) throw error;
      setHolidays(updatedHolidays);
      setFullOvertimeConfig(updatedConfig);
      toast.success("Hari libur berhasil dihapus");
      setSelectedDate(null);
    } catch (err: any) {
      toast.error("Gagal menghapus: " + err.message);
    }
  };

  const handleEditHoliday = async () => {
    if (!editingHoliday || !editHolidayName.trim()) return;
    try {
      const updatedHolidays = holidays.map(h => h.id === editingHoliday.id ? { ...h, name: editHolidayName.trim() } : h);
      const updatedConfig = { ...(fullOvertimeConfig || {}), holidays: updatedHolidays };
      const { error } = await supabase.from("system_settings").update({ value: updatedConfig, updated_at: new Date().toISOString() }).eq("key", "overtime_policy");
      if (error) throw error;
      setHolidays(updatedHolidays);
      setFullOvertimeConfig(updatedConfig);
      toast.success("Hari libur berhasil diperbarui");
      setEditingHoliday(null);
      setSelectedDate(null);
    } catch (err: any) {
      toast.error("Gagal mengubah: " + err.message);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    try {
      const { error } = await supabase.from("company_events").delete().eq("id", eventId);
      if (error) throw error;
      toast.success("Event berhasil dihapus");
      setSelectedDate(null);
      fetchCompanyEvents();
    } catch (err: any) {
      toast.error("Gagal menghapus event: " + err.message);
    }
  };

  const handleEditEvent = async () => {
    if (!editingEvent || !editEventTitle.trim()) return;
    try {
      const { error } = await supabase.from("company_events").update({
        title: editEventTitle.trim(),
        description: editEventDescription.trim() || null,
        start_date: editEventStartDate,
        end_date: editEventEndDate,
        updated_at: new Date().toISOString(),
      }).eq("id", editingEvent.id);
      if (error) throw error;
      toast.success("Event berhasil diperbarui");
      setEditingEvent(null);
      setSelectedDate(null);
      fetchCompanyEvents();
    } catch (err: any) {
      toast.error("Gagal mengubah event: " + err.message);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" />
            Kalender Perusahaan
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[120px] text-center">
              {format(currentMonth, "MMMM yyyy", { locale: dateLocale })}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {dayNames.map(d => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: paddingDays }).map((_, i) => (
            <div key={`pad-${i}`} className="aspect-square" />
          ))}

          {daysInMonth.map(date => {
            const dateStr = format(date, "yyyy-MM-dd");
            const holidayName = holidayMap.get(dateStr);
            const specialPeriod = getSpecialPeriodForDate(date);
            const weekend = isWeekend(date);
            const today = isToday(date);
            const leaveDays = leaveDaysMap.get(dateStr);
            const travelDays = travelDaysMap.get(dateStr);
            const companyEvents = companyEventsMap.get(dateStr);

            const hasEvent = !!holidayName || !!specialPeriod || !!leaveDays || !!travelDays || !!companyEvents;

            let bgClass = "bg-background hover:bg-accent/50";
            if (today) bgClass = "bg-primary/10 ring-1 ring-primary";
            else if (holidayName) bgClass = "bg-destructive/10";
            else if (companyEvents) bgClass = "bg-blue-500/10";
            else if (travelDays) bgClass = "bg-green-500/10";
            else if (leaveDays) bgClass = "bg-indigo-500/10";
            else if (specialPeriod) bgClass = "bg-chart-4/20";
            else if (weekend) bgClass = "bg-muted/50";

            const handleDateClick = () => {
              if (hasEvent) {
                setSelectedDate(date);
              } else if (isAdmin) {
                setAddEventDate(date);
                setAddMode("event");
                setNewEventTitle("");
                setNewEventEndDate(format(date, "yyyy-MM-dd"));
                setNewEventDescription("");
              }
            };

            const content = (
              <div
                onClick={handleDateClick}
                className={`aspect-square rounded-md flex flex-col items-center justify-center text-[10px] relative transition-colors p-0.5 ${bgClass} ${hasEvent || isAdmin ? "cursor-pointer" : "cursor-default"}`}
              >
                <span className={`font-medium text-xs ${weekend ? "text-destructive/70" : ""} ${holidayName ? "text-destructive" : ""} ${today ? "text-primary font-bold" : ""}`}>
                  {format(date, "d")}
                </span>
                {holidayName && (
                  <span className="text-[7px] leading-tight text-destructive/80 text-center line-clamp-2 mt-0.5 px-0.5">
                    {holidayName}
                  </span>
                )}
                {!holidayName && companyEvents && (
                  <span className="text-[7px] leading-tight text-blue-600 text-center line-clamp-2 mt-0.5 px-0.5">
                    {companyEvents[0].title}
                  </span>
                )}
                {!holidayName && !companyEvents && leaveDays && (
                  <span className="text-[7px] leading-tight text-indigo-600 text-center line-clamp-2 mt-0.5 px-0.5">
                    {leaveDays[0].label}
                  </span>
                )}
                {!holidayName && !companyEvents && !leaveDays && travelDays && (
                  <span className="text-[7px] leading-tight text-green-600 text-center line-clamp-2 mt-0.5 px-0.5">
                    Dinas: {travelDays[0].destination}
                  </span>
                )}
                {!holidayName && !companyEvents && !leaveDays && !travelDays && specialPeriod && (
                  <span className="text-[7px] leading-tight text-chart-4 text-center line-clamp-2 mt-0.5 px-0.5">
                    {specialPeriod.name}
                  </span>
                )}
                {!holidayName && (companyEvents || specialPeriod || leaveDays || travelDays) && (
                  <div className="flex gap-0.5 mt-0.5">
                    {companyEvents && companyEvents.length > 1 && <div className="h-1 w-1 rounded-full bg-blue-500" />}
                    {specialPeriod && companyEvents && <div className="h-1 w-1 rounded-full bg-chart-4" />}
                    {leaveDays && (companyEvents || specialPeriod) && <div className="h-1 w-1 rounded-full bg-indigo-500" />}
                    {travelDays && (companyEvents || leaveDays || specialPeriod) && <div className="h-1 w-1 rounded-full bg-green-500" />}
                  </div>
                )}
              </div>
            );

            if (hasEvent) {
              return (
                <Tooltip key={dateStr}>
                  <TooltipTrigger asChild>{content}</TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px]">
                    <div className="space-y-1">
                      <p className="font-medium text-xs">{format(date, "d MMMM yyyy", { locale: dateLocale })}</p>
                      {holidayName && (
                        <div className="flex items-center gap-1 text-xs">
                          <Palmtree className="h-3 w-3 text-destructive" />
                          <span>{holidayName}</span>
                        </div>
                      )}
                      {specialPeriod && (
                        <div className="flex items-center gap-1 text-xs">
                          <Clock className="h-3 w-3 text-chart-4" />
                          <span>{specialPeriod.name}</span>
                          {specialPeriod.check_out_start && (
                            <span className="text-muted-foreground">
                              (Pulang: {specialPeriod.check_out_start})
                            </span>
                          )}
                        </div>
                      )}
                      {companyEvents && companyEvents.map((e, i) => (
                        <div key={`ce-${i}`} className="flex items-center gap-1 text-xs">
                          <CalendarDays className="h-3 w-3 text-blue-500" />
                          <span>{e.title}</span>
                          {e.description && <span className="text-muted-foreground">- {e.description}</span>}
                        </div>
                      ))}
                      {leaveDays && leaveDays.map((l, i) => (
                        <div key={i} className="flex items-center gap-1 text-xs">
                          <Briefcase className="h-3 w-3 text-indigo-500" />
                          <span>{l.label}</span>
                        </div>
                      ))}
                      {travelDays && travelDays.map((t, i) => (
                        <div key={`t-${i}`} className="flex items-center gap-1 text-xs">
                          <Plane className="h-3 w-3 text-green-500" />
                          <span>Dinas: {t.destination}</span>
                        </div>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            }

            return <div key={dateStr}>{content}</div>;
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-destructive" />
            Hari Libur
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-chart-4" />
            Jam Kerja Khusus
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            Event Kantor
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-indigo-500" />
            Cuti Saya
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            Dinas
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-primary" />
            Hari Ini
          </div>
        </div>
      </CardContent>

      {/* Detail Dialog */}
      <Dialog open={!!selectedDate} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              {selectedDate && format(selectedDate, "EEEE, d MMMM yyyy", { locale: dateLocale })}
            </DialogTitle>
          </DialogHeader>
          {selectedDate && (() => {
            const dateStr = format(selectedDate, "yyyy-MM-dd");
            const holidayName = holidayMap.get(dateStr);
            const holidayObj = holidays.find(h => h.date === dateStr);
            const specialPeriod = getSpecialPeriodForDate(selectedDate);
            const leaveDays = leaveDaysMap.get(dateStr);
            const travelDays = travelDaysMap.get(dateStr);
            const companyEvents = companyEventsMap.get(dateStr);

            return (
              <div className="space-y-3">
                {holidayName && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10">
                    <Palmtree className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">Hari Libur</p>
                      <p className="text-sm text-muted-foreground">{holidayName}</p>
                    </div>
                    {isAdmin && holidayObj && (
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                          setEditingHoliday(holidayObj);
                          setEditHolidayName(holidayObj.name);
                          setSelectedDate(null);
                        }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteHoliday(holidayObj.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                {specialPeriod && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-chart-4/10">
                    <Clock className="h-5 w-5 text-chart-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-sm">Jam Kerja Khusus</p>
                      <p className="text-sm text-muted-foreground">{specialPeriod.name}</p>
                      {specialPeriod.check_in_end && (
                        <p className="text-xs text-muted-foreground">Masuk: s.d. {specialPeriod.check_in_end}</p>
                      )}
                      {specialPeriod.check_out_start && (
                        <p className="text-xs text-muted-foreground">Pulang: mulai {specialPeriod.check_out_start}</p>
                      )}
                    </div>
                  </div>
                )}
                {companyEvents && companyEvents.map((e, i) => (
                  <div key={`ce-${i}`} className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10">
                    <CalendarDays className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">Event Kantor</p>
                      <p className="text-sm text-foreground">{e.title}</p>
                      {e.description && <p className="text-xs text-muted-foreground mt-1">{e.description}</p>}
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                          setEditingEvent(e);
                          setEditEventTitle(e.title);
                          setEditEventDescription(e.description || "");
                          setEditEventStartDate(e.start_date);
                          setEditEventEndDate(e.end_date);
                          setSelectedDate(null);
                        }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteEvent(e.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {leaveDays && leaveDays.map((l, i) => (
                  <div key={`l-${i}`} className="flex items-start gap-3 p-3 rounded-lg bg-indigo-500/10">
                    <Briefcase className="h-5 w-5 text-indigo-500 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">Cuti / Izin</p>
                      <p className="text-sm text-muted-foreground">{l.label}</p>
                      {l.delegate_name && (
                        <div className="mt-2 pt-2 border-t border-indigo-500/20 space-y-0.5">
                          <p className="text-xs text-muted-foreground">Tugas didelegasikan ke:</p>
                          <p className="text-xs font-medium">
                            {l.delegate_name}
                            {l.delegate_jabatan ? ` - ${l.delegate_jabatan}` : ""}
                          </p>
                          {l.delegation_notes && (
                            <p className="text-xs text-muted-foreground italic mt-1 whitespace-pre-wrap">
                              "{l.delegation_notes}"
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {travelDays && travelDays.map((t, i) => (
                  <div key={`t-${i}`} className="flex items-start gap-3 p-3 rounded-lg bg-green-500/10">
                    <Plane className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-sm">Perjalanan Dinas</p>
                      <p className="text-sm text-foreground">{t.destination}</p>
                      <p className="text-xs text-muted-foreground mt-1">{t.purpose}</p>
                    </div>
                  </div>
                ))}
                {!holidayName && !specialPeriod && !companyEvents && !leaveDays && !travelDays && (
                  <p className="text-sm text-muted-foreground text-center py-4">Tidak ada event pada tanggal ini.</p>
                )}

                {/* Admin quick add buttons */}
                {isAdmin && (
                  <div className="flex gap-2 pt-2 border-t">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => {
                      setAddEventDate(selectedDate);
                      setAddMode("holiday");
                      setNewEventTitle("");
                      setSelectedDate(null);
                    }}>
                      <Palmtree className="h-3.5 w-3.5 mr-1" />
                      Tambah Libur
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => {
                      setAddEventDate(selectedDate);
                      setAddMode("event");
                      setNewEventTitle("");
                      setNewEventEndDate(format(selectedDate, "yyyy-MM-dd"));
                      setNewEventDescription("");
                      setSelectedDate(null);
                    }}>
                      <CalendarDays className="h-3.5 w-3.5 mr-1" />
                      Tambah Event
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Add Event/Holiday Dialog (Admin only) */}
      <Dialog open={!!addEventDate} onOpenChange={(open) => !open && setAddEventDate(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              {addMode === "holiday" ? "Tambah Hari Libur" : "Tambah Event Kantor"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {addEventDate && format(addEventDate, "EEEE, d MMMM yyyy", { locale: dateLocale })}
            </p>

            {/* Mode tabs */}
            <div className="flex gap-2">
              <Button variant={addMode === "event" ? "default" : "outline"} size="sm" onClick={() => setAddMode("event")} className="flex-1">
                <CalendarDays className="h-3.5 w-3.5 mr-1" />
                Event Kantor
              </Button>
              <Button variant={addMode === "holiday" ? "default" : "outline"} size="sm" onClick={() => setAddMode("holiday")} className="flex-1">
                <Palmtree className="h-3.5 w-3.5 mr-1" />
                Hari Libur
              </Button>
            </div>

            <div className="space-y-2">
              <Label>{addMode === "holiday" ? "Nama Hari Libur *" : "Judul Event *"}</Label>
              <Input
                placeholder={addMode === "holiday" ? "Contoh: Hari Raya Idul Fitri" : "Contoh: Rapat Bulanan"}
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
              />
            </div>

            {addMode === "event" && (
              <>
                <div className="space-y-2">
                  <Label>Tanggal Selesai</Label>
                  <Input
                    type="date"
                    value={newEventEndDate}
                    onChange={(e) => setNewEventEndDate(e.target.value)}
                    min={addEventDate ? format(addEventDate, "yyyy-MM-dd") : undefined}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Deskripsi (opsional)</Label>
                  <Textarea
                    placeholder="Deskripsi event..."
                    value={newEventDescription}
                    onChange={(e) => setNewEventDescription(e.target.value)}
                    rows={3}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddEventDate(null)}>Batal</Button>
            <Button onClick={addMode === "holiday" ? handleAddHoliday : handleAddEvent} disabled={!newEventTitle.trim() || addingEvent}>
              {addingEvent ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Holiday Dialog */}
      <Dialog open={!!editingHoliday} onOpenChange={(open) => !open && setEditingHoliday(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Edit Hari Libur
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {editingHoliday && (
              <p className="text-sm text-muted-foreground">{editingHoliday.date}</p>
            )}
            <div className="space-y-2">
              <Label>Nama Hari Libur</Label>
              <Input value={editHolidayName} onChange={(e) => setEditHolidayName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingHoliday(null)}>Batal</Button>
            <Button onClick={handleEditHoliday} disabled={!editHolidayName.trim()}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Event Dialog */}
      <Dialog open={!!editingEvent} onOpenChange={(open) => !open && setEditingEvent(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Edit Event Kantor
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Judul Event</Label>
              <Input value={editEventTitle} onChange={(e) => setEditEventTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tanggal Mulai</Label>
                <Input type="date" value={editEventStartDate} onChange={(e) => setEditEventStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Tanggal Selesai</Label>
                <Input type="date" value={editEventEndDate} onChange={(e) => setEditEventEndDate(e.target.value)} min={editEventStartDate} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Deskripsi (opsional)</Label>
              <Textarea value={editEventDescription} onChange={(e) => setEditEventDescription(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEvent(null)}>Batal</Button>
            <Button onClick={handleEditEvent} disabled={!editEventTitle.trim()}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default CompanyCalendar;

import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, AlertCircle, Info } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { overtimeRequestSchema, OvertimeRequestFormData } from "@/lib/validationSchemas";
import { useOvertimePolicy, isHoliday, isWeekend } from "@/hooks/usePolicySettings";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import logo from "@/assets/logo.png";
import { EmployeeBottomNav } from "@/components/EmployeeBottomNav";
import { notifyAdmins, NotificationTemplates, formatDateForNotification } from "@/lib/notifications";
import { useTranslation } from "react-i18next";

const OvertimeRequest = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { policy, isLoading: isPolicyLoading } = useOvertimePolicy();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingHours, setExistingHours] = useState({ week: 0, month: 0 });
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const form = useForm<OvertimeRequestFormData>({
    resolver: zodResolver(overtimeRequestSchema),
    defaultValues: {
      overtimeDate: "",
      startTime: "",
      endTime: "",
      reason: "",
    },
  });

  const startTime = form.watch("startTime");
  const endTime = form.watch("endTime");
  const overtimeDate = form.watch("overtimeDate");

  useEffect(() => {
    const fetchExistingHours = async () => {
      if (!profile?.id || !overtimeDate) return;

      const selectedDate = new Date(overtimeDate);
      const weekStart = format(startOfWeek(selectedDate, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const weekEnd = format(endOfWeek(selectedDate, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const monthStart = format(startOfMonth(selectedDate), "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(selectedDate), "yyyy-MM-dd");

      try {
        const { data: weekData } = await supabase
          .from("overtime_requests")
          .select("hours")
          .eq("user_id", profile.id)
          .in("status", ["pending", "approved"])
          .gte("overtime_date", weekStart)
          .lte("overtime_date", weekEnd);

        const { data: monthData } = await supabase
          .from("overtime_requests")
          .select("hours")
          .eq("user_id", profile.id)
          .in("status", ["pending", "approved"])
          .gte("overtime_date", monthStart)
          .lte("overtime_date", monthEnd);

        setExistingHours({
          week: weekData?.reduce((sum, r) => sum + r.hours, 0) || 0,
          month: monthData?.reduce((sum, r) => sum + r.hours, 0) || 0,
        });
      } catch (error) {
        console.error("Error fetching existing hours:", error);
      }
    };

    fetchExistingHours();
  }, [profile?.id, overtimeDate]);

  const totalHours = useMemo(() => {
    if (!startTime || !endTime) return 0;
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);
    const startTotalMinutes = startHour * 60 + startMinute;
    const endTotalMinutes = endHour * 60 + endMinute;
    let diffMinutes = endTotalMinutes - startTotalMinutes;
    if (diffMinutes < 0) diffMinutes += 24 * 60;
    return Math.round((diffMinutes / 60) * 10) / 10;
  }, [startTime, endTime]);

  useEffect(() => {
    const errors: string[] = [];
    if (!overtimeDate || totalHours <= 0) { setValidationErrors([]); return; }

    if (totalHours < policy.min_hours) errors.push(t("overtimeRequest.errMin", { n: policy.min_hours }));
    if (totalHours > policy.max_hours_per_day) errors.push(t("overtimeRequest.errMaxDay", { n: policy.max_hours_per_day }));
    if (existingHours.week + totalHours > policy.max_hours_per_week) {
      errors.push(t("overtimeRequest.errWeek", { max: policy.max_hours_per_week, left: Math.max(0, policy.max_hours_per_week - existingHours.week) }));
    }
    if (existingHours.month + totalHours > policy.max_hours_per_month) {
      errors.push(t("overtimeRequest.errMonth", { max: policy.max_hours_per_month, left: Math.max(0, policy.max_hours_per_month - existingHours.month) }));
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(overtimeDate);
    const daysDiff = Math.floor((selectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff < policy.min_days_advance_request) errors.push(t("overtimeRequest.errAdvance", { n: policy.min_days_advance_request }));
    if (isWeekend(overtimeDate) && !policy.allow_weekend_overtime) errors.push(t("overtimeRequest.errWeekend"));
    if (isHoliday(overtimeDate, policy.holidays) && !policy.allow_holiday_overtime) errors.push(t("overtimeRequest.errHoliday"));

    setValidationErrors(errors);
  }, [overtimeDate, totalHours, policy, existingHours, t]);

  const onSubmit = async (data: OvertimeRequestFormData) => {
    if (totalHours <= 0) {
      toast({ title: t("overtimeRequest.invalidHoursTitle"), description: t("overtimeRequest.invalidHoursDesc"), variant: "destructive" });
      return;
    }
    if (validationErrors.length > 0) {
      toast({ title: t("overtimeRequest.validationFail"), description: validationErrors[0], variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("overtime_requests").insert([{
        user_id: profile?.id,
        overtime_date: data.overtimeDate,
        hours: totalHours,
        reason: data.reason,
        status: "pending",
        created_at: new Date().toISOString(),
      }]);
      if (error) throw error;

      const formattedDate = formatDateForNotification(data.overtimeDate);
      const notification = NotificationTemplates.overtimeRequestSubmitted(profile?.full_name || 'Karyawan', totalHours, formattedDate);
      notifyAdmins(notification.title, notification.body, { type: 'overtime_request' });

      toast({ title: t("overtimeRequest.successTitle"), description: t("overtimeRequest.successDesc") });
      navigate("/employee");
    } catch (error: any) {
      console.error("Error submitting overtime:", error);
      toast({ title: t("overtimeRequest.failTitle"), description: error.message || "", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDateTypeLabel = () => {
    if (!overtimeDate) return null;
    if (isHoliday(overtimeDate, policy.holidays)) {
      const holiday = policy.holidays.find(h => h.date === overtimeDate);
      return (
        <span className="text-orange-600 dark:text-orange-400">
          {t("overtimeRequest.holidayLabel", { name: holiday?.name, x: policy.holiday_rate_multiplier })}
        </span>
      );
    }
    if (isWeekend(overtimeDate)) {
      return (
        <span className="text-blue-600 dark:text-blue-400">
          {t("overtimeRequest.weekendLabel", { x: policy.weekend_rate_multiplier })}
        </span>
      );
    }
    return (
      <span className="text-muted-foreground">
        {t("overtimeRequest.weekdayLabel", { x: policy.weekday_rate_multiplier })}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 pb-24">
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/employee")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <img src={logo} alt="Kemika" className="h-10 object-contain" />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>{t("overtimeRequest.title")}</CardTitle>
            <CardDescription>{t("overtimeRequest.subtitle")}</CardDescription>
          </CardHeader>

          <CardContent>
            {isPolicyLoading ? (
              <p className="text-muted-foreground">{t("overtimeRequest.loadingPolicy")}</p>
            ) : (
              <>
                <Alert className="mb-4">
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    {t("overtimeRequest.limitInfo", { day: policy.max_hours_per_day, week: policy.max_hours_per_week, month: policy.max_hours_per_month })}
                  </AlertDescription>
                </Alert>

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="overtimeDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("overtimeRequest.overtimeDate")}</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          {overtimeDate && (
                            <p className="text-xs">{getDateTypeLabel()}</p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="startTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("overtimeRequest.startTime")}</FormLabel>
                            <FormControl>
                              <Input type="time" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="endTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("overtimeRequest.endTime")}</FormLabel>
                            <FormControl>
                              <Input type="time" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>{t("overtimeRequest.totalHours")}</Label>
                      <div className="flex items-center h-10 px-3 py-2 rounded-md border border-input bg-muted">
                        <span className="text-sm text-muted-foreground">
                          {totalHours > 0 ? t("overtimeRequest.hoursValue", { n: totalHours }) : t("overtimeRequest.fillTimes")}
                        </span>
                      </div>
                    </div>

                    {validationErrors.length > 0 && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          <ul className="list-disc list-inside text-xs space-y-1">
                            {validationErrors.map((error, idx) => (
                              <li key={idx}>{error}</li>
                            ))}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}

                    <FormField
                      control={form.control}
                      name="reason"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("overtimeRequest.reason")}</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder={t("overtimeRequest.reasonPlaceholder")}
                              rows={4}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isSubmitting || totalHours <= 0 || validationErrors.length > 0}
                    >
                      {isSubmitting ? t("overtimeRequest.submitting") : t("overtimeRequest.submit")}
                    </Button>
                  </form>
                </Form>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <EmployeeBottomNav />
    </div>
  );
};

export default OvertimeRequest;

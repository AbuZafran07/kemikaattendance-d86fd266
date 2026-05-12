import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, AlertCircle, Info } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { leaveRequestSchema, LeaveRequestFormData } from "@/lib/validationSchemas";
import { useLeavePolicy } from "@/hooks/usePolicySettings";
import logo from "@/assets/logo.png";
import { EmployeeBottomNav } from "@/components/EmployeeBottomNav";
import { notifyAdmins, NotificationTemplates, formatLeaveTypeForNotification } from "@/lib/notifications";
import { useTranslation } from "react-i18next";

interface Holiday { id: string; name: string; date: string; }
interface DepartmentColleague { id: string; full_name: string; jabatan: string; }

const LeaveRequest = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { policy, isLoading: isPolicyLoading } = useLeavePolicy();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [usedQuotas, setUsedQuotas] = useState({ annual: 0, sick: 0, permission: 0 });
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [colleagues, setColleagues] = useState<DepartmentColleague[]>([]);

  const isAnnualLeaveInactive = profile?.annual_leave_quota === 0 && profile?.remaining_leave === 0;

  const form = useForm<LeaveRequestFormData>({
    resolver: zodResolver(leaveRequestSchema),
    defaultValues: {
      leaveType: undefined,
      startDate: "",
      endDate: "",
      reason: "",
      delegatedTo: "",
      delegationNotes: "",
      checkInTime: "",
      checkOutTime: "",
    },
  });

  const isLupaAbsen = form.watch("leaveType") === "lupa_absen";

  const leaveType = form.watch("leaveType");
  const startDate = form.watch("startDate");
  const endDate = form.watch("endDate");

  useEffect(() => {
    const fetchUsedQuotas = async () => {
      if (!profile?.id) return;
      const currentYear = new Date().getFullYear();
      const yearStart = `${currentYear}-01-01`;
      const yearEnd = `${currentYear}-12-31`;
      try {
        const { data } = await supabase
          .from("leave_requests")
          .select("leave_type, total_days")
          .eq("user_id", profile.id)
          .in("status", ["pending", "approved"])
          .gte("start_date", yearStart)
          .lte("start_date", yearEnd);

        const quotas = { annual: 0, sick: 0, permission: 0 };
        data?.forEach((req) => {
          if (req.leave_type === "cuti_tahunan") quotas.annual += req.total_days;
          else if (req.leave_type === "sakit") quotas.sick += req.total_days;
          else if (req.leave_type === "izin") quotas.permission += req.total_days;
        });
        setUsedQuotas(quotas);
      } catch (error) {
        console.error("Error fetching used quotas:", error);
      }
    };
    fetchUsedQuotas();
  }, [profile?.id]);

  useEffect(() => {
    const fetchHolidays = async () => {
      try {
        const { data } = await supabase
          .from("system_settings")
          .select("value")
          .eq("key", "overtime_policy")
          .single();

        if (data?.value && typeof data.value === 'object' && 'holidays' in data.value) {
          const policyValue = data.value as { holidays?: Holiday[] };
          setHolidays(policyValue.holidays || []);
        }
      } catch (error) {
        console.error("Error fetching holidays:", error);
      }
    };
    fetchHolidays();
  }, []);

  useEffect(() => {
    const fetchColleagues = async () => {
      if (!profile?.id || !profile?.departemen) return;
      try {
        const { data, error } = await supabase.rpc("get_delegation_colleagues");
        if (error) throw error;
        if (data) setColleagues(data as any);
      } catch (error) {
        console.error("Error fetching colleagues:", error);
      }
    };
    fetchColleagues();
  }, [profile?.id, profile?.departemen]);

  const calculateWorkingDays = (start: string, end: string, holidayList: Holiday[]) => {
    if (!start || !end) return 0;
    const startDateObj = new Date(start);
    const endDateObj = new Date(end);
    if (endDateObj < startDateObj) return 0;
    const holidayDates = new Set(holidayList.map(h => h.date));
    let workingDays = 0;
    const currentDate = new Date(startDateObj);
    while (currentDate <= endDateObj) {
      const dayOfWeek = currentDate.getDay();
      const dateStr = currentDate.toISOString().split('T')[0];
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidayDates.has(dateStr)) workingDays++;
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return workingDays;
  };

  const totalDays = useMemo(() => calculateWorkingDays(startDate, endDate, holidays), [startDate, endDate, holidays]);

  useEffect(() => {
    const errors: string[] = [];
    if (!leaveType || !startDate || !endDate || totalDays <= 0) { setValidationErrors([]); return; }

    if (leaveType !== "sakit" && leaveType !== "lupa_absen") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selectedDate = new Date(startDate);
      const daysDiff = Math.floor((selectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff < policy.min_days_advance_request) {
        errors.push(t("leaveRequest.errMinAdvance", { n: policy.min_days_advance_request }));
      }
    }

    if (totalDays > policy.max_consecutive_days) {
      errors.push(t("leaveRequest.errMaxConsec", { n: policy.max_consecutive_days }));
    }

    if (leaveType === "cuti_tahunan") {
      if (isAnnualLeaveInactive) {
        errors.push(t("leaveRequest.errAnnualNotActive"));
      } else {
        const remainingQuota = policy.annual_leave_quota - usedQuotas.annual;
        if (totalDays > remainingQuota) errors.push(t("leaveRequest.errAnnualQuota", { n: remainingQuota }));
      }
    } else if (leaveType === "sakit") {
      const remainingQuota = policy.sick_leave_quota - usedQuotas.sick;
      if (totalDays > remainingQuota) errors.push(t("leaveRequest.errSickQuota", { n: remainingQuota }));
    } else if (leaveType === "izin") {
      const remainingQuota = policy.permission_quota - usedQuotas.permission;
      if (totalDays > remainingQuota) errors.push(t("leaveRequest.errPermitQuota", { n: remainingQuota }));
    }

    setValidationErrors(errors);
  }, [leaveType, startDate, endDate, totalDays, policy, usedQuotas, isAnnualLeaveInactive, t]);

  const getQuotaInfo = () => ({
    annual: { total: policy.annual_leave_quota, used: usedQuotas.annual, remaining: policy.annual_leave_quota - usedQuotas.annual },
    sick: { total: policy.sick_leave_quota, used: usedQuotas.sick, remaining: policy.sick_leave_quota - usedQuotas.sick },
    permission: { total: policy.permission_quota, used: usedQuotas.permission, remaining: policy.permission_quota - usedQuotas.permission },
  });

  const quotaInfo = getQuotaInfo();

  const onSubmit = async (data: LeaveRequestFormData) => {
    if (validationErrors.length > 0) {
      toast({ title: t("leaveRequest.validationFail"), description: validationErrors[0], variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const isLupa = data.leaveType === "lupa_absen";
      let reasonText = data.reason || "";
      if (isLupa && data.checkInTime && data.checkOutTime) {
        reasonText = `[JAM:${data.checkInTime}-${data.checkOutTime}] ${reasonText}`.trim();
      }
      const { error } = await supabase.from("leave_requests").insert([{
        user_id: profile?.id,
        leave_type: data.leaveType,
        start_date: data.startDate,
        end_date: data.endDate,
        total_days: totalDays,
        reason: reasonText,
        delegated_to: isLupa ? null : (data.delegatedTo || null),
        delegation_notes: isLupa ? null : (data.delegationNotes || null),
      } as any]);

      if (error) throw error;

      const leaveTypeName = formatLeaveTypeForNotification(data.leaveType);
      const notification = NotificationTemplates.leaveRequestSubmitted(profile?.full_name || 'Karyawan', leaveTypeName, totalDays);
      notifyAdmins(notification.title, notification.body, { type: 'leave_request' });

      toast({ title: t("leaveRequest.successTitle"), description: t("leaveRequest.successDesc") });
      navigate("/employee");
    } catch (error: any) {
      toast({ title: t("leaveRequest.failTitle"), description: error.message || "", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 pb-24">
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/employee")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <img src={logo} alt="Kemika" className="h-10 object-contain" />
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>{t("leaveRequest.title")}</CardTitle>
            <CardDescription>{t("leaveRequest.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            {isPolicyLoading ? (
              <p className="text-muted-foreground">{t("leaveRequest.loadingPolicy")}</p>
            ) : (
              <>
                {isAnnualLeaveInactive && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      {t("leaveRequest.annualInactive")}
                    </AlertDescription>
                  </Alert>
                )}

                <Alert className="mb-4">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <div className="text-xs space-y-1">
                      <p>{t("leaveRequest.remainingThisYear")}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {!isAnnualLeaveInactive && (
                          <span>{t("leaveRequest.annualLeave")}: <strong>{quotaInfo.annual.remaining}</strong>/{quotaInfo.annual.total} {t("common.days")}</span>
                        )}
                        <span>{t("leaveRequest.sick")}: <strong>{quotaInfo.sick.remaining}</strong>/{quotaInfo.sick.total} {t("common.days")}</span>
                        <span>{t("leaveRequest.permit")}: <strong>{quotaInfo.permission.remaining}</strong>/{quotaInfo.permission.total} {t("common.days")}</span>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="leaveType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("leaveRequest.leaveType")}</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder={t("leaveRequest.selectType")} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="cuti_tahunan" disabled={isAnnualLeaveInactive}>
                                {t("leaveRequest.annualLabel", { suffix: isAnnualLeaveInactive ? t("leaveRequest.notActive") : t("leaveRequest.remainingDays", { n: quotaInfo.annual.remaining }) })}
                              </SelectItem>
                              <SelectItem value="izin">
                                {t("leaveRequest.permit")} {t("leaveRequest.remainingDays", { n: quotaInfo.permission.remaining })}
                              </SelectItem>
                              <SelectItem value="sakit">
                                {t("leaveRequest.sick")} {t("leaveRequest.remainingDays", { n: quotaInfo.sick.remaining })}
                              </SelectItem>
                              <SelectItem value="lupa_absen">{t("leaveRequest.lupaAbsen")}</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("leaveRequest.startDate")}</FormLabel>
                          <FormControl><Input type="date" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("leaveRequest.endDate")}</FormLabel>
                          <FormControl><Input type="date" {...field} /></FormControl>
                          {totalDays > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {t("leaveRequest.totalWorkingDays", { n: totalDays })}
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {validationErrors.length > 0 && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          <ul className="list-disc list-inside text-xs space-y-1">
                            {validationErrors.map((error, idx) => <li key={idx}>{error}</li>)}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}

                    <FormField
                      control={form.control}
                      name="reason"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("leaveRequest.reason")}</FormLabel>
                          <FormControl>
                            <Textarea
                              rows={4}
                              placeholder={t("leaveRequest.reasonPlaceholder")}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {isLupaAbsen && (
                      <div className="border-t pt-4 space-y-4">
                        <div>
                          <p className="text-sm font-semibold">Jam Kerja (Opsional)</p>
                          <p className="text-xs text-muted-foreground">
                            Isi jika ingin menyesuaikan jam masuk/pulang yang akan diinput otomatis ke attendance. Kosongkan untuk pakai jam kerja standar.
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <FormField
                            control={form.control}
                            name="checkInTime"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Jam Masuk</FormLabel>
                                <FormControl><Input type="time" {...field} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="checkOutTime"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Jam Pulang</FormLabel>
                                <FormControl><Input type="time" {...field} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    )}

                    {!isLupaAbsen && (
                    <div className="border-t pt-4 space-y-4">
                      <div>
                        <p className="text-sm font-semibold">{t("leaveRequest.delegationTitle")}</p>
                        <p
                          className="text-xs text-muted-foreground"
                          dangerouslySetInnerHTML={{ __html: t("leaveRequest.delegationDesc", { dept: profile?.departemen || "" }) }}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="delegatedTo"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("leaveRequest.substitute")}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={colleagues.length === 0 ? t("leaveRequest.noColleagues") : t("leaveRequest.selectSubstitute")} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {colleagues.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.full_name} - {c.jabatan}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="delegationNotes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("leaveRequest.delegationTasks")}</FormLabel>
                            <FormControl>
                              <Textarea
                                rows={3}
                                placeholder={t("leaveRequest.delegationPlaceholder")}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    )}

                    <Button type="submit" className="w-full" disabled={isSubmitting || validationErrors.length > 0}>
                      {isSubmitting ? t("leaveRequest.submitting") : t("leaveRequest.submit")}
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

export default LeaveRequest;

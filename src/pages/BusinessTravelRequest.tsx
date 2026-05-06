import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";
import { EmployeeBottomNav } from "@/components/EmployeeBottomNav";
import { notifyAdmins, NotificationTemplates } from "@/lib/notifications";
import { useTranslation } from "react-i18next";

const businessTravelSchema = z.object({
  destination: z.string().trim().min(1, "Tujuan harus diisi").max(200, "Tujuan maksimal 200 karakter"),
  purpose: z.string().trim().min(1, "Keperluan harus diisi").max(500, "Keperluan maksimal 500 karakter"),
  startDate: z.string().min(1, "Tanggal mulai harus diisi"),
  endDate: z.string().min(1, "Tanggal selesai harus diisi"),
  notes: z.string().trim().max(1000, "Catatan maksimal 1000 karakter").optional().or(z.literal("")),
}).refine(data => new Date(data.endDate) >= new Date(data.startDate), {
  message: "Tanggal selesai harus setelah tanggal mulai",
  path: ["endDate"],
});

type BusinessTravelFormData = z.infer<typeof businessTravelSchema>;

const BusinessTravelRequest = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<BusinessTravelFormData>({
    resolver: zodResolver(businessTravelSchema),
    defaultValues: {
      destination: "",
      purpose: "",
      startDate: "",
      endDate: "",
      notes: "",
    },
  });

  const startDate = form.watch("startDate");
  const endDate = form.watch("endDate");

  const calculateDays = (start: string, end: string) => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const totalDays = useMemo(() => {
    return calculateDays(startDate, endDate);
  }, [startDate, endDate]);

  const onSubmit = async (data: BusinessTravelFormData) => {
    setIsSubmitting(true);

    try {
      const { error } = await supabase.from("business_travel_requests").insert([
        {
          user_id: profile?.id,
          destination: data.destination,
          purpose: data.purpose,
          start_date: data.startDate,
          end_date: data.endDate,
          total_days: totalDays,
          notes: data.notes || null,
        },
      ]);

      if (error) throw error;

      const notification = NotificationTemplates.businessTravelSubmitted(
        profile?.full_name || 'Karyawan',
        data.destination,
        totalDays
      );
      notifyAdmins(notification.title, notification.body, { type: 'business_travel' });

      toast({
        title: t("travelRequest.successTitle"),
        description: t("travelRequest.successDesc"),
      });

      navigate("/employee");
    } catch (error: any) {
      toast({
        title: t("travelRequest.failTitle"),
        description: error.message || "",
        variant: "destructive",
      });
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
            <CardTitle>{t("travelRequest.title")}</CardTitle>
            <CardDescription>{t("travelRequest.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="destination"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("travelRequest.destination")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("travelRequest.destinationPlaceholder")}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="purpose"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("travelRequest.purpose")}</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          placeholder={t("travelRequest.purposePlaceholder")}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("travelRequest.startDate")}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("travelRequest.endDate")}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      {totalDays > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {t("travelRequest.totalDays", { n: totalDays })}
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("travelRequest.notes")}</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          placeholder={t("travelRequest.notesPlaceholder")}
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
                  disabled={isSubmitting}
                >
                  {isSubmitting ? t("travelRequest.submitting") : t("travelRequest.submit")}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>

      <EmployeeBottomNav />
    </div>
  );
};

export default BusinessTravelRequest;

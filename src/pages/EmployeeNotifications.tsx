import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, CheckCircle, XCircle, Clock } from "lucide-react";
import { EmployeeBottomNav } from "@/components/EmployeeBottomNav";
import logo from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { useNotificationBadge } from "@/hooks/useNotificationBadge";
import { useTranslation } from "react-i18next";

interface Notification {
  id: string;
  type: "leave" | "overtime";
  status: "pending" | "approved" | "rejected";
  title: string;
  description: string;
  date: string;
}

const EmployeeNotifications = () => {
  const { signOut, profile } = useAuth();
  const { t, i18n } = useTranslation();
  const localeStr = i18n.resolvedLanguage?.startsWith("en") ? "en-US" : "id-ID";
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const { clearBadge } = useNotificationBadge();

  useEffect(() => {
    clearBadge();
  }, [clearBadge]);

  useEffect(() => {
    fetchNotifications();
  }, [profile?.id, i18n.resolvedLanguage]);

  const formatLeaveType = (type: string) => {
    const map: Record<string, string> = {
      cuti_tahunan: t("leavePage.leaveType.cuti_tahunan"),
      izin: t("leavePage.leaveType.izin"),
      sakit: t("leavePage.leaveType.sakit"),
      lupa_absen: t("leavePage.leaveType.lupa_absen"),
    };
    return map[type] || type;
  };

  const fetchNotifications = async () => {
    if (!profile?.id) return;
    
    try {
      const [leaveRes, overtimeRes] = await Promise.all([
        supabase
          .from("leave_requests")
          .select("*")
          .eq("user_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("overtime_requests")
          .select("*")
          .eq("user_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      const leaveNotifs: Notification[] = (leaveRes.data || []).map((req) => ({
        id: req.id,
        type: "leave",
        status: req.status,
        title: t("empNotif.leaveSubmission", { type: formatLeaveType(req.leave_type) }),
        description: `${new Date(req.start_date).toLocaleDateString(localeStr)} - ${new Date(req.end_date).toLocaleDateString(localeStr)}`,
        date: req.updated_at || req.created_at,
      }));

      const overtimeNotifs: Notification[] = (overtimeRes.data || []).map((req) => ({
        id: req.id,
        type: "overtime",
        status: req.status,
        title: t("empNotif.overtimeSubmission"),
        description: t("empNotif.overtimeRange", { date: new Date(req.overtime_date).toLocaleDateString(localeStr), hours: req.hours }),
        date: req.updated_at || req.created_at,
      }));

      const allNotifications = [...leaveNotifs, ...overtimeNotifs].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setNotifications(allNotifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "rejected":
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return <Clock className="h-5 w-5 text-yellow-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20">{t("empNotif.approved")}</Badge>;
      case "rejected":
        return <Badge variant="destructive">{t("empNotif.rejected")}</Badge>;
      default:
        return <Badge variant="secondary">{t("empNotif.waiting")}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 pb-24">
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <img src={logo} alt="Kemika" className="h-10 object-contain" />
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("empNotif.title")}</h1>
          <p className="text-muted-foreground">{t("empNotif.subtitle")}</p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4 h-20 bg-muted/30" />
              </Card>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{t("empNotif.empty")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {notifications.map((notif) => (
              <Card key={notif.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {getStatusIcon(notif.status)}
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-medium">{notif.title}</h3>
                        {getStatusBadge(notif.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">{notif.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(notif.date).toLocaleDateString(localeStr, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <EmployeeBottomNav />
    </div>
  );
};

export default EmployeeNotifications;

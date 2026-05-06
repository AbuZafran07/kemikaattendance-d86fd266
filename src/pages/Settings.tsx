import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Clock, Calendar, FileText, Bell, CalendarClock, Coins, Landmark, Shield, Receipt, Briefcase, Layers, DatabaseBackup, Users, Palmtree } from "lucide-react";

export default function Settings() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const settingsMenu = [
    { key: "office", icon: Building2, path: "/dashboard/settings/office" },
    { key: "workHours", icon: Clock, path: "/dashboard/settings/work-hours" },
    { key: "specialHours", icon: CalendarClock, path: "/dashboard/settings/special-work-hours" },
    { key: "leave", icon: Calendar, path: "/dashboard/settings/leave" },
    { key: "overtime", icon: FileText, path: "/dashboard/settings/overtime" },
    { key: "holidays", icon: Palmtree, path: "/dashboard/settings/holidays" },
    { key: "allowance", icon: Coins, path: "/dashboard/settings/attendance-allowance" },
    { key: "bank", icon: Landmark, path: "/dashboard/settings/company-bank" },
    { key: "bpjs", icon: Shield, path: "/dashboard/settings/bpjs" },
    { key: "ptkp", icon: Receipt, path: "/dashboard/settings/ptkp" },
    { key: "biayaJabatan", icon: Briefcase, path: "/dashboard/settings/biaya-jabatan" },
    { key: "pph21", icon: Layers, path: "/dashboard/settings/pph21-brackets" },
    { key: "notif", icon: Bell, path: "/dashboard/settings/notifications" },
    { key: "backup", icon: DatabaseBackup, path: "/dashboard/settings/backup" },
    { key: "deptJab", icon: Users, path: "/dashboard/settings/department-jabatan" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 animate-fadeIn">
        <div className="px-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t("settingsPage.title")}</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">{t("settingsPage.subtitle")}</p>
        </div>

        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
          {settingsMenu.map((item) => {
            const Icon = item.icon;
            return (
              <Card
                key={item.key}
                onClick={() => navigate(item.path)}
                className="cursor-pointer border-primary/10 hover:border-primary/40 hover:shadow-md transition-all duration-200"
              >
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
                    {t(`settingsPage.items.${item.key}.title`)}
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">{t(`settingsPage.items.${item.key}.desc`)}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}

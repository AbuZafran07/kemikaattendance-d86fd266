import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Clock, TrendingUp, ChevronRight, History, Plane, FileText, DollarSign, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { EmployeeBottomNav } from "@/components/EmployeeBottomNav";
import logo from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";

interface ServiceItem {
  labelKey: string;
  descKey: string;
  icon: React.ElementType;
  path: string;
  color: string;
}

const services: ServiceItem[] = [
  { labelKey: "selfService.items.leaveTitle", descKey: "selfService.items.leaveDesc", icon: Calendar, path: "/employee/leave-request", color: "bg-blue-500/10 text-blue-600" },
  { labelKey: "selfService.items.travelTitle", descKey: "selfService.items.travelDesc", icon: Plane, path: "/employee/business-travel", color: "bg-purple-500/10 text-purple-600" },
  { labelKey: "selfService.items.overtimeTitle", descKey: "selfService.items.overtimeDesc", icon: Clock, path: "/employee/overtime-request", color: "bg-orange-500/10 text-orange-600" },
  { labelKey: "selfService.items.historyTitle", descKey: "selfService.items.historyDesc", icon: FileText, path: "/employee/request-history", color: "bg-gray-500/10 text-gray-600" },
  { labelKey: "selfService.items.attendanceTitle", descKey: "selfService.items.attendanceDesc", icon: History, path: "/employee/attendance-history", color: "bg-green-500/10 text-green-600" },
  { labelKey: "selfService.items.performanceTitle", descKey: "selfService.items.performanceDesc", icon: TrendingUp, path: "/employee/performance", color: "bg-emerald-500/10 text-emerald-600" },
  { labelKey: "selfService.items.payslipTitle", descKey: "selfService.items.payslipDesc", icon: DollarSign, path: "/employee/payroll-history", color: "bg-yellow-500/10 text-yellow-600" },
  { labelKey: "selfService.items.loanTitle", descKey: "selfService.items.loanDesc", icon: Wallet, path: "/employee/loans", color: "bg-red-500/10 text-red-600" },
];

const EmployeeSelfService = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 pb-24">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
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

      <div className="container mx-auto px-4 py-6 max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("selfService.title")}</h1>
          <p className="text-muted-foreground">{t("selfService.subtitle")}</p>
        </div>

        <div className="space-y-3">
          {services.map((service) => (
            <Card
              key={service.path + service.labelKey}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(service.path)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${service.color}`}>
                    <service.icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">{t(service.labelKey)}</h3>
                    <p className="text-sm text-muted-foreground">{t(service.descKey)}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <EmployeeBottomNav />
    </div>
  );
};

export default EmployeeSelfService;

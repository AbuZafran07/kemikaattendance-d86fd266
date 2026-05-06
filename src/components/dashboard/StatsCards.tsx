import { Card, CardContent } from "@/components/ui/card";
import { Users, UserCheck, UserX, Clock, Timer, CalendarOff } from "lucide-react";
import { useTranslation } from "react-i18next";

interface StatsCardsProps {
  stats: {
    totalEmployees: number;
    presentToday: number;
    absentToday: number;
    lateToday: number;
    earlyLeaveToday: number;
    pendingLeave: number;
    pendingOvertime: number;
    pendingTravel?: number;
    totalOvertimeHours: number;
  };
}

const StatsCards = ({ stats }: StatsCardsProps) => {
  const { t } = useTranslation();
  const pendingTravel = stats.pendingTravel || 0;
  const totalPending = stats.pendingLeave + stats.pendingOvertime + pendingTravel;
  const pct = (n: number) => stats.totalEmployees > 0 ? Math.round((n / stats.totalEmployees) * 100) : 0;

  const statsData = [
    {
      title: t("dashboard.stats.totalEmployees"),
      value: stats.totalEmployees.toString(),
      icon: Users,
      description: t("dashboard.stats.totalEmployeesDesc"),
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      title: t("dashboard.stats.presentToday"),
      value: stats.presentToday.toString(),
      icon: UserCheck,
      description: t("dashboard.stats.presentTodayDesc", { percent: pct(stats.presentToday) }),
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      title: t("dashboard.stats.late"),
      value: stats.lateToday.toString(),
      icon: Clock,
      description: t("dashboard.stats.lateDesc", { percent: pct(stats.lateToday) }),
      iconBg: "bg-accent",
      iconColor: "text-accent-foreground",
    },
    {
      title: t("dashboard.stats.earlyLeave"),
      value: stats.earlyLeaveToday.toString(),
      icon: Timer,
      description: t("dashboard.stats.earlyLeaveDesc"),
      iconBg: "bg-accent",
      iconColor: "text-accent-foreground",
    },
    {
      title: t("dashboard.stats.absent"),
      value: stats.absentToday.toString(),
      icon: UserX,
      description: t("dashboard.stats.lateDesc", { percent: pct(stats.absentToday) }),
      iconBg: "bg-destructive/10",
      iconColor: "text-destructive",
    },
    {
      title: t("dashboard.stats.pending"),
      value: totalPending.toString(),
      icon: CalendarOff,
      description: pendingTravel > 0
        ? t("dashboard.stats.pendingDescWithTravel", { leave: stats.pendingLeave, overtime: stats.pendingOvertime, travel: pendingTravel })
        : t("dashboard.stats.pendingDesc", { leave: stats.pendingLeave, overtime: stats.pendingOvertime }),
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
      {statsData.map((stat) => (
        <Card key={stat.title} className="border border-border/50 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs font-medium text-muted-foreground leading-tight">{stat.title}</p>
              <div className={`p-2 rounded-lg ${stat.iconBg}`}>
                <stat.icon className={`h-4 w-4 ${stat.iconColor}`} />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight">{stat.value}</div>
            <p className="text-[11px] text-muted-foreground mt-1">{stat.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default StatsCards;

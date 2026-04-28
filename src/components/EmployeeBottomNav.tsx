import { Home, Plane, Bell, User, LayoutGrid, Target } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useNotificationBadge } from "@/hooks/useNotificationBadge";

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  isCenter?: boolean;
  showBadge?: boolean;
}

const navItems: NavItem[] = [
  { label: "Beranda", icon: Home, path: "/employee" },
  { label: "KPI", icon: Target, path: "/employee/kpi" },
  { label: "Self Service", icon: LayoutGrid, path: "/employee/self-service", isCenter: true },
  { label: "Notifikasi", icon: Bell, path: "/employee/notifications", showBadge: true },
  { label: "Profil", icon: User, path: "/employee/profile" },
];

export const EmployeeBottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { badgeCount } = useNotificationBadge();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-end justify-around h-16 max-w-lg mx-auto relative">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
            (item.path === "/employee" && location.pathname === "/employee") ||
            (item.path === "/employee/self-service" && location.pathname.includes("/employee/self-service"));
          
          if (item.isCenter) {
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center justify-center -mt-6"
              >
                <div className={cn(
                  "w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "bg-primary/80 text-primary-foreground"
                )}>
                  <item.icon className="h-6 w-6" />
                </div>
                <span className={cn(
                  "text-xs mt-1 font-medium",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex flex-col items-center justify-center py-2 px-3 relative"
            >
              <div className="relative">
                <item.icon className={cn(
                  "h-5 w-5 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )} />
                {item.showBadge && badgeCount > 0 && (
                  <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1 leading-none">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </div>
              <span className={cn(
                "text-xs mt-1",
                isActive ? "text-primary font-medium" : "text-muted-foreground"
              )}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

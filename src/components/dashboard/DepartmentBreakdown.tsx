import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useTranslation } from "react-i18next";

interface DepartmentBreakdownProps {
  data: {
    name: string;
    value: number;
    present: number;
  }[];
}

const COLORS = ['hsl(var(--primary))', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4'];

const DepartmentBreakdown = ({ data }: DepartmentBreakdownProps) => {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{t("dashboard.charts.deptAttendance")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                dataKey="present"
                nameKey="name"
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                formatter={(value: number, name: string) => [t("dashboard.charts.presentTooltip", { value }), name]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2.5 mt-2">
          {data.map((dept, index) => (
            <div key={dept.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div 
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-muted-foreground text-xs">{dept.name}</span>
              </div>
              <span className="font-medium text-xs">{dept.present}/{dept.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default DepartmentBreakdown;

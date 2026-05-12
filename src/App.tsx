import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { FCMNotifications } from "./components/FCMNotifications";
import Login from "./pages/Login";
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import Attendance from "./pages/Attendance";
import Leave from "./pages/Leave";
import Overtime from "./pages/Overtime";
import Reports from "./pages/Reports";
import EmployeeReports from "./pages/EmployeeReports";
import Settings from "./pages/Settings";
import Notifications from "./pages/Notifications";
import EmployeeView from "./pages/EmployeeView";
import FaceEnrollment from "./pages/FaceEnrollment";
import AttendanceHistory from "./pages/AttendanceHistory";
import PerformanceDashboard from "./pages/PerformanceDashboard";
import NotificationSettings from "./pages/NotificationSettings";
import LeaveRequest from "./pages/LeaveRequest";
import OvertimeRequest from "./pages/OvertimeRequest";
import OfficeSettings from "./pages/OfficeSettings";
import WorkHoursSettings from "./pages/WorkHoursSettings";
import LeaveSettings from "./pages/LeaveSettings";
import OvertimeSettings from "./pages/OvertimeSettings";
import SpecialWorkHoursSettings from "./pages/SpecialWorkHoursSettings";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import KPI from "./pages/KPI";
import EmployeeKPI from "./pages/EmployeeKPI";
import KPIRecap from "./pages/KPIRecap";
import EmployeeSelfService from "./pages/EmployeeSelfService";
import EmployeeNotifications from "./pages/EmployeeNotifications";
import RequestHistory from "./pages/RequestHistory";
import EmployeeProfile from "./pages/EmployeeProfile";
import BusinessTravelRequest from "./pages/BusinessTravelRequest";
import BusinessTravelHistory from "./pages/BusinessTravelHistory";
import BusinessTravel from "./pages/BusinessTravel";
import AttendanceAllowanceSettings from "./pages/AttendanceAllowanceSettings";
import AttendanceAllowanceReport from "./pages/AttendanceAllowanceReport";
import AttendanceAuditLog from "./pages/AttendanceAuditLog";
import LupaAbsenAuditLog from "./pages/LupaAbsenAuditLog";
import ApprovalAuditLog from "./pages/ApprovalAuditLog";
import Payroll from "./pages/Payroll";
import LoanManagement from "./pages/LoanManagement";
import EmployeePayrollHistory from "./pages/EmployeePayrollHistory";
import EmployeeLoanHistory from "./pages/EmployeeLoanHistory";
import TERManagement from "./pages/TERManagement";
import BuktiPotong1721A1 from "./pages/BuktiPotong1721A1";
import PPh21Report from "./pages/PPh21Report";
import PayrollAnalytics from "./pages/PayrollAnalytics";
import PayrollAuditLog from "./pages/PayrollAuditLog";
import AnnouncementManagement from "./pages/AnnouncementManagement";
import CompanyBankSettings from "./pages/CompanyBankSettings";
import BPJSSettings from "./pages/BPJSSettings";
import PTKPSettings from "./pages/PTKPSettings";
import BiayaJabatanSettings from "./pages/BiayaJabatanSettings";
import PPh21BracketsSettings from "./pages/PPh21BracketsSettings";
import BackupRestore from "./pages/BackupRestore";
import DepartmentJabatanSettings from "./pages/DepartmentJabatanSettings";
import HolidayEventSettings from "./pages/HolidayEventSettings";

const queryClient = new QueryClient();
const App = () => <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <FCMNotifications />
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/dashboard" element={<ProtectedRoute requireAdmin><Dashboard /></ProtectedRoute>} />
            <Route path="/dashboard/employees" element={<ProtectedRoute requireAdmin><Employees /></ProtectedRoute>} />
            <Route path="/dashboard/attendance" element={<ProtectedRoute requireAdmin><Attendance /></ProtectedRoute>} />
            <Route path="/dashboard/leave" element={<ProtectedRoute requireAdmin><Leave /></ProtectedRoute>} />
            <Route path="/dashboard/overtime" element={<ProtectedRoute requireAdmin><Overtime /></ProtectedRoute>} />
            <Route path="/dashboard/business-travel" element={<ProtectedRoute requireAdmin><BusinessTravel /></ProtectedRoute>} />
            <Route path="/dashboard/reports" element={<ProtectedRoute requireAdmin><Reports /></ProtectedRoute>} />
            <Route path="/dashboard/reports/employee" element={<ProtectedRoute requireAdmin><EmployeeReports /></ProtectedRoute>} />
            <Route path="/dashboard/settings" element={<ProtectedRoute requireAdmin><Settings /></ProtectedRoute>} />
            <Route path="/dashboard/settings/office" element={<ProtectedRoute requireAdmin><OfficeSettings /></ProtectedRoute>} />
            <Route path="/dashboard/settings/work-hours" element={<ProtectedRoute requireAdmin><WorkHoursSettings /></ProtectedRoute>} />
            <Route path="/dashboard/settings/special-work-hours" element={<ProtectedRoute requireAdmin><SpecialWorkHoursSettings /></ProtectedRoute>} />
            <Route path="/dashboard/settings/leave" element={<ProtectedRoute requireAdmin><LeaveSettings /></ProtectedRoute>} />
            <Route path="/dashboard/settings/overtime" element={<ProtectedRoute requireAdmin><OvertimeSettings /></ProtectedRoute>} />
            <Route path="/dashboard/settings/attendance-allowance" element={<ProtectedRoute requireAdmin><AttendanceAllowanceSettings /></ProtectedRoute>} />
            <Route path="/dashboard/reports/attendance-allowance" element={<ProtectedRoute requireAdmin><AttendanceAllowanceReport /></ProtectedRoute>} />
            <Route path="/dashboard/attendance/audit-log" element={<ProtectedRoute requireAdmin><AttendanceAuditLog /></ProtectedRoute>} />
            <Route path="/dashboard/approval-audit-log" element={<ProtectedRoute requireAdmin><ApprovalAuditLog /></ProtectedRoute>} />
            <Route path="/dashboard/payroll" element={<ProtectedRoute requireAdmin><Payroll /></ProtectedRoute>} />
            <Route path="/dashboard/loans" element={<ProtectedRoute requireAdmin><LoanManagement /></ProtectedRoute>} />
            <Route path="/dashboard/ter-management" element={<ProtectedRoute requireAdmin><TERManagement /></ProtectedRoute>} />
            <Route path="/dashboard/bukti-potong" element={<ProtectedRoute requireAdmin><BuktiPotong1721A1 /></ProtectedRoute>} />
            <Route path="/dashboard/reports/pph21" element={<ProtectedRoute requireAdmin><PPh21Report /></ProtectedRoute>} />
            <Route path="/dashboard/payroll-analytics" element={<ProtectedRoute requireAdmin><PayrollAnalytics /></ProtectedRoute>} />
            <Route path="/dashboard/payroll-audit-log" element={<ProtectedRoute requireAdmin><PayrollAuditLog /></ProtectedRoute>} />
            <Route path="/dashboard/announcements" element={<ProtectedRoute requireAdmin><AnnouncementManagement /></ProtectedRoute>} />
            <Route path="/dashboard/notifications" element={<ProtectedRoute requireAdmin><Notifications /></ProtectedRoute>} />
            <Route path="/employee" element={<ProtectedRoute><EmployeeView /></ProtectedRoute>} />
            <Route path="/employee/face-enrollment" element={<ProtectedRoute><FaceEnrollment /></ProtectedRoute>} />
            <Route path="/employee/leave-request" element={<ProtectedRoute><LeaveRequest /></ProtectedRoute>} />
            <Route path="/employee/overtime-request" element={<ProtectedRoute><OvertimeRequest /></ProtectedRoute>} />
            <Route path="/employee/business-travel" element={<ProtectedRoute><BusinessTravelRequest /></ProtectedRoute>} />
            <Route path="/employee/business-travel-history" element={<ProtectedRoute><BusinessTravelHistory /></ProtectedRoute>} />
            <Route path="/employee/attendance-history" element={<ProtectedRoute><AttendanceHistory /></ProtectedRoute>} />
            <Route path="/employee/performance" element={<ProtectedRoute><PerformanceDashboard /></ProtectedRoute>} />
            <Route path="/employee/self-service" element={<ProtectedRoute><EmployeeSelfService /></ProtectedRoute>} />
            <Route path="/employee/notifications" element={<ProtectedRoute><EmployeeNotifications /></ProtectedRoute>} />
            <Route path="/employee/request-history" element={<ProtectedRoute><RequestHistory /></ProtectedRoute>} />
            <Route path="/employee/profile" element={<ProtectedRoute><EmployeeProfile /></ProtectedRoute>} />
            <Route path="/employee/payroll-history" element={<ProtectedRoute><EmployeePayrollHistory /></ProtectedRoute>} />
            <Route path="/employee/loans" element={<ProtectedRoute><EmployeeLoanHistory /></ProtectedRoute>} />
            <Route path="/dashboard/settings/notifications" element={<ProtectedRoute requireAdmin><NotificationSettings /></ProtectedRoute>} />
            <Route path="/dashboard/settings/company-bank" element={<ProtectedRoute requireAdmin><CompanyBankSettings /></ProtectedRoute>} />
            <Route path="/dashboard/settings/bpjs" element={<ProtectedRoute requireAdmin><BPJSSettings /></ProtectedRoute>} />
            <Route path="/dashboard/settings/ptkp" element={<ProtectedRoute requireAdmin><PTKPSettings /></ProtectedRoute>} />
            <Route path="/dashboard/settings/biaya-jabatan" element={<ProtectedRoute requireAdmin><BiayaJabatanSettings /></ProtectedRoute>} />
            <Route path="/dashboard/settings/pph21-brackets" element={<ProtectedRoute requireAdmin><PPh21BracketsSettings /></ProtectedRoute>} />
            <Route path="/dashboard/settings/backup" element={<ProtectedRoute requireAdmin><BackupRestore /></ProtectedRoute>} />
            <Route path="/dashboard/settings/department-jabatan" element={<ProtectedRoute requireAdmin><DepartmentJabatanSettings /></ProtectedRoute>} />
            <Route path="/dashboard/settings/holidays" element={<ProtectedRoute requireAdmin><HolidayEventSettings /></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="/dashboard/kpi" element={<ProtectedRoute requireAdmin><KPI /></ProtectedRoute>} />
            <Route path="/dashboard/kpi-recap" element={<ProtectedRoute requireAdmin><KPIRecap /></ProtectedRoute>} />
            <Route path="/employee/kpi" element={<ProtectedRoute><EmployeeKPI /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>;
export default App;

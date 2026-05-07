import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Download, MoreVertical, Upload, User, Pencil, Eye, Mail, Phone, MapPin, Calendar, Briefcase, Building2, KeyRound, Shield, ShieldCheck, Archive, Users } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { EmployeeDetailDialog } from "@/components/EmployeeDetailDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useDepartmentJabatan } from "@/hooks/useDepartmentJabatan";
import { employeeSchema, employeeEditSchema } from "@/lib/validationSchemas";
import { compressEmployeePhoto, blobToFile } from "@/lib/imageCompression";
import logger from "@/lib/logger";

const Employees = () => {
  const { t, i18n } = useTranslation();
  const localeCode = i18n.language === 'en' ? 'en-US' : 'id-ID';
  const { departments: DEPARTMENT_OPTIONS, jabatanOptions: JABATAN_OPTIONS } = useDepartmentJabatan();
  const [employees, setEmployees] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [resetPasswordEmployee, setResetPasswordEmployee] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isSetAdminDialogOpen, setIsSetAdminDialogOpen] = useState(false);
  const [setAdminEmployee, setSetAdminEmployee] = useState<any>(null);
  const [isSettingAdmin, setIsSettingAdmin] = useState(false);
  const [employeeRoles, setEmployeeRoles] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"active" | "archive">("active");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any>(null);
  const [viewingEmployee, setViewingEmployee] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    nik: "",
    full_name: "",
    jabatan: "",
    departemen: "",
    phone: "",
    address: "",
    join_date: new Date().toISOString().split('T')[0],
    work_type: "wfo",
  });

  const [editFormData, setEditFormData] = useState({
    email: "",
    nik: "",
    full_name: "",
    jabatan: "",
    departemen: "",
    phone: "",
    address: "",
    status: "",
    work_type: "wfo",
    basic_salary: "",
    ptkp_status: "TK/0",
    tunjangan_komunikasi: "",
    tunjangan_jabatan: "",
    tunjangan_operasional: "",
    bpjs_kesehatan_enabled: true,
    bpjs_ketenagakerjaan_enabled: true,
    contract_type: "permanent",
    npwp: "",
    bank_name: "",
    bank_account_number: "",
    join_date: "",
    resign_date: "",
    leave_active: true,
    annual_leave_quota: "12",
    remaining_leave: "12",
  });

  useEffect(() => {
    fetchEmployees();
    fetchEmployeeRoles();
  }, []);

  const fetchEmployeeRoles = async () => {
    const { data } = await supabase
      .from('user_roles')
      .select('user_id, role');
    
    if (data) {
      const rolesMap: Record<string, string> = {};
      data.forEach((item) => {
        rolesMap[item.user_id] = item.role;
      });
      setEmployeeRoles(rolesMap);
    }
  };

  const fetchEmployees = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data) {
      // Generate signed URLs for all employee photos
      const employeesWithSignedUrls = await Promise.all(
        data.map(async (emp) => {
          if (emp.photo_url) {
            const signedUrl = await getSignedPhotoUrl(emp.photo_url);
            return { ...emp, photo_url: signedUrl };
          }
          return emp;
        })
      );
      setEmployees(employeesWithSignedUrls);
    }
  };

  // Helper to get signed URL for employee photos
  const getSignedPhotoUrl = async (filePath: string): Promise<string | null> => {
    if (!filePath) return null;
    
    // If it's already a full URL (legacy data), try to extract the path
    if (filePath.startsWith('http')) {
      const match = filePath.match(/employee-photos\/(.+)$/);
      if (match) {
        filePath = match[1];
      } else {
        return filePath; // Return as-is if we can't parse it
      }
    }
    
    const { data, error } = await supabase.storage
      .from('employee-photos')
      .createSignedUrl(filePath, 3600); // 1 hour expiry
    
    if (error) {
      logger.error('Error creating signed URL:', error);
      return null;
    }
    
    return data.signedUrl;
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: t("employeesPage.toast.fileTooLargeTitle"),
          description: t("employeesPage.toast.fileTooLargeDesc"),
          variant: "destructive",
        });
        return;
      }
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadPhoto = async (userId: string): Promise<string | null> => {
    if (!photoFile) return null;

    try {
      // Compress the photo before uploading
      const compressedBlob = await compressEmployeePhoto(photoFile);
      const compressedFile = blobToFile(compressedBlob, `${userId}.jpg`);
      
      const filePath = `photos/${userId}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('employee-photos')
        .upload(filePath, compressedFile, { upsert: true });

      if (uploadError) throw uploadError;

      // Return the file path - we'll generate signed URLs when displaying
      return filePath;
    } catch (error) {
      logger.error('Error uploading photo:', error);
      throw error;
    }
  };
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [editFormErrors, setEditFormErrors] = useState<Record<string, string>>({});

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    // Validate input
    const result = employeeSchema.safeParse(formData);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as string;
        errors[field] = err.message;
      });
      setFormErrors(errors);
      toast({
        title: t("employeesPage.toast.validationFailedTitle"),
        description: t("employeesPage.toast.validationFailedDesc"),
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Use admin edge function to create user without auto-login
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: result.data.email,
          password: result.data.password,
          userData: {
            nik: result.data.nik,
            full_name: result.data.full_name,
            jabatan: result.data.jabatan,
            departemen: result.data.departemen,
            phone: formData.phone,
            address: formData.address,
            join_date: formData.join_date,
            work_type: formData.work_type,
          }
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const userId = data?.userId;

      // Upload photo if exists
      if (userId && photoFile) {
        const photoUrl = await uploadPhoto(userId);
        if (photoUrl) {
          await supabase
            .from('profiles')
            .update({ photo_url: photoUrl })
            .eq('id', userId);
        }
      }

      toast({
        title: t("employeesPage.toast.successTitle"),
        description: t("employeesPage.toast.addedDesc"),
      });

      setIsDialogOpen(false);
      resetForm();
      fetchEmployees();
      fetchEmployeeRoles();
    } catch (error: any) {
      toast({
        title: t("employeesPage.toast.addFailedTitle"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleEditEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setEditFormErrors({});

    // Validate input
    const result = employeeEditSchema.safeParse(editFormData);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as string;
        errors[field] = err.message;
      });
      setEditFormErrors(errors);
      toast({
        title: t("employeesPage.toast.validationFailedTitle"),
        description: t("employeesPage.toast.validationFailedDesc"),
        variant: "destructive",
      });
      return;
    }

    // Extra validation: resign_date wajib jika status Resigned
    if (editFormData.status === "Resigned" && !editFormData.resign_date) {
      setEditFormErrors({ resign_date: t("employeesPage.toast.resignDateRequiredField") });
      toast({
        title: t("employeesPage.toast.resignDateRequiredTitle"),
        description: t("employeesPage.toast.resignDateRequiredDesc"),
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      let photoUrl = editingEmployee.photo_url;
      
      if (photoFile) {
        photoUrl = await uploadPhoto(editingEmployee.id);
      }

      // Update email via edge function if changed
      if (result.data.email !== editingEmployee.email) {
        const { data: emailResult, error: emailError } = await supabase.functions.invoke('admin-update-email', {
          body: {
            userId: editingEmployee.id,
            newEmail: result.data.email,
          }
        });
        if (emailError) throw emailError;
        if (emailResult?.error) throw new Error(emailResult.error);
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          nik: result.data.nik,
          full_name: result.data.full_name,
          jabatan: result.data.jabatan,
          departemen: result.data.departemen,
          phone: result.data.phone || null,
          address: result.data.address || null,
          status: result.data.status,
          photo_url: photoUrl,
          work_type: editFormData.work_type,
          basic_salary: (result.data.basic_salary ?? (Number(editFormData.basic_salary) || 0)),
          ptkp_status: editFormData.ptkp_status || "TK/0",
          tunjangan_komunikasi: (result.data.tunjangan_komunikasi ?? (Number(editFormData.tunjangan_komunikasi) || 0)),
          tunjangan_jabatan: (result.data.tunjangan_jabatan ?? (Number(editFormData.tunjangan_jabatan) || 0)),
          tunjangan_operasional: (result.data.tunjangan_operasional ?? (Number(editFormData.tunjangan_operasional) || 0)),
           bpjs_kesehatan_enabled: editFormData.bpjs_kesehatan_enabled,
           bpjs_ketenagakerjaan_enabled: editFormData.bpjs_ketenagakerjaan_enabled,
          contract_type: editFormData.contract_type,
          annual_leave_quota: editFormData.leave_active ? (Number(editFormData.annual_leave_quota) || 12) : 0,
          remaining_leave: editFormData.leave_active ? (Number(editFormData.remaining_leave) || 0) : 0,
          npwp: result.data.npwp || null,
          bank_name: result.data.bank_name || null,
          bank_account_number: result.data.bank_account_number || null,
          join_date: editFormData.join_date || undefined,
          resign_date: editFormData.status === "Resigned" ? editFormData.resign_date : null,
        })
        .eq('id', editingEmployee.id);

      if (error) throw error;

      toast({
        title: t("employeesPage.toast.successTitle"),
        description: t("employeesPage.toast.updatedDesc"),
      });

      setIsEditDialogOpen(false);
      setEditingEmployee(null);
      resetForm();
      fetchEmployees();
    } catch (error: any) {
      toast({
        title: t("employeesPage.toast.updateFailedTitle"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const openEditDialog = (employee: any) => {
    setEditingEmployee(employee);
    setEditFormData({
      email: employee.email || "",
      nik: employee.nik,
      full_name: employee.full_name,
      jabatan: employee.jabatan,
      departemen: employee.departemen,
      phone: employee.phone || "",
      address: employee.address || "",
      status: employee.status || "Active",
      work_type: employee.work_type || "wfo",
      basic_salary: String(employee.basic_salary || ""),
      ptkp_status: employee.ptkp_status || "TK/0",
      tunjangan_komunikasi: String(employee.tunjangan_komunikasi || ""),
      tunjangan_jabatan: String(employee.tunjangan_jabatan || ""),
      tunjangan_operasional: String(employee.tunjangan_operasional || ""),
      bpjs_kesehatan_enabled: employee.bpjs_kesehatan_enabled !== false,
      bpjs_ketenagakerjaan_enabled: employee.bpjs_ketenagakerjaan_enabled !== false,
      contract_type: employee.contract_type || "permanent",
      npwp: employee.npwp || "",
      bank_name: employee.bank_name || "",
      bank_account_number: employee.bank_account_number || "",
      join_date: employee.join_date || "",
      resign_date: employee.resign_date || "",
      leave_active: (employee.annual_leave_quota ?? 12) > 0,
      annual_leave_quota: String(employee.annual_leave_quota ?? 12),
      remaining_leave: String(employee.remaining_leave ?? 12),
    });
    setPhotoPreview(employee.photo_url);
    setPhotoFile(null);
    setEditFormErrors({});
    setIsEditDialogOpen(true);
  };

  const openDetailDialog = (employee: any) => {
    setViewingEmployee(employee);
    setIsDetailDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      email: "",
      password: "",
      nik: "",
      full_name: "",
      jabatan: "",
      departemen: "",
      phone: "",
      address: "",
      join_date: new Date().toISOString().split('T')[0],
      work_type: "wfo",
    });
    setEditFormData({
      email: "",
      nik: "",
      full_name: "",
      jabatan: "",
      departemen: "",
      phone: "",
      address: "",
      status: "",
      work_type: "wfo",
      basic_salary: "",
      ptkp_status: "TK/0",
      tunjangan_komunikasi: "",
      tunjangan_jabatan: "",
      tunjangan_operasional: "",
      bpjs_kesehatan_enabled: true,
      bpjs_ketenagakerjaan_enabled: true,
      contract_type: "permanent",
      npwp: "",
      bank_name: "",
      bank_account_number: "",
      join_date: "",
      resign_date: "",
      leave_active: true,
      annual_leave_quota: "12",
      remaining_leave: "12",
    });
    setPhotoFile(null);
    setPhotoPreview(null);
    setFormErrors({});
    setEditFormErrors({});
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("employeesPage.confirmDelete"))) return;

    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', id);

    if (error) {
      toast({
        title: t("employeesPage.toast.deleteFailedTitle"),
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: t("employeesPage.toast.successTitle"),
        description: t("employeesPage.toast.deletedDesc"),
      });
      fetchEmployees();
    }
  };

  const openResetPasswordDialog = (employee: any) => {
    setResetPasswordEmployee(employee);
    setNewPassword("");
    setIsResetPasswordDialogOpen(true);
  };

  const handleAdminResetPassword = async () => {
    if (!resetPasswordEmployee || !newPassword) {
      toast({
        title: t("employeesPage.toast.passwordRequiredTitle"),
        description: t("employeesPage.toast.passwordRequiredDesc"),
        variant: "destructive",
      });
      return;
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      toast({
        title: t("employeesPage.toast.weakPasswordTitle"),
        description: t("employeesPage.toast.weakPasswordDesc"),
        variant: "destructive",
      });
      return;
    }

    setIsResettingPassword(true);

    try {
      const { data, error } = await supabase.functions.invoke('admin-reset-password', {
        body: {
          userId: resetPasswordEmployee.id,
          newPassword: newPassword,
        },
      });

      if (error) throw error;

      toast({
        title: t("employeesPage.toast.successTitle"),
        description: t("employeesPage.toast.resetSuccess", { name: resetPasswordEmployee.full_name }),
      });

      setIsResetPasswordDialogOpen(false);
      setResetPasswordEmployee(null);
      setNewPassword("");
    } catch (error: any) {
      toast({
        title: t("employeesPage.toast.resetFailedTitle"),
        description: error.message || t("employeesPage.toast.genericError"),
        variant: "destructive",
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const openSetAdminDialog = (employee: any) => {
    setSetAdminEmployee(employee);
    setIsSetAdminDialogOpen(true);
  };

  const handleSetAdminRole = async () => {
    if (!setAdminEmployee) return;

    setIsSettingAdmin(true);

    try {
      const currentRole = employeeRoles[setAdminEmployee.id] || 'employee';
      const newRole = currentRole === 'admin' ? 'employee' : 'admin';

      const { error } = await supabase
        .from('user_roles')
        .update({ role: newRole })
        .eq('user_id', setAdminEmployee.id);

      if (error) throw error;

      toast({
        title: t("employeesPage.toast.successTitle"),
        description: t("employeesPage.toast.roleSuccess", {
          name: setAdminEmployee.full_name,
          role: newRole === 'admin' ? t("employeesPage.toast.roleAdmin") : t("employeesPage.toast.roleEmployee"),
        }),
      });

      setIsSetAdminDialogOpen(false);
      setSetAdminEmployee(null);
      fetchEmployeeRoles();
    } catch (error: any) {
      toast({
        title: t("employeesPage.toast.roleFailedTitle"),
        description: error.message || t("employeesPage.toast.genericError"),
        variant: "destructive",
      });
    } finally {
      setIsSettingAdmin(false);
    }
  };

  // Filter by view mode (Aktif vs Arsip) first
  const viewFilteredEmployees = employees.filter((emp) => {
    const status = emp.status || "Active";
    if (viewMode === "active") return status === "Active";
    return status === "Inactive" || status === "Resigned";
  });

  const searchFilteredEmployees = viewFilteredEmployees.filter(emp =>
    emp.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.nik.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeCount = employees.filter((e) => (e.status || "Active") === "Active").length;
  const archiveCount = employees.filter((e) => e.status === "Inactive" || e.status === "Resigned").length;

  // Reset to page 1 when search changes
  const totalPages = Math.ceil(searchFilteredEmployees.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const filteredEmployees = searchFilteredEmployees.slice(startIndex, startIndex + itemsPerPage);

  // Reset page when search query changes
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleViewModeChange = (mode: string) => {
    setViewMode(mode as "active" | "archive");
    setCurrentPage(1);
    setSearchQuery("");
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("employeesPage.header.title")}</h1>
            <p className="text-muted-foreground mt-1">
              {t("employeesPage.header.subtitle")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              {t("employeesPage.header.export")}
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  {t("employeesPage.header.addEmployee")}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{t("employeesPage.addDialog.title")}</DialogTitle>
                  <DialogDescription>
                    {t("employeesPage.addDialog.description")}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddEmployee} className="space-y-4">
                  {/* Photo Upload */}
                  <div className="flex flex-col items-center gap-4">
                    <div 
                      className="relative cursor-pointer group"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Avatar className="h-24 w-24">
                        {photoPreview ? (
                          <AvatarImage src={photoPreview} alt="Preview" />
                        ) : (
                          <AvatarFallback className="bg-muted">
                            <User className="h-10 w-10 text-muted-foreground" />
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Upload className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handlePhotoSelect(e, false)}
                    />
                    <p className="text-sm text-muted-foreground">
                      {t("employeesPage.addDialog.uploadHint")}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="nik">{t("employeesPage.addDialog.nik")} *</Label>
                      <Input
                        id="nik"
                        value={formData.nik}
                        onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="full_name">{t("employeesPage.addDialog.fullName")} *</Label>
                      <Input
                        id="full_name"
                        value={formData.full_name}
                        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">{t("employeesPage.addDialog.email")} *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">{t("employeesPage.addDialog.password")} *</Label>
                      <Input
                        id="password"
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required
                        minLength={6}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="jabatan">{t("employeesPage.addDialog.jabatan")} *</Label>
                      <Select
                        value={formData.jabatan}
                        onValueChange={(value) => setFormData({ ...formData, jabatan: value })}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("employeesPage.addDialog.selectJabatan")} />
                        </SelectTrigger>
                        <SelectContent>
                          {JABATAN_OPTIONS.map((jabatan) => (
                            <SelectItem key={jabatan} value={jabatan}>
                              {jabatan}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="departemen">{t("employeesPage.addDialog.departemen")} *</Label>
                      <Select
                        value={formData.departemen}
                        onValueChange={(value) => setFormData({ ...formData, departemen: value })}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("employeesPage.addDialog.selectDepartemen")} />
                        </SelectTrigger>
                        <SelectContent>
                          {DEPARTMENT_OPTIONS.map((dept) => (
                            <SelectItem key={dept} value={dept}>
                              {dept}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">{t("employeesPage.addDialog.phone")}</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="join_date">{t("employeesPage.addDialog.joinDate")} *</Label>
                      <Input
                        id="join_date"
                        type="date"
                        value={formData.join_date}
                        onChange={(e) => setFormData({ ...formData, join_date: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="work_type">{t("employeesPage.addDialog.workType")} *</Label>
                      <Select
                        value={formData.work_type}
                        onValueChange={(value) => setFormData({ ...formData, work_type: value })}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("employeesPage.addDialog.selectWorkType")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="wfo">{t("employeesPage.addDialog.wfo")}</SelectItem>
                          <SelectItem value="wfa">{t("employeesPage.addDialog.wfa")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {t("employeesPage.addDialog.hybridHint")}
                      </p>
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="address">{t("employeesPage.addDialog.address")}</Label>
                      <Input
                        id="address"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      {t("employeesPage.addDialog.cancel")}
                    </Button>
                    <Button type="submit" disabled={isUploading}>
                      {isUploading ? t("employeesPage.addDialog.saving") : t("employeesPage.addDialog.save")}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Edit Employee Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) {
            setEditingEmployee(null);
            resetForm();
          }
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("employeesPage.editDialog.title")}</DialogTitle>
              <DialogDescription>
                {t("employeesPage.editDialog.description")}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleEditEmployee} className="space-y-4">
              {/* Photo Upload */}
              <div className="flex flex-col items-center gap-4">
                <div 
                  className="relative cursor-pointer group"
                  onClick={() => editFileInputRef.current?.click()}
                >
                  <Avatar className="h-24 w-24">
                    {photoPreview ? (
                      <AvatarImage src={photoPreview} alt="Preview" />
                    ) : (
                      <AvatarFallback className="bg-muted">
                        <User className="h-10 w-10 text-muted-foreground" />
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Pencil className="h-6 w-6 text-white" />
                  </div>
                </div>
                <input
                  ref={editFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handlePhotoSelect(e, true)}
                />
                <p className="text-sm text-muted-foreground">
                  {t("employeesPage.editDialog.uploadHint")}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_email">{t("employeesPage.addDialog.email")} *</Label>
                  <Input
                    id="edit_email"
                    type="email"
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    required
                  />
                  {editFormErrors.email && <p className="text-sm text-destructive">{editFormErrors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_nik">{t("employeesPage.addDialog.nik")} *</Label>
                  <Input
                    id="edit_nik"
                    value={editFormData.nik}
                    onChange={(e) => setEditFormData({ ...editFormData, nik: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_full_name">{t("employeesPage.addDialog.fullName")} *</Label>
                  <Input
                    id="edit_full_name"
                    value={editFormData.full_name}
                    onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_jabatan">{t("employeesPage.addDialog.jabatan")} *</Label>
                  <Select
                    value={editFormData.jabatan}
                    onValueChange={(value) => setEditFormData({ ...editFormData, jabatan: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("employeesPage.addDialog.selectJabatan")} />
                    </SelectTrigger>
                    <SelectContent>
                      {JABATAN_OPTIONS.map((jabatan) => (
                        <SelectItem key={jabatan} value={jabatan}>
                          {jabatan}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_departemen">{t("employeesPage.addDialog.departemen")} *</Label>
                  <Select
                    value={editFormData.departemen}
                    onValueChange={(value) => setEditFormData({ ...editFormData, departemen: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("employeesPage.addDialog.selectDepartemen")} />
                    </SelectTrigger>
                    <SelectContent>
                      {DEPARTMENT_OPTIONS.map((dept) => (
                        <SelectItem key={dept} value={dept}>
                          {dept}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_join_date">{t("employeesPage.addDialog.joinDate")}</Label>
                  <Input
                    id="edit_join_date"
                    type="date"
                    value={editFormData.join_date}
                    onChange={(e) => setEditFormData({ ...editFormData, join_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_phone">{t("employeesPage.addDialog.phone")}</Label>
                  <Input
                    id="edit_phone"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_status">{t("employeesPage.editDialog.status")}</Label>
                  <Select
                    value={editFormData.status}
                    onValueChange={(value) => setEditFormData({ ...editFormData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("employeesPage.editDialog.selectStatus")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">{t("employeesPage.editDialog.statusActive")}</SelectItem>
                      <SelectItem value="Inactive">{t("employeesPage.editDialog.statusInactive")}</SelectItem>
                      <SelectItem value="Resigned">{t("employeesPage.editDialog.statusResigned")}</SelectItem>
                    </SelectContent>
                  </Select>
                  {editFormData.status === "Resigned" && (
                    <p className="text-xs text-muted-foreground">
                      {t("employeesPage.editDialog.resignedHint")}
                    </p>
                  )}
                </div>
                {editFormData.status === "Resigned" && (
                  <div className="space-y-2">
                    <Label htmlFor="edit_resign_date">{t("employeesPage.editDialog.resignDate")} *</Label>
                    <Input
                      id="edit_resign_date"
                      type="date"
                      value={editFormData.resign_date}
                      onChange={(e) => {
                        setEditFormData({ ...editFormData, resign_date: e.target.value });
                        if (e.target.value && editFormErrors.resign_date) {
                          const { resign_date, ...rest } = editFormErrors;
                          setEditFormErrors(rest);
                        }
                      }}
                      required
                      aria-invalid={!!editFormErrors.resign_date}
                      className={editFormErrors.resign_date ? "border-destructive focus-visible:ring-destructive" : ""}
                    />
                    {editFormErrors.resign_date ? (
                      <p className="text-sm text-destructive">{editFormErrors.resign_date}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {t("employeesPage.editDialog.resignDateHint")}
                      </p>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="edit_work_type">{t("employeesPage.addDialog.workType")} *</Label>
                  <Select
                    value={editFormData.work_type}
                    onValueChange={(value) => setEditFormData({ ...editFormData, work_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("employeesPage.addDialog.selectWorkType")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wfo">{t("employeesPage.addDialog.wfo")}</SelectItem>
                      <SelectItem value="wfa">{t("employeesPage.addDialog.wfa")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t("employeesPage.addDialog.hybridHint")}
                  </p>
                </div>

                {/* Payroll Info Section */}
                <div className="col-span-2 border-t border-border pt-3 mt-2">
                  <p className="text-sm font-semibold text-muted-foreground mb-3">{t("employeesPage.editDialog.payrollSection")}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_basic_salary">{t("employeesPage.editDialog.basicSalary")}</Label>
                  <Input
                    id="edit_basic_salary"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={editFormData.basic_salary}
                    onChange={(e) => setEditFormData({ ...editFormData, basic_salary: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_ptkp_status">{t("employeesPage.editDialog.ptkpStatus")}</Label>
                  <Select
                    value={editFormData.ptkp_status}
                    onValueChange={(value) => setEditFormData({ ...editFormData, ptkp_status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("employeesPage.editDialog.selectPtkp")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TK/0">TK/0 - Tidak Kawin</SelectItem>
                      <SelectItem value="TK/1">TK/1 - Tidak Kawin, 1 Tanggungan</SelectItem>
                      <SelectItem value="TK/2">TK/2 - Tidak Kawin, 2 Tanggungan</SelectItem>
                      <SelectItem value="TK/3">TK/3 - Tidak Kawin, 3 Tanggungan</SelectItem>
                      <SelectItem value="K/0">K/0 - Kawin, 0 Tanggungan</SelectItem>
                      <SelectItem value="K/1">K/1 - Kawin, 1 Tanggungan</SelectItem>
                      <SelectItem value="K/2">K/2 - Kawin, 2 Tanggungan</SelectItem>
                      <SelectItem value="K/3">K/3 - Kawin, 3 Tanggungan</SelectItem>
                      <SelectItem value="K/I/0">K/I/0 - Kawin, Istri Digabung, 0 Tanggungan</SelectItem>
                      <SelectItem value="K/I/1">K/I/1 - Kawin, Istri Digabung, 1 Tanggungan</SelectItem>
                      <SelectItem value="K/I/2">K/I/2 - Kawin, Istri Digabung, 2 Tanggungan</SelectItem>
                      <SelectItem value="K/I/3">K/I/3 - Kawin, Istri Digabung, 3 Tanggungan</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t("employeesPage.editDialog.ptkpHint")}
                  </p>
                </div>

                {/* BPJS & Tunjangan Tetap Section */}
                <div className="col-span-2 border-t border-border pt-3 mt-2">
                  <p className="text-sm font-semibold text-muted-foreground mb-3">{t("employeesPage.editDialog.bpjsSection")}</p>
                </div>
                <div className="col-span-2 flex items-center space-x-2 mb-2">
                  <Checkbox
                    id="edit_bpjs_kes"
                    checked={editFormData.bpjs_kesehatan_enabled}
                    onCheckedChange={(checked) => setEditFormData({ ...editFormData, bpjs_kesehatan_enabled: !!checked })}
                  />
                  <Label htmlFor="edit_bpjs_kes" className="text-sm font-normal cursor-pointer">
                    {t("employeesPage.editDialog.bpjsKes")}
                  </Label>
                  {!editFormData.bpjs_kesehatan_enabled && (
                    <Badge variant="destructive" className="text-xs">{t("employeesPage.editDialog.notEnrolled")}</Badge>
                  )}
                </div>
                <div className="col-span-2 flex items-center space-x-2 mb-2">
                  <Checkbox
                    id="edit_bpjs_tk"
                    checked={editFormData.bpjs_ketenagakerjaan_enabled}
                    onCheckedChange={(checked) => setEditFormData({ ...editFormData, bpjs_ketenagakerjaan_enabled: !!checked })}
                  />
                  <Label htmlFor="edit_bpjs_tk" className="text-sm font-normal cursor-pointer">
                    {t("employeesPage.editDialog.bpjsTk")}
                  </Label>
                  {!editFormData.bpjs_ketenagakerjaan_enabled && (
                    <Badge variant="destructive" className="text-xs">{t("employeesPage.editDialog.notEnrolled")}</Badge>
                  )}
                </div>



                <div className="space-y-2">
                  <Label htmlFor="edit_tunjangan_komunikasi">{t("employeesPage.editDialog.tunjanganKomunikasi")}</Label>
                  <Input
                    id="edit_tunjangan_komunikasi"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={editFormData.tunjangan_komunikasi}
                    onChange={(e) => setEditFormData({ ...editFormData, tunjangan_komunikasi: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_tunjangan_jabatan">{t("employeesPage.editDialog.tunjanganJabatan")}</Label>
                  <Input
                    id="edit_tunjangan_jabatan"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={editFormData.tunjangan_jabatan}
                    onChange={(e) => setEditFormData({ ...editFormData, tunjangan_jabatan: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_tunjangan_operasional">{t("employeesPage.editDialog.tunjanganOperasional")}</Label>
                  <Input
                    id="edit_tunjangan_operasional"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={editFormData.tunjangan_operasional}
                    onChange={(e) => setEditFormData({ ...editFormData, tunjangan_operasional: e.target.value })}
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="edit_address">{t("employeesPage.addDialog.address")}</Label>
                  <Input
                    id="edit_address"
                    value={editFormData.address}
                    onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                  />
                </div>

                {/* Contract & Bank Info Section */}
                <div className="col-span-2 border-t border-border pt-3 mt-2">
                  <p className="text-sm font-semibold text-muted-foreground mb-3">{t("employeesPage.editDialog.contractSection")}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_contract_type">{t("employeesPage.editDialog.contractType")}</Label>
                  <Select
                    value={editFormData.contract_type}
                    onValueChange={(value) => setEditFormData({ ...editFormData, contract_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("employeesPage.editDialog.selectContract")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="permanent">{t("employeesPage.editDialog.permanent")}</SelectItem>
                      <SelectItem value="contract">{t("employeesPage.editDialog.contract")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_npwp">NPWP</Label>
                  <Input
                    id="edit_npwp"
                    placeholder="00.000.000.0-000.000"
                    value={editFormData.npwp}
                    onChange={(e) => setEditFormData({ ...editFormData, npwp: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_bank_name">{t("employeesPage.editDialog.bankName")}</Label>
                  <Input
                    id="edit_bank_name"
                    placeholder={t("employeesPage.editDialog.bankNamePlaceholder")}
                    value={editFormData.bank_name}
                    onChange={(e) => setEditFormData({ ...editFormData, bank_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_bank_account_number">{t("employeesPage.editDialog.bankAccount")}</Label>
                  <Input
                    id="edit_bank_account_number"
                    placeholder="1234567890"
                    value={editFormData.bank_account_number}
                    onChange={(e) => setEditFormData({ ...editFormData, bank_account_number: e.target.value })}
                  />
                </div>

                {/* Cuti Section */}
                <div className="col-span-2 border-t border-border pt-3 mt-2">
                  <p className="text-sm font-semibold text-muted-foreground mb-3">{t("employeesPage.editDialog.leaveSection")}</p>
                </div>
                {/* Tenure info for leave eligibility */}
                {editFormData.join_date && (() => {
                  const joinDate = new Date(editFormData.join_date + 'T00:00:00');
                  const now = new Date();
                  const diffMs = now.getTime() - joinDate.getTime();
                  const diffMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44));
                  const eligibleDate = new Date(joinDate);
                  eligibleDate.setFullYear(eligibleDate.getFullYear() + 1);
                  const isEligible = diffMonths >= 12;
                  return (
                    <div className="col-span-2 mb-2">
                      <div className={`text-xs rounded-md px-3 py-2 border ${isEligible ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-950 dark:border-green-800 dark:text-green-300' : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300'}`}>
                        <p className="font-medium">{isEligible ? '✅' : '⏳'} {t("employeesPage.editDialog.tenurePrefix")} {diffMonths} {t("employeesPage.editDialog.tenureMonths")} {editFormData.join_date})</p>
                        {isEligible 
                          ? <p>{t("employeesPage.editDialog.tenureEligible")}</p>
                          : <p>{t("employeesPage.editDialog.tenureNotEligibleBefore")} {eligibleDate.toLocaleDateString(localeCode, { day: 'numeric', month: 'long', year: 'numeric' })}{t("employeesPage.editDialog.tenureNotEligibleAfter")}</p>
                        }
                      </div>
                    </div>
                  );
                })()}
                <div className="col-span-2 flex items-center space-x-2 mb-2">
                  <Checkbox
                    id="edit_leave_active"
                    checked={editFormData.leave_active}
                    onCheckedChange={(checked) => setEditFormData({ ...editFormData, leave_active: !!checked })}
                  />
                  <Label htmlFor="edit_leave_active" className="text-sm font-normal cursor-pointer">
                    {t("employeesPage.editDialog.leaveActive")}
                  </Label>
                  {editFormData.leave_active ? (
                    <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">{t("employeesPage.editDialog.leaveActiveBadge")}</Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">{t("employeesPage.editDialog.leaveInactiveBadge")}</Badge>
                  )}
                </div>
                {editFormData.leave_active && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="edit_annual_leave_quota">{t("employeesPage.editDialog.annualQuota")}</Label>
                      <Input
                        id="edit_annual_leave_quota"
                        type="number"
                        min="0"
                        value={editFormData.annual_leave_quota}
                        onChange={(e) => setEditFormData({ ...editFormData, annual_leave_quota: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit_remaining_leave">{t("employeesPage.editDialog.remainingLeave")}</Label>
                      <Input
                        id="edit_remaining_leave"
                        type="number"
                        min="0"
                        value={editFormData.remaining_leave}
                        onChange={(e) => setEditFormData({ ...editFormData, remaining_leave: e.target.value })}
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  {t("employeesPage.editDialog.cancel")}
                </Button>
                <Button type="submit" disabled={isUploading}>
                  {isUploading ? t("employeesPage.editDialog.saving") : t("employeesPage.editDialog.saveChanges")}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <EmployeeDetailDialog
          open={isDetailDialogOpen}
          onOpenChange={(open) => {
            setIsDetailDialogOpen(open);
            if (!open) setViewingEmployee(null);
          }}
          employee={viewingEmployee}
          employeeRoles={employeeRoles}
          onEdit={(emp) => openEditDialog(emp)}
        />

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle>
                    {viewMode === "active" ? t("employeesPage.table.activeTitle") : t("employeesPage.table.archiveTitle")}
                  </CardTitle>
                  <CardDescription>
                    {viewMode === "active"
                      ? t("employeesPage.table.activeTotal", { count: activeCount })
                      : t("employeesPage.table.archiveTotal", { count: archiveCount })}
                  </CardDescription>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("employeesPage.table.search")}
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                  />
                </div>
              </div>
              <Tabs value={viewMode} onValueChange={handleViewModeChange}>
                <TabsList className="grid w-full sm:w-auto sm:inline-grid grid-cols-2">
                  <TabsTrigger value="active" className="gap-2">
                    <Users className="h-4 w-4" />
                    {t("employeesPage.table.tabActive")} ({activeCount})
                  </TabsTrigger>
                  <TabsTrigger value="archive" className="gap-2">
                    <Archive className="h-4 w-4" />
                    {t("employeesPage.table.tabArchive")} ({archiveCount})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto max-h-[calc(100vh-320px)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("employeesPage.table.photo")}</TableHead>
                    <TableHead>{t("employeesPage.table.nik")}</TableHead>
                    <TableHead>{t("employeesPage.table.name")}</TableHead>
                    <TableHead>{t("employeesPage.table.email")}</TableHead>
                    <TableHead>{t("employeesPage.table.jabatan")}</TableHead>
                    <TableHead>{t("employeesPage.table.departemen")}</TableHead>
                    <TableHead>{t("employeesPage.table.joined")}</TableHead>
                    <TableHead>{t("employeesPage.table.status")}</TableHead>
                    <TableHead className="text-right">{t("employeesPage.table.action")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmployees.length > 0 ? (
                    filteredEmployees.map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell>
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={employee.photo_url} alt={employee.full_name} />
                            <AvatarFallback>{getInitials(employee.full_name)}</AvatarFallback>
                          </Avatar>
                        </TableCell>
                        <TableCell className="font-medium">{employee.nik}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 flex-wrap">
                            {employee.full_name}
                            {employeeRoles[employee.id] === 'admin' && (
                              <Badge variant="outline" className="text-xs">
                                <ShieldCheck className="h-3 w-3 mr-1" />
                                {t("employeesPage.table.adminBadge")}
                              </Badge>
                            )}
                            {employee.work_type === 'wfa' && (
                              <Badge variant="secondary" className="text-xs">
                                <MapPin className="h-3 w-3 mr-1" />
                                {t("employeesPage.table.hybridBadge")}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{employee.email}</TableCell>
                        <TableCell>{employee.jabatan}</TableCell>
                        <TableCell>{employee.departemen}</TableCell>
                        <TableCell>{new Date(employee.join_date).toLocaleDateString(localeCode)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              employee.status === "Active"
                                ? "default"
                                : employee.status === "Resigned"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {employee.status === "Resigned" && employee.resign_date
                              ? `${t("employeesPage.table.resignedWith")} (${new Date(employee.resign_date).toLocaleDateString(localeCode)})`
                              : employee.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openDetailDialog(employee)}>
                                <Eye className="h-4 w-4 mr-2" />
                                {t("employeesPage.table.viewDetail")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditDialog(employee)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                {t("employeesPage.table.edit")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openResetPasswordDialog(employee)}>
                                <KeyRound className="h-4 w-4 mr-2" />
                                {t("employeesPage.table.resetPassword")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openSetAdminDialog(employee)}>
                                {employeeRoles[employee.id] === 'admin' ? (
                                  <>
                                    <Shield className="h-4 w-4 mr-2" />
                                    {t("employeesPage.table.removeAdmin")}
                                  </>
                                ) : (
                                  <>
                                    <ShieldCheck className="h-4 w-4 mr-2" />
                                    {t("employeesPage.table.makeAdmin")}
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={() => handleDelete(employee.id)}
                              >
                                {t("employeesPage.table.delete")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        {searchQuery
                          ? t("employeesPage.table.noMatch")
                          : viewMode === "active"
                          ? t("employeesPage.table.noActive")
                          : t("employeesPage.table.noArchive")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            
            <DataTablePagination
              currentPage={currentPage}
              totalItems={searchFilteredEmployees.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
            />
          </CardContent>
        </Card>

        {/* Reset Password Dialog */}
        <Dialog open={isResetPasswordDialogOpen} onOpenChange={(open) => {
          setIsResetPasswordDialogOpen(open);
          if (!open) {
            setResetPasswordEmployee(null);
            setNewPassword("");
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                {t("employeesPage.resetPassword.title")}
              </DialogTitle>
              <DialogDescription>
                {t("employeesPage.resetPassword.description", { name: resetPasswordEmployee?.full_name })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">{t("employeesPage.resetPassword.newPassword")}</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder={t("employeesPage.resetPassword.placeholder")}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsResetPasswordDialogOpen(false)}>
                  {t("employeesPage.resetPassword.cancel")}
                </Button>
                <Button onClick={handleAdminResetPassword} disabled={isResettingPassword}>
                  {isResettingPassword ? t("employeesPage.resetPassword.saving") : t("employeesPage.resetPassword.submit")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Set Admin Dialog */}
        <Dialog open={isSetAdminDialogOpen} onOpenChange={(open) => {
          setIsSetAdminDialogOpen(open);
          if (!open) {
            setSetAdminEmployee(null);
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                {setAdminEmployee && employeeRoles[setAdminEmployee.id] === 'admin' 
                  ? t("employeesPage.adminDialog.removeTitle") 
                  : t("employeesPage.adminDialog.makeTitle")}
              </DialogTitle>
              <DialogDescription>
                {setAdminEmployee && employeeRoles[setAdminEmployee.id] === 'admin'
                  ? t("employeesPage.adminDialog.removeConfirm", { name: setAdminEmployee?.full_name })
                  : t("employeesPage.adminDialog.makeConfirm", { name: setAdminEmployee?.full_name })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  {setAdminEmployee && employeeRoles[setAdminEmployee.id] === 'admin'
                    ? t("employeesPage.adminDialog.removeInfo")
                    : t("employeesPage.adminDialog.makeInfo")}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsSetAdminDialogOpen(false)}>
                  {t("employeesPage.adminDialog.cancel")}
                </Button>
                <Button onClick={handleSetAdminRole} disabled={isSettingAdmin}>
                  {isSettingAdmin ? t("employeesPage.adminDialog.saving") : (
                    setAdminEmployee && employeeRoles[setAdminEmployee.id] === 'admin' 
                      ? t("employeesPage.adminDialog.removeAction") 
                      : t("employeesPage.adminDialog.makeAction")
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Employees;

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Mail, Phone, MapPin, Briefcase, Building, Calendar, CreditCard, LogOut, User, Pencil, Key, Landmark, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmployeeBottomNav } from "@/components/EmployeeBottomNav";
import logo from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { id as idLocale, enUS } from "date-fns/locale";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { EditProfileDialog } from "@/components/EditProfileDialog";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { useTranslation } from "react-i18next";

const EmployeeProfile = () => {
  const navigate = useNavigate();
  const { signOut, profile, refreshProfile } = useAuth();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.resolvedLanguage?.startsWith("en") ? enUS : idLocale;
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 flex items-center justify-center">
        <p className="text-muted-foreground">{t("empProfile.loadingProfile")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 pb-24">
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/employee")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <img src={logo} alt="Kemika" className="h-8 object-contain" />
          </div>
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-lg space-y-6">
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-primary to-primary/80 h-24" />
          <CardContent className="pt-0 pb-6">
            <div className="flex flex-col items-center -mt-12">
              <div className="bg-background rounded-full p-1">
                <EmployeeAvatar
                  src={profile.photo_url}
                  name={profile.full_name}
                  size="xl"
                  className="h-24 w-24 text-2xl"
                />
              </div>
              <h2 className="text-xl font-bold mt-3">{profile.full_name}</h2>
              <p className="text-muted-foreground">{profile.jabatan}</p>
              <Badge variant="secondary" className="mt-2">{profile.departemen}</Badge>
              <div className="flex gap-2 mt-3">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowEditDialog(true)}>
                  <Pencil className="h-4 w-4" />
                  {t("empProfile.editProfile")}
                </Button>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowPasswordDialog(true)}>
                  <Key className="h-4 w-4" />
                  {t("empProfile.changePassword")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              {t("empProfile.personalInfo")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{t("common.nik")}</p>
                <p className="font-medium">{profile.nik}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{t("common.email")}</p>
                <p className="font-medium">{profile.email}</p>
              </div>
            </div>
            {profile.phone && (
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">{t("empProfile.phone")}</p>
                  <p className="font-medium">{profile.phone}</p>
                </div>
              </div>
            )}
            {profile.address && (
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">{t("empProfile.address")}</p>
                  <p className="font-medium">{profile.address}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Landmark className="h-5 w-5" />
              {t("empProfile.bankTaxInfo")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{t("empProfile.npwp")}</p>
                <p className="font-medium">{profile.npwp || "-"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Landmark className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{t("empProfile.bankName")}</p>
                <p className="font-medium">{profile.bank_name || "-"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Wallet className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{t("empProfile.accountNumber")}</p>
                <p className="font-medium">{profile.bank_account_number || "-"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              {t("empProfile.workInfo")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Briefcase className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{t("empProfile.position")}</p>
                <p className="font-medium">{profile.jabatan}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Building className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{t("empProfile.department")}</p>
                <p className="font-medium">{profile.departemen}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{t("empProfile.joinDate")}</p>
                <p className="font-medium">
                  {format(new Date(profile.join_date), "d MMMM yyyy", { locale: dateLocale })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t("empProfile.leaveBalance")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-primary/5 rounded-lg">
                <p className="text-3xl font-bold text-primary">{profile.remaining_leave ?? 0}</p>
                <p className="text-sm text-muted-foreground">{t("empProfile.remainingLeave")}</p>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-3xl font-bold">{profile.annual_leave_quota ?? 12}</p>
                <p className="text-sm text-muted-foreground">{t("empProfile.annualQuota")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {showEditDialog && (
        <EditProfileDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          profile={profile}
          onUpdated={() => refreshProfile()}
        />
      )}

      {showPasswordDialog && (
        <ChangePasswordDialog
          open={showPasswordDialog}
          onOpenChange={setShowPasswordDialog}
          userEmail={profile.email}
        />
      )}

      <EmployeeBottomNav />
    </div>
  );
};

export default EmployeeProfile;

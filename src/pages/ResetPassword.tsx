import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.png";
import { Eye, EyeOff, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const ResetPassword = () => {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user has a valid recovery session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setIsValidSession(true);
      } else {
        toast({
          title: "Link Tidak Valid",
          description: "Link reset password tidak valid atau sudah kadaluarsa",
          variant: "destructive"
        });
        navigate("/");
      }
    };

    // Listen for password recovery event
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsValidSession(true);
      }
    });

    checkSession();

    return () => subscription.unsubscribe();
  }, [navigate, toast]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast({
        title: "Password Terlalu Pendek",
        description: "Password minimal 6 karakter",
        variant: "destructive"
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Password Tidak Sama",
        description: "Konfirmasi password tidak sesuai",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: password
    });

    if (error) {
      toast({
        title: "Gagal Mengubah Password",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Password Berhasil Diubah",
        description: "Silakan login dengan password baru Anda"
      });
      await supabase.auth.signOut();
      navigate("/");
    }

    setIsLoading(false);
  };

  if (!isValidSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 p-4 flex items-center justify-center">
        <Card className="w-full max-w-md shadow-xl">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Memvalidasi link reset password...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 p-4 flex items-center justify-center">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <img src={logo} alt="Kemika Logo" className="h-16 object-contain" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold flex items-center justify-center gap-2">
              <Lock className="h-6 w-6" />
              Reset Password
            </CardTitle>
            <CardDescription className="mt-2">
              Masukkan password baru Anda
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password Baru</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Minimal 6 karakter"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Konfirmasi Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Ulangi password baru"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? "Menyimpan..." : "Simpan Password Baru"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => navigate("/")}
            >
              Kembali ke Login
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;

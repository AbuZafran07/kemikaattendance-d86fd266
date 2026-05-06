import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import logo from "@/assets/logo.png";
import { APP_VERSION } from "@/config/appVersion";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { loginSchema } from "@/lib/validationSchemas";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const Login = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const { signIn } = useAuth();
  const { toast } = useToast();

  const handleResetPassword = async () => {
    if (!resetEmail) {
      toast({
        title: t("login.emailRequired"),
        description: t("login.emailRequiredDesc"),
        variant: "destructive"
      });
      return;
    }

    setIsResetLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`
    });

    if (error) {
      toast({
        title: t("login.resetEmailFailedTitle"),
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: t("login.resetEmailSentTitle"),
        description: t("login.resetEmailSentDesc")
      });
      setResetDialogOpen(false);
      setResetEmail("");
    }
    setIsResetLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as 'email' | 'password';
        fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);
    const { error } = await signIn(result.data.email, result.data.password);
    if (error) {
      toast({
        title: t("login.loginFailed"),
        description: error.message || t("login.loginFailedDesc"),
        variant: "destructive"
      });
    } else {
      toast({
        title: t("login.loginSuccess"),
        description: t("login.loginSuccessDesc")
      });
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/10 p-4 bg-[#3c3c28] flex flex-col items-center justify-center border-0 border-solid rounded-none">
      <div className="w-full max-w-md flex justify-end mb-2">
        <LanguageSwitcher variant="outline" />
      </div>
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="flex justify-center">
            <img src={logo} alt="Kemika Logo" className="h-16 object-contain" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">{t("common.appName")}</CardTitle>
            <CardDescription className="mt-2">
              {t("common.appTagline")}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-1">
              <TabsTrigger value="login">{t("login.tabLogin")}</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("common.email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t("login.emailPlaceholder")}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className={errors.email ? "border-destructive" : ""}
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t("common.password")}</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder={t("login.passwordPlaceholder")}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className={errors.password ? "border-destructive" : ""}
                  />
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password}</p>
                  )}
                </div>
                <Button type="submit" disabled={isLoading} className="w-full bg-green-800 hover:bg-green-700">
                  {isLoading ? t("login.loggingIn") : t("login.submit")}
                </Button>

                <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="link" type="button" className="w-full text-muted-foreground">
                      {t("login.forgotPassword")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("login.resetTitle")}</DialogTitle>
                      <DialogDescription>
                        {t("login.resetDescription")}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="reset-email">{t("common.email")}</Label>
                        <Input
                          id="reset-email"
                          type="email"
                          placeholder={t("login.emailPlaceholder")}
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                        />
                      </div>
                      <Button
                        onClick={handleResetPassword}
                        disabled={isResetLoading}
                        className="w-full"
                      >
                        {isResetLoading ? t("login.sendingResetLink") : t("login.sendResetLink")}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-2 mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> {t("common.backToHome")}
      </button>
      <p className="text-xs text-muted-foreground/80 mt-3 opacity-60 text-center">{t("common.appVersion")} {APP_VERSION}</p>
    </div>
  );
};

export default Login;

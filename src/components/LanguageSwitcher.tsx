import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { SUPPORTED_LANGUAGES } from "@/i18n";

interface LanguageSwitcherProps {
  variant?: "ghost" | "outline";
  size?: "sm" | "default" | "icon";
  className?: string;
}

const LABELS: Record<string, string> = { id: "ID", en: "EN" };

const LanguageSwitcher = ({
  variant = "ghost",
  size = "sm",
  className,
}: LanguageSwitcherProps) => {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage || i18n.language || "id").slice(0, 2);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className={className} aria-label={t("common.language")}>
          <Languages className="h-4 w-4" />
          <span className="ml-1 text-xs font-semibold">{LABELS[current] ?? current.toUpperCase()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LANGUAGES.map((lng) => (
          <DropdownMenuItem
            key={lng}
            onClick={() => i18n.changeLanguage(lng)}
            className={current === lng ? "font-semibold" : ""}
          >
            {lng === "id" ? t("common.languageId") : t("common.languageEn")}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSwitcher;

import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Target, Plus, Trash2, Save, TrendingUp, Users, Award, DollarSign,
  Loader2, ChevronDown, ChevronUp, Info, HelpCircle, Settings2, BookOpen,
} from "lucide-react";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";

type FormulaType = "ratio" | "akumulasi" | "avg" | "lower" | "threshold" | "custom";

interface ThresholdRule {
  op: "=" | "<" | "<=" | ">" | ">=";
  value: number;
  score: number;
}

interface CustomVar {
  label: string;
  alias: string; // v0, v1, v2 ...
}

interface Indicator {
  id?: string;
  user_id: string;
  year: number;
  name: string;
  description: string;
  weight: number;
  target: string;
  unit: string;
  formula_type: FormulaType;
  thresholds: ThresholdRule[];
  custom_vars: CustomVar[];
  custom_expr: string;
  sort_order: number;
  _isNew?: boolean;
}

interface Realization {
  id?: string;
  indicator_id: string;
  user_id: string;
  month: number;
  year: number;
  value: number | null;
  custom_values: Record<string, number>;
  notes?: string | null;
}

interface GradeSetting {
  id?: string;
  grade: string;
  min_score: number;
  bonus_percent: number;
}

interface ProfileLite {
  id: string;
  full_name: string;
  jabatan: string;
  departemen: string;
  basic_salary: number | null;
}

const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const FORMULA_OPTIONS: { value: FormulaType; label: string; hint: string }[] = [
  { value: "ratio", label: "Ratio", hint: "Rata-rata realisasi / target × 100" },
  { value: "akumulasi", label: "Akumulasi", hint: "Total realisasi / target × 100" },
  { value: "avg", label: "Average", hint: "Rata-rata realisasi / target × 100" },
  { value: "lower", label: "Lower is Better", hint: "Target / rata-rata × 100" },
  { value: "threshold", label: "Threshold", hint: "Skor berdasarkan aturan" },
  { value: "custom", label: "Custom Formula", hint: "Ekspresi dengan variabel v0..vN" },
];

const scoreColor = (s: number) => {
  if (s >= 90) return "bg-emerald-500";
  if (s >= 75) return "bg-blue-500";
  if (s >= 60) return "bg-amber-500";
  return "bg-red-500";
};

import { safeEval, validateCustomExpr } from "@/lib/kpiFormula";
const computeIndicatorScore = (ind: Indicator, reals: Realization[]): { score: number; realized: number } => {
  const target = parseFloat(ind.target) || 0;
  const filled = reals.filter((r) => {
    if (ind.formula_type === "custom") return r.custom_values && Object.keys(r.custom_values).length > 0;
    return r.value !== null && r.value !== undefined;
  });

  if (filled.length === 0) return { score: 0, realized: 0 };

  let realized = 0;
  let score = 0;

  switch (ind.formula_type) {
    case "ratio":
    case "avg": {
      const sum = filled.reduce((a, r) => a + (Number(r.value) || 0), 0);
      realized = sum / filled.length;
      score = target > 0 ? (realized / target) * 100 : 0;
      break;
    }
    case "akumulasi": {
      realized = filled.reduce((a, r) => a + (Number(r.value) || 0), 0);
      score = target > 0 ? (realized / target) * 100 : 0;
      break;
    }
    case "lower": {
      const sum = filled.reduce((a, r) => a + (Number(r.value) || 0), 0);
      realized = sum / filled.length;
      score = realized > 0 ? (target / realized) * 100 : 0;
      break;
    }
    case "threshold": {
      const sum = filled.reduce((a, r) => a + (Number(r.value) || 0), 0);
      realized = sum / filled.length;
      const rules = [...(ind.thresholds || [])];
      for (const rule of rules) {
        const v = Number(rule.value);
        let ok = false;
        switch (rule.op) {
          case "=": ok = realized === v; break;
          case "<": ok = realized < v; break;
          case "<=": ok = realized <= v; break;
          case ">": ok = realized > v; break;
          case ">=": ok = realized >= v; break;
        }
        if (ok) { score = Number(rule.score) || 0; break; }
      }
      break;
    }
    case "custom": {
      const monthly = filled.map((r) => safeEval(ind.custom_expr, r.custom_values || {}));
      realized = monthly.reduce((a, b) => a + b, 0) / monthly.length;
      score = target > 0 ? (realized / target) * 100 : 0;
      break;
    }
  }

  return { score: Math.min(120, Math.max(0, score)), realized };
};

// Inline tester for custom formulas — admin enters sample values, sees result + score vs target.
function FormulaTester({
  expr,
  vars,
  target,
  unit,
  formulaLowerIsBetter,
}: {
  expr: string;
  vars: CustomVar[];
  target: number;
  unit: string;
  formulaLowerIsBetter?: boolean;
}) {
  const [samples, setSamples] = useState<Record<string, string>>({});
  const error = validateCustomExpr(expr, vars);

  // Drop sample keys for aliases that no longer exist
  useEffect(() => {
    const allowed = new Set(vars.map((v) => v.alias));
    setSamples((prev) => {
      const next: Record<string, string> = {};
      Object.keys(prev).forEach((k) => { if (allowed.has(k)) next[k] = prev[k]; });
      return next;
    });
  }, [vars]);

  const numericVars = useMemo(() => {
    const out: Record<string, number> = {};
    vars.forEach((v) => {
      const raw = samples[v.alias];
      out[v.alias] = raw === undefined || raw === "" ? 0 : Number(raw) || 0;
    });
    return out;
  }, [samples, vars]);

  const allFilled = vars.length > 0 && vars.every((v) => samples[v.alias] !== undefined && samples[v.alias] !== "");
  const result = !error && allFilled ? safeEval(expr, numericVars) : null;
  const score = result !== null && target > 0
    ? Math.min(120, Math.max(0, formulaLowerIsBetter ? (target / Math.max(result, 0.0001)) * 100 : (result / target) * 100))
    : null;

  return (
    <div className="border border-dashed rounded-md p-3 bg-background space-y-3">
      <div className="flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-primary" />
        <span className="font-medium text-sm">Uji Formula</span>
        <span className="text-xs text-muted-foreground">— masukkan contoh nilai untuk melihat hasil</span>
      </div>
      {vars.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Tambahkan variabel dahulu untuk mengetes formula.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {vars.map((v) => (
              <div key={v.alias}>
                <Label className="text-xs">
                  {v.label || <span className="italic text-muted-foreground">(tanpa label)</span>}{" "}
                  <span className="font-mono text-muted-foreground">[{v.alias}]</span>
                </Label>
                <Input
                  type="number"
                  step="any"
                  placeholder="0"
                  value={samples[v.alias] ?? ""}
                  onChange={(e) => setSamples((p) => ({ ...p, [v.alias]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" type="button" onClick={() => {
              const filled: Record<string, string> = {};
              vars.forEach((v) => { filled[v.alias] = "1"; });
              setSamples(filled);
            }}>Isi semua = 1</Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setSamples({})}>Reset</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t">
            <div className="rounded-md bg-muted/50 p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Hasil Realisasi</div>
              <div className="text-lg font-bold">
                {error
                  ? <span className="text-destructive text-sm">Formula tidak valid</span>
                  : !allFilled
                    ? <span className="text-muted-foreground text-sm">Isi semua variabel</span>
                    : `${result?.toFixed(2)} ${unit || ""}`}
              </div>
            </div>
            <div className="rounded-md bg-muted/50 p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Target</div>
              <div className="text-lg font-bold">{target || 0} {unit || ""}</div>
            </div>
            <div className={`rounded-md p-2 ${score === null ? "bg-muted/50" : score >= 90 ? "bg-emerald-50 dark:bg-emerald-950/30" : score >= 75 ? "bg-blue-50 dark:bg-blue-950/30" : score >= 60 ? "bg-amber-50 dark:bg-amber-950/30" : "bg-red-50 dark:bg-red-950/30"}`}>
              <div className="text-[10px] uppercase text-muted-foreground">Score (capped 120)</div>
              <div className="text-lg font-bold">
                {score === null ? <span className="text-muted-foreground text-sm">—</span> : `${score.toFixed(2)}`}
              </div>
            </div>
          </div>
          {error && allFilled && (
            <p className="text-xs text-destructive">⚠ {error}</p>
          )}
        </>
      )}
    </div>
  );
}

export default function KPIPage() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [realizations, setRealizations] = useState<Realization[]>([]);
  const [grades, setGrades] = useState<GradeSetting[]>([]);
  const [recap, setRecap] = useState<{ user: ProfileLite; score: number; grade: string; bonus: number }[]>([]);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedUserId) || null,
    [profiles, selectedUserId]
  );

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  // Load profiles + grades on mount
  useEffect(() => {
    (async () => {
      const [{ data: profs }, { data: gs }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, jabatan, departemen, basic_salary").order("full_name"),
        supabase.from("kpi_grade_settings").select("*").order("min_score", { ascending: false }),
      ]);
      setProfiles((profs || []) as ProfileLite[]);
      setGrades((gs || []) as GradeSetting[]);
    })();
  }, []);

  // Load indicators + realizations when user/year changes
  useEffect(() => {
    if (!selectedUserId) {
      setIndicators([]);
      setRealizations([]);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const { data: inds, error: e1 } = await supabase
          .from("kpi_indicators")
          .select("*")
          .eq("user_id", selectedUserId)
          .eq("year", year)
          .order("sort_order", { ascending: true });
        if (e1) throw e1;

        const indicatorsClean: Indicator[] = ((inds || []) as any[]).map((i) => ({
          id: i.id,
          user_id: i.user_id,
          year: i.year,
          name: i.name || "",
          description: i.description || "",
          weight: Number(i.weight) || 0,
          target: i.target ?? "100",
          unit: i.unit ?? "%",
          formula_type: (i.formula_type || "ratio") as FormulaType,
          thresholds: Array.isArray(i.thresholds) ? i.thresholds : [],
          custom_vars: Array.isArray(i.custom_vars) ? i.custom_vars : [],
          custom_expr: i.custom_expr || "",
          sort_order: i.sort_order ?? 0,
        }));
        setIndicators(indicatorsClean);

        const ids = indicatorsClean.map((i) => i.id).filter(Boolean) as string[];
        if (ids.length) {
          const { data: reals } = await supabase
            .from("kpi_realizations")
            .select("*")
            .in("indicator_id", ids)
            .eq("year", year);
          setRealizations(((reals || []) as any[]).map((r) => ({
            id: r.id,
            indicator_id: r.indicator_id,
            user_id: r.user_id,
            month: r.month,
            year: r.year,
            value: r.value === null ? null : Number(r.value),
            custom_values: (r.custom_values || {}) as Record<string, number>,
            notes: r.notes,
          })));
        } else {
          setRealizations([]);
        }
      } catch (err: any) {
        toast({ title: "Gagal memuat KPI", description: err.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedUserId, year, toast]);

  /* ========== INDICATOR HANDLERS ========== */

  const addIndicator = () => {
    if (!selectedUserId) {
      toast({ title: "Pilih karyawan dulu", variant: "destructive" });
      return;
    }
    setIndicators((prev) => [
      ...prev,
      {
        user_id: selectedUserId,
        year,
        name: "",
        description: "",
        weight: 0,
        target: "100",
        unit: "%",
        formula_type: "ratio",
        thresholds: [],
        custom_vars: [],
        custom_expr: "",
        sort_order: prev.length,
        _isNew: true,
      },
    ]);
  };

  const updateIndicator = (idx: number, patch: Partial<Indicator>) => {
    setIndicators((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const removeIndicator = async (idx: number) => {
    const ind = indicators[idx];
    if (ind.id) {
      const { error } = await supabase.from("kpi_indicators").delete().eq("id", ind.id);
      if (error) {
        toast({ title: "Gagal menghapus", description: error.message, variant: "destructive" });
        return;
      }
    }
    setIndicators((prev) => prev.filter((_, i) => i !== idx));
    setRealizations((prev) => prev.filter((r) => r.indicator_id !== ind.id));
    toast({ title: "Indicator dihapus" });
  };

  const saveAllIndicators = async () => {
    if (!selectedUserId) return;
    const total = indicators.reduce((a, b) => a + (Number(b.weight) || 0), 0);
    if (Math.round(total) !== 100) {
      toast({
        title: "Total bobot harus 100%",
        description: `Saat ini total bobot = ${total}%`,
        variant: "destructive",
      });
      return;
    }
    // Validate every custom-formula indicator before saving
    for (const ind of indicators) {
      if (ind.formula_type !== "custom") continue;
      const err = validateCustomExpr(ind.custom_expr, ind.custom_vars);
      if (err) {
        toast({
          title: `Formula tidak valid: ${ind.name || "Indicator tanpa nama"}`,
          description: err,
          variant: "destructive",
        });
        return;
      }
    }
    setSaving(true);
    try {
      const payload = indicators.map((i, idx) => ({
        ...(i.id ? { id: i.id } : {}),
        user_id: selectedUserId,
        year,
        name: i.name,
        description: i.description,
        weight: Number(i.weight) || 0,
        target: String(i.target),
        unit: i.unit,
        formula_type: i.formula_type,
        thresholds: i.thresholds as any,
        custom_vars: i.custom_vars as any,
        custom_expr: i.custom_expr,
        sort_order: idx,
      }));
      const { data, error } = await supabase
        .from("kpi_indicators")
        .upsert(payload, { onConflict: "id" })
        .select();
      if (error) throw error;

      // Refresh ids
      const refreshed: Indicator[] = ((data || []) as any[])
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((i) => ({
          id: i.id,
          user_id: i.user_id,
          year: i.year,
          name: i.name || "",
          description: i.description || "",
          weight: Number(i.weight) || 0,
          target: i.target ?? "100",
          unit: i.unit ?? "%",
          formula_type: (i.formula_type || "ratio") as FormulaType,
          thresholds: Array.isArray(i.thresholds) ? i.thresholds : [],
          custom_vars: Array.isArray(i.custom_vars) ? i.custom_vars : [],
          custom_expr: i.custom_expr || "",
          sort_order: i.sort_order ?? 0,
        }));
      setIndicators(refreshed);
      toast({ title: "Tersimpan", description: "Semua indicator berhasil disimpan" });
    } catch (err: any) {
      toast({ title: "Gagal menyimpan", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  /* ========== REALIZATION HANDLERS ========== */

  const upsertRealization = async (
    indicator_id: string,
    month: number,
    patch: { value?: number | null; custom_values?: Record<string, number> }
  ) => {
    if (!selectedUserId) return;
    const existing = realizations.find((r) => r.indicator_id === indicator_id && r.month === month);
    const next: Realization = {
      ...(existing || { indicator_id, user_id: selectedUserId, month, year, value: null, custom_values: {} }),
      ...patch,
    } as Realization;

    try {
      const { data, error } = await supabase
        .from("kpi_realizations")
        .upsert(
          {
            ...(next.id ? { id: next.id } : {}),
            indicator_id,
            user_id: selectedUserId,
            month,
            year,
            value: next.value,
            custom_values: next.custom_values as any,
          },
          { onConflict: "indicator_id,month,year" }
        )
        .select()
        .single();
      if (error) throw error;
      setRealizations((prev) => {
        const others = prev.filter((r) => !(r.indicator_id === indicator_id && r.month === month));
        return [
          ...others,
          {
            id: data.id,
            indicator_id: data.indicator_id,
            user_id: data.user_id,
            month: data.month,
            year: data.year,
            value: data.value === null ? null : Number(data.value),
            custom_values: (data.custom_values || {}) as Record<string, number>,
          },
        ];
      });
    } catch (err: any) {
      toast({ title: "Gagal menyimpan realisasi", description: err.message, variant: "destructive" });
    }
  };

  /* ========== SCORE CALCULATIONS ========== */

  const indicatorScores = useMemo(() => {
    return indicators.map((ind) => {
      const reals = realizations.filter((r) => r.indicator_id === ind.id);
      const { score, realized } = computeIndicatorScore(ind, reals);
      return { indicator: ind, reals, score, realized, filledCount: reals.length };
    });
  }, [indicators, realizations]);

  const totalWeight = useMemo(
    () => indicators.reduce((a, b) => a + (Number(b.weight) || 0), 0),
    [indicators]
  );

  const finalScore = useMemo(() => {
    return indicatorScores.reduce((acc, it) => acc + (it.score * (it.indicator.weight || 0)) / 100, 0);
  }, [indicatorScores]);

  const finalGrade = useMemo(() => {
    const sorted = [...grades].sort((a, b) => b.min_score - a.min_score);
    return sorted.find((g) => finalScore >= g.min_score) || null;
  }, [grades, finalScore]);

  /* ========== GRADES & RECAP ========== */

  const updateGrade = (idx: number, patch: Partial<GradeSetting>) =>
    setGrades((prev) => prev.map((g, i) => (i === idx ? { ...g, ...patch } : g)));

  const saveGrades = async () => {
    setSaving(true);
    try {
      const payload = grades.map((g) => ({
        ...(g.id ? { id: g.id } : {}),
        grade: g.grade,
        min_score: Number(g.min_score) || 0,
        bonus_percent: Number(g.bonus_percent) || 0,
      }));
      const { error } = await supabase.from("kpi_grade_settings").upsert(payload, { onConflict: "grade" });
      if (error) throw error;
      toast({ title: "Pengaturan grade tersimpan" });
    } catch (err: any) {
      toast({ title: "Gagal menyimpan grade", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Recap all employees
  useEffect(() => {
    if (profiles.length === 0) return;
    (async () => {
      const { data: allInds } = await supabase
        .from("kpi_indicators")
        .select("*")
        .eq("year", year);
      if (!allInds || allInds.length === 0) {
        setRecap([]);
        return;
      }
      const { data: allReals } = await supabase
        .from("kpi_realizations")
        .select("*")
        .eq("year", year);

      const grouped: Record<string, any[]> = {};
      (allInds as any[]).forEach((i) => {
        if (!i.user_id) return;
        (grouped[i.user_id] ||= []).push(i);
      });

      const realsByInd: Record<string, any[]> = {};
      ((allReals || []) as any[]).forEach((r) => {
        (realsByInd[r.indicator_id] ||= []).push(r);
      });

      const sortedGrades = [...grades].sort((a, b) => b.min_score - a.min_score);
      const list: typeof recap = [];
      Object.entries(grouped).forEach(([uid, inds]) => {
        const prof = profiles.find((p) => p.id === uid);
        if (!prof) return;
        let weighted = 0;
        inds.forEach((i: any) => {
          const ind: Indicator = {
            ...i,
            thresholds: Array.isArray(i.thresholds) ? i.thresholds : [],
            custom_vars: Array.isArray(i.custom_vars) ? i.custom_vars : [],
          };
          const reals = (realsByInd[i.id] || []).map((r: any) => ({
            ...r,
            value: r.value === null ? null : Number(r.value),
            custom_values: r.custom_values || {},
          }));
          const { score } = computeIndicatorScore(ind, reals);
          weighted += (score * (Number(i.weight) || 0)) / 100;
        });
        const g = sortedGrades.find((gg) => weighted >= gg.min_score);
        const bonus = ((prof.basic_salary || 0) * (g?.bonus_percent || 0)) / 100;
        list.push({ user: prof, score: weighted, grade: g?.grade || "-", bonus });
      });
      list.sort((a, b) => b.score - a.score);
      setRecap(list);
    })();
  }, [year, profiles, grades, indicators, realizations]);

  /* ========== RENDER ========== */

  const initials = (name: string) =>
    name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
        <div className="flex items-center gap-3">
          <Target className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">KPI Management</h1>
            <p className="text-sm text-muted-foreground">Kelola indikator, realisasi, dan output payroll KPI karyawan</p>
          </div>
        </div>

        {/* Selector */}
        <Card>
          <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Karyawan</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger><SelectValue placeholder="Pilih karyawan" /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name} — {p.jabatan}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tahun</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedProfile && (
              <div className="rounded-md border p-3 text-sm">
                <div className="font-semibold">{selectedProfile.full_name}</div>
                <div className="text-muted-foreground">{selectedProfile.jabatan} • {selectedProfile.departemen}</div>
                <div className="text-muted-foreground">
                  Gaji Pokok: Rp {(selectedProfile.basic_salary || 0).toLocaleString("id-ID")}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* PANDUAN PENGGUNAAN KPI */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Panduan Cara Mengelola KPI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="step1">
                <AccordionTrigger className="text-sm font-semibold">
                  1. Langkah-Langkah Pengaturan KPI
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground space-y-2">
                  <p><b>a.</b> Pilih <b>Karyawan</b> dan <b>Tahun</b> di atas.</p>
                  <p><b>b.</b> Buka tab <b>Setup Indicator</b> → klik <b>Tambah Indicator</b> untuk membuat KPI baru.</p>
                  <p><b>c.</b> Isi <b>Nama, Deskripsi, Bobot (%), Target, Satuan,</b> dan pilih <b>Tipe Formula</b>.</p>
                  <p><b>d.</b> Total bobot semua indicator <b>WAJIB = 100%</b> sebelum disimpan.</p>
                  <p><b>e.</b> Klik <b>Simpan Semua</b>.</p>
                  <p><b>f.</b> Buka tab <b>Input Realisasi</b> → input nilai pencapaian per bulan (Jan–Des).</p>
                  <p><b>g.</b> Lihat hasil agregasi di tab <b>Progress &amp; Score</b> dan estimasi bonus di <b>Payroll Output</b>.</p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="step2">
                <AccordionTrigger className="text-sm font-semibold">
                  2. Penjelasan Tipe Formula
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground space-y-3">
                  <div className="rounded-md border bg-background p-3">
                    <div className="font-semibold text-foreground">Ratio / Average</div>
                    <p>Score = (rata-rata realisasi 12 bulan ÷ target) × 100. Cocok untuk KPI persentase pencapaian rutin.</p>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <div className="font-semibold text-foreground">Akumulasi</div>
                    <p>Score = (total realisasi seluruh bulan ÷ target tahunan) × 100. Cocok untuk target kumulatif (mis. total penjualan setahun).</p>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <div className="font-semibold text-foreground">Lower is Better</div>
                    <p>Score = (target ÷ rata-rata realisasi) × 100. Cocok untuk KPI yang semakin kecil semakin baik (mis. defect rate, keterlambatan).</p>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <div className="font-semibold text-foreground">Threshold</div>
                    <p>Skor ditentukan oleh aturan kondisi. Contoh: jika realisasi ≥ 95 → skor 100, jika ≥ 80 → skor 80, dst. Aturan dievaluasi dari atas ke bawah, urutan penting.</p>
                  </div>
                  <div className="rounded-md border bg-background p-3">
                    <div className="font-semibold text-foreground">Custom Formula</div>
                    <p>Anda bisa mendefinisikan rumus sendiri dengan variabel. Lihat panduan di bawah.</p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="step3">
                <AccordionTrigger className="text-sm font-semibold">
                  3. Cara Membuat Custom Formula
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground space-y-3">
                  <p>Custom Formula dipakai bila perhitungan KPI butuh <b>lebih dari satu variabel input</b> per bulan (mis. konversi, efisiensi, dsb).</p>
                  <ol className="list-decimal pl-5 space-y-1">
                    <li>Pilih <b>Tipe Formula = Custom Formula</b>.</li>
                    <li>Klik <b>Tambah Variabel</b>. Setiap variabel otomatis dapat alias <code className="px-1 rounded bg-muted">v0, v1, v2, ...</code></li>
                    <li>Beri <b>Label</b> yang jelas, contoh: <i>v0 = Jumlah Lead Closing</i>, <i>v1 = Total Lead Masuk</i>.</li>
                    <li>Tulis <b>Ekspresi Formula</b> menggunakan alias tersebut, contoh: <code className="px-1 rounded bg-muted">(v0 / v1) * 100</code>.</li>
                    <li>Setelah disimpan, di tab <b>Input Realisasi</b> Anda akan diminta input semua variabel per bulan.</li>
                    <li>Sistem menghitung formula tiap bulan, lalu rata-ratanya dibagi target × 100 = score.</li>
                  </ol>
                  <div className="rounded-md border bg-background p-3 space-y-2">
                    <div className="font-semibold text-foreground">Contoh Lengkap — Conversion Rate</div>
                    <p>Variabel: <code className="px-1 rounded bg-muted">v0</code> = Closing, <code className="px-1 rounded bg-muted">v1</code> = Lead Masuk</p>
                    <p>Ekspresi: <code className="px-1 rounded bg-muted">(v0 / v1) * 100</code></p>
                    <p>Target: 25 (artinya target conversion 25%)</p>
                    <p>Bila bulan tertentu v0=50, v1=200 → realisasi bulan itu = 25 → score 100%.</p>
                  </div>
                  <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-700 p-3 text-emerald-800 dark:text-emerald-200 space-y-2">
                    <div className="font-semibold flex items-center gap-1"><Info className="h-4 w-4" /> Operator &amp; Fungsi yang didukung (mirip Excel)</div>
                    <p><b>Operator:</b> <code>+ − * / ( )</code> dan pembanding <code>=</code>, <code>&lt;&gt;</code>, <code>&lt;</code>, <code>&gt;</code>, <code>&lt;=</code>, <code>&gt;=</code></p>

                    <div>
                      <p className="font-semibold mt-1">📐 Matematika &amp; Pembulatan</p>
                      <p className="text-xs"><code>ABS</code>, <code>SQRT</code>, <code>POWER(x,n)</code>, <code>EXP</code>, <code>LN</code>, <code>LOG10</code>, <code>LOG(x,base)</code>, <code>SIGN</code>, <code>MOD(a,b)</code>, <code>INT</code>, <code>TRUNC</code>, <code>ROUND(x,d)</code>, <code>ROUNDUP</code>, <code>ROUNDDOWN</code>, <code>FLOOR</code>, <code>CEILING</code>, <code>PI()</code></p>
                    </div>

                    <div>
                      <p className="font-semibold">📊 Statistik &amp; Agregasi</p>
                      <p className="text-xs"><code>SUM</code>, <code>PRODUCT</code>, <code>AVERAGE</code>/<code>AVG</code>, <code>MEDIAN</code>, <code>MIN</code>, <code>MAX</code>, <code>COUNT</code>, <code>STDEV</code>, <code>VAR</code>, <code>PERCENT(a,b)</code></p>
                    </div>

                    <div>
                      <p className="font-semibold">🔀 Logika &amp; Kondisi</p>
                      <p className="text-xs"><code>IF(cond,a,b)</code>, <code>IFS(c1,v1,c2,v2,...)</code>, <code>SWITCH(val,k1,v1,...,default)</code>, <code>CHOOSE(idx,v1,v2,...)</code>, <code>AND</code>, <code>OR</code>, <code>NOT</code>, <code>XOR</code>, <code>BETWEEN(x,a,b)</code>, <code>CLAMP(x,min,max)</code>, <code>ISBLANK</code>, <code>ISNUMBER</code></p>
                    </div>

                    <div>
                      <p className="font-semibold">📐 Trigonometri</p>
                      <p className="text-xs"><code>SIN</code>, <code>COS</code>, <code>TAN</code>, <code>ASIN</code>, <code>ACOS</code>, <code>ATAN</code>, <code>DEGREES</code>, <code>RADIANS</code></p>
                    </div>

                    <div>
                      <p className="font-semibold">🎲 Acak (jarang dipakai untuk KPI)</p>
                      <p className="text-xs"><code>RAND()</code>, <code>RANDBETWEEN(a,b)</code></p>
                    </div>

                    <p className="font-semibold mt-2">💡 Contoh praktis:</p>
                    <ul className="list-disc list-inside ml-2 space-y-1 text-xs">
                      <li><code>IF(v0&lt;=25, 100, MAX(0, 100-(v0-25)*10))</code> — Skor 100 bila tepat waktu, kurang 10 poin/hari telat</li>
                      <li><code>CLAMP(v0/v1*100, 0, 100)</code> — Rasio % dibatasi 0–100</li>
                      <li><code>IFS(v0&gt;=95,100, v0&gt;=85,90, v0&gt;=75,75, 1,50)</code> — Skor bertingkat (mirip nested IF)</li>
                      <li><code>SWITCH(v0, 1,100, 2,80, 3,60, 0)</code> — Skor berdasarkan kategori</li>
                      <li><code>ROUND(AVERAGE(v0,v1,v2)*0.8 + v3*0.2, 2)</code> — Rata-rata 3 nilai + bobot tambahan</li>
                      <li><code>SUM(v0,v1,v2)/COUNT(v0,v1,v2)</code> — Rata-rata manual</li>
                      <li><code>PERCENT(v0, v1)</code> — Sama dengan <code>v0/v1*100</code></li>
                      <li><code>IF(AND(v0&gt;=80, v1&lt;=5), 100, 70)</code> — Bonus penuh bila 2 syarat terpenuhi</li>
                    </ul>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="step4">
                <AccordionTrigger className="text-sm font-semibold">
                  4. Bobot, Grade &amp; Bonus
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground space-y-2">
                  <p><b>Bobot</b> menentukan kontribusi indicator ke score akhir. Total semua bobot harus 100%.</p>
                  <p><b>Score Akhir</b> = Σ (score indicator × bobot ÷ 100).</p>
                  <p><b>Grade</b> ditentukan dari ambang batas score di tab <b>Payroll Output</b> (A/B/C/D dengan % bonus masing-masing).</p>
                  <p><b>Bonus</b> = Gaji Pokok × % bonus grade.</p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        {/* DAFTAR KPI SEMUA KARYAWAN */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Daftar KPI Semua Karyawan — Tahun {year}
            </CardTitle>
            <Badge variant="outline">{recap.length} karyawan</Badge>
          </CardHeader>
          <CardContent>
            {recap.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                Belum ada karyawan yang memiliki KPI di tahun {year}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Karyawan</TableHead>
                      <TableHead>Jabatan</TableHead>
                      <TableHead className="text-right">Score Akhir</TableHead>
                      <TableHead className="text-center">Grade</TableHead>
                      <TableHead className="text-right">Estimasi Bonus</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recap.map((row) => (
                      <TableRow
                        key={row.user.id}
                        className={selectedUserId === row.user.id ? "bg-primary/5" : ""}
                      >
                        <TableCell className="font-medium">{row.user.full_name}</TableCell>
                        <TableCell className="text-muted-foreground">{row.user.jabatan}</TableCell>
                        <TableCell className="text-right">
                          <Badge className={scoreColor(row.score) + " text-white"}>
                            {row.score.toFixed(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center font-bold">{row.grade}</TableCell>
                        <TableCell className="text-right">
                          Rp {row.bonus.toLocaleString("id-ID")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant={selectedUserId === row.user.id ? "default" : "outline"}
                            onClick={() => setSelectedUserId(row.user.id)}
                          >
                            <Settings2 className="h-3 w-3 mr-1" />
                            Kelola
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {!selectedUserId ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
              Pilih karyawan untuk mulai mengelola KPI
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="setup">
            <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full">
              <TabsTrigger value="setup">Setup Indicator</TabsTrigger>
              <TabsTrigger value="realisasi">Input Realisasi</TabsTrigger>
              <TabsTrigger value="progress">Progress &amp; Score</TabsTrigger>
              <TabsTrigger value="payroll">Payroll Output</TabsTrigger>
            </TabsList>

            {/* TAB 1: SETUP */}
            <TabsContent value="setup" className="space-y-4 mt-4">
              <div className="flex gap-2 rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800 p-3 text-sm text-blue-800 dark:text-blue-200">
                <HelpCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <b>Tips:</b> Buat 3–6 indicator. Total bobot wajib 100%. Pilih tipe formula sesuai sifat KPI (Ratio untuk %, Akumulasi untuk total tahunan, Lower untuk metrik kecil-lebih-baik, Threshold untuk skor diskrit, Custom untuk rumus banyak variabel).
                </div>
              </div>
              {indicators.length === 0 && (
                <Card><CardContent className="py-10 text-center text-muted-foreground">
                  Belum ada indicator. Klik "Tambah Indicator" untuk memulai.
                </CardContent></Card>
              )}
              {indicators.map((ind, idx) => (
                <Card key={ind.id || `new-${idx}`}>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">Indicator #{idx + 1}</CardTitle>
                    <Button size="sm" variant="ghost" onClick={() => removeIndicator(idx)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <Label>Nama Indicator</Label>
                      <Input value={ind.name} onChange={(e) => updateIndicator(idx, { name: e.target.value })} placeholder="e.g. Pencapaian Target Penjualan" />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Deskripsi</Label>
                      <Textarea rows={2} value={ind.description} onChange={(e) => updateIndicator(idx, { description: e.target.value })} />
                    </div>
                    <div>
                      <Label>Bobot (%)</Label>
                      <Input type="number" value={ind.weight} onChange={(e) => updateIndicator(idx, { weight: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div>
                      <Label>Target</Label>
                      <Input value={ind.target} onChange={(e) => updateIndicator(idx, { target: e.target.value })} />
                    </div>
                    <div>
                      <Label>Satuan</Label>
                      <Input value={ind.unit} onChange={(e) => updateIndicator(idx, { unit: e.target.value })} placeholder="%, pcs, jam" />
                    </div>
                    <div>
                      <Label>Tipe Formula</Label>
                      <Select value={ind.formula_type} onValueChange={(v) => updateIndicator(idx, { formula_type: v as FormulaType })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FORMULA_OPTIONS.map((f) => (
                            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">{FORMULA_OPTIONS.find((f) => f.value === ind.formula_type)?.hint}</p>
                    </div>

                    {ind.formula_type === "threshold" && (
                      <div className="md:col-span-2 border rounded-md p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Aturan Threshold</Label>
                          <Button size="sm" variant="outline" onClick={() => updateIndicator(idx, { thresholds: [...ind.thresholds, { op: ">=", value: 0, score: 0 }] })}>
                            <Plus className="h-3 w-3 mr-1" /> Tambah
                          </Button>
                        </div>
                        {ind.thresholds.map((t, ti) => (
                          <div key={ti} className="grid grid-cols-12 gap-2 items-end">
                            <div className="col-span-3">
                              <Select value={t.op} onValueChange={(v) => {
                                const next = [...ind.thresholds];
                                next[ti] = { ...t, op: v as ThresholdRule["op"] };
                                updateIndicator(idx, { thresholds: next });
                              }}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {["=","<","<=",">",">="].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="col-span-4">
                              <Input type="number" placeholder="Nilai" value={t.value}
                                onChange={(e) => {
                                  const next = [...ind.thresholds];
                                  next[ti] = { ...t, value: parseFloat(e.target.value) || 0 };
                                  updateIndicator(idx, { thresholds: next });
                                }} />
                            </div>
                            <div className="col-span-4">
                              <Input type="number" placeholder="Score" value={t.score}
                                onChange={(e) => {
                                  const next = [...ind.thresholds];
                                  next[ti] = { ...t, score: parseFloat(e.target.value) || 0 };
                                  updateIndicator(idx, { thresholds: next });
                                }} />
                            </div>
                            <div className="col-span-1">
                              <Button size="icon" variant="ghost" onClick={() => updateIndicator(idx, { thresholds: ind.thresholds.filter((_, j) => j !== ti) })}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {ind.formula_type === "custom" && (
                      <div className="md:col-span-2 border rounded-md p-3 space-y-3 bg-muted/30">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Variabel Custom</Label>
                            <p className="text-xs text-muted-foreground">Alias dikunci & tidak berubah meski variabel dihapus, agar data historis & formula tetap konsisten.</p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => {
                            // Generate next stable alias by finding max existing v{n}
                            const usedNums = ind.custom_vars
                              .map((c) => /^v(\d+)$/.exec(c.alias)?.[1])
                              .filter((s): s is string => !!s)
                              .map((s) => parseInt(s, 10));
                            const nextNum = usedNums.length > 0 ? Math.max(...usedNums) + 1 : 0;
                            updateIndicator(idx, { custom_vars: [...ind.custom_vars, { label: "", alias: `v${nextNum}` }] });
                          }}>
                            <Plus className="h-3 w-3 mr-1" /> Tambah Variabel
                          </Button>
                        </div>
                        {ind.custom_vars.length === 0 && (
                          <p className="text-xs text-muted-foreground italic">Belum ada variabel. Tambahkan minimal 1 variabel untuk indikator ini.</p>
                        )}
                        {ind.custom_vars.map((cv, ci) => (
                          <div key={cv.alias} className="grid grid-cols-12 gap-2 items-end">
                            <div className="col-span-2">
                              <Label className="text-xs">Alias</Label>
                              <Input value={cv.alias} disabled className="font-mono text-center bg-muted" />
                            </div>
                            <div className="col-span-9">
                              <Label className="text-xs">Label Variabel</Label>
                              <Input placeholder="contoh: Jumlah Lead Masuk" value={cv.label}
                                onChange={(e) => {
                                  const next = [...ind.custom_vars];
                                  next[ci] = { ...cv, label: e.target.value };
                                  updateIndicator(idx, { custom_vars: next });
                                }} />
                            </div>
                            <div className="col-span-1">
                              <Button size="icon" variant="ghost" title="Hapus variabel" onClick={() => {
                                if (!confirm(`Hapus variabel ${cv.alias}? Data realisasi yang sudah diisi untuk variabel ini akan ikut terhapus.`)) return;
                                // Keep aliases stable for remaining vars (no renumbering)
                                const next = ind.custom_vars.filter((_, j) => j !== ci);
                                updateIndicator(idx, { custom_vars: next });
                              }}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        {(() => {
                          const exprError = validateCustomExpr(ind.custom_expr, ind.custom_vars);
                          return (
                            <div>
                              <Label>Ekspresi Formula</Label>
                              <Input
                                placeholder="e.g. (v0 / v1) * 100"
                                value={ind.custom_expr}
                                onChange={(e) => updateIndicator(idx, { custom_expr: e.target.value })}
                                className={exprError && ind.custom_expr ? "border-destructive focus-visible:ring-destructive" : ""}
                              />
                              <p className="text-xs text-muted-foreground mt-1">
                                Alias tersedia: {ind.custom_vars.length > 0
                                  ? ind.custom_vars.map((c) => `${c.alias}${c.label ? ` (${c.label})` : ""}`).join(", ")
                                  : "belum ada variabel"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Operator: <code className="px-1 rounded bg-muted">+ − * / ( ) = &lt;&gt; &lt; &gt; &lt;= &gt;=</code> · Fungsi: <code className="px-1 rounded bg-muted">IF IFS SWITCH AND OR NOT MIN MAX SUM AVG MEDIAN ROUND CLAMP POWER SQRT MOD PERCENT BETWEEN</code> <span className="italic">(lihat panduan di atas untuk daftar lengkap)</span>
                              </p>
                              {exprError && ind.custom_expr && (
                                <p className="text-xs text-destructive mt-1 font-medium">⚠ {exprError}</p>
                              )}
                            </div>
                          );
                        })()}
                        <FormulaTester
                          expr={ind.custom_expr}
                          vars={ind.custom_vars}
                          target={parseFloat(ind.target) || 0}
                          unit={ind.unit}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              <div className={`flex items-center justify-between rounded-md border p-3 ${Math.round(totalWeight) === 100 ? "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-red-50 border-red-300 text-red-700 dark:bg-red-950 dark:text-red-300"}`}>
                <span className="font-semibold">Total Bobot: {totalWeight}%</span>
                <span className="text-sm">{Math.round(totalWeight) === 100 ? "✓ Sesuai" : "Harus 100%"}</span>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={addIndicator}>
                  <Plus className="h-4 w-4 mr-2" /> Tambah Indicator
                </Button>
                <Button onClick={saveAllIndicators} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Simpan Semua
                </Button>
              </div>
            </TabsContent>

            {/* TAB 2: REALISASI */}
            <TabsContent value="realisasi" className="space-y-4 mt-4">
              {indicators.filter((i) => i.id).length === 0 && (
                <Card><CardContent className="py-10 text-center text-muted-foreground">
                  Simpan indicator terlebih dahulu di tab Setup.
                </CardContent></Card>
              )}
              {indicators.filter((i) => i.id).map((ind) => {
                const reals = realizations.filter((r) => r.indicator_id === ind.id);
                const { score, realized } = computeIndicatorScore(ind, reals);
                const filled = reals.filter((r) => ind.formula_type === "custom"
                  ? r.custom_values && Object.keys(r.custom_values).length > 0
                  : r.value !== null && r.value !== undefined).length;
                return (
                  <Card key={ind.id}>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center justify-between">
                        <span>{ind.name || "(Tanpa nama)"}</span>
                        <Badge variant="outline">{FORMULA_OPTIONS.find((f) => f.value === ind.formula_type)?.label}</Badge>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">Target: {ind.target} {ind.unit} • Bobot: {ind.weight}%</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {ind.formula_type !== "custom" ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {MONTHS.map((m, mi) => {
                            const month = mi + 1;
                            const r = reals.find((rr) => rr.month === month);
                            return (
                              <div key={month}>
                                <Label className="text-xs">{m}</Label>
                                <Input
                                  type="number"
                                  defaultValue={r?.value ?? ""}
                                  onBlur={(e) => {
                                    const raw = e.target.value;
                                    const v = raw === "" ? null : parseFloat(raw);
                                    if (r?.value === v) return;
                                    upsertRealization(ind.id!, month, { value: v });
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      ) : ind.custom_vars.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">Belum ada variabel custom. Tambahkan variabel di tab Setup Indicator terlebih dahulu.</p>
                      ) : (
                        <div className="space-y-3">
                          {MONTHS.map((m, mi) => {
                            const month = mi + 1;
                            const r = reals.find((rr) => rr.month === month);
                            const cv = r?.custom_values || {};
                            return (
                              <div key={month} className="border rounded-md p-3">
                                <div className="font-medium text-sm mb-2">{m}</div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                  {ind.custom_vars.map((v) => (
                                    <div key={v.alias}>
                                      <Label className="text-xs">
                                        {v.label || <span className="italic text-muted-foreground">(tanpa label)</span>}{" "}
                                        <span className="font-mono text-muted-foreground">[{v.alias}]</span>
                                      </Label>
                                      <Input
                                        type="number"
                                        defaultValue={cv[v.alias] ?? ""}
                                        onBlur={(e) => {
                                          const raw = e.target.value;
                                          const next = { ...cv };
                                          if (raw === "") delete next[v.alias];
                                          else next[v.alias] = parseFloat(raw) || 0;
                                          if (JSON.stringify(next) === JSON.stringify(cv)) return;
                                          upsertRealization(ind.id!, month, { custom_values: next });
                                        }}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t">
                        <Metric label="Bulan Terisi" value={`${filled}/12`} />
                        <Metric label="Realisasi" value={realized.toFixed(2)} />
                        <Metric label="Target" value={ind.target} />
                        <Metric label="Score" value={`${score.toFixed(1)}`} />
                      </div>
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div className={`h-full ${scoreColor(score)}`} style={{ width: `${Math.min(100, score)}%` }} />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>

            {/* TAB 3: PROGRESS */}
            <TabsContent value="progress" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SummaryCard icon={<TrendingUp className="h-5 w-5" />} label="Score Akhir (Weighted)" value={finalScore.toFixed(1)} />
                <SummaryCard icon={<Award className="h-5 w-5" />} label="Grade Proyeksi" value={finalGrade?.grade || "-"} />
                <SummaryCard icon={<Target className="h-5 w-5" />} label="Total Indicator" value={String(indicators.length)} />
              </div>

              {indicatorScores.map((it) => (
                <Card key={it.indicator.id}>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>{it.indicator.name || "(Tanpa nama)"}</span>
                      <Badge className={scoreColor(it.score) + " text-white"}>{it.score.toFixed(1)}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden mb-3">
                      <div className={`h-full ${scoreColor(it.score)}`} style={{ width: `${Math.min(100, it.score)}%` }} />
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Bulan</TableHead>
                            <TableHead>Realisasi</TableHead>
                            <TableHead>Target</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {MONTHS.map((m, mi) => {
                            const month = mi + 1;
                            const r = it.reals.find((rr) => rr.month === month);
                            let realVal: number | null = null;
                            if (r) {
                              if (it.indicator.formula_type === "custom") {
                                realVal = safeEval(it.indicator.custom_expr, r.custom_values || {});
                              } else if (r.value !== null && r.value !== undefined) {
                                realVal = Number(r.value);
                              }
                            }
                            const tgt = parseFloat(it.indicator.target) || 0;
                            const ok = realVal !== null && (it.indicator.formula_type === "lower" ? realVal <= tgt : realVal >= tgt);
                            return (
                              <TableRow key={month}>
                                <TableCell>{m}</TableCell>
                                <TableCell>{realVal === null ? "-" : realVal.toFixed(2)}</TableCell>
                                <TableCell>{it.indicator.target}</TableCell>
                                <TableCell>{realVal === null ? "-" : ok ? <span className="text-emerald-600">✓</span> : <span className="text-red-600">✗</span>}</TableCell>
                              </TableRow>
                            );
                          })}
                          <TableRow className="font-semibold bg-muted/50">
                            <TableCell>Total / Rata-rata</TableCell>
                            <TableCell>{it.realized.toFixed(2)}</TableCell>
                            <TableCell>{it.indicator.target}</TableCell>
                            <TableCell>Score: {it.score.toFixed(1)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            {/* TAB 4: PAYROLL OUTPUT */}
            <TabsContent value="payroll" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle className="text-base">Konfigurasi Grade</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {grades.map((g, gi) => (
                      <div key={g.id || g.grade} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-2">
                          <Label className="text-xs">Grade</Label>
                          <Input value={g.grade} disabled />
                        </div>
                        <div className="col-span-5">
                          <Label className="text-xs">Min Score</Label>
                          <Input type="number" value={g.min_score} onChange={(e) => updateGrade(gi, { min_score: parseFloat(e.target.value) || 0 })} />
                        </div>
                        <div className="col-span-5">
                          <Label className="text-xs">Bonus (%)</Label>
                          <Input type="number" value={g.bonus_percent} onChange={(e) => updateGrade(gi, { bonus_percent: parseFloat(e.target.value) || 0 })} />
                        </div>
                      </div>
                    ))}
                    <Button onClick={saveGrades} disabled={saving} className="w-full">
                      {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                      Simpan Grade
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" /> Slip Payroll KPI</CardTitle></CardHeader>
                  <CardContent>
                    {selectedProfile ? (() => {
                      const basic = selectedProfile.basic_salary || 0;
                      const bonus = (basic * (finalGrade?.bonus_percent || 0)) / 100;
                      return (
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                              {initials(selectedProfile.full_name)}
                            </div>
                            <div>
                              <div className="font-semibold">{selectedProfile.full_name}</div>
                              <div className="text-sm text-muted-foreground">{selectedProfile.jabatan} • Tahun {year}</div>
                            </div>
                          </div>
                          <div className="space-y-2 text-sm border-t pt-3">
                            <Row label="Score Akhir" value={finalScore.toFixed(1)} />
                            <Row label="Grade" value={finalGrade?.grade || "-"} />
                            <Row label="Gaji Pokok" value={`Rp ${basic.toLocaleString("id-ID")}`} />
                            <Row label={`Bonus KPI (${finalGrade?.bonus_percent || 0}%)`} value={`Rp ${bonus.toLocaleString("id-ID")}`} />
                            <div className="border-t pt-2 flex justify-between font-bold text-base">
                              <span>Total Take-Home</span>
                              <span>Rp {(basic + bonus).toLocaleString("id-ID")}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })() : (
                      <div className="text-sm text-muted-foreground text-center py-6">Pilih karyawan</div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base">Rekap Semua Karyawan ({year})</CardTitle></CardHeader>
                <CardContent>
                  {recap.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-6">Belum ada data score</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Karyawan</TableHead>
                            <TableHead>Departemen</TableHead>
                            <TableHead>Score</TableHead>
                            <TableHead>Grade</TableHead>
                            <TableHead>Gaji Pokok</TableHead>
                            <TableHead>Bonus KPI</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recap.map((r) => (
                            <TableRow key={r.user.id}>
                              <TableCell className="font-medium">{r.user.full_name}</TableCell>
                              <TableCell>{r.user.departemen}</TableCell>
                              <TableCell>{r.score.toFixed(1)}</TableCell>
                              <TableCell><Badge className={scoreColor(r.score) + " text-white"}>{r.grade}</Badge></TableCell>
                              <TableCell>Rp {(r.user.basic_salary || 0).toLocaleString("id-ID")}</TableCell>
                              <TableCell>Rp {r.bonus.toLocaleString("id-ID")}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

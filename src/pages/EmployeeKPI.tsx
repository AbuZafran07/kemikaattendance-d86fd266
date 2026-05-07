import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Loader2, Target, Award, DollarSign, TrendingUp, Paperclip, AlertTriangle } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import KPIMonthlyAttachments from "@/components/KPIMonthlyAttachments";
import logo from "@/assets/logo.png";

type FormulaType = "ratio" | "akumulasi" | "avg" | "lower" | "threshold" | "custom";

interface ThresholdRule { op: "=" | "<" | "<=" | ">" | ">="; value: number; score: number; }
interface CustomVar { label: string; alias: string; }

interface Indicator {
  id: string;
  user_id: string;
  year: number;
  name: string;
  description: string | null;
  weight: number;
  target: string;
  unit: string;
  formula_type: FormulaType;
  thresholds: ThresholdRule[];
  custom_vars: CustomVar[];
  custom_expr: string;
  sort_order: number;
}

interface Realization {
  id?: string;
  indicator_id: string;
  user_id: string;
  month: number;
  year: number;
  value: number | null;
  custom_values: Record<string, number>;
}

interface GradeSetting {
  id?: string;
  grade: string;
  min_score: number;
  bonus_percent: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

import { safeEval } from "@/lib/kpiFormula";

const computeIndicatorScore = (ind: Indicator, reals: Realization[]): { score: number; realized: number } => {
  const target = parseFloat(ind.target) || 0;
  const filled = reals.filter((r) => {
    if (ind.formula_type === "custom") return r.custom_values && Object.keys(r.custom_values).length > 0;
    return r.value !== null && r.value !== undefined;
  });
  if (filled.length === 0) return { score: 0, realized: 0 };
  let realized = 0; let score = 0;
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
      for (const rule of ind.thresholds || []) {
        const v = Number(rule.value); let ok = false;
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

const scoreColorClass = (s: number) => {
  if (s >= 90) return "bg-emerald-500";
  if (s >= 75) return "bg-blue-500";
  if (s >= 60) return "bg-amber-500";
  return "bg-red-500";
};

const formatRupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);

export default function EmployeeKPI() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [realizations, setRealizations] = useState<Realization[]>([]);
  const [grades, setGrades] = useState<GradeSetting[]>([]);
  const [attachmentCounts, setAttachmentCounts] = useState<Record<number, number>>({});

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }, []);

  const userId = profile?.id;

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [indRes, realRes, gradeRes, attRes] = await Promise.all([
        supabase.from("kpi_indicators").select("*").eq("user_id", userId).eq("year", year).order("sort_order", { ascending: true }),
        supabase.from("kpi_realizations").select("*").eq("user_id", userId).eq("year", year),
        supabase.from("kpi_grade_settings").select("*").order("min_score", { ascending: false }),
        supabase.from("kpi_monthly_attachments").select("month").eq("user_id", userId).eq("year", year),
      ]);
      setIndicators((indRes.data || []) as unknown as Indicator[]);
      setRealizations(((realRes.data || []) as unknown as Realization[]).map((r) => ({
        ...r,
        custom_values: (r.custom_values || {}) as Record<string, number>,
      })));
      setGrades((gradeRes.data || []) as GradeSetting[]);
      const counts: Record<number, number> = {};
      ((attRes.data || []) as { month: number }[]).forEach((row) => {
        counts[row.month] = (counts[row.month] || 0) + 1;
      });
      setAttachmentCounts(counts);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal memuat data";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [userId, year, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const realsByIndicator = useMemo(() => {
    const map = new Map<string, Realization[]>();
    indicators.forEach((i) => map.set(i.id, []));
    realizations.forEach((r) => {
      if (!r.indicator_id) return;
      const arr = map.get(r.indicator_id) || [];
      arr.push(r);
      map.set(r.indicator_id, arr);
    });
    return map;
  }, [indicators, realizations]);

  const indicatorScores = useMemo(() => {
    return indicators.map((ind) => {
      const reals = realsByIndicator.get(ind.id) || [];
      const { score, realized } = computeIndicatorScore(ind, reals);
      return { ind, score, realized, contribution: (score * (Number(ind.weight) || 0)) / 100 };
    });
  }, [indicators, realsByIndicator]);

  const finalScore = useMemo(
    () => indicatorScores.reduce((a, x) => a + x.contribution, 0),
    [indicatorScores]
  );

  const myGrade = useMemo(() => {
    const sorted = [...grades].sort((a, b) => b.min_score - a.min_score);
    return sorted.find((g) => finalScore >= g.min_score) || null;
  }, [grades, finalScore]);

  const basicSalary = Number(profile?.basic_salary) || 0;
  const bonusPercent = myGrade?.bonus_percent || 0;
  const bonusAmount = (basicSalary * bonusPercent) / 100;

  // Upsert single realization (value or custom) — wajib ada lampiran bulan tsb
  const upsertRealization = async (
    indicator_id: string,
    month: number,
    payload: { value?: number | null; custom_values?: Record<string, number> }
  ): Promise<boolean> => {
    if (!userId) return false;

    // Validasi: minimal 1 lampiran untuk bulan tsb (cek live ke DB untuk antisipasi race)
    const { count, error: cntErr } = await supabase
      .from("kpi_monthly_attachments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("year", year)
      .eq("month", month);
    if (cntErr) {
      toast({ title: "Gagal validasi lampiran", description: cntErr.message, variant: "destructive" });
      return false;
    }
    if (!count || count === 0) {
      toast({
        title: "Lampiran wajib",
        description: `Upload minimal 1 file laporan (PDF/Excel) untuk bulan ${MONTHS[month - 1]} sebelum input realisasi.`,
        variant: "destructive",
      });
      // Sync state
      setAttachmentCounts((prev) => ({ ...prev, [month]: 0 }));
      return false;
    }
    setAttachmentCounts((prev) => ({ ...prev, [month]: count }));

    const existing = realizations.find((r) => r.indicator_id === indicator_id && r.month === month);
    const row = {
      indicator_id,
      user_id: userId,
      month,
      year,
      value: payload.value !== undefined ? payload.value : existing?.value ?? null,
      custom_values: payload.custom_values !== undefined ? payload.custom_values : existing?.custom_values ?? {},
    };
    const { data, error } = await supabase
      .from("kpi_realizations")
      .upsert(row, { onConflict: "indicator_id,month,year" })
      .select()
      .single();
    if (error) {
      toast({ title: "Gagal menyimpan", description: error.message, variant: "destructive" });
      return false;
    }
    setRealizations((prev) => {
      const idx = prev.findIndex((p) => p.indicator_id === indicator_id && p.month === month);
      const next = [...prev];
      const merged = { ...(data as unknown as Realization), custom_values: ((data as { custom_values?: Record<string, number> }).custom_values || {}) };
      if (idx >= 0) next[idx] = merged; else next.push(merged);
      return next;
    });
    return true;
  };

  const handleAttachmentCountChange = useCallback((month: number, count: number) => {
    setAttachmentCounts((prev) => (prev[month] === count ? prev : { ...prev, [month]: count }));
  }, []);

  if (!userId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background border-b shadow-sm" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 max-w-6xl mx-auto">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <img src={logo} alt="Logo" className="w-9 h-9 object-contain" />
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold truncate">KPI Saya</h1>
              <p className="text-xs text-muted-foreground truncate">{profile?.full_name}</p>
            </div>
          </div>
          <div className="shrink-0">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : indicators.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <Target className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Belum ada KPI untuk tahun {year}</p>
              <p className="text-sm">Silakan hubungi HR/Admin untuk menetapkan indikator KPI Anda.</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="input" className="w-full">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="input">Input Realisasi</TabsTrigger>
              <TabsTrigger value="progress">Progress</TabsTrigger>
              <TabsTrigger value="score">Score</TabsTrigger>
            </TabsList>

            {/* TAB 1: INPUT */}
            <TabsContent value="input" className="space-y-4 mt-4">
              {/* Lampiran wajib per bulan */}
              <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-amber-600" />
                    Lampiran Laporan Bulanan (Wajib)
                  </CardTitle>
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>Upload laporan bulanan (PDF/Excel, max 10 MB) sebelum input realisasi KPI. Input akan dinonaktifkan jika lampiran belum tersedia.</span>
                  </p>
                </CardHeader>
                <CardContent>
                  <Accordion type="multiple" className="w-full">
                    {MONTHS.map((m, idx) => {
                      const month = idx + 1;
                      const cnt = attachmentCounts[month] || 0;
                      return (
                        <AccordionItem key={month} value={`m-${month}`}>
                          <AccordionTrigger className="py-2 text-sm hover:no-underline">
                            <div className="flex items-center gap-2 flex-1 mr-2">
                              <span className="font-medium">{m} {year}</span>
                              <Badge variant={cnt > 0 ? "default" : "destructive"} className="text-[10px]">
                                {cnt > 0 ? `${cnt} file` : "Belum ada"}
                              </Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <KPIMonthlyAttachments
                              ownerUserId={userId}
                              year={year}
                              month={month}
                              monthLabel={`${m} ${year}`}
                              onCountChange={(c) => handleAttachmentCountChange(month, c)}
                            />
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </CardContent>
              </Card>

              {indicators.map((ind) => {
                const reals = realsByIndicator.get(ind.id) || [];
                const filledCount = reals.filter((r) =>
                  ind.formula_type === "custom"
                    ? r.custom_values && Object.keys(r.custom_values).length > 0
                    : r.value !== null && r.value !== undefined
                ).length;
                return (
                  <Card key={ind.id}>
                    <CardHeader>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-base">{ind.name}</CardTitle>
                          {ind.description && (
                            <p className="text-xs text-muted-foreground mt-1">{ind.description}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">Target: {ind.target} {ind.unit}</Badge>
                          <Badge variant="outline">Bobot: {ind.weight}%</Badge>
                          <Badge variant="secondary">{ind.formula_type}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {ind.formula_type !== "custom" ? (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                          {MONTHS.map((m, idx) => {
                            const month = idx + 1;
                            const r = reals.find((x) => x.month === month);
                            const val = r?.value;
                            const filled = val !== null && val !== undefined;
                            const hasAtt = (attachmentCounts[month] || 0) > 0;
                            return (
                              <div key={`${month}-${attachmentCounts[month] || 0}`} className="space-y-1">
                                <Label className="text-xs flex items-center gap-1">
                                  {m}
                                  {!hasAtt && <Paperclip className="w-3 h-3 text-destructive" />}
                                </Label>
                                <Input
                                  type="number"
                                  step="any"
                                  defaultValue={val ?? ""}
                                  disabled={!hasAtt}
                                  title={hasAtt ? "" : "Upload lampiran laporan bulan ini terlebih dahulu"}
                                  className={filled ? "bg-blue-50 border-blue-300 dark:bg-blue-950/30" : ""}
                                  onBlur={async (e) => {
                                    const raw = e.target.value;
                                    const num = raw === "" ? null : Number(raw);
                                    const prev = val ?? null;
                                    if (num === prev) return;
                                    const ok = await upsertRealization(ind.id, month, { value: num });
                                    if (!ok) e.target.value = prev === null ? "" : String(prev);
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {ind.custom_vars && ind.custom_vars.length > 0 ? (
                            MONTHS.map((m, idx) => {
                              const month = idx + 1;
                              const r = reals.find((x) => x.month === month);
                              const cv = r?.custom_values || {};
                              const hasAtt = (attachmentCounts[month] || 0) > 0;
                              return (
                                <div key={`${month}-${attachmentCounts[month] || 0}`} className="border rounded-md p-2">
                                  <p className="text-xs font-medium mb-2 flex items-center gap-1">
                                    {m}
                                    {!hasAtt && <Paperclip className="w-3 h-3 text-destructive" />}
                                  </p>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                    {ind.custom_vars.map((v) => {
                                      const cur = cv[v.alias];
                                      const filled = cur !== undefined && cur !== null;
                                      return (
                                        <div key={v.alias} className="space-y-1">
                                          <Label className="text-xs">{v.label} ({v.alias})</Label>
                                          <Input
                                            type="number"
                                            step="any"
                                            defaultValue={cur ?? ""}
                                            disabled={!hasAtt}
                                            title={hasAtt ? "" : "Upload lampiran laporan bulan ini terlebih dahulu"}
                                            className={filled ? "bg-blue-50 border-blue-300 dark:bg-blue-950/30" : ""}
                                            onBlur={async (e) => {
                                              const raw = e.target.value;
                                              const next = { ...(cv || {}) };
                                              if (raw === "") delete next[v.alias];
                                              else next[v.alias] = Number(raw);
                                              const ok = await upsertRealization(ind.id, month, { custom_values: next });
                                              if (!ok) e.target.value = cur === undefined || cur === null ? "" : String(cur);
                                            }}
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <p className="text-sm text-muted-foreground">Variabel custom belum diatur oleh admin.</p>
                          )}
                        </div>
                      )}

                      <div className="pt-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>Bulan terisi</span>
                          <span>{filledCount}/12</span>
                        </div>
                        <Progress value={(filledCount / 12) * 100} />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>

            {/* TAB 2: PROGRESS */}
            <TabsContent value="progress" className="space-y-4 mt-4">
              {indicatorScores.map(({ ind, score, realized }) => {
                const reals = realsByIndicator.get(ind.id) || [];
                const target = parseFloat(ind.target) || 0;
                return (
                  <Card key={ind.id}>
                    <CardHeader>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle className="text-base">{ind.name}</CardTitle>
                        <Badge className={`${scoreColorClass(score)} text-white border-transparent`}>
                          Score: {score.toFixed(1)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Realisasi: {realized.toFixed(2)} {ind.unit}</span>
                          <span>Target: {ind.target} {ind.unit}</span>
                        </div>
                        <div className="h-3 w-full rounded-full bg-secondary overflow-hidden">
                          <div
                            className={`h-full ${scoreColorClass(score)} transition-all`}
                            style={{ width: `${Math.min(100, score)}%` }}
                          />
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Bulan</TableHead>
                              <TableHead>Realisasi</TableHead>
                              <TableHead>Target</TableHead>
                              <TableHead className="text-center">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {MONTHS.map((m, idx) => {
                              const month = idx + 1;
                              const r = reals.find((x) => x.month === month);
                              let realisasiVal: number | null = null;
                              if (ind.formula_type === "custom") {
                                if (r?.custom_values && Object.keys(r.custom_values).length > 0) {
                                  realisasiVal = safeEval(ind.custom_expr, r.custom_values);
                                }
                              } else {
                                realisasiVal = r?.value ?? null;
                              }
                              const filled = realisasiVal !== null;
                              const meets =
                                filled &&
                                (ind.formula_type === "lower"
                                  ? (realisasiVal as number) <= target
                                  : (realisasiVal as number) >= target);
                              return (
                                <TableRow key={month}>
                                  <TableCell>{m}</TableCell>
                                  <TableCell>{filled ? (realisasiVal as number).toFixed(2) : "-"}</TableCell>
                                  <TableCell>{ind.target}</TableCell>
                                  <TableCell className="text-center">
                                    {!filled ? (
                                      <span className="text-muted-foreground">-</span>
                                    ) : meets ? (
                                      <span className="text-emerald-600 font-bold">✓</span>
                                    ) : (
                                      <span className="text-red-600 font-bold">✗</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>

            {/* TAB 3: SCORE */}
            <TabsContent value="score" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="p-3 rounded-full bg-primary/10">
                      <TrendingUp className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Score Akhir</p>
                      <p className="text-3xl font-bold">{finalScore.toFixed(1)}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="p-3 rounded-full bg-amber-500/10">
                      <Award className="w-6 h-6 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Grade</p>
                      <p className="text-3xl font-bold">{myGrade?.grade || "-"}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Rincian Indikator</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {indicatorScores.map(({ ind, score, contribution }) => (
                    <div key={ind.id} className="flex flex-wrap items-center justify-between gap-2 p-3 border rounded-md">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{ind.name}</p>
                        <p className="text-xs text-muted-foreground">Bobot {ind.weight}%</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`${scoreColorClass(score)} text-white border-transparent`}>
                          {score.toFixed(1)}
                        </Badge>
                        <Badge variant="outline">+{contribution.toFixed(2)} poin</Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Tabel Grade</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Grade</TableHead>
                        <TableHead>Min Score</TableHead>
                        <TableHead>% Bonus</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {grades.map((g) => {
                        const isMine = myGrade?.grade === g.grade;
                        return (
                          <TableRow key={g.grade} className={isMine ? "bg-emerald-50 dark:bg-emerald-950/20 font-semibold" : ""}>
                            <TableCell>
                              {g.grade} {isMine && <Badge className="ml-2 bg-emerald-600">Anda</Badge>}
                            </TableCell>
                            <TableCell>{g.min_score}</TableCell>
                            <TableCell>{g.bonus_percent}%</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}

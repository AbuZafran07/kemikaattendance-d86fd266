import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Award, Loader2, Search, Trophy, TrendingUp, Users, Target as TargetIcon, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

type FormulaType = "ratio" | "akumulasi" | "avg" | "lower" | "threshold" | "custom";

interface ThresholdRule { op: "=" | "<" | "<=" | ">" | ">="; value: number; score: number; }
interface CustomVar { label: string; alias: string; }
interface IndicatorRow {
  id: string;
  user_id: string;
  year: number;
  weight: number;
  target: string;
  formula_type: FormulaType;
  thresholds: ThresholdRule[];
  custom_vars: CustomVar[];
  custom_expr: string;
}
interface RealizationRow {
  indicator_id: string;
  user_id: string;
  month: number;
  year: number;
  value: number | null;
  custom_values: Record<string, number>;
}
interface ProfileLite {
  id: string;
  full_name: string;
  jabatan: string;
  departemen: string;
  status: string | null;
}
interface GradeSetting { grade: string; min_score: number; bonus_percent: number; }

const safeEval = (expr: string, vars: Record<string, number>): number => {
  if (!expr.trim()) return 0;
  let replaced = expr;
  Object.keys(vars).sort((a, b) => b.length - a.length).forEach((k) => {
    replaced = replaced.replace(new RegExp(`\\b${k}\\b`, "g"), String(vars[k] ?? 0));
  });
  if (!/^[0-9+\-*/().\s]+$/.test(replaced)) return 0;
  try {
    // eslint-disable-next-line no-new-func
    const r = Function(`"use strict"; return (${replaced});`)();
    return typeof r === "number" && isFinite(r) ? r : 0;
  } catch { return 0; }
};

const computeIndicatorScore = (ind: IndicatorRow, reals: RealizationRow[]) => {
  const target = parseFloat(ind.target) || 0;
  const filled = reals.filter((r) => ind.formula_type === "custom"
    ? r.custom_values && Object.keys(r.custom_values).length > 0
    : r.value !== null && r.value !== undefined);
  if (filled.length === 0) return { score: 0, filled: 0 };
  let realized = 0, score = 0;
  switch (ind.formula_type) {
    case "ratio":
    case "avg": {
      realized = filled.reduce((a, r) => a + (Number(r.value) || 0), 0) / filled.length;
      score = target > 0 ? (realized / target) * 100 : 0; break;
    }
    case "akumulasi": {
      realized = filled.reduce((a, r) => a + (Number(r.value) || 0), 0);
      score = target > 0 ? (realized / target) * 100 : 0; break;
    }
    case "lower": {
      realized = filled.reduce((a, r) => a + (Number(r.value) || 0), 0) / filled.length;
      score = realized > 0 ? (target / realized) * 100 : 0; break;
    }
    case "threshold": {
      realized = filled.reduce((a, r) => a + (Number(r.value) || 0), 0) / filled.length;
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
      } break;
    }
    case "custom": {
      const monthly = filled.map((r) => safeEval(ind.custom_expr, r.custom_values || {}));
      realized = monthly.reduce((a, b) => a + b, 0) / monthly.length;
      score = target > 0 ? (realized / target) * 100 : 0; break;
    }
  }
  return { score: Math.min(120, Math.max(0, score)), filled: filled.length };
};

const gradeFor = (score: number, grades: GradeSetting[]) => {
  const sorted = [...grades].sort((a, b) => b.min_score - a.min_score);
  for (const g of sorted) if (score >= g.min_score) return g;
  return null;
};

const scoreColor = (s: number) => {
  if (s >= 90) return "bg-emerald-500 text-white";
  if (s >= 75) return "bg-blue-500 text-white";
  if (s >= 60) return "bg-amber-500 text-white";
  if (s > 0)   return "bg-red-500 text-white";
  return "bg-muted text-muted-foreground";
};

export default function KPIRecap() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [indicators, setIndicators] = useState<IndicatorRow[]>([]);
  const [reals, setReals] = useState<RealizationRow[]>([]);
  const [grades, setGrades] = useState<GradeSetting[]>([]);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "with" | "without">("all");

  const loadAll = async () => {
    setLoading(true);
    try {
      const [{ data: profs, error: pe }, { data: inds, error: ie }, { data: rls, error: re }, { data: grd, error: ge }, { data: roles, error: rolesErr }] =
        await Promise.all([
          supabase.from("profiles").select("id, full_name, jabatan, departemen, status").order("full_name"),
          supabase.from("kpi_indicators").select("*").eq("year", year),
          supabase.from("kpi_realizations").select("*").eq("year", year),
          supabase.from("kpi_grade_settings").select("*").order("min_score", { ascending: false }),
          supabase.from("user_roles").select("user_id, role").in("role", ["admin", "super_admin"] as any),
        ]);
      if (pe || ie || re || ge || rolesErr) throw pe || ie || re || ge || rolesErr;
      const adminIds = new Set((roles || []).map((r: any) => r.user_id));
      const filteredProfs = ((profs || []) as ProfileLite[]).filter(
        (p) =>
          p.status === "Active" &&
          !["BOD", "Komisaris"].includes(p.departemen) &&
          !adminIds.has(p.id),
      );
      setProfiles(filteredProfs);
      setIndicators(((inds || []) as any[]).map((i) => ({
        id: i.id, user_id: i.user_id, year: i.year, weight: Number(i.weight) || 0,
        target: String(i.target ?? "0"), formula_type: (i.formula_type || "ratio") as FormulaType,
        thresholds: Array.isArray(i.thresholds) ? i.thresholds : [],
        custom_vars: Array.isArray(i.custom_vars) ? i.custom_vars : [],
        custom_expr: i.custom_expr || "",
      })));
      setReals(((rls || []) as any[]).map((r) => ({
        indicator_id: r.indicator_id, user_id: r.user_id, month: r.month, year: r.year,
        value: r.value !== null ? Number(r.value) : null,
        custom_values: (r.custom_values || {}) as Record<string, number>,
      })));
      setGrades((grd || []) as GradeSetting[]);
    } catch (err: unknown) {
      toast({ title: "Gagal memuat data", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [year]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    profiles.forEach((p) => p.departemen && set.add(p.departemen));
    return Array.from(set).sort();
  }, [profiles]);

  const rows = useMemo(() => {
    return profiles.map((p) => {
      const userInds = indicators.filter((i) => i.user_id === p.id);
      const totalWeight = userInds.reduce((a, b) => a + (b.weight || 0), 0);
      let weightedScore = 0;
      let monthsFilled = 0;
      userInds.forEach((ind) => {
        const indReals = reals.filter((r) => r.indicator_id === ind.id);
        const { score, filled } = computeIndicatorScore(ind, indReals);
        weightedScore += score * (ind.weight / 100);
        monthsFilled = Math.max(monthsFilled, filled);
      });
      const finalScore = totalWeight > 0 ? weightedScore : 0;
      const grade = finalScore > 0 ? gradeFor(finalScore, grades) : null;
      return {
        profile: p,
        indicatorCount: userInds.length,
        totalWeight,
        finalScore,
        monthsFilled,
        grade,
      };
    });
  }, [profiles, indicators, reals, grades]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (statusFilter === "with" && r.indicatorCount === 0) return false;
        if (statusFilter === "without" && r.indicatorCount > 0) return false;
        if (deptFilter !== "all" && r.profile.departemen !== deptFilter) return false;
        if (q && !`${r.profile.full_name} ${r.profile.jabatan} ${r.profile.departemen}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.finalScore - a.finalScore);
  }, [rows, search, deptFilter, statusFilter]);

  const summary = useMemo(() => {
    const withKpi = rows.filter((r) => r.indicatorCount > 0);
    const avg = withKpi.length > 0
      ? withKpi.reduce((a, b) => a + b.finalScore, 0) / withKpi.length
      : 0;
    const top = withKpi.length > 0
      ? withKpi.reduce((a, b) => (a.finalScore >= b.finalScore ? a : b))
      : null;
    return {
      totalEmployees: profiles.length,
      withKpi: withKpi.length,
      avgScore: avg,
      topName: top?.profile.full_name || "-",
      topScore: top?.finalScore || 0,
    };
  }, [rows, profiles]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Trophy className="h-6 w-6 text-primary" /> Daftar KPI Semua Karyawan
            </h1>
            <p className="text-sm text-muted-foreground">Pencapaian KPI seluruh karyawan untuk tahun {year}.</p>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm">Tahun</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><Users className="h-4 w-4" /> Total Karyawan</div>
            <div className="text-2xl font-bold mt-1">{summary.totalEmployees}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><TargetIcon className="h-4 w-4" /> Punya KPI</div>
            <div className="text-2xl font-bold mt-1">{summary.withKpi}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><TrendingUp className="h-4 w-4" /> Rata-rata Score</div>
            <div className="text-2xl font-bold mt-1">{summary.avgScore.toFixed(2)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><Award className="h-4 w-4" /> Top Performer</div>
            <div className="text-sm font-semibold mt-1 truncate">{summary.topName}</div>
            <div className="text-xs text-muted-foreground">Score {summary.topScore.toFixed(2)}</div>
          </CardContent></Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs">Cari nama / jabatan / departemen</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Ketik untuk mencari..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Departemen</Label>
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Departemen</SelectItem>
                  {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status KPI</Label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  <SelectItem value="with">Sudah Ada KPI</SelectItem>
                  <SelectItem value="without">Belum Ada KPI</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader><CardTitle className="text-base">Pencapaian KPI Karyawan</CardTitle></CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Memuat data...
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Tidak ada karyawan yang cocok dengan filter.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Karyawan</TableHead>
                      <TableHead>Departemen</TableHead>
                      <TableHead className="text-center">Indikator</TableHead>
                      <TableHead className="text-center">Bobot Total</TableHead>
                      <TableHead className="text-center">Score Akhir</TableHead>
                      <TableHead className="text-center">Grade</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((r, idx) => (
                      <TableRow key={r.profile.id}>
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="font-medium">{r.profile.full_name}</div>
                          <div className="text-xs text-muted-foreground">{r.profile.jabatan}</div>
                        </TableCell>
                        <TableCell className="text-sm">{r.profile.departemen}</TableCell>
                        <TableCell className="text-center">
                          {r.indicatorCount === 0
                            ? <Badge variant="outline" className="text-muted-foreground">Belum diatur</Badge>
                            : <Badge variant="secondary">{r.indicatorCount}</Badge>}
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          {r.indicatorCount === 0 ? "-" : (
                            <span className={Math.round(r.totalWeight) === 100 ? "text-emerald-600 font-medium" : "text-amber-600"}>
                              {r.totalWeight}%
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {r.indicatorCount === 0 ? "-" : (
                            <Badge className={`${scoreColor(r.finalScore)} font-bold`}>
                              {r.finalScore.toFixed(2)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {r.grade
                            ? <Badge variant="outline" className="font-bold">{r.grade.grade} <span className="text-muted-foreground ml-1">({r.grade.bonus_percent}%)</span></Badge>
                            : <span className="text-muted-foreground text-xs">-</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => navigate(`/dashboard/kpi?user=${r.profile.id}&year=${year}`)}>
                            Detail <ArrowRight className="h-3 w-3 ml-1" />
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
      </div>
    </DashboardLayout>
  );
}

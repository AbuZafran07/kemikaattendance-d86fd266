// Shared safe Excel-like formula evaluator for KPI custom expressions.
// Supports operators + - * / ( ) , numbers, variable aliases, comparisons (= <> < > <= >=),
// and a rich set of Excel-like functions (math, stats, logic, rounding, trig).

// Direct mapping: Excel function name -> JS Math.xxx (single arg unless noted)
export const FUNC_MAP: Record<string, string> = {
  // Math
  ABS: "Math.abs",
  SQRT: "Math.sqrt",
  EXP: "Math.exp",
  LN: "Math.log",
  LOG10: "Math.log10",
  SIGN: "Math.sign",
  // Rounding
  INT: "Math.trunc",
  TRUNC: "Math.trunc",
  FLOOR: "Math.floor",
  CEILING: "Math.ceil",
  CEIL: "Math.ceil",
  // Power
  POWER: "Math.pow",
  POW: "Math.pow",
  // Min/Max
  MIN: "Math.min",
  MAX: "Math.max",
  // Trig (radians)
  SIN: "Math.sin",
  COS: "Math.cos",
  TAN: "Math.tan",
  ASIN: "Math.asin",
  ACOS: "Math.acos",
  ATAN: "Math.atan",
};

// Custom helpers (resolved via __NAME__ stub)
const CUSTOM_FUNCS = [
  "MOD", "ROUND", "ROUNDUP", "ROUNDDOWN",
  "IF", "IFS", "AND", "OR", "NOT", "XOR",
  "SUM", "AVERAGE", "AVG", "COUNT", "MEDIAN", "STDEV", "VAR", "PRODUCT",
  "LOG", "PI", "DEGREES", "RADIANS", "RAND", "RANDBETWEEN",
  "ISBLANK", "ISNUMBER", "GTE", "LTE", "BETWEEN", "CLAMP", "PERCENT",
  "SWITCH", "CHOOSE",
];

export const ALLOWED_FUNCS = new Set([...Object.keys(FUNC_MAP), ...CUSTOM_FUNCS]);

// ============= Function metadata for validation & autocomplete =============
export type FuncCategory = "Math" | "Rounding" | "Stats" | "Logic" | "Trig" | "Util";

export interface FuncMeta {
  name: string;
  category: FuncCategory;
  // min/max number of arguments. Use Infinity for variadic.
  minArgs: number;
  maxArgs: number;
  signature: string;
  desc: string;
  // Special validators for arg structure (e.g. IFS pairs).
  validateArgs?: (count: number) => string | null;
}

export const FUNC_META: Record<string, FuncMeta> = {
  // ---- Math ----
  ABS: { name: "ABS", category: "Math", minArgs: 1, maxArgs: 1, signature: "ABS(x)", desc: "Nilai absolut." },
  SQRT: { name: "SQRT", category: "Math", minArgs: 1, maxArgs: 1, signature: "SQRT(x)", desc: "Akar kuadrat." },
  EXP: { name: "EXP", category: "Math", minArgs: 1, maxArgs: 1, signature: "EXP(x)", desc: "e pangkat x." },
  LN: { name: "LN", category: "Math", minArgs: 1, maxArgs: 1, signature: "LN(x)", desc: "Logaritma natural." },
  LOG10: { name: "LOG10", category: "Math", minArgs: 1, maxArgs: 1, signature: "LOG10(x)", desc: "Log basis 10." },
  LOG: { name: "LOG", category: "Math", minArgs: 1, maxArgs: 2, signature: "LOG(x, [base=10])", desc: "Log basis bebas." },
  SIGN: { name: "SIGN", category: "Math", minArgs: 1, maxArgs: 1, signature: "SIGN(x)", desc: "Tanda: -1, 0, 1." },
  POWER: { name: "POWER", category: "Math", minArgs: 2, maxArgs: 2, signature: "POWER(x, y)", desc: "x pangkat y." },
  POW: { name: "POW", category: "Math", minArgs: 2, maxArgs: 2, signature: "POW(x, y)", desc: "Alias POWER." },
  MOD: { name: "MOD", category: "Math", minArgs: 2, maxArgs: 2, signature: "MOD(a, b)", desc: "Sisa bagi a/b." },
  // ---- Rounding ----
  INT: { name: "INT", category: "Rounding", minArgs: 1, maxArgs: 1, signature: "INT(x)", desc: "Potong ke integer." },
  TRUNC: { name: "TRUNC", category: "Rounding", minArgs: 1, maxArgs: 1, signature: "TRUNC(x)", desc: "Potong ke integer." },
  FLOOR: { name: "FLOOR", category: "Rounding", minArgs: 1, maxArgs: 1, signature: "FLOOR(x)", desc: "Pembulatan ke bawah." },
  CEILING: { name: "CEILING", category: "Rounding", minArgs: 1, maxArgs: 1, signature: "CEILING(x)", desc: "Pembulatan ke atas." },
  CEIL: { name: "CEIL", category: "Rounding", minArgs: 1, maxArgs: 1, signature: "CEIL(x)", desc: "Alias CEILING." },
  ROUND: { name: "ROUND", category: "Rounding", minArgs: 1, maxArgs: 2, signature: "ROUND(x, [digits=0])", desc: "Pembulatan." },
  ROUNDUP: { name: "ROUNDUP", category: "Rounding", minArgs: 1, maxArgs: 2, signature: "ROUNDUP(x, [digits=0])", desc: "Bulat ke atas (Excel)." },
  ROUNDDOWN: { name: "ROUNDDOWN", category: "Rounding", minArgs: 1, maxArgs: 2, signature: "ROUNDDOWN(x, [digits=0])", desc: "Bulat ke bawah (Excel)." },
  // ---- Min/Max ----
  MIN: { name: "MIN", category: "Math", minArgs: 1, maxArgs: Infinity, signature: "MIN(a, b, ...)", desc: "Nilai terkecil." },
  MAX: { name: "MAX", category: "Math", minArgs: 1, maxArgs: Infinity, signature: "MAX(a, b, ...)", desc: "Nilai terbesar." },
  // ---- Stats ----
  SUM: { name: "SUM", category: "Stats", minArgs: 1, maxArgs: Infinity, signature: "SUM(a, b, ...)", desc: "Jumlah semua argumen." },
  PRODUCT: { name: "PRODUCT", category: "Stats", minArgs: 1, maxArgs: Infinity, signature: "PRODUCT(a, b, ...)", desc: "Perkalian semua argumen." },
  AVERAGE: { name: "AVERAGE", category: "Stats", minArgs: 1, maxArgs: Infinity, signature: "AVERAGE(a, b, ...)", desc: "Rata-rata." },
  AVG: { name: "AVG", category: "Stats", minArgs: 1, maxArgs: Infinity, signature: "AVG(a, b, ...)", desc: "Alias AVERAGE." },
  COUNT: { name: "COUNT", category: "Stats", minArgs: 1, maxArgs: Infinity, signature: "COUNT(a, b, ...)", desc: "Jumlah argumen." },
  MEDIAN: { name: "MEDIAN", category: "Stats", minArgs: 1, maxArgs: Infinity, signature: "MEDIAN(a, b, ...)", desc: "Nilai tengah." },
  STDEV: { name: "STDEV", category: "Stats", minArgs: 2, maxArgs: Infinity, signature: "STDEV(a, b, ...)", desc: "Standar deviasi (sampel)." },
  VAR: { name: "VAR", category: "Stats", minArgs: 2, maxArgs: Infinity, signature: "VAR(a, b, ...)", desc: "Varians (sampel)." },
  // ---- Logic ----
  IF: { name: "IF", category: "Logic", minArgs: 2, maxArgs: 3, signature: "IF(cond, then, [else=0])", desc: "Kondisional sederhana." },
  IFS: {
    name: "IFS", category: "Logic", minArgs: 2, maxArgs: Infinity,
    signature: "IFS(cond1, val1, cond2, val2, ..., [default])",
    desc: "Multi-kondisi. Argumen ganjil terakhir = nilai default.",
    validateArgs: (n) => (n < 2 ? "IFS butuh minimal 1 pasang kondisi-nilai." : null),
  },
  SWITCH: {
    name: "SWITCH", category: "Logic", minArgs: 3, maxArgs: Infinity,
    signature: "SWITCH(value, match1, val1, ..., [default])",
    desc: "Cocokkan nilai ke beberapa pilihan.",
    validateArgs: (n) => (n < 3 ? "SWITCH butuh value + minimal 1 pasang match-val." : null),
  },
  CHOOSE: { name: "CHOOSE", category: "Logic", minArgs: 2, maxArgs: Infinity, signature: "CHOOSE(idx, v1, v2, ...)", desc: "Pilih argumen ke-idx (1-based)." },
  AND: { name: "AND", category: "Logic", minArgs: 1, maxArgs: Infinity, signature: "AND(a, b, ...)", desc: "Semua benar → 1." },
  OR: { name: "OR", category: "Logic", minArgs: 1, maxArgs: Infinity, signature: "OR(a, b, ...)", desc: "Salah satu benar → 1." },
  NOT: { name: "NOT", category: "Logic", minArgs: 1, maxArgs: 1, signature: "NOT(x)", desc: "Negasi logika." },
  XOR: { name: "XOR", category: "Logic", minArgs: 2, maxArgs: Infinity, signature: "XOR(a, b, ...)", desc: "Eksklusif OR." },
  GTE: { name: "GTE", category: "Logic", minArgs: 2, maxArgs: 2, signature: "GTE(a, b)", desc: "a >= b." },
  LTE: { name: "LTE", category: "Logic", minArgs: 2, maxArgs: 2, signature: "LTE(a, b)", desc: "a <= b." },
  BETWEEN: { name: "BETWEEN", category: "Logic", minArgs: 3, maxArgs: 3, signature: "BETWEEN(x, a, b)", desc: "a ≤ x ≤ b." },
  ISBLANK: { name: "ISBLANK", category: "Logic", minArgs: 1, maxArgs: 1, signature: "ISBLANK(x)", desc: "True jika 0/kosong." },
  ISNUMBER: { name: "ISNUMBER", category: "Logic", minArgs: 1, maxArgs: 1, signature: "ISNUMBER(x)", desc: "True jika angka valid." },
  // ---- Util ----
  CLAMP: { name: "CLAMP", category: "Util", minArgs: 3, maxArgs: 3, signature: "CLAMP(x, min, max)", desc: "Batasi x di rentang [min, max]." },
  PERCENT: { name: "PERCENT", category: "Util", minArgs: 2, maxArgs: 2, signature: "PERCENT(a, b)", desc: "(a/b)*100, aman jika b=0." },
  PI: { name: "PI", category: "Util", minArgs: 0, maxArgs: 0, signature: "PI()", desc: "Konstanta π." },
  RAND: { name: "RAND", category: "Util", minArgs: 0, maxArgs: 0, signature: "RAND()", desc: "Acak [0,1)." },
  RANDBETWEEN: { name: "RANDBETWEEN", category: "Util", minArgs: 2, maxArgs: 2, signature: "RANDBETWEEN(a, b)", desc: "Integer acak [a,b]." },
  DEGREES: { name: "DEGREES", category: "Trig", minArgs: 1, maxArgs: 1, signature: "DEGREES(rad)", desc: "Radian → derajat." },
  RADIANS: { name: "RADIANS", category: "Trig", minArgs: 1, maxArgs: 1, signature: "RADIANS(deg)", desc: "Derajat → radian." },
  // ---- Trig ----
  SIN: { name: "SIN", category: "Trig", minArgs: 1, maxArgs: 1, signature: "SIN(x)", desc: "Sinus (radian)." },
  COS: { name: "COS", category: "Trig", minArgs: 1, maxArgs: 1, signature: "COS(x)", desc: "Cosinus (radian)." },
  TAN: { name: "TAN", category: "Trig", minArgs: 1, maxArgs: 1, signature: "TAN(x)", desc: "Tangen (radian)." },
  ASIN: { name: "ASIN", category: "Trig", minArgs: 1, maxArgs: 1, signature: "ASIN(x)", desc: "Arcsinus." },
  ACOS: { name: "ACOS", category: "Trig", minArgs: 1, maxArgs: 1, signature: "ACOS(x)", desc: "Arccosinus." },
  ATAN: { name: "ATAN", category: "Trig", minArgs: 1, maxArgs: 1, signature: "ATAN(x)", desc: "Arctangen." },
};

// ============= Formula template gallery =============
export interface FormulaTemplate {
  id: string;
  name: string;
  category: "Skor" | "Ratio" | "Telat" | "Bertingkat" | "Akumulasi";
  description: string;
  // Required variable count and label hints (alias ditetapkan saat insert: v0, v1, ...).
  vars: { label: string; hint?: string }[];
  // Expression with placeholders {v0}, {v1} that will be replaced by actual aliases.
  expr: string;
  example?: string;
}

export const FORMULA_TEMPLATES: FormulaTemplate[] = [
  {
    id: "ratio-percent",
    name: "Persentase Pencapaian",
    category: "Ratio",
    description: "Realisasi dibagi target, dikali 100. Aman jika target = 0.",
    vars: [
      { label: "Realisasi", hint: "Jumlah aktual" },
      { label: "Target", hint: "Target periode" },
    ],
    expr: "PERCENT({v0}, {v1})",
    example: "v0=80, v1=100 → 80",
  },
  {
    id: "clamp-100",
    name: "Skor Dibatasi 0–100",
    category: "Skor",
    description: "Persentase pencapaian, dibatasi maksimum 100 dan minimum 0.",
    vars: [
      { label: "Realisasi" },
      { label: "Target" },
    ],
    expr: "CLAMP(PERCENT({v0}, {v1}), 0, 100)",
    example: "v0=120, v1=100 → 100 (tidak melebihi)",
  },
  {
    id: "ifs-tier",
    name: "Skor Bertingkat (IFS)",
    category: "Bertingkat",
    description: "Skor diskrit berdasar pencapaian: ≥95→100, ≥85→90, ≥75→80, sisanya 60.",
    vars: [
      { label: "Pencapaian (%)", hint: "Mis. pencapaian penjualan dalam %" },
    ],
    expr: "IFS({v0}>=95, 100, {v0}>=85, 90, {v0}>=75, 80, 1, 60)",
    example: "v0=88 → 90",
  },
  {
    id: "late-day",
    name: "Skor Telat per Hari (Ontime Payroll)",
    category: "Telat",
    description: "Tepat waktu (≤ tgl batas) = 100. Telat 1 hari kurangi 10 poin. Minimum 0.",
    vars: [
      { label: "Tanggal Realisasi", hint: "Tanggal aktual (1–31)" },
      { label: "Tanggal Batas", hint: "Tanggal target, mis. 25" },
    ],
    expr: "MAX(0, IF({v0}<={v1}, 100, 100-({v0}-{v1})*10))",
    example: "v0=27, v1=25 → 80",
  },
  {
    id: "late-minute",
    name: "Skor Telat per Menit",
    category: "Telat",
    description: "Tiap 1 menit telat = -1 poin. Minimum 0.",
    vars: [{ label: "Menit Telat" }],
    expr: "MAX(0, 100 - {v0})",
    example: "v0=15 → 85",
  },
  {
    id: "lower-better",
    name: "Lower-is-Better (Inverse)",
    category: "Skor",
    description: "Cocok untuk metrik 'kecil lebih baik' (mis. complaint). Target/Aktual × 100.",
    vars: [
      { label: "Realisasi (aktual)" },
      { label: "Target (maksimum)" },
    ],
    expr: "CLAMP(PERCENT({v1}, MAX({v0}, 0.0001)), 0, 120)",
    example: "v0=5, v1=10 → 200 → dibatasi 120",
  },
  {
    id: "weighted-2",
    name: "Rata-rata Bertimbang (2 metrik)",
    category: "Akumulasi",
    description: "Gabungan 2 metrik dengan bobot. Default 60% & 40%.",
    vars: [
      { label: "Skor Metrik A" },
      { label: "Skor Metrik B" },
    ],
    expr: "({v0}*0.6) + ({v1}*0.4)",
    example: "v0=90, v1=70 → 82",
  },
  {
    id: "weighted-3",
    name: "Rata-rata Bertimbang (3 metrik)",
    category: "Akumulasi",
    description: "Gabungan 3 metrik. Default 50/30/20.",
    vars: [
      { label: "Skor Metrik A" },
      { label: "Skor Metrik B" },
      { label: "Skor Metrik C" },
    ],
    expr: "({v0}*0.5) + ({v1}*0.3) + ({v2}*0.2)",
  },
  {
    id: "switch-grade",
    name: "Grade Diskrit (SWITCH)",
    category: "Bertingkat",
    description: "Map angka grade (1–5) ke skor 100/85/70/55/40.",
    vars: [{ label: "Grade (1–5)" }],
    expr: "SWITCH({v0}, 5, 100, 4, 85, 3, 70, 2, 55, 1, 40, 0)",
  },
  {
    id: "between-window",
    name: "Skor di Dalam Rentang",
    category: "Skor",
    description: "Skor 100 jika nilai berada di rentang [min,max], di luar 0.",
    vars: [
      { label: "Realisasi" },
      { label: "Min" },
      { label: "Max" },
    ],
    expr: "IF(BETWEEN({v0}, {v1}, {v2}), 100, 0)",
  },
];

const EVAL_HELPERS = `
  const __toNum = (x) => typeof x === "boolean" ? (x?1:0) : (typeof x === "number" && isFinite(x) ? x : 0);
  const __flat = (xs) => xs.flat(Infinity).map(__toNum);
  const __MOD__ = (a,b) => b === 0 ? 0 : a - Math.floor(a/b)*b;
  const __ROUND__ = (x, d=0) => { const f = Math.pow(10, d); return Math.round(x*f)/f; };
  const __ROUNDUP__ = (x, d=0) => { const f = Math.pow(10, d); return (x>=0?Math.ceil(x*f):Math.floor(x*f))/f; };
  const __ROUNDDOWN__ = (x, d=0) => { const f = Math.pow(10, d); return (x>=0?Math.floor(x*f):Math.ceil(x*f))/f; };
  const __IF__ = (cond, a, b=0) => cond ? a : b;
  const __IFS__ = (...xs) => { for (let i=0;i<xs.length-1;i+=2){ if(xs[i]) return xs[i+1]; } return xs.length%2===1 ? xs[xs.length-1] : 0; };
  const __AND__ = (...xs) => xs.every(Boolean);
  const __OR__ = (...xs) => xs.some(Boolean);
  const __NOT__ = (x) => !x;
  const __XOR__ = (...xs) => xs.reduce((a,b)=>a !== !!b, false);
  const __SUM__ = (...xs) => __flat(xs).reduce((a,b)=>a+b,0);
  const __PRODUCT__ = (...xs) => __flat(xs).reduce((a,b)=>a*b,1);
  const __AVERAGE__ = (...xs) => { const a = __flat(xs); return a.length? a.reduce((s,v)=>s+v,0)/a.length : 0; };
  const __AVG__ = __AVERAGE__;
  const __COUNT__ = (...xs) => __flat(xs).length;
  const __MEDIAN__ = (...xs) => { const a = __flat(xs).slice().sort((x,y)=>x-y); const n=a.length; if(!n) return 0; return n%2 ? a[(n-1)/2] : (a[n/2-1]+a[n/2])/2; };
  const __VAR__ = (...xs) => { const a = __flat(xs); const n=a.length; if(n<2) return 0; const m = a.reduce((s,v)=>s+v,0)/n; return a.reduce((s,v)=>s+(v-m)*(v-m),0)/(n-1); };
  const __STDEV__ = (...xs) => Math.sqrt(__VAR__(...xs));
  const __LOG__ = (x, base=10) => Math.log(x)/Math.log(base);
  const __PI__ = () => Math.PI;
  const __DEGREES__ = (r) => r * 180 / Math.PI;
  const __RADIANS__ = (d) => d * Math.PI / 180;
  const __RAND__ = () => Math.random();
  const __RANDBETWEEN__ = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
  const __ISBLANK__ = (x) => x === 0 || x == null;
  const __ISNUMBER__ = (x) => typeof x === "number" && isFinite(x);
  const __GTE__ = (a,b) => a >= b;
  const __LTE__ = (a,b) => a <= b;
  const __BETWEEN__ = (x,a,b) => x >= a && x <= b;
  const __CLAMP__ = (x,a,b) => Math.min(b, Math.max(a, x));
  const __PERCENT__ = (a,b) => b === 0 ? 0 : (a/b)*100;
  const __SWITCH__ = (val, ...xs) => { for(let i=0;i<xs.length-1;i+=2){ if(val===xs[i]) return xs[i+1]; } return xs.length%2===1 ? xs[xs.length-1] : 0; };
  const __CHOOSE__ = (idx, ...xs) => xs[Math.floor(idx)-1] ?? 0;
`;

export const preprocessExpr = (expr: string): string => {
  let s = expr;
  // Excel comparisons: <> -> !=, then standalone = -> ==
  s = s.replace(/<>/g, "!=");
  s = s.replace(/([^=!<>])=(?!=)/g, "$1==");
  // Map function names
  s = s.replace(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g, (_m, name) => {
    const up = name.toUpperCase();
    if (FUNC_MAP[up]) return `${FUNC_MAP[up]}(`;
    if (CUSTOM_FUNCS.includes(up)) return `__${up}__(`;
    return `${name}(`;
  });
  return s;
};

export const safeEval = (expr: string, vars: Record<string, number>): number => {
  if (!expr || !expr.trim()) return 0;
  let replaced = preprocessExpr(expr);
  Object.keys(vars)
    .sort((a, b) => b.length - a.length)
    .forEach((k) => {
      replaced = replaced.replace(new RegExp(`\\b${k}\\b`, "g"), `(${Number(vars[k] ?? 0)})`);
    });
  // Whitelist check: strip allowed Math.xxx and __XXX__ stubs, then ensure only safe chars remain.
  const stripped = replaced
    .replace(/Math\.[a-zA-Z0-9]+/g, "")
    .replace(/__[A-Z0-9_]+__/g, "");
  if (!/^[0-9+\-*/().,\s<>=!]+$/.test(stripped)) return 0;
  try {
    // eslint-disable-next-line no-new-func
    const r = Function(`"use strict"; ${EVAL_HELPERS} return (${replaced});`)();
    const n = typeof r === "boolean" ? (r ? 1 : 0) : r;
    return typeof n === "number" && isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
};

// ============= Argument count parser (top-level args of each call) =============
// Returns array of { name, argCount } for every function call in the expression.
const parseFunctionCalls = (expr: string): { name: string; argCount: number; pos: number }[] => {
  const out: { name: string; argCount: number; pos: number }[] = [];
  const re = /([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr)) !== null) {
    const name = m[1];
    const startArgs = m.index + m[0].length; // index right after '('
    let depth = 1;
    let i = startArgs;
    let commas = 0;
    let hasContent = false;
    while (i < expr.length && depth > 0) {
      const ch = expr[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      } else if (ch === "," && depth === 1) {
        commas++;
      } else if (!/\s/.test(ch)) {
        hasContent = true;
      }
      i++;
    }
    if (depth !== 0) continue; // unbalanced — handled elsewhere
    const argCount = hasContent ? commas + 1 : 0;
    out.push({ name, argCount, pos: m.index });
  }
  return out;
};

export const validateCustomExpr = (
  expr: string,
  vars: { alias: string }[]
): string | null => {
  const trimmed = (expr || "").trim();
  if (!trimmed) return "Ekspresi formula belum diisi.";
  if (trimmed.length > 1000) return "Ekspresi terlalu panjang (maks 1000 karakter).";

  const allowedAliases = new Set(vars.map((v) => v.alias));
  const identRegex = /([A-Za-z_][A-Za-z0-9_]*)(\s*\()?/g;
  const unknownVars: string[] = [];
  const unknownFuncs: string[] = [];
  let m;
  while ((m = identRegex.exec(trimmed)) !== null) {
    const name = m[1];
    const isCall = !!m[2];
    if (isCall) {
      if (!ALLOWED_FUNCS.has(name.toUpperCase())) unknownFuncs.push(name);
    } else if (!allowedAliases.has(name)) {
      unknownVars.push(name);
    }
  }
  if (unknownFuncs.length > 0) {
    return `Fungsi tidak didukung: ${[...new Set(unknownFuncs)].join(", ")}. Lihat panduan untuk daftar fungsi.`;
  }
  if (unknownVars.length > 0) {
    return `Alias tidak dikenal: ${[...new Set(unknownVars)].join(", ")}. Alias terdaftar: ${vars.map((v) => v.alias).join(", ") || "belum ada"}.`;
  }

  const stripped = trimmed.replace(/[A-Za-z_][A-Za-z0-9_]*/g, "");
  const invalidChars = stripped.match(/[^0-9+\-*/().,\s<>=!]/g);
  if (invalidChars && invalidChars.length > 0) {
    const uniq = [...new Set(invalidChars)].join(" ");
    return `Karakter tidak didukung: "${uniq}". Operator yang diperbolehkan: + - * / ( ) , < > <= >= = <> dan fungsi.`;
  }

  let depth = 0;
  for (const ch of trimmed) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth < 0) return "Tanda kurung tidak seimbang (terlalu banyak ')').";
  }
  if (depth !== 0) return "Tanda kurung tidak seimbang (kurang ')').";

  // Arity & shape validation per call.
  const calls = parseFunctionCalls(trimmed);
  for (const c of calls) {
    const meta = FUNC_META[c.name.toUpperCase()];
    if (!meta) continue; // unknown handled above
    if (c.argCount < meta.minArgs) {
      return `Fungsi ${meta.name} butuh minimal ${meta.minArgs} argumen (diberikan ${c.argCount}). Format: ${meta.signature}`;
    }
    if (c.argCount > meta.maxArgs) {
      return `Fungsi ${meta.name} maksimal ${meta.maxArgs === Infinity ? "tak terbatas" : meta.maxArgs} argumen (diberikan ${c.argCount}). Format: ${meta.signature}`;
    }
    if (meta.validateArgs) {
      const err = meta.validateArgs(c.argCount);
      if (err) return `${meta.name}: ${err} Format: ${meta.signature}`;
    }
  }

  try {
    const dummy: Record<string, number> = {};
    vars.forEach((v) => { dummy[v.alias] = 1; });
    const r = safeEval(trimmed, dummy);
    if (typeof r !== "number" || !isFinite(r)) return "Ekspresi tidak menghasilkan angka yang valid.";
  } catch {
    return "Sintaks ekspresi tidak valid.";
  }

  return null;
};

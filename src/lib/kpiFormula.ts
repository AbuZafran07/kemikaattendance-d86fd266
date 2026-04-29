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
      // Allow PI as a constant call PI() — discourage bare PI
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

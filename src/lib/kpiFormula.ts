// Shared safe Excel-like formula evaluator for KPI custom expressions.
// Supports: + - * / ( ) , numbers, variable aliases, comparisons (= <> < > <= >=),
// and functions: MIN, MAX, ABS, ROUND, FLOOR, CEILING/CEIL, SQRT, POWER/POW, MOD, IF, AND, OR, NOT.

export const FUNC_MAP: Record<string, string> = {
  MIN: "Math.min",
  MAX: "Math.max",
  ABS: "Math.abs",
  ROUND: "Math.round",
  FLOOR: "Math.floor",
  CEILING: "Math.ceil",
  CEIL: "Math.ceil",
  SQRT: "Math.sqrt",
  POWER: "Math.pow",
  POW: "Math.pow",
};

export const ALLOWED_FUNCS = new Set(
  Object.keys(FUNC_MAP).concat(["MOD", "IF", "AND", "OR", "NOT"])
);

const EVAL_HELPERS = `
  const __MOD__ = (a,b) => b === 0 ? 0 : a - Math.floor(a/b)*b;
  const __IF__ = (cond, a, b) => cond ? a : b;
  const __AND__ = (...xs) => xs.every(Boolean);
  const __OR__ = (...xs) => xs.some(Boolean);
  const __NOT__ = (x) => !x;
`;

export const preprocessExpr = (expr: string): string => {
  let s = expr;
  s = s.replace(/<>/g, "!=");
  s = s.replace(/([^=!<>])=(?!=)/g, "$1==");
  s = s.replace(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g, (_m, name) => {
    const up = name.toUpperCase();
    if (ALLOWED_FUNCS.has(up)) {
      if (up === "MOD") return "__MOD__(";
      if (up === "IF") return "__IF__(";
      if (up === "AND") return "__AND__(";
      if (up === "OR") return "__OR__(";
      if (up === "NOT") return "__NOT__(";
      return `${FUNC_MAP[up]}(`;
    }
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
  const stripped = replaced
    .replace(/Math\.(min|max|abs|round|floor|ceil|sqrt|pow)/g, "")
    .replace(/__(MOD|IF|AND|OR|NOT)__/g, "");
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
  if (trimmed.length > 500) return "Ekspresi terlalu panjang (maks 500 karakter).";

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
    return `Fungsi tidak didukung: ${[...new Set(unknownFuncs)].join(", ")}. Fungsi yang didukung: ${[...ALLOWED_FUNCS].join(", ")}.`;
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

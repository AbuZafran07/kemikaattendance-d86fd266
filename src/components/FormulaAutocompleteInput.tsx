import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FUNC_META } from "@/lib/kpiFormula";

interface VarOption {
  alias: string;
  label?: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  vars: VarOption[];
  placeholder?: string;
  className?: string;
}

interface Suggestion {
  insert: string; // text to insert (replaces current token)
  display: string;
  description: string;
  kind: "var" | "func";
}

const FUNC_LIST = Object.values(FUNC_META).map((f) => ({
  name: f.name,
  signature: f.signature,
  desc: f.desc,
  category: f.category,
}));

/**
 * Lightweight inline autocomplete for KPI custom formulas.
 * - Suggests function names (uppercased) and variable aliases as the user types.
 * - Trigger token = trailing [A-Za-z_][A-Za-z0-9_]* before cursor.
 * - Selecting a function inserts "NAME(" and places cursor inside the parens.
 */
export const FormulaAutocompleteInput: React.FC<Props> = ({
  value,
  onChange,
  vars,
  placeholder,
  className,
}) => {
  const ref = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [highlight, setHighlight] = React.useState(0);
  const [token, setToken] = React.useState("");
  const [tokenStart, setTokenStart] = React.useState(0);

  const suggestions: Suggestion[] = React.useMemo(() => {
    if (!token) return [];
    const upper = token.toUpperCase();
    const lower = token.toLowerCase();
    const varHits: Suggestion[] = vars
      .filter((v) => v.alias.toLowerCase().startsWith(lower))
      .slice(0, 6)
      .map((v) => ({
        insert: v.alias,
        display: v.alias,
        description: v.label || "Variabel custom",
        kind: "var" as const,
      }));
    const funcHits: Suggestion[] = FUNC_LIST.filter((f) =>
      f.name.startsWith(upper),
    )
      .slice(0, 8)
      .map((f) => ({
        insert: `${f.name}(`,
        display: f.signature,
        description: `${f.category} · ${f.desc}`,
        kind: "func" as const,
      }));
    return [...varHits, ...funcHits];
  }, [token, vars]);

  const updateTokenFromCursor = (el: HTMLInputElement) => {
    const pos = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, pos);
    const m = /([A-Za-z_][A-Za-z0-9_]*)$/.exec(before);
    if (m) {
      setToken(m[1]);
      setTokenStart(pos - m[1].length);
      setOpen(true);
      setHighlight(0);
    } else {
      setToken("");
      setOpen(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    requestAnimationFrame(() => {
      if (ref.current) updateTokenFromCursor(ref.current);
    });
  };

  const applySuggestion = (s: Suggestion) => {
    const el = ref.current;
    if (!el) return;
    const pos = el.selectionStart ?? el.value.length;
    const before = value.slice(0, tokenStart);
    const after = value.slice(pos);
    const next = before + s.insert + after;
    onChange(next);
    const newPos = (before + s.insert).length;
    requestAnimationFrame(() => {
      if (ref.current) {
        ref.current.focus();
        ref.current.setSelectionRange(newPos, newPos);
      }
    });
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      applySuggestion(suggestions[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <Input
        ref={ref}
        value={value}
        placeholder={placeholder}
        className={cn("font-mono", className)}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={(e) => updateTokenFromCursor(e.currentTarget)}
        onFocus={(e) => updateTokenFromCursor(e.currentTarget)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
        spellCheck={false}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md">
          {suggestions.map((s, i) => (
            <button
              type="button"
              key={`${s.kind}-${s.display}-${i}`}
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(s);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "w-full text-left px-3 py-1.5 text-xs flex flex-col gap-0.5",
                i === highlight ? "bg-accent text-accent-foreground" : "",
              )}
            >
              <span className="font-mono font-medium">
                <span
                  className={cn(
                    "inline-block px-1 mr-2 rounded text-[10px]",
                    s.kind === "var"
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {s.kind === "var" ? "VAR" : "fn"}
                </span>
                {s.display}
              </span>
              <span className="text-muted-foreground text-[11px] pl-8">
                {s.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { FORMULA_TEMPLATES, FormulaTemplate } from "@/lib/kpiFormula";

interface CustomVar {
  alias: string;
  label: string;
}

interface Props {
  existingVars: CustomVar[];
  onApply: (next: { expr: string; vars: CustomVar[] }) => void;
}

/**
 * Template gallery for KPI formulas.
 * - Shows curated templates grouped by category.
 * - Apply: appends required new variable slots, then substitutes {v0}/{v1}... with
 *   the actual aliases assigned in this indicator (preserving any existing aliases).
 */
export const FormulaTemplateGallery: React.FC<Props> = ({ existingVars, onApply }) => {
  const [open, setOpen] = React.useState(false);

  const apply = (tpl: FormulaTemplate) => {
    // Reuse existing aliases first, create new v{n} for missing slots.
    const usedNums = existingVars
      .map((c) => /^v(\d+)$/.exec(c.alias)?.[1])
      .filter((s): s is string => !!s)
      .map((s) => parseInt(s, 10));
    let nextNum = usedNums.length > 0 ? Math.max(...usedNums) + 1 : 0;

    const finalVars: CustomVar[] = [...existingVars];
    const aliasMap: string[] = []; // index = template var index, value = actual alias
    tpl.vars.forEach((tv, i) => {
      if (i < existingVars.length) {
        aliasMap.push(existingVars[i].alias);
      } else {
        const alias = `v${nextNum++}`;
        aliasMap.push(alias);
        finalVars.push({ alias, label: tv.label });
      }
    });

    let expr = tpl.expr;
    aliasMap.forEach((alias, i) => {
      expr = expr.replace(new RegExp(`\\{v${i}\\}`, "g"), alias);
    });

    onApply({ expr, vars: finalVars });
    setOpen(false);
  };

  const categories = Array.from(new Set(FORMULA_TEMPLATES.map((t) => t.category)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Sparkles className="h-3 w-3 mr-1" /> Pakai Template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Galeri Template Rumus KPI</DialogTitle>
          <DialogDescription>
            Pilih template siap pakai. Variabel yang dibutuhkan akan ditambahkan otomatis
            ke daftar variabel custom indikator ini.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {categories.map((cat) => (
            <div key={cat}>
              <h4 className="text-sm font-semibold text-primary mb-2">{cat}</h4>
              <div className="grid gap-2 md:grid-cols-2">
                {FORMULA_TEMPLATES.filter((t) => t.category === cat).map((tpl) => (
                  <div
                    key={tpl.id}
                    className="border rounded-md p-3 bg-muted/30 hover:bg-muted/60 transition-colors flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{tpl.name}</div>
                        <div className="text-xs text-muted-foreground">{tpl.description}</div>
                      </div>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {tpl.vars.length} var
                      </Badge>
                    </div>
                    <code className="block text-[11px] font-mono bg-background border rounded px-2 py-1 break-all">
                      {tpl.expr}
                    </code>
                    {tpl.example && (
                      <div className="text-[11px] text-muted-foreground italic">
                        Contoh: {tpl.example}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {tpl.vars.map((v, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] font-mono">
                          v{i}: {v.label}
                        </Badge>
                      ))}
                    </div>
                    <Button size="sm" onClick={() => apply(tpl)}>
                      Gunakan Template
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

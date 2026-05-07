import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import RichTextEditor from "@/components/RichTextEditor";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ArrowLeft, Megaphone } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale, enUS } from "date-fns/locale";
import DOMPurify from "dompurify";

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string;
  is_active: boolean;
  priority: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  expire_at: string | null;
}

export default function AnnouncementManagement() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.resolvedLanguage?.startsWith("en") ? enUS : idLocale;
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", content: "", type: "info", priority: 0, is_active: true, expire_at: "" });

  const fetchAnnouncements = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("company_announcements" as any)
      .select("*")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });

    if (!error && data) setAnnouncements(data as any);
    setIsLoading(false);
  };

  useEffect(() => { fetchAnnouncements(); }, []);

  const openAdd = () => {
    setEditingId(null);
    setForm({ title: "", content: "", type: "info", priority: 0, is_active: true, expire_at: "" });
    setDialogOpen(true);
  };

  const openEdit = (a: Announcement) => {
    setEditingId(a.id);
    setForm({ title: a.title, content: a.content, type: a.type, priority: a.priority, is_active: a.is_active, expire_at: a.expire_at ? a.expire_at.slice(0, 10) : "" });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast({ title: t("announceMgmt.errorTitle"), description: t("announceMgmt.errRequired"), variant: "destructive" });
      return;
    }
    setIsSaving(true);

    const expireAt = form.expire_at ? new Date(form.expire_at + "T23:59:59").toISOString() : null;

    if (editingId) {
      const { error } = await supabase
        .from("company_announcements" as any)
        .update({ title: form.title, content: form.content, type: form.type, priority: form.priority, is_active: form.is_active, expire_at: expireAt } as any)
        .eq("id", editingId);
      if (error) toast({ title: t("announceMgmt.errorTitle"), description: error.message, variant: "destructive" });
      else toast({ title: t("announceMgmt.successTitle"), description: t("announceMgmt.updatedOk") });
    } else {
      const { error } = await supabase
        .from("company_announcements" as any)
        .insert({ title: form.title, content: form.content, type: form.type, priority: form.priority, is_active: form.is_active, expire_at: expireAt, created_by: user?.id } as any);
      if (error) toast({ title: t("announceMgmt.errorTitle"), description: error.message, variant: "destructive" });
      else toast({ title: t("announceMgmt.successTitle"), description: t("announceMgmt.createdOk") });
    }

    setIsSaving(false);
    setDialogOpen(false);
    fetchAnnouncements();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("announceMgmt.deleteConfirm"))) return;
    const { error } = await supabase.from("company_announcements" as any).delete().eq("id", id);
    if (error) toast({ title: t("announceMgmt.errorTitle"), description: error.message, variant: "destructive" });
    else { toast({ title: t("announceMgmt.successTitle"), description: t("announceMgmt.deletedOk") }); fetchAnnouncements(); }
  };

  const toggleActive = async (a: Announcement) => {
    await supabase.from("company_announcements" as any).update({ is_active: !a.is_active } as any).eq("id", a.id);
    fetchAnnouncements();
  };

  const typeBadge = (type: string) => {
    if (type === "warning") return <Badge variant="destructive" className="text-[10px]">{t("announceMgmt.typeWarning")}</Badge>;
    if (type === "success") return <Badge className="text-[10px] bg-primary">{t("announceMgmt.typeSuccess")}</Badge>;
    return <Badge variant="secondary" className="text-[10px]">{t("announceMgmt.typeInfo")}</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6 animate-fadeIn">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/settings")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t("announceMgmt.title")}</h1>
              <p className="text-sm text-muted-foreground mt-1">{t("announceMgmt.subtitle")}</p>
            </div>
          </div>
          <Button onClick={openAdd} className="gap-2">
            <Plus className="h-4 w-4" /> {t("announceMgmt.add")}
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">{t("announceMgmt.loading")}</div>
            ) : announcements.length === 0 ? (
              <div className="p-8 text-center">
                <Megaphone className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground">{t("announceMgmt.empty")}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("announceMgmt.colTitle")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("announceMgmt.colType")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("announceMgmt.colStatus")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("announceMgmt.colDate")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("announceMgmt.colExpired")}</TableHead>
                    <TableHead className="text-right">{t("announceMgmt.colAction")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {announcements.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{a.title}</p>
                        <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(a.content) }} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{typeBadge(a.type)}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Switch checked={a.is_active} onCheckedChange={() => toggleActive(a)} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {format(new Date(a.created_at), "dd MMM yyyy", { locale: dateLocale })}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {a.expire_at ? (
                          <Badge variant={new Date(a.expire_at) < new Date() ? "destructive" : "secondary"} className="text-[10px]">
                            {format(new Date(a.expire_at), "dd MMM yyyy", { locale: dateLocale })}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(a)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(a.id)} className="text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? t("announceMgmt.edit") : t("announceMgmt.add")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("announceMgmt.labelTitle")}</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("announceMgmt.phTitle")} />
            </div>
            <div>
              <Label>{t("announceMgmt.labelContent")}</Label>
              <RichTextEditor value={form.content} onChange={(v) => setForm({ ...form, content: v })} placeholder={t("announceMgmt.phContent")} />
            </div>
            <div>
              <Label>{t("announceMgmt.labelType")}</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">{t("announceMgmt.typeInfo")}</SelectItem>
                  <SelectItem value="warning">{t("announceMgmt.typeWarning")}</SelectItem>
                  <SelectItem value="success">{t("announceMgmt.typeSuccess")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("announceMgmt.labelPriority")}</Label>
                <Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>{t("announceMgmt.labelExpire")}</Label>
                <Input type="date" value={form.expire_at} onChange={(e) => setForm({ ...form, expire_at: e.target.value })} />
                <p className="text-[10px] text-muted-foreground mt-1">{t("announceMgmt.expireHint")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>{t("announceMgmt.labelActive")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("announceMgmt.cancel")}</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? t("announceMgmt.saving") : t("announceMgmt.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

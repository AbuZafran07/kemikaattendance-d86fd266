import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadHRDocs } from "@/components/HRDocumentModal";

export interface HRMessage {
  role: "user" | "assistant";
  content: string;
}

export function useHRAssistant() {
  const [hrMessages, setHrMessages] = useState<HRMessage[]>([]);
  const [hrInput, setHrInput] = useState("");
  const [hrLoading, setHrLoading] = useState(false);
  const hrMessagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hrMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [hrMessages]);

  const sendHRMessage = async (text?: string) => {
    const msg = (text ?? hrInput).trim();
    if (!msg || hrLoading) return;

    const newMessages: HRMessage[] = [...hrMessages, { role: "user", content: msg }];
    setHrMessages(newMessages);
    setHrInput("");
    setHrLoading(true);

    try {
      const history = newMessages.slice(-20);
      const activeDocs = loadHRDocs().filter((d) => d.active);
      const docsContext = activeDocs.length > 0
        ? activeDocs.map((doc) => `=== ${doc.name} ===\n${doc.content.slice(0, 3000)}`).join("\n\n")
        : "";

      const messagesPayload = docsContext
        ? [
            { role: "user" as const, content: `Berikut dokumen tambahan perusahaan sebagai referensi:\n\n${docsContext}` },
            { role: "assistant" as const, content: "Baik, saya akan mengacu pada dokumen tersebut." },
            ...history,
          ]
        : history;

      const { data, error } = await supabase.functions.invoke("hr-assistant", {
        body: { messages: messagesPayload },
      });

      if (error) throw error;
      const reply = data?.reply ?? "Maaf, saya tidak dapat menjawab saat ini.";
      setHrMessages([...newMessages, { role: "assistant", content: reply }]);
    } catch {
      setHrMessages([...newMessages, { role: "assistant", content: "Maaf, terjadi kesalahan. Silakan coba lagi." }]);
    } finally {
      setHrLoading(false);
    }
  };

  const clearMessages = () => setHrMessages([]);

  return { hrMessages, hrInput, setHrInput, hrLoading, hrMessagesEndRef, sendHRMessage, clearMessages };
}

"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { UploadIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { FileRef } from "@/modules/flow";

/**
 * Files for a run: picked, sent to /api/files for the flow, and kept
 * as references the run input carries. Each file's extraction is
 * reported as it lands, so a scanned PDF is known before the run, not
 * as the brick that failed on it.
 */
type Uploaded = { name: string; ok: boolean; reason?: string; ref?: FileRef; hasText?: boolean };

export function FileField({
  id,
  flowId,
  multiple,
  value,
  onChange,
}: {
  id: string;
  flowId: string;
  multiple: boolean;
  value: FileRef[];
  onChange: (refs: FileRef[]) => void;
}) {
  const t = useTranslations("run.files");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Uploaded[]>([]);

  const upload = async (picked: FileList) => {
    setBusy(true);
    const form = new FormData();
    form.set("flowId", flowId);
    for (const file of Array.from(picked)) form.append("files", file);
    try {
      const response = await fetch("/api/files", { method: "POST", body: form });
      const data = (await response.json()) as {
        ok: boolean;
        results?: Array<{
          name: string;
          ok: boolean;
          reason?: string;
          ref?: FileRef;
          file?: { hasText: boolean };
        }>;
      };
      if (!data.ok || !data.results) {
        toast.error(t("failed"));
        return;
      }
      const landed = data.results.map((r) => ({
        name: r.name,
        ok: r.ok,
        reason: r.reason,
        ref: r.ref,
        hasText: r.file?.hasText,
      }));
      setNotes((prev) => [...prev, ...landed]);
      const refs = landed.filter((r) => r.ok && r.ref).map((r) => r.ref!);
      onChange(multiple ? [...value, ...refs] : refs.slice(0, 1));
    } catch {
      toast.error(t("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        id={id}
        type="file"
        multiple={multiple}
        accept=".pdf,.docx,.txt,.md,.csv,.json,application/pdf,text/plain"
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) void upload(e.target.files);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <UploadIcon data-icon="inline-start" />
        {busy ? t("uploading") : multiple ? t("pickMany") : t("pickOne")}
      </Button>
      <p className="text-meta text-xs">{t("accepted")}</p>
      {value.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {value.map((ref) => {
            const note = notes.find((n) => n.ref?.fileId === ref.fileId);
            return (
              <li key={ref.fileId} className="flex items-center gap-2 text-2sm">
                <span className="truncate">{ref.name}</span>
                {note && note.hasText === false ? (
                  <span className="text-warning text-xs">{t("noText")}</span>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("remove")}
                  onClick={() => onChange(value.filter((v) => v.fileId !== ref.fileId))}
                >
                  <XIcon />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {notes
        .filter((n) => !n.ok)
        .map((n, i) => (
          <p key={i} className="text-warning text-xs">
            {n.name}: {t(`reasons.${n.reason ?? "generic"}`)}
          </p>
        ))}
      {multiple && value.length > 0 ? (
        <p className="text-meta text-xs">{t("count", { count: value.length })}</p>
      ) : null}
    </div>
  );
}

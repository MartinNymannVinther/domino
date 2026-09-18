"use client";

import { useRef, useTransition } from "react";
import { useTranslations } from "next-intl";
import { UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MAX_IMPORT_BYTES } from "@/modules/flow";
import { importFlowAction } from "@/modules/flow/actions";
import { useRouter } from "@/i18n/navigation";

/**
 * A flow file back in (dogma three). The file is read in the browser
 * and sent as text; the server migrates, validates and stores it, and
 * says by name what it could not read.
 */
export function ImportFlowButton() {
  const t = useTranslations("flows.import");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          if (file.size > MAX_IMPORT_BYTES) {
            toast.error(t("tooBig"));
            return;
          }
          startTransition(async () => {
            const text = await file.text();
            const result = await importFlowAction({ text });
            if (!result.ok) {
              const reason = result.detail ?? "invalid";
              toast.error(t(`reasons.${reason}` as "reasons.invalid"));
              return;
            }
            toast.success(t("done"));
            router.push(`/flows/${result.data.flowId}`);
          });
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => input.current?.click()}
      >
        <UploadIcon data-icon="inline-start" />
        {t("button")}
      </Button>
    </>
  );
}

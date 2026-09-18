"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { authClient } from "@/core/auth/client";
import { useRouter } from "@/i18n/navigation";

type Step = { kind: "idle" } | { kind: "verify"; backupCodes: string[]; qrDataUrl: string | null };

export function TotpManager({ initialEnabled }: { initialEnabled: boolean }) {
  const t = useTranslations("app.security.totp");
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEnable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const { data, error: apiError } = await authClient.twoFactor.enable({ password });
    setPending(false);
    if (apiError || !data || data.method !== "totp") {
      setError(t("error"));
      return;
    }
    setPassword("");
    const qrDataUrl = await QRCode.toDataURL(data.totpURI, { margin: 1, width: 220 }).catch(
      () => null,
    );
    setStep({ kind: "verify", backupCodes: data.backupCodes, qrDataUrl });
  }

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const { error: apiError } = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (apiError) {
      setError(t("verifyError"));
      setCode("");
      return;
    }
    setStep({ kind: "idle" });
    setCode("");
    setEnabled(true);
    toast.success(t("enabledToast"));
    router.refresh();
  }

  async function handleDisable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const { error: apiError } = await authClient.twoFactor.disable({ password });
    setPending(false);
    if (apiError) {
      setError(t("error"));
      return;
    }
    setPassword("");
    setEnabled(false);
    toast.success(t("disabledToast"));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("title")}
          <Badge variant={enabled ? "default" : "outline"}>
            {enabled ? t("statusEnabled") : t("statusDisabled")}
          </Badge>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {step.kind === "verify" ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">{t("scan")}</p>
            {step.qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={step.qrDataUrl}
                alt={t("totpQrAlt")}
                width={220}
                height={220}
                className="self-start rounded-md border"
              />
            ) : null}
            <div>
              <p className="text-sm font-medium">{t("backupCodes")}</p>
              <p className="text-muted-foreground mb-2 text-xs">{t("backupHint")}</p>
              <div className="grid max-w-sm grid-cols-2 gap-1 rounded-md border p-3 font-mono text-xs">
                {step.backupCodes.map((backupCode) => (
                  <span key={backupCode}>{backupCode}</span>
                ))}
              </div>
            </div>
            <form onSubmit={handleVerify} className="flex flex-col gap-3">
              <Field>
                <FieldLabel>{t("verifyLabel")}</FieldLabel>
                <InputOTP maxLength={6} value={code} onChange={setCode}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </Field>
              <Button type="submit" disabled={pending || code.length !== 6} className="self-start">
                {pending ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
                {t("verify")}
              </Button>
            </form>
          </div>
        ) : (
          <form
            onSubmit={enabled ? handleDisable : handleEnable}
            className="flex flex-wrap items-end gap-3"
          >
            <Field className="max-w-xs flex-1">
              <FieldLabel htmlFor="totp-password">{t("password")}</FieldLabel>
              <Input
                id="totp-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>
            <Button type="submit" variant={enabled ? "destructive" : "default"} disabled={pending}>
              {pending ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
              {enabled ? t("disable") : t("enable")}
            </Button>
          </form>
        )}
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

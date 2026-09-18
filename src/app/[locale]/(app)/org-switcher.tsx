"use client";

import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { authClient } from "@/core/auth/client";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { organizationSlug } from "@/lib/slug";

export function OrgSwitcher({
  triggerClassName,
  align = "start",
  label,
}: {
  triggerClassName?: string;
  align?: "start" | "end" | "center";
  /** Overrides the trigger text; the 2a lockup already names the active org. */
  label?: string;
}) {
  const t = useTranslations("app.orgSwitcher");
  const router = useRouter();
  const { data: organizations } = authClient.useListOrganizations();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function switchTo(organizationId: string) {
    if (organizationId === activeOrganization?.id) return;
    const target = organizations?.find((o) => o.id === organizationId);
    const { error: switchError } = await authClient.organization.setActive({ organizationId });
    if (switchError) {
      toast.error(t("error"));
      return;
    }
    if (target) toast.success(t("switched", { name: target.name }));
    router.refresh();
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const name = String(new FormData(event.currentTarget).get("name") ?? "");
    const { data, error: createError } = await authClient.organization.create({
      name,
      slug: organizationSlug(name),
    });
    setPending(false);
    if (createError || !data) {
      setError(t("error"));
      return;
    }
    await authClient.organization.setActive({ organizationId: data.id });
    setDialogOpen(false);
    toast.success(t("created", { name: data.name }));
    router.refresh();
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="sm" className={cn("gap-2 font-medium", triggerClassName)}>
              <span className="truncate">{label ?? activeOrganization?.name ?? t("label")}</span>
              <ChevronsUpDown data-slot="icon" className="shrink-0 opacity-50" />
            </Button>
          }
        />
        <DropdownMenuContent align={align} className="min-w-56">
          {/* Base UI: a GroupLabel must live inside a Group. */}
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
            {(organizations ?? []).map((organization) => (
              <DropdownMenuItem key={organization.id} onClick={() => switchTo(organization.id)}>
                <span className="flex-1 truncate">{organization.name}</span>
                {organization.id === activeOrganization?.id ? <Check data-slot="icon" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setDialogOpen(true)}>
            <Plus data-slot="icon" />
            {t("create")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-org-name">{t("name")}</FieldLabel>
              <Input id="new-org-name" name="name" required maxLength={200} />
            </Field>
          </FieldGroup>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
            {t("createSubmit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** ASCII slug from a (Danish) name, plus a random suffix for uniqueness. */
export function organizationSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replaceAll("æ", "ae")
    .replaceAll("ø", "oe")
    .replaceAll("å", "aa")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${base || "org"}-${suffix}`;
}

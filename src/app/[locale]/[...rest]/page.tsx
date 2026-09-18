import { notFound } from "next/navigation";

/** Funnels every unmatched path within a locale into the localized 404. */
export default function CatchAllPage() {
  notFound();
}

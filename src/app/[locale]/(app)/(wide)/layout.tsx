/**
 * Full frame, no margins: the canvas fills what the sidebar leaves and
 * lays out its own header and panel inside that.
 */
export default function WideLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="flex min-h-svh flex-1 flex-col">
      {children}
    </main>
  );
}

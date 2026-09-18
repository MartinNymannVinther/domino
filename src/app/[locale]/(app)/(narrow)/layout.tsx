/**
 * The ordinary page width: a reading column with the 2a margins. The
 * canvas lives in the (wide) group beside this one and takes the whole
 * frame instead; both sit inside the app layout's sidebar shell.
 */
export default function NarrowLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="@container mx-auto w-full max-w-6xl flex-1 px-5 py-6 sm:px-7 lg:px-8 lg:py-[30px]"
    >
      {children}
    </main>
  );
}

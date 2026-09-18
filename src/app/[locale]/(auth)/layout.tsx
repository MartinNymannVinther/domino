import { Wordmark } from "@/components/wordmark";
import { Link } from "@/i18n/navigation";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center p-5">
      <main className="w-full max-w-[470px]">
        <p className="mb-7 text-center">
          <Link href="/" aria-label="Domino">
            <Wordmark className="text-[1.375rem]" />
          </Link>
        </p>
        {children}
      </main>
    </div>
  );
}

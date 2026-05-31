import { LoginForm } from "./login-form";

type SearchParams = { next?: string; error?: string };

export default async function LoginPage(props: { searchParams: Promise<SearchParams> }) {
  const { next, error } = await props.searchParams;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--bg)] px-6 py-12">
      {/* Calm ambient depth — a single soft accent glow, no noise. */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)]/8 blur-[120px]"
      />

      <div className="relative w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-8 shadow-[var(--elev-2)]">
        <LoginForm next={next ?? "/"} error={error} />
      </div>
    </main>
  );
}

import { loginAction } from "./actions";
import { ShimmerButton } from "@/components/ui/shimmer-button";

type SearchParams = { next?: string; error?: string };

export default async function LoginPage(props: { searchParams: Promise<SearchParams> }) {
  const { next, error } = await props.searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--bg-app)]">
      <div className="w-full max-w-sm rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8">
        <h1 className="text-2xl font-semibold text-text-primary">Shorts OS</h1>
        <p className="text-sm text-text-secondary mt-1">Cockpit access</p>

        <form action={loginAction} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next ?? "/"} />
          <input
            type="password"
            name="password"
            autoFocus
            required
            placeholder="Password"
            className="w-full h-10 px-3 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-text-primary placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-electric)]"
          />
          {error && <p className="text-sm text-[var(--accent-red)]">{error}</p>}
          <ShimmerButton
            type="submit"
            background="rgba(20, 20, 20, 1)"
            shimmerColor="#00ff88"
            borderRadius="6px"
            className="w-full h-10"
          >
            Enter cockpit
          </ShimmerButton>
        </form>
      </div>
    </main>
  );
}

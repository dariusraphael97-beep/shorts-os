import type { ReactNode } from "react";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-[var(--bg)]">
      <div className="w-full max-w-xl">{children}</div>
    </div>
  );
}

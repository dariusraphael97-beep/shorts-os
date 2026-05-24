import { CockpitShell } from "@/components/cockpit/cockpit-shell";

export default function HomePage() {
  return (
    <CockpitShell>
      <div className="p-6 space-y-2">
        <h1 className="text-2xl font-semibold text-text-primary">Cockpit</h1>
        <p className="text-text-secondary text-sm">Topic Queue and Trending Panel land here in later tasks.</p>
      </div>
    </CockpitShell>
  );
}

import { CockpitShell } from "@/components/cockpit/cockpit-shell";

export default function LabPage() {
  return (
    <CockpitShell>
      <div className="p-8 max-w-2xl">
        <h1 className="text-2xl font-semibold text-text-primary">The Lab</h1>
        <p className="text-text-secondary mt-2">Coming in Plan #3.</p>

        <div className="mt-6 space-y-3 text-text-secondary">
          <p>
            This is where the agents actually make videos. The Strategist will dispatch a topic from the queue → Writer streams a script live → Voice Coach previews voices → Director picks b-roll → you'll watch the whole pipeline assemble in front of you.
          </p>
          <p>
            Nothing here yet. Drop a topic into the queue from the cockpit; when Plan #3 ships, the queued topics become the Lab's input.
          </p>
        </div>
      </div>
    </CockpitShell>
  );
}

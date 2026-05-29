// THROWAWAY — design-system visual review surface. Delete in Sub-phase J.

import type { Metadata } from "next"
import { SandboxClient } from "./sandbox-client"

export const metadata: Metadata = { title: "Sandbox — Components" }

export default function SandboxComponentsPage() {
  return <SandboxClient />
}

import type { Metadata } from "next";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "Shorts OS — Cockpit",
  description: "Faceless YouTube Shorts production cockpit.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <TooltipProvider delay={300}>{children}</TooltipProvider>
      </body>
    </html>
  );
}

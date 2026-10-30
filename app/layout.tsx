import type { Metadata } from "next";
import "./globals.css";
import "@/components/ui/focus.css";
import "@/components/ui/scroll.css";

export const metadata: Metadata = {
  title: "Trip planner | Your Italy trips",
  description: "Plan three days in Italy. Save a trip and return with your reference ID.",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import StartTrip from "@/lib/start-trip";

export const metadata: Metadata = {
  title: "Trip planner | Your Italy trips",
  description: "Start a trip or continue a saved project.",
};

export default function NewProjectPage() {
  return <StartTrip />;
}

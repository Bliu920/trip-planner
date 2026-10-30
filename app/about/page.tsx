import type { Metadata } from "next";
import { ProductStory } from "@/lib/product-story";

export const metadata: Metadata = {
  title: "AI travel planner | 3 Days in Italy",
  description:
    "Explore Italy and create a three-day trip around your interests, with an AI planner, a clear itinerary, a budget and a shared workspace.",
};

export default function AboutPage() {
  // Present the product story.
  return <ProductStory />;
}

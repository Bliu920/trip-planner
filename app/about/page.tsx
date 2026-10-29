import type { Metadata } from "next";
import { ProductStory } from "@/lib/product-story";

export const metadata: Metadata = {
  title: "The plan comes first | 3 Days in Italy",
  description: "The product thinking, agent architecture and deliberate scope behind 3 Days in Italy.",
};

export default function AboutPage() {
  // Present the product story.
  return <ProductStory />;
}

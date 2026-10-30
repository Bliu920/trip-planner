import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Chapters } from "./chapters";
import { Navigation } from "./reading";
import { ProductDemo } from "@/lib/product-demo";
import "./story.css";

export function ProductStory() {
  // Frame the product.
  return (
    <div className="story-page" id="top">
      <a className="story-skip" href="#story-content">
        Skip to the page
      </a>
      <header className="story-header">
        <Link href="/projects/new" className="story-brand">
          3 Days in Italy
        </Link>
        <Navigation />
        <Link href="/projects/new" className="story-try">
          Try the planner <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </header>
      <main id="story-content" className="story-main">
        <section className="story-hero" aria-labelledby="story-title">
          <h1 id="story-title">AI travel planner</h1>
          <p>
            Explore Italy, describe the trip you have in mind, and turn it into a three-day plan you
            can make your own.
          </p>
          <Link href="/projects/new" className="story-hero-cta">
            Plan your trip <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </section>
        {/* Show the result. */}
        <section id="the-plan" className="story-product" aria-label="Explore the product">
          <ProductDemo />
          <p className="story-sample-note">
            Your itinerary and your conversation, side by side. Example trip shown.
          </p>
        </section>
        {/* Reveal the thinking. */}
        <Chapters />
      </main>
      <footer className="story-footer">
        <p>Explore the planner.</p>
        <Link href="/projects/new" className="story-footer-cta">
          Plan your Italy trip <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
        <div>
          <Link href="/credits">Image credits</Link>
          <a href="#top">Back to top ↑</a>
        </div>
      </footer>
    </div>
  );
}

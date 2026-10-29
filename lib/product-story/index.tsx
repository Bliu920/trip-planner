import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Chapters } from "./chapters";
import { Contents, Screenshot } from "./reading";
import "./story.css";

export function ProductStory() {
  // Frame the reading experience.
  return <div className="story-page" id="top">
    <a className="story-skip" href="#story-content">Skip to the story</a>
    <header className="story-header">
      <Link href="/projects/new" className="story-brand"><ArrowLeft size={16} aria-hidden="true" /> Trip planner</Link>
      <Link href="/projects/new" className="story-try">Try the planner <ArrowUpRight size={16} aria-hidden="true" /></Link>
    </header>
    <main id="story-content" className="story-main">
      <div className="story-hero">
        <p className="story-byline">3 Days in Italy <span>Product & engineering notes</span></p>
        <h1>The plan comes first.</h1>
        <p className="story-deck">Before designing an agent that plans a trip, I had to decide what makes a plan worth having.</p>
        <p className="story-purpose">This project demonstrates an AI agent working in a purpose-built environment to create something you can understand, explore and make your own. It is a working prototype of that approach, with room to improve the planning itself.</p>
        <a href="#the-plan" className="story-read">Read the story <span aria-hidden="true">↓</span></a>
      </div>
      <div className="story-cover">
        <Screenshot name="Three days at a glance" src="/product-story/plan.jpg" width={1191} height={794} priority caption="A demonstration itinerary using supplied places. Start with the shape of three days, then open the parts that interest you. Arrangements are illustrative and unconfirmed." />
      </div>
      {/* Connect the chapters. */}
      <div className="story-layout">
        <Contents />
        <article className="story-article" aria-label="How and why I built 3 Days in Italy"><Chapters /></article>
      </div>
    </main>
    <footer className="story-footer">
      <p>A useful plan is the beginning of the conversation.</p>
      <Link href="/projects/new" className="story-try">Plan three days in Italy <ArrowUpRight size={16} aria-hidden="true" /></Link>
      <div><Link href="/credits">Image credits</Link><a href="#top">Back to top ↑</a></div>
    </footer>
  </div>;
}

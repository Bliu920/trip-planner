import Link from "next/link";
import { Plus } from "lucide-react";
import { DiscoveryPreview, LibraryPreview, TripPreview } from "@/lib/product-preview";
import { Architecture } from "./reading";

export function Chapters() {
  // Introduce product capabilities.
  return (
    <>
      <section id="planning-together" className="story-feature" aria-labelledby="discover-title">
        <div className="story-feature-visual">
          <DiscoveryPreview />
        </div>
        <div className="story-feature-copy">
          <h2 id="discover-title">Find the places that feel like you.</h2>
          <p>
            Art, neighbourhood walks or a long lunch. Explore places across Italy and add the ones
            you like to your message.
          </p>
          <p>
            Then describe the trip you have in mind. Type it out or use your voice, and review the
            transcript before sending.
          </p>
          <span className="story-feature-note">
            Your selected places travel with your request, giving the planner a concrete starting
            point.
          </span>
        </div>
      </section>
      <section
        id="trip-details"
        className="story-feature story-feature-reverse"
        aria-labelledby="itinerary-title"
      >
        <div className="story-feature-copy">
          <h2 id="itinerary-title">A clear plan for each day.</h2>
          <p>
            Get a feel for the whole trip, then follow each day on the map or look closer at an
            activity, its timing and costs. The plan stays beside your conversation as you refine
            it.
          </p>
          <p>
            Ask for a slower afternoon, a different stop or more time for lunch. You can also edit
            the itinerary and budget yourself.
          </p>
          <span className="story-feature-note">
            An overview first, detail when you need it. The same itinerary gives you and the AI
            something concrete to work on.
          </span>
        </div>
        <div className="story-feature-visual">
          <TripPreview />
        </div>
      </section>
      <section id="the-environment" className="story-feature" aria-labelledby="workspace-title">
        <div className="story-feature-visual">
          <LibraryPreview />
        </div>
        <div className="story-feature-copy">
          <h2 id="workspace-title">Keep the details with the trip.</h2>
          <p>
            Your preferences, research and planning decisions belong together. Library keeps that
            supporting material alongside your plan and budget.
          </p>
          <p>
            Upload your own travel notes, or open the documents the planner creates as it works. A
            new conversation can continue working on the same trip.
          </p>
          <span className="story-feature-note">
            Library also gives the agent room to keep working notes, consult evidence and carry
            decisions into later revisions.
          </span>
        </div>
      </section>
      <section className="story-behind" aria-label="About the planning approach">
        <details className="story-disclosure story-engineering" id="guides-and-tools">
          <summary>
            How the planner works <Plus size={18} aria-hidden="true" />
          </summary>
          <div>
            <p>
              The agent works through a planning loop: understand your request, research options,
              compose the days, check the result and save. Trip-planning research informed the
              attention to personal fit, geography, realistic timing and spare capacity.
            </p>
            <Architecture />
            <h3>Guidance that can improve with use</h3>
            <p>
              Specialist guiding documents give the agent relevant methods at the right stage. This
              follows progressive disclosure: core rules establish the boundaries, and more specific
              guidance is loaded when needed.
            </p>
            <p>
              Separating that guidance into documents makes it possible to turn reviewed lessons
              into better instructions for future trips. I can refine one planning method at a time
              and test the result. More use and evaluation can enrich these guides; improvement
              depends on that deliberate review.
            </p>
          </div>
        </details>
        <details className="story-disclosure story-research" id="the-workflow">
          <summary>
            Where the planning method comes from <Plus size={18} aria-hidden="true" />
          </summary>
          <div>
            <p>
              The{" "}
              <a href="https://www.syros.aegean.gr/users/dgavalas/en/iframe_files/papers/2014/survey_TTDP.pdf">
                Tourist Trip Design Problem
              </a>{" "}
              and{" "}
              <a href="https://www.ricksteves.com/travel-tips/trip-planning/itinerary-tips">
                Rick Steves’ itinerary guidance
              </a>{" "}
              informed the method: select meaningful experiences that fit the geography and
              available time.
            </p>

            <p>
              <a href="https://journals.sagepub.com/doi/10.1509/jmr.14.0591">
                Rough-scheduling research
              </a>{" "}
              informed the calmer overview.{" "}
              <a href="https://doi.org/10.1037/0022-3514.67.3.366">Planning-fallacy research</a>{" "}
              motivated attention to transitions and spare capacity. Applying these findings to
              travel is a design hypothesis, not a demonstrated product outcome.
            </p>
          </div>
        </details>
      </section>
      <section id="scope" className="story-section story-scope" aria-labelledby="scope-title">
        <div className="story-section-heading">
          <h2 id="scope-title">A working prototype, with room to grow</h2>
          <p>
            This demonstration brings discovery, planning and revision into one workspace. The
            experience is usable today, with further work needed on speed, route accuracy and
            research coverage.
          </p>
        </div>
        <div className="story-scope-list">
          <details className="story-disclosure">
            <summary>
              More dependable routes and travel evidence <Plus size={18} aria-hidden="true" />
            </summary>
            <div>
              <p>
                Travel checks need richer coverage of public transport, service schedules, queues
                and opening windows. Source-linked research and map estimates support decisions;
                they do not guarantee live availability, a feasible whole day or a reservation.
              </p>
            </div>
          </details>
          <details className="story-disclosure">
            <summary>
              Faster planning and broader evaluation <Plus size={18} aria-hidden="true" />
            </summary>
            <div>
              <p>
                Research-heavy turns can be slow. I would measure delays and failure patterns,
                improve retrieval, and expand acceptance testing. An evaluation harness exists;
                broad live coverage and judge calibration remain incomplete.
              </p>
            </div>
          </details>
          <details className="story-disclosure">
            <summary>
              More precise ways to request changes <Plus size={18} aria-hidden="true" />
            </summary>
            <div>
              <p>
                Places and files can already enter chat context. Selecting a day, stop or cost
                directly for a revision would make follow-up work more precise. Broader discovery
                and clearer comparisons are further opportunities.
              </p>
            </div>
          </details>
          <details className="story-disclosure">
            <summary>
              Accounts and production readiness <Plus size={18} aria-hidden="true" />
            </summary>
            <div>
              <p>
                I kept the demo account-free to focus on planning. Anyone with a trip link can view
                and edit it. Authentication, finer permissions, monitoring and broader usability
                testing remain production work.
              </p>
            </div>
          </details>
        </div>
      </section>
      <section id="building-with-ai" className="story-ai" aria-labelledby="ai-title">
        <h2 id="ai-title">About this demonstration</h2>
        <p>
          3 Days in Italy demonstrates an AI agent working in a travel-planning environment, from a
          request to a saved, editable trip. I used AI coding assistants for research, design
          exploration, implementation, tests and debugging, and shaped the product through iterative
          review. This page was also developed with AI assistance.
        </p>
        <Link href="/credits">Photography and illustration notes</Link>
      </section>
    </>
  );
}

"use client";

import { ArrowUp, Check, FileText, Mic, Plus } from "lucide-react";
import { DayCard } from "@/lib/plan/presentation/components";
import { StopDetails } from "@/lib/plan/day-view/details";
import { BudgetDetails } from "@/lib/budget/ui/table";
import { PlaceCard } from "@/lib/explore/place";
import { ExploreControls } from "@/lib/explore/controls";
import { PlaceChips } from "@/lib/place-references";
import { PromptInput } from "@/lib/prompt-input";
import { DayMap } from "@/lib/plan/day-view/map";
import { discoveryPlaces, previewDay, dayMapPlaces, sampleBudget } from "./data";
import "@/lib/start-trip/start.css";
import "@/lib/plan/day-view/styles.css";
import "@/lib/budget/ui/budget.css";
import "@/lib/explore/explore.css";

export function DiscoveryVisual() {
  return (
    <div
      className="preview-board preview-discovery"
      role="img"
      aria-label="Example Start Page with the trip prompt above Explore and Projects tabs, a place grid and image-corner add buttons."
    >
      <div className="preview-surface preview-start-viewport" inert aria-hidden="true">
        <div className="preview-real-start">
          <div className="preview-app-header">
            <span>Trip planner</span>
            <span>
              About <span>Credits</span>
            </span>
          </div>
          <div className="start-trip-content">
            <div className="start-trip-intro">
              <h2>Plan your Italy trip</h2>
            </div>
            <div className="start-trip-form">
              <PromptInput
                size="roomy"
                value="Three days of art, local food and easy walks. We’d love to visit the Colosseum."
                onChange={() => {}}
                onSubmit={() => {}}
                label="Tell us about your trip"
                placeholder="What do you have in mind?"
                attachments={<PlaceChips places={[discoveryPlaces[0]]} onRemove={() => {}} />}
                leadingAction={
                  <span className="preview-prompt-action">
                    <Plus size={17} />
                  </span>
                }
                action={
                  <>
                    <span className="preview-prompt-action">
                      <Mic size={17} />
                    </span>
                    <span className="prompt-input-submit">
                      <ArrowUp size={17} />
                    </span>
                  </>
                }
              />
            </div>
          </div>
          <div className="start-trip-tabs">
            <div className="start-trip-navigation">
              <div className="start-trip-tab-list">
                <span className="start-trip-tab" data-active>
                  Explore
                </span>
                <span className="start-trip-tab">Projects</span>
              </div>
              <div className="start-trip-actions">
                <ExploreControls
                  filters={{ query: "", city: "", type: "" }}
                  onChange={() => {}}
                  cities={["Rome"]}
                  types={["historic_site", "neighborhood", "restaurant"]}
                  compact
                />
              </div>
            </div>
            <div className="explore explore-embedded">
              <div className="explore-grid">
                {discoveryPlaces.map((place, index) => (
                  <PlaceCard
                    key={place.id}
                    place={place}
                    action={
                      <span className="place-toggle" aria-pressed={index === 0}>
                        <span className="place-toggle-symbol">
                          {index === 0 ? <Check size={16} /> : <Plus size={16} />}
                        </span>
                      </span>
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DayVisual() {
  const day = previewDay;
  return (
    <div
      className="preview-board preview-day"
      role="img"
      aria-label="Example second day in Florence, with its timeline, Uffizi Gallery activity details and a geographic map of the day’s places."
    >
      <div
        className="preview-surface preview-day-grid product-demo pp-page"
        inert
        aria-hidden="true"
        data-embedded="true"
      >
        <DayCard
          day={day}
          number={2}
          active
          expanded
          selectedId={day.stops[0].id}
          domId="feature-day"
          onOpenDay={() => {}}
          onStop={() => {}}
        />
        <div className="preview-activity">
          <span>Activity details</span>
          <StopDetails stop={day.stops[0]} cover={day.photo} />
          <DayMap
            places={dayMapPlaces}
            selected={day.stops[0].id}
            selectionRequest={0}
            onSelect={() => {}}
          />
        </div>
      </div>
    </div>
  );
}

export function BudgetVisual() {
  return (
    <div
      className="preview-board preview-budget"
      role="img"
      aria-label="Example budget breakdown for two travellers, with clearly marked illustrative cost estimates."
    >
      <div className="preview-surface bd-panel" inert aria-hidden="true">
        <header className="bd-header">
          <h2>Budget</h2>
          <span className="bd-button">Edit budget</span>
        </header>
        <BudgetDetails budget={sampleBudget} onOpenDocument={() => {}} />
        <p className="preview-estimate-note">
          Sample amounts for illustration. Not researched prices.
        </p>
      </div>
    </div>
  );
}

export function LibraryVisual() {
  const files = ["Trip preferences", "Florence research", "Planning decisions", "Travel notes"];
  return (
    <div
      className="preview-board preview-library"
      role="img"
      aria-label="Example Library with trip preferences, research, planning decisions and uploaded travel notes."
    >
      <div className="preview-surface" inert aria-hidden="true">
        <div className="preview-library-header">
          <strong>Library</strong>
          <span>
            <Plus size={14} />
            Add a file
          </span>
        </div>
        <div className="preview-library-body">
          <div className="preview-files">
            {files.map((name, index) => (
              <div key={name} data-selected={index === 0 || undefined}>
                <FileText size={17} />
                <span>
                  {name}
                  <small>{index === 3 ? "PDF · Uploaded by you" : "Document"}</small>
                </span>
              </div>
            ))}
          </div>
          <article className="preview-document">
            <span>Trip preferences</span>
            <h3>A relaxed Florence getaway</h3>
            <div className="preview-document-tags">
              <span>3 days</span>
              <span>2 adults</span>
              <span>Easy pace</span>
            </div>
            <h4>What matters most</h4>
            <p>
              Local food, Renaissance art and time to wander. Keep the mornings focused and the
              afternoons flexible.
            </p>
            <h4>One must-see</h4>
            <p>A morning at the Uffizi, with a long lunch afterwards.</p>
            <h4>Still to confirm</h4>
            <p>Travel dates and arrival time.</p>
          </article>
        </div>
      </div>
    </div>
  );
}

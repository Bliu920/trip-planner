"use client";

import { ArrowLeft, ArrowUp, ChevronDown, Copy, Mic, PanelLeft, Plus } from "lucide-react";
import { DayCard, TripSummary } from "@/lib/plan/presentation/components";
import type { Budget } from "@/lib/plan/presentation/model";
import type { DemoDay } from "./data";
import "@/lib/plan/presentation/presentation.css";

export function DemoWorkspace({ days, budget }: { days: DemoDay[]; budget: Budget }) {
  // Present the sample workspace.
  return (
    <div
      className="demo-frame"
      role="img"
      aria-label="Example trip workspace showing a three-day Florence plan beside a conversation with the planner."
    >
      <div className="demo-workspace" inert aria-hidden="true">
        <div className="demo-header">
          <span>
            <ArrowLeft size={14} /> Projects <span className="demo-slash">/</span>{" "}
            <PanelLeft size={15} /> <strong>A relaxed Italian food and art getaway</strong>
          </span>
          <span>
            <Copy size={14} /> Copy ID
          </span>
        </div>
        <div className="demo-panels">
          <section className="demo-plan">
            <div className="demo-plan-tabs">
              <span>Plan</span>
              <span>Budget</span>
              <span>Library</span>
            </div>
            <div className="product-demo pp-page" data-embedded="true">
              <TripSummary
                title="Florence"
                meta={["3 days", "2 adults"]}
                dateLabel="Dates flexible"
                budget={budget}
                embedded
                onBudget={() => {}}
              />
              <div className="pp-days demo-days">
                {days.map((day, index) => (
                  <DayCard
                    key={day.id}
                    day={day}
                    number={index + 1}
                    active
                    domId={"preview-" + day.id}
                    onOpenDay={() => {}}
                    onStop={() => {}}
                  />
                ))}
              </div>
            </div>
          </section>
          <aside className="demo-chat">
            <div className="demo-chat-header">
              <span>
                Trip conversation <ChevronDown size={13} />
              </span>
              <Plus size={17} />
            </div>
            <div className="demo-messages">
              <p className="demo-user-message">
                I&apos;m planning a relaxed three-day trip to Florence for two. We love local food,
                art and easy walks. Could you put together a plan?
              </p>
              <div className="demo-reply">
                <p>
                  <strong>Here&apos;s a three-day Florence itinerary for two</strong>, with markets,
                  art, long lunches and time to wander.
                </p>
                <p>
                  I&apos;ve kept the days relaxed, with room to explore and a shared budget to help
                  you get started.
                </p>
                <p>Take a look at the plan, and let me know what you&apos;d like to change.</p>
              </div>
            </div>
            <div className="demo-input">
              <span>Ask about your trip</span>
              <div>
                <span>
                  <Plus size={16} />
                  <Mic size={15} />
                </span>
                <span className="demo-send">
                  <ArrowUp size={16} />
                </span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

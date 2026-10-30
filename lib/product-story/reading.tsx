"use client";

import { useEffect, useState } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { ArrowRight, ArrowLeftRight, BookOpen, FileText, Sparkles } from "lucide-react";

const sections = [
  ["planning-together", "Explore"],
  ["trip-details", "Your trip"],
  ["the-environment", "Workspace"],
  ["scope", "Scope"],
] as const;

export function Navigation() {
  const [active, setActive] = useState<string>("planning-together");
  useEffect(() => {
    const headings = sections.map(([id]) => document.getElementById(id));
    let frame = 0;
    const update = () => {
      const reached = headings.filter(
        (element) => element && element.getBoundingClientRect().top <= 200,
      );
      setActive(reached.at(-1)?.id ?? "planning-together");
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
    };
  }, []);
  return (
    <nav className="story-nav" aria-label="On this page">
      {sections.map(([id, title]) => (
        <a key={id} href={"#" + id} aria-current={active === id ? "location" : undefined}>
          {title}
        </a>
      ))}
    </nav>
  );
}

const architecture = [
  {
    id: "environment",
    title: "Environment",
    text: "The Plan holds the itinerary, Budget holds costs and sources, and Library holds the brief, research and planning decisions. The agent can create working notes and consult uploaded files. These materials support its decisions across conversations about the same trip.",
  },
  {
    id: "guides",
    title: "Guides",
    text: "Guidance follows progressive disclosure: core rules establish the boundaries, phase-specific instructions support the current stage, and specialist documents can be read when relevant. Keeping these documents separate makes individual planning methods easier to review and improve.",
  },
  {
    id: "tools",
    title: "Tools",
    text: "Tools let the agent inspect the trip, find places, research missing details and edit specific parts of the plan. Checks return feedback it can use to repair a draft. Changes are published together, and the agent needs confirmation of a save before reporting success.",
  },
] as const;

export function Architecture() {
  const [focus, setFocus] = useState<string | number | null>("environment");
  return (
    <figure className="story-architecture" aria-label="How the agent works with the trip">
      <Tabs.Root value={focus} onValueChange={setFocus}>
        <Tabs.List className="story-architecture-tabs" aria-label="Explore the agent architecture">
          {architecture.map((item) => (
            <Tabs.Tab key={item.id} value={item.id} className="cursor-pointer">
              {item.title}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <div className="story-architecture-map" data-focus={focus}>
          <div className="story-guide-node">
            <BookOpen size={24} aria-hidden="true" />
            <strong>Guides</strong>
            <span>Methods & boundaries</span>
          </div>
          <ArrowRight className="story-architecture-arrow" size={18} aria-hidden="true" />
          <div className="story-agent-node">
            <Sparkles size={24} aria-hidden="true" />
            <strong>Agent</strong>
            <span>Read, decide, act, check</span>
          </div>
          <div className="story-tool-edge">
            <ArrowLeftRight size={20} aria-hidden="true" />
            <span>Tools</span>
          </div>
          <div className="story-environment-node">
            <p>Trip workspace</p>
            <div className="story-artifact">
              <strong>Plan</strong>
              <span>The selected journey</span>
            </div>
            <div className="story-workspace-row">
              <div>
                <strong>Budget</strong>
                <span>Costs & sources</span>
              </div>
              <div>
                <FileText size={14} aria-hidden="true" />
                <strong>Library</strong>
                <span>Brief, evidence, decisions</span>
              </div>
            </div>
          </div>
        </div>
        {architecture.map((item) => (
          <Tabs.Panel className="story-architecture-explanation" key={item.id} value={item.id}>
            <p>{item.text}</p>
          </Tabs.Panel>
        ))}
      </Tabs.Root>
    </figure>
  );
}

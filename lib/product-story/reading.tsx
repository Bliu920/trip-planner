"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { ArrowRight, ArrowLeftRight, BookOpen, FileText, Maximize2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const sections = [
  ["the-plan", "The plan comes first"],
  ["the-workflow", "Research into practice"],
  ["the-environment", "An environment to work in"],
  ["guides-and-tools", "Guides, tools and trust"],
  ["planning-together", "Planning together"],
  ["scope", "Scope and next steps"],
  ["building-with-ai", "Building with AI"],
] as const;

export function Contents() {
  const [active, setActive] = useState<string>(sections[0][0]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const headings = sections.map(([id]) => document.getElementById(id));
    const article = document.querySelector(".story-article");
    let frame = 0;
    const update = () => {
      const reached = headings.filter(heading => heading && heading.getBoundingClientRect().top <= 190);
      const last = reached.at(-1);
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;
      setActive(atEnd ? sections.at(-1)![0] : last?.id ?? sections[0][0]);
      if (article) {
        const bounds = article.getBoundingClientRect();
        setProgress(Math.min(100, Math.max(0, (190 - bounds.top) / Math.max(1, bounds.height - window.innerHeight + 190) * 100)));
      }
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); };
  }, []);

  return <aside className="story-contents">
    <nav aria-label="In this story">
      <p className="story-contents-title">In this story</p>
      <ol>{sections.map(([id, title]) => <li key={id}><a href={`#${id}`} aria-current={active === id ? "location" : undefined}>{title}</a></li>)}</ol>
      <label className="story-mobile-contents">Jump to a section
        <select aria-label="Jump to a section" value={active} onChange={event => { window.location.hash = event.target.value; }}>{sections.map(([id, title]) => <option value={id} key={id}>{title}</option>)}</select>
      </label>
      <progress aria-label="Reading progress" max={100} value={progress} />
    </nav>
  </aside>;
}

type ScreenshotProps = { name: string; src: string; width: number; height: number; caption: string; priority?: boolean };

export function Screenshot({ name, src, width, height, caption, priority = false }: ScreenshotProps) {
  return <figure className="story-figure">
    <Dialog>
      <DialogTrigger className="cursor-pointer story-image-button" aria-label={`Enlarge screenshot: ${name}`}>
        <Image src={src} alt={name} width={width} height={height} sizes="(max-width: 760px) 100vw, 1100px" preload={priority} />
        <span className="story-enlarge"><Maximize2 size={15} aria-hidden="true" /><span>View screenshot</span></span>
      </DialogTrigger>
      <DialogContent className="story-lightbox">
        <DialogTitle>{name}</DialogTitle>
        <DialogDescription>{caption}</DialogDescription>
        <Image src={src} alt={name} width={width} height={height} sizes="96vw" />
      </DialogContent>
    </Dialog>
    <figcaption>{caption}</figcaption>
  </figure>;
}

const architecture = [
  { id: "environment", title: "Environment", text: "One shared trip: an editable itinerary, a structured budget and a Library of requirements, evidence and decisions. The agent reads what matters for the current task and changes the same artifacts the traveller sees." },
  { id: "guides", title: "Guides", text: "Trusted application documents describe how to plan, research and revise. A guide directory supports on-demand loading; essential guidance for the first itinerary is supplied at the start. Working notes and uploaded files stay separate from these instructions." },
  { id: "tools", title: "Tools", text: "A bounded interface connects the model to the trip: read, research, edit, inspect and commit. Targeted edits preserve unrelated details. Validation returns feedback for repair, and a save receipt confirms publication." },
] as const;

export function Architecture() {
  const [focus, setFocus] = useState<string | number | null>("environment");
  return <figure className="story-architecture" aria-label="How the agent works with the trip">
    <Tabs.Root value={focus} onValueChange={setFocus}>
      <Tabs.List className="story-architecture-tabs" aria-label="Explore the agent architecture">
        {architecture.map(item => <Tabs.Tab key={item.id} value={item.id} className="cursor-pointer">{item.title}</Tabs.Tab>)}
      </Tabs.List>
      <div className="story-architecture-map" data-focus={focus}>
        <div className="story-guide-node"><BookOpen size={22} aria-hidden="true" /><strong>Guides</strong><span>Methods & boundaries</span></div>
        <ArrowRight className="story-architecture-arrow" size={18} aria-hidden="true" />
        <div className="story-agent-node"><Sparkles size={22} aria-hidden="true" /><strong>Agent</strong><span>Read, decide, act, check</span></div>
        <div className="story-tool-edge"><ArrowLeftRight size={20} aria-hidden="true" /><span>Tools</span></div>
        <div className="story-environment-node">
          <p>Trip workspace</p>
          <div className="story-artifact"><strong>Plan</strong><span>The selected journey</span></div>
          <div className="story-workspace-row"><div><strong>Budget</strong><span>Costs & sources</span></div><div><FileText size={14} aria-hidden="true" /><strong>Library</strong><span>Brief, evidence, decisions</span></div></div>
        </div>
      </div>
      {architecture.map(item => <Tabs.Panel className="story-architecture-explanation" key={item.id} value={item.id}><p>{item.text}</p></Tabs.Panel>)}
    </Tabs.Root>
    <figcaption>Explore the three parts of the harness. Each supports the agent’s work on one shared trip.</figcaption>
  </figure>;
}

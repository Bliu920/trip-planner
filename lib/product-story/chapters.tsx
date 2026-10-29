import Link from "next/link";
import { Architecture, Screenshot } from "./reading";

export function Chapters() {
  return <>
    <section id="the-plan" aria-labelledby="the-plan-title">
      <h2 id="the-plan-title">Something to make your own.</h2>
      <p>I wanted the first reaction to be: “I can picture these three days.” Where I will be, how the days feel, and what deserves a closer look. That sense of orientation is the first value the product has to deliver.</p>
      <p>The plan is therefore the central artifact: a persistent, editable piece of work. The overview gives each day a shape. Opening a day reveals its schedule, places, map and spending. Sources and practical details sit closer to the decisions they support.</p>
      <p>The AI, the research and the interface have to meet at the right level of detail. Once the trip feels legible and appealing, there is a reason to explore it, question it and work with the assistant to improve it.</p>
      <Screenshot name="A day opened up" src="/product-story/day.jpg" width={1191} height={794} caption="The same demonstration plan, one level deeper. A day opens in place, bringing its timing and map into view." />
    </section>
    <section id="the-workflow" aria-labelledby="the-workflow-title">
      <h2 id="the-workflow-title">A travel workflow before an agent loop.</h2>
      <p>I began with trip-planning research. The <a href="https://www.syros.aegean.gr/users/dgavalas/en/iframe_files/papers/2014/survey_TTDP.pdf">Tourist Trip Design Problem</a> frames planning as selecting valuable experiences under time, travel and opening constraints. <a href="https://www.ricksteves.com/travel-tips/trip-planning/itinerary-tips">Rick Steves’ practical guidance</a> adds a useful discipline: fit the wish list to geography, pace and the time actually available.</p>
      <p>Research on <a href="https://journals.sagepub.com/doi/10.1509/jmr.14.0591">rough scheduling</a> informed the calmer period-level overview, while <a href="https://doi.org/10.1037/0022-3514.67.3.366">planning-fallacy research</a> motivated attention to transitions and spare capacity. Applying those findings to this travel interface is a design hypothesis, not a demonstrated outcome.</p>
      <ol className="story-workflow" aria-label="The planning workflow">
        <li><strong>Understand</strong><span>Intent, constraints and fixed commitments</span></li>
        <li><strong>Explore</strong><span>Relevant places, geography and evidence</span></li>
        <li><strong>Compose</strong><span>Connected days, meals, movement and rest</span></li>
        <li><strong>Check and revise</strong><span>Timing, costs, sources and tradeoffs</span></li>
        <li><strong>Save and continue</strong><span>An editable plan with visible unknowns</span></li>
      </ol>
      <p>These stages guide one bounded agent loop. New evidence can change an earlier choice. The first turn aims to deliver a useful draft with explicit assumptions, giving the traveller something concrete to respond to.</p>
    </section>
    <section id="the-environment" aria-labelledby="the-environment-title">
      <h2 id="the-environment-title">Give the agent somewhere to work.</h2>
      <p>A coding agent has a project to inspect and change. I wanted a similar working environment for travel, organised around the plan it is responsible for producing.</p>
      <Architecture />
      <p>The itinerary owns the selected arrangements. Budget owns costs and their evidence. Library holds uploaded originals and working documents: a Travel brief for requirements, Research notes for reusable evidence, and Planning decisions for choices worth revisiting. These notes support later work; they are not extra reading the traveller must do.</p>
      <p>Each fact has one authoritative home. A research note should not become a second itinerary or cost ledger. Different chats work on the same trip, so the useful context can outlive a particular conversation.</p>
      <Screenshot name="The shared trip Library" src="/product-story/library.jpg" width={1200} height={800} caption="Library keeps requirements, evidence and decisions available for future edits. The document shown here is illustrative demonstration content." />
    </section>
    <section id="guides-and-tools" aria-labelledby="guides-and-tools-title">
      <h2 id="guides-and-tools-title">Guidance in layers. Changes with boundaries.</h2>
      <p>The prompt architecture uses progressive disclosure. Shared instructions establish source trust, editing rules and honest save reporting. A small directory points to task-specific guides for planning, budget research and revision. Essential first-plan guidance is supplied upfront; other guides are read when relevant. These are application instructions. Uploaded files and web pages are evidence, with a different level of authority.</p>
      <p>I designed the guides as a place for domain experience to accumulate. From planning attempts and test results, I can turn recurring failures and useful approaches into clearer rules, worked examples or specialist guides. The agent can then retrieve those lessons when the relevant situation arises. Each revision can be tested against the cases that motivated it, creating a practical loop from experience to more specialised guidance. The prototype therefore demonstrates both a planner and a way to improve its working methods over time.</p>
      <p>The tools follow the work: discover and read, make targeted edits, inspect changes, then commit. The supplied Italy dataset anchors named attractions; web research supplements practical facts and meal venues. Code checks structure, references and protected commitments. Changes are staged before publication, with the final itinerary, budget and document updates saved together. A confirmed save receipt determines what the assistant can call saved.</p>
      <p>This is the agent harness: the environment, guidance, tools and feedback around the model. I iterated on all four, including clearer research results and recovery from rejected edits. Route quality and judgement still need evaluation beyond these mechanical checks.</p>
    </section>
    <section id="planning-together" aria-labelledby="planning-together-title">
      <h2 id="planning-together-title">Leave room for the person.</h2>
      <p><Link href="/explore">Explore</Link> gives the traveller a sense of possibility before they have a precise request. Places they select become references in their message, so browsing can lead naturally into planning. A selection expresses interest; their words establish whether it is a must-see.</p>
      <Screenshot name="Explore and start a trip" src="/product-story/explore.jpg" width={1191} height={794} caption="Browsing and conversation meet in the same starting point. Choose places that appeal to you, then describe the trip you have in mind." />
      <p>Voice input matters here too. “Art in the morning, long lunches, and please don’t rush us” is often easier to say than to turn into form fields. Dictation puts a transcript into the composer for review before sending. It is a way to express intent, not a separate planning mode.</p>
    </section>
    <section id="scope" aria-labelledby="scope-title">
      <h2 id="scope-title">A working approach, with deliberate limits.</h2>
      <p>The demonstration focuses on the complete path from intent to a saved, revisable trip. It includes prompt, workflow and tool refinement, but does not represent the best possible planning quality or a production travel service. These are the next areas I would develop:</p>
      <dl className="story-limits">
        <div><dt>Route and timing fidelity</dt><dd>Travel feasibility needs richer coverage of public-transport timetables, queues, opening windows and real arrival and departure constraints. A map estimate alone cannot establish whether a whole day works.</dd></div>
        <div><dt>Evidence and availability</dt><dd>The supplied dataset has seasonal and missing details. Web evidence and price ranges help, but do not guarantee live hours, inventory or reservations. Source validation checks provenance, not every claim’s meaning.</dd></div>
        <div><dt>Richer collaboration</dt><dd>Explore places and files can enter chat context. Selecting a day, stop or cost directly for a revision would make collaboration more precise. Broader discovery and clearer comparisons would give travellers more ways in.</dd></div>
        <div><dt>Speed and planning quality</dt><dd>Research-heavy turns can be slow. I would measure latency and failure patterns, improve retrieval and context loading, and run a broader acceptance suite. An evaluation harness exists; full live coverage and judge calibration remain incomplete.</dd></div>
        <div><dt>Production readiness</dt><dd>I deliberately kept the demo account-free to focus on the planning experience. Anyone with a trip link can view and edit it. Authentication, finer permissions, operational monitoring and broader usability testing remain future work.</dd></div>
      </dl>
      <p>I would start with route feasibility and a focused evaluation set. That would make the plan more dependable before expanding how much the agent can do.</p>
    </section>
    <section id="building-with-ai" aria-labelledby="building-with-ai-title">
      <h2 id="building-with-ai-title">AI was also part of building it.</h2>
      <p>I used AI coding assistants for research synthesis, design exploration, implementation, tests and debugging. Through iterative review, I shaped the product around a readable plan, clear information ownership and an environment the agent could work in. This explanatory page was also drafted and implemented with AI assistance.</p>
      <p>The result demonstrates an end-to-end approach: define a useful artifact, build the environment around it, then give the agent the guidance and tools to create and improve it.</p>
    </section>
  </>;
}

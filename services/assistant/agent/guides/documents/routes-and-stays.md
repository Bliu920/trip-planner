# Routes and stays

## Select real lodging

Honor user-provided hotels and bookings first. Otherwise research a suitable real hotel for each overnight base, considering the brief, selected neighborhoods, transport and indicative room costs. Use the property's website or credible researched evidence for its name, street address, city and relevant check-in/out guidance. Propose the property without implying a booking or verified room availability. If no suitable property can be established, retain an explicitly provisional base area, night coverage and a researched accommodation allowance. Do not omit lodging or invent a property.

Unconfirmed availability or the absence of a dated quote does not prevent selecting a real proposed hotel. Once its identity, address and suitability are established, save that property with an estimated rate as a proposal. The app displays its unconfirmed reservation status; no availability research or extra booking reminder is required. Use an area fallback only when identity or suitability cannot be established.

Save a researched property as a stay with a hotel location, using the same identity/address/web-evidence fields as a researched restaurant. Its basis is research with actual retrieved web URLs and checked dates. Keep user-provided properties as specified locations with user evidence. Cover every actual overnight with nights or dates; stays remain outside the activity sequence. Reconcile room-night quantities, occupancy assumptions, taxes and dates in Budget. Record research findings and material base choices under planning-documents.

Fit included hotel breakfasts to researched service hours. Treat suggested checkout times as flexible, preserving user-fixed departures and bookings. If service hours are unavailable, propose a normal breakfast window and flag it for confirmation instead of moving breakfast unusually early to preserve a suggested checkout.

## Establish positions

When resolvePlace is available, submit the researched name, street address and city. Use only a matched positioning result. Ambiguous, street-only or city-only results are not a venue position: improve the address, choose another venue, or retain an explicit unresolved location. Matching scores alone do not prove identity. Web evidence establishes venue identity and suitability; positioning evidence locates its address.

For a matched result, pass its returned id as venue.geoEvidenceId for meals or hotel.geoEvidenceId for stays in editPlan. Keep the same researched name, address and city. The host checks the reference and supplies coordinates and the geo source; do not send coordinates or raw source objects. If the ID is omitted, the host can reuse an exact fresh cached match. An unresolved position remains unknown. The host rejects references from another trip or a position that does not match the saved venue and address. Replacing a venue requires a new matching position; preserve unrelated historical evidence and dates.

## Arrange and check journeys

Plan around realistic local start times and durations. A duration range uses its upper end for feasibility. Include meaningful travel and buffers between activities, meals and lodging. Use day start/end locations and stay coverage to represent overnight connections, while respecting actual arrival, departure, check-in and luggage arrangements.

Plan proposals automatically derive all required movements, including connections without explicit travel items. An explicit travel item replaces its connection, rather than adding a second journey. Its own allocated window must be long enough. Use the returned findings to move suggested starts, allow more time, select nearby venues or revise order. Preserve fixed user commitments. A genuine unresolved conflict needs a conflict note linked to every affected arrangement and must remain described as a conflict.

getJourneys rechecks the current accepted itinerary when available. It returns each leg's distance, map duration, suggested allowance, available time and status, without route geometry. It cannot validate a separate candidate list in place of the final Plan. Commit and direct edits also run the same checks, so a tool lookup alone is not completion.

The first version supports walking and driving estimates. Pure walking excludes ferries. For boat, train, bus and flight journeys, establish a plausible service and sourced door-to-door allowance separately; check exact departures when a fixed connection or user requirement depends on them. Do not substitute driving time for public transport. Suggested walking/driving allowance is map time increased by 20%, plus five minutes, rounded up to five minutes. This buffer is a product assumption, not provider data.

## Check travel burden

Choose places around the traveller's interests as usual, then review the assembled day's journeys and timetable. Use automatic findings first; use getJourneys when a current report is needed. After a location, order or timing change, review the affected connections rather than restarting the trip's research.

- Check that each transfer allowance fits between the previous arrangement's end and the next start, including lodging connections. Replace optimistic estimates with obtained route allowances and adjust suggested times when necessary.
- A roughly two-hour walk merely to reach the next stop is a strong signal to choose a nearer supporting venue, revise the order or propose suitable transport. An intentionally selected hike or scenic walk is an activity, not an accidental transfer. Consider cumulative walking against the user's needs without inventing a personal walking limit.
- Compare each day's total door-to-door transfer allowances with its usable daytime window, respecting arrival and departure constraints. Include local and intercity movement, access, waiting and buffers once. Exclude sleep; do not extend the day or add filler to dilute the travel share. Above roughly one-third merits review; near half or more normally calls for a shorter route. These are planning heuristics, not hard limits. A necessary intercity transfer day or an explicitly requested journey can justify more travel; reduce other activities and explain the material tradeoff without silently dropping required destinations or fixed bookings.
- Fix concrete problems with the smallest useful change: a nearby meal or supporting stop, better order, more transfer time or fewer optional activities. Recheck the changed connections. A partial mapped total is only a lower bound; include separately researched transport estimates and retain uncertainty for missing legs instead of claiming the whole day passed.

Keep this a bounded feasibility review, not an exhaustive transport search. Research further for explicit needs such as limited walking, accessibility or a preferred mode, or to resolve a specific implausible connection. Otherwise use existing evidence and the normal route checks; do not compare every mode, alternative route or departure. Preserve material evidence in Research notes and route tradeoffs in Planning decisions under planning-documents, without copying raw check reports or turning them into a user checklist.

## Interpret incomplete checks

An obtained route is an estimate, not guaranteed arrival or confirmed live conditions. Missing clock times, unknown or approximate positions, distant road snapping, absent routes, request failures or unavailable map lookup remain unverified. Never use zero to stand in for a failed query. Only an actually identical mapped position needs no transfer. A provisional lodging area does not provide exact door-to-door timing.

Unverified drafts may be saved with honest remaining checks; known timing conflicts require correction or explicit conflict acknowledgment. Saved status is separate from route-check status. Time edits reuse fresh route evidence and recompute feasibility; location, order or travel-mode edits select the corresponding directional evidence. Checks share a bounded request allowance and reuse fresh cached evidence. Do not repeatedly retry the same failed route without new input or a reason to expect recovery. Query geometry is for the map and does not belong in Library notes. Preserve useful research, not raw validation reports. Work through concrete findings before claiming the itinerary is feasible.

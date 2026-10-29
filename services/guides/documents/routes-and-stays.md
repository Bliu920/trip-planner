# Routes and stays

## Select real lodging

Honor user-provided hotels and bookings first. Otherwise research a suitable real hotel for each overnight base, considering the brief, selected neighborhoods, transport and indicative room costs. Use the property's website or credible researched evidence for its name, street address, city and relevant check-in/out guidance. Propose the property without implying a booking or verified room availability. If no suitable property can be established, retain an explicitly provisional base area, night coverage and a researched accommodation allowance. Do not omit lodging or invent a property.

Save a researched property as a stay with a hotel location, using the same identity/address/web-evidence fields as a researched restaurant. Its basis is research with actual retrieved web URLs and checked dates. Keep user-provided properties as specified locations with user evidence. Cover every actual overnight with nights or dates; stays remain outside the activity sequence. Reconcile room-night quantities, occupancy assumptions, taxes and dates in Budget. Record research findings and material base choices under planning-documents.

## Establish positions

When resolvePlace is available, submit the researched name, street address and city. Use only a matched positioning result. Ambiguous, street-only or city-only results are not a venue position: improve the address, choose another venue, or retain an explicit unresolved location. Matching scores alone do not prove identity. Web evidence establishes venue identity and suitability; positioning evidence locates its address.

For matched evidence, preserve the returned id as location.geoEvidenceId and add a source of type geo with evidenceId equal to that id. Set longitude and latitude from the returned payload.coordinates in that order. Never invent IDs or coordinates. Unknown coordinates remain null. The host rejects references from another trip or a position that does not match the saved venue and address. Replacing a venue requires a new matching position; preserve unrelated historical evidence and dates.

## Arrange and check journeys

Plan around realistic local start times and durations. A duration range uses its upper end for feasibility. Include meaningful travel and buffers between activities, meals and lodging. Use day start/end locations and stay coverage to represent overnight connections, while respecting actual arrival, departure, check-in and luggage arrangements.

Plan proposals automatically derive all required movements, including connections without explicit travel items. An explicit travel item replaces its connection, rather than adding a second journey. Its own allocated window must be long enough. Use the returned findings to move suggested starts, allow more time, select nearby venues or revise order. Preserve fixed user commitments. A genuine unresolved conflict needs a conflict note linked to every affected arrangement and must remain described as a conflict.

getJourneys rechecks the current accepted itinerary when available. It returns each leg's distance, map duration, suggested allowance, available time and status, without route geometry. It cannot validate a separate candidate list in place of the final Plan. Commit and direct edits also run the same checks, so a tool lookup alone is not completion.

The first version supports walking and driving estimates. Pure walking excludes ferries; boat, train, bus and flight journeys need separate timetable and door-to-door research. Do not substitute driving time for public transport. Suggested walking/driving allowance is map time increased by 20%, plus five minutes, rounded up to five minutes. This buffer is a product assumption, not provider data. Check single long walks and the returned partial/full daily walking total against user needs; do not infer a personal walking limit.

## Interpret incomplete checks

An obtained route is an estimate, not guaranteed arrival or confirmed live conditions. Missing clock times, unknown or approximate positions, distant road snapping, absent routes, request failures or unavailable map lookup remain unverified. Never use zero to stand in for a failed query. Only an actually identical mapped position needs no transfer. A provisional lodging area does not provide exact door-to-door timing.

Unverified drafts may be saved with honest remaining checks; known timing conflicts require correction or explicit conflict acknowledgment. Saved status is separate from route-check status. Time edits reuse fresh route evidence and recompute feasibility; location, order or travel-mode edits select the corresponding directional evidence. Checks share a bounded request allowance and reuse fresh cached evidence. Do not repeatedly retry the same failed route without new input or a reason to expect recovery. Query geometry is for the map and does not belong in Library notes. Preserve useful research, not raw validation reports. Work through concrete findings before claiming the itinerary is feasible.

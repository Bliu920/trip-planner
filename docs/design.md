# Trip Planner design

Status: discovery in progress. This document records confirmed preferences; remaining references and layout choices are still under review.

## Confirmed direction

- Minimal interface structured through text, alignment, spacing, and thin lines.
- Italian flag palette: green, white, and red. Blue is rejected.
- Clean sans-serif typography.
- Flat white or off-white base surfaces. No gradients or fancy background effects.
- For dashboard views, arrange distinct modules on a clear background. Every text element and image must belong to a purposeful module or control.
- Use color selectively to make important content stand out and distinguish modules. Keep most surfaces neutral; fewer colors than the dashboard reference are acceptable.
- Balance useful detail with breathing room. Avoid both crowded modules and sparse decorative layouts.
- No oversized decorative numbers. Numbering must convey useful sequence or information, not serve as ornament.

## Reference decisions

### Minimalistic list

Source: `.local/inspirations/minimalistic-list.png`.

Keep the minimal use of text and lines. Reject the gradient, its colors, and the large row numbers. Translate this into compact text-led lists with restrained separators, without prominent numeric columns. Exact spacing and sizing remain to be established in the preview.

### Modular travel dashboard

Source: `.local/inspirations/inspiration-1.webp`.

Use this as the layout reference if a dashboard view is needed. The user likes the clear separation between background and modules, purposeful placement, selective color, visual hierarchy, spacing, and moderate information density.

- Group related information into clearly bounded modules on a white or off-white base.
- Use module size, placement, and restrained color to establish hierarchy; avoid giving every module equal visual emphasis.
- Keep supporting modules neutral and reserve stronger color for information that deserves attention. The reference's exact colors and number of colors are not requirements.
- Give text and imagery a clear location and purpose. Avoid detached decorative elements.
- Preserve enough detail to make each module useful while leaving comfortable space between and within modules.

This reference does not establish a need for budget, weather, flight, or packing features. Module content follows the trip planner's actual scope. Exact corner radii and navigation remain open.

## Proposed palette application

The latest preview uses white surfaces, green primary actions, and small red accents, with dark neutral text. This distribution is a proposal; the flag colors themselves are confirmed. Preview values: green `#007A3D`, white `#FFFFFF`, red `#CD212A`.

## Open design work

- Review `inspiration-2.jpg`, `side-bar.jpg`, and `agent-ui-minimal.jpg`, one at a time.
- Resolve workspace layout, component treatments, and responsive behavior from the reference discussion.
- Build the component and page preview after the design direction is agreed.

# FloodFlow landing design research

Reviewed 10 October 2026. These sources inform layout decisions; they do not substantiate FloodFlow product capabilities.

## Applied principles

- [Nielsen Norman Group: Visual Hierarchy in UX](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/): use scale, contrast and proximity to communicate priority. The landing page has one dominant headline, one primary action and a quieter secondary action, rather than competing card-sized messages.
- [Nielsen Norman Group: Homepage Design Principles](https://www.nngroup.com/articles/homepage-design-principles/): identify the product, its purpose and the next action immediately. The hero describes photo, location and vehicle reporting; reporting links lead to the existing `/report` experience.
- [Nielsen Norman Group: Photos as Web Content](https://www.nngroup.com/articles/photos-as-web-content/): favor relevant imagery with information value over decorative stock photographs. Flood/rain road photography establishes the actual context; illustrative UI is explicitly presented as an example.
- [web.dev: Typography](https://web.dev/learn/design/typography): bound fluid heading sizes with `clamp`, use readable paragraph measures and unitless line height, and retain device/user flexibility.
- [W3C: Reduced Motion Technique C39](https://www.w3.org/WAI/WCAG22/Techniques/css/C39.html): respect operating-system motion preferences. Scroll reveals and smooth in-page navigation are enhancements; all content remains visible without JavaScript and reduced-motion users receive static content.
- [W3C: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): provide comfortably spaced interactive targets. Main actions and navigation use 44px or larger heights, exceeding the 24px minimum criterion.

## Commercial page references

- [Tomorrow.io](https://www.tomorrow.io/), inspected in a browser at 1280px: dark media-led hero, prominent headline, concise explanation, clear primary/secondary actions, and detailed product demonstrations farther down the page. Applied the hierarchy and product-demo approach, without borrowing its customer claims or imagery.
- [Apple iPhone](https://www.apple.com/iphone/), reviewed page content: short product-led statements paired with large relevant product media, then detailed evidence and explanation. Applied the change of pace between introduction and product detail, without copying its wording or assets.
- [FlowGuard Solutions](https://flowguardsolutions.com.ng/), user-supplied reference, separately inspected by the collaborating designer. Its domain-specific positioning and section structure informed the environmental product direction. See the implementation handoff for that designer's detailed observations.

## Product claim boundary

The existing report screen supports local photo/location/vehicle reports. Shared reporting, water-depth assessment and hazard-aware routing are not implemented. Landing content must not present those as available, fabricate testimonials or live incident activity, or imply that the interface determines a safe crossing.

# Teamergency Design System

> Before making any Teamergency UI change, read this file first.
> This file is the canonical source of truth for typography, spacing, geometry,
> layout rhythm, and anti-AI-slop principles.
>
> Where an approved existing Teamergency component conflicts with a generic
> rule, preserve the approved component unless the user explicitly requests a redesign.

## 1. Design direction

Teamergency uses an editorial, typographic-first visual system. Interfaces should feel deliberate, calm, and task-focused.

Prioritize:

- strong typography hierarchy
- deliberate whitespace
- flat surfaces
- sharp content cards
- restrained borders
- clear alignment and page rhythm
- reusable components and shared tokens

Avoid:

- generic SaaS card stacking
- card inside card
- unnecessary shadows or colored glow
- glassmorphism and backdrop blur
- random gradients
- excessive pills and rounded containers
- giant empty dashboard panels
- equal-weight blocks and CTAs
- tiny unreadable labels
- decorative UI without a clear purpose

The structural direction is inspired by the approved OFF+BRAND reference. Teamergency keeps its own brand identity, palette, content, and product behavior.

## 2. Brand

Canonical brand colors:

```css
--brand-blue: #2755C0;
--brand-red: #EC3138;
```

Dark mode uses a black or near-black canvas. Light mode uses a neutral light canvas. Blue and red are accents for brand, selection, primary actions, and genuinely semantic states.

Do not reintroduce purple, magenta, pink gradients, or unrelated reference colors into the application UI.

Landing-specific artwork may use localized blue/red atmospheric treatment. That artwork is not a shared internal-page surface system.

## 3. Typography

Use one safe, system-first UI stack. Do not bundle proprietary font files.

```css
font-family:
  -apple-system,
  BlinkMacSystemFont,
  "SF Pro Text",
  Inter,
  "Segoe UI",
  sans-serif;
```

The intended feel is clean, geometric, editorial, academic, and soft.

### Approved type scale

| Role | Size | Line height | Letter spacing |
| --- | ---: | ---: | ---: |
| Caption | 11px | 1.4 | 0.55px |
| Body small | 15px | 1.4 | 0.15px |
| Body | 18px | 1.4 | 0.23px |
| Subheading | 34px | 1 | 0.44px |
| Heading small | 46px | 1 | 0.6px |
| Heading | 70px | 0.8 | 0.91px |
| Heading large | 76px | 0.8 | 0.99px |
| Display | 103px | 0.8 | 1.34px |

Use the smallest appropriate role. Internal task pages are more compact than the Landing page. Do not invent arbitrary sizes without a clear component reason.

### Weights

- body and metadata: `400`
- labels: `500`
- controls and navigation: `500–600`
- card and request titles: `600`
- section and page headings: `600–700`
- deliberate brand/display exceptions: allowed only where intentional

Avoid ordinary UI weights of `800`, `850`, or `900`.

## 4. Spacing and layout

Preferred spacing scale:

```css
--spacing-5: 5px;
--spacing-6: 6px;
--spacing-8: 8px;
--spacing-15: 15px;
--spacing-19: 19px;
--spacing-30: 30px;
--spacing-32: 32px;
--spacing-46: 46px;
--spacing-76: 76px;
--spacing-119: 119px;
```

Use:

- page max-width: `1400px`
- standard card/content padding: approximately `30px`
- standard element gap: approximately `19px`
- large section rhythm: `76–119px`

Internal pages may use tighter spacing when density and usability require it, but spacing should still derive from this scale.

Use available desktop width intentionally. Tablet layouts should wrap naturally. Mobile layouts should become single-column where appropriate without horizontal overflow.

## 5. Geometry

Canonical radii:

- cards and content surfaces: `0px`
- links: `10px`
- inputs: `10px`
- buttons: `10px`
- badges and chips: compact rounding only when their semantics justify it

Do not make ordinary content cards rounded by default. A radius must have a clear interaction or semantic reason.

## 6. Surfaces and borders

Internal surfaces are flat. Establish hierarchy with background tone, a subtle 1px border, typography, spacing, and alignment.

Dark mode:

- near-black canvas
- neutral dark surfaces
- white or off-white primary text
- readable gray secondary text
- subtle neutral borders

Light mode:

- neutral light canvas
- white or light-neutral surfaces
- dark primary text
- readable secondary text
- subtle gray borders

Geometry must remain the same across themes. Never use dark-mode text tokens on light surfaces.

Avoid box shadows, colored glow, glass blur, backdrop filters, and card-in-card elevation systems on internal task pages. A very subtle neutral shadow is acceptable only where it materially improves hierarchy.

## 7. Buttons

Use shared button types:

- **Primary:** Teamergency blue
- **Secondary:** neutral surface and border
- **Destructive:** Teamergency red only for genuinely destructive actions
- **Quiet/Ghost:** low-priority actions with no heavy fill

Standard buttons use a `10px` radius, `14–15px` text, and `500–600` weight. Use flat fills, clear hover/pressed states, and visible focus states.

Avoid gradients, glow, oversized controls, and multiple equal-priority primary CTAs.

## 8. Inputs and filters

Inputs, selects, textareas, search fields, and filters use:

- `10px` radius
- neutral border
- clean surface
- readable placeholder text
- clear focus-visible treatment
- no colored outer glow

Reuse approved shared components. If Discover has the approved filter/search behavior, reuse it for Collabs and other pages rather than creating a page-specific filter system.

Utility controls remain static unless a task explicitly approves another behavior.

## 9. Cards and content blocks

Cards are not the default answer. First ask whether spacing, typography, alignment, or a divider communicates the hierarchy more clearly.

When a card is useful:

- use a sharp `0px` radius
- use a subtle border
- use no shadow or glow
- use approximately `30px` padding where the content density allows

Do not nest cards unnecessarily or create a separate visual system for every page.

## 10. Page structure

Internal pages generally use a clear main title and optional short description. Do not add redundant page-name eyebrows above a title that already identifies the page. Small labels are allowed when they provide real structure, but they are not a substitute for readable section headings.

Important internal sections should generally use readable `15–18px` headings at `600` weight. Micro labels may use `11px` uppercase tracked text when their meaning is clear.

Preserve approved page layouts and user flows. Restyle shared visual systems before introducing new markup or page-specific patterns.

## 11. Motion

Utility controls remain static:

- search bars
- filters
- tabs
- buttons
- form controls

Approved motion exceptions:

- Landing intro typography
- My Classes bidirectional class-card reveal
- Discover bidirectional profile-card reveal

My Profile has no animation. Always respect `prefers-reduced-motion: reduce`; animated elements must become immediately visible with no transform, blur, or delay.

## 12. Landing exception

Landing may remain more expressive than internal task pages. It may use:

- blue/red atmospheric artwork
- refractive rings and lens visuals
- localized glow
- larger display typography
- page-load typography animation

Do not carry those effects into My Classes, Discover, Collabs, Connections, My Profile, or request-detail pages. Internal pages inherit the design system, not the Landing artwork.

## 13. Responsive behavior

Preserve hierarchy across breakpoints:

- desktop: use available width intentionally
- tablet: wrap and reflow naturally
- mobile: stack content when appropriate

Do not force desktop grids onto mobile, create horizontal overflow, or invent unrelated mobile-only typography systems.

## 14. Anti-AI-slop checklist

For every future UI task:

1. Inspect the existing approved component and cascade first.
2. Reuse an existing component or token before creating a new one.
3. Make the smallest effective change.
4. Remove obsolete CSS instead of stacking overrides.
5. Prefer typography, spacing, alignment, and borders over decorative effects.
6. Keep controls task-focused and immediately usable.
7. Avoid generic filler copy and duplicate information.
8. Avoid arbitrary sizes, radii, gradients, glow, and nested containers.
9. Preserve approved components when a generic rule conflicts with them.
10. Check light/dark, responsive, and reduced-motion behavior before handoff.

## 15. Change discipline

Before changing UI, read this file and inspect the current implementation. Preserve functionality, i18n meaning, navigation, authentication, and data behavior unless the user explicitly requests a change.

Do not execute SQL automatically. Do not modify Supabase automatically. Do not commit, push, or deploy unless the user explicitly requests it.

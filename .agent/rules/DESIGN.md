# Design System Document: The Observational Monolith (Light Edition)

## 1. Overview & Creative North Star
**Creative North Star: "The Clinical Architect"**

The objective of this design system is to evolve the interface from a standard "dashboard" into a high-precision instrument. We are moving away from the generic "SaaS Blue" aesthetic toward a sophisticated, editorial Light Mode that feels like a physical piece of laboratory equipment or a high-end architectural blueprint.

By utilizing **Intentional Asymmetry** and **Tonal Depth**, we break the "template" look. We reject the standard 1px border-all-around approach in favor of "Observational Monoliths"—sections of the UI that feel carved out of a single block of material through subtle shifts in light and value. The experience should feel professional, technical, and authoritative.

---

## 2. Colors & Surface Logic
The palette is built on a foundation of "Cool Slates" and "Technical Blues." We utilize a Material Design-inspired token system but apply it with an editorial eye.

### Primary Palette
*   **Surface (Primary Background):** `#F7F9FB` – A crisp, cool-toned gray that provides more depth than a stark `#FFFFFF`.
*   **Primary (Accents):** `#0059BB` – A refined, high-contrast blue that ensures WCAG 2.1 AA compliance against light surfaces.
*   **On-Surface (Text):** `#191C1E` – A deep charcoal that maintains maximum readability without the harshness of pure black.

### The "No-Line" Rule
To achieve a premium feel, **prohibit 1px solid borders for general sectioning.** Structural boundaries must be defined through background color shifts.
*   **Technique:** Place a `surface-container-low` (#F2F4F6) element inside a `surface` (#F7F9FB) background to define a zone.
*   **Exception:** Use a "Ghost Border" (1px line using `outline-variant` at 20% opacity) only when high-density data requires a hard guide for the eye.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Each layer indicates a change in functional priority:
1.  **Level 0 (Base):** `surface` (#F7F9FB) - The main canvas.
2.  **Level 1 (Sections):** `surface-container-low` (#F2F4F6) - Large content areas or side navigation.
3.  **Level 2 (Cards/Widgets):** `surface-container-highest` (#E0E3E5) - Interactive components that need to "pop."
4.  **Level 3 (Popovers):** `surface-container-lowest` (#FFFFFF) - Floating elements that sit "closest" to the user.

---

## 3. Typography
The system uses a dual-font strategy to balance technical precision with modern editorial flair.

*   **Display & Headlines (Space Grotesk):** This typeface provides the "Observational Monolith" feel. Its geometric, slightly idiosyncratic letterforms (like the 'G' and 'y') suggest a custom, high-end technical interface. 
    *   *Role:* Headline-LG (2rem) down to Headline-SM (1.5rem). Use tight letter-spacing (-0.02em) for headlines.
*   **Body & Labels (Inter):** The workhorse. Known for its exceptional legibility at small sizes.
    *   *Role:* Title, Body, and Label scales. Use `body-md` (0.875rem) as the default for console data.
*   **Hierarchy Note:** Use `tertiary` (#9E3D00) sparingly for "Warning" states or high-interest data points to break the blue/gray monochrome and guide the eye to critical metrics.

---

## 4. Elevation & Depth
We reject the "floating" drop-shadow look of the early 2010s. Depth in this system is achieved through **Tonal Layering** and **Ambient Light**.

*   **The Layering Principle:** Softness is key. To elevate a card, do not reach for a shadow first; reach for a lighter surface token. A `#FFFFFF` card on a `#F2F4F6` background creates a natural, clean lift.
*   **Ambient Shadows:** If a component must float (e.g., a Modal or Tooltip), use a highly diffused shadow: `box-shadow: 0px 12px 32px rgba(25, 28, 30, 0.06);`. The shadow color must be a derivative of `on-surface` (#191C1E) to feel natural.
*   **Glassmorphism:** For the side navigation or top-level overlays, use a backdrop-blur (12px) with a semi-transparent `surface` color at 80% opacity. This makes the "Monolith" feel integrated into the environment rather than separate from it.

---

## 5. Components

### Side Navigation
The navigation should be treated as a distinct "Monolith." Use `surface-container-low` (#F2F4F6) with a 1px `outline-variant` (10% opacity) on the right-hand side only. This creates a clear vertical axis without boxing in the design.

### Buttons
*   **Primary:** Background: `primary` (#0059BB); Text: `on-primary` (#FFFFFF). Use `md` (0.375rem) roundedness. Avoid gradients here; keep it a flat, authoritative slab of color.
*   **Secondary:** Background: `secondary-container` (#D5E3FC); Text: `on-secondary-container` (#57657A).
*   **Tertiary (Ghost):** No background. Use `primary` (#0059BB) for text. These should be used for low-priority actions like "Cancel."

### Input Fields
*   **Visual Style:** Use `surface-container-highest` (#E0E3E5) for the field background with no border. On focus, add a 1px bottom border using `primary` (#0059BB). This mimics a "fill-in-the-blank" technical form.

### Cards & Data Lists
*   **Forbid Dividers:** Do not use horizontal lines between list items. Instead, use a vertical spacing of `spacing-4` (0.9rem) or a subtle alternating background (`surface` vs `surface-container-low`).
*   **Data Density:** Use `label-sm` (0.6875rem) in `on-surface-variant` (#414754) for metadata headers. Ensure all numbers are set in Inter with tabular-nums enabled for alignment.

---

## 6. Do’s and Don’ts

### Do
*   **Do** use `spacing-10` (2.25rem) and `spacing-12` (2.75rem) for section breathing room. High-end design requires "wasteful" space.
*   **Do** use `surface-dim` (#D8DADC) for inactive or disabled containers to maintain the monolithic weight.
*   **Do** use the `0.25rem` (DEFAULT) roundedness scale for a sharp, professional look.

### Don’t
*   **Don’t** use pure black (#000000) for text. It breaks the "light-filled" aesthetic. Use `on-surface`.
*   **Don’t** use heavy shadows. If you think it needs a shadow, try a different surface color first.
*   **Don’t** use "Standard Blue" (#007BFF) if it fails contrast ratios. Always stick to the `primary` (#0059BB) token for interactive elements.
*   **Don’t** center-align everything. The Console should feel like a high-end ledger; stick to strong left-aligned grids with intentional right-aligned data points.
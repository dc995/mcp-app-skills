---
name: redesign-existing-projects
description: Upgrades existing websites and apps to premium quality. Audits current design, identifies generic AI patterns, and applies high-end design standards without breaking functionality. Works with any CSS framework or vanilla CSS.
---

# Redesign Existing Projects

Upgrade an existing website or app without changing its framework or breaking
its behavior. Audit the current interface, identify generic patterns, and apply
focused design improvements in the existing stack.

## Prerequisites

* Access to the project's source, dependency manifest, and test commands
* A runnable local development or preview environment
* Browser inspection or screenshot tooling for desktop and mobile validation

## Quick Start

1. Scan the codebase to identify the framework, styling method, design system,
   and existing component patterns.
2. Diagnose the interface with the audit below.
3. Prioritize the smallest changes with the highest visual impact.
4. Implement targeted upgrades without changing the framework.
5. Run the project's tests and inspect the result at desktop and mobile sizes.

## Design Audit

### Typography

Check for these problems and fix them:

* Replace browser defaults or ubiquitous fonts with type that suits the product.
* Give display text clear presence through size, weight, and line-height.
* Limit prose to roughly 65 characters per line and use readable line-height.
* Use medium and semibold weights to create hierarchy between regular and bold.
* Use tabular figures or a monospaced face for data-heavy numbers.
* Balance wrapping so headings and paragraphs do not leave orphaned words.
* Keep compact panels and dashboards typographically dense and scannable.

### Color and Surfaces

* Replace pure black with a considered off-black when the design is dark.
* Keep accents controlled and consistent with the product's subject matter.
* Use one coherent gray family instead of mixing warm and cool neutrals.
* Remove generic purple-blue AI gradients unless the brand requires them.
* Tint shadows to match the surrounding palette and use one lighting direction.
* Add restrained texture or imagery when a flat surface feels unfinished.
* Keep light and dark sections intentional rather than alternating arbitrarily.

### Layout

* Break unnecessary symmetry when hierarchy or content benefits from asymmetry.
* Replace generic equal-card rows with layouts that reflect content importance.
* Use `min-height: 100dvh` instead of `height: 100vh` for full-screen sections.
* Prefer CSS Grid for reliable multi-column structures.
* Constrain wide content with a suitable maximum width.
* Use cards only where a framed or elevated object communicates hierarchy.
* Align shared elements across comparable items using stable dimensions.
* Apply optical alignment when mathematical centering looks incorrect.

### Interactivity and States

* Add visible hover, pressed, focus, loading, empty, and error states.
* Keep focus indicators visible for keyboard users.
* Use inline errors instead of `window.alert()`.
* Remove dead links or expose them as unavailable controls.
* Indicate the active page or view in navigation.
* Use `transform` and `opacity` for animation where possible.
* Honor `prefers-reduced-motion` for nonessential motion.

### Content

* Replace placeholder names and companies with contextual, believable examples.
* Use organic sample values instead of suspiciously perfect round numbers.
* Remove generic AI copywriting and describe the actual product or action.
* Write direct success and error messages without exclamation marks or gimmicks.
* Use active voice and sentence case.
* Replace lorem ipsum with realistic draft copy.

### Component Patterns

* Remove the default border-shadow-white-card treatment when spacing suffices.
* Use command buttons only for commands; use links for navigation.
* Replace decorative pill badges with quieter status treatments when appropriate.
* Prefer inline editing or side panels over unnecessary modals.
* Use stable control dimensions so content changes do not shift the layout.
* Simplify footer navigation to the paths users actually need.

### Iconography and Assets

* Use the project's existing icon system and keep stroke weight consistent.
* Avoid cliche icon metaphors when a direct symbol exists.
* Add a branded favicon where the project lacks one.
* Use real, inspectable product or subject imagery instead of atmospheric stock.
* Give meaningful images useful alternative text.

### Code Quality

* Prefer semantic HTML over generic container markup.
* Keep styles in the project's styling system rather than mixing inline styles.
* Use responsive constraints instead of hardcoded fixed widths.
* Establish a small z-index scale instead of arbitrary large values.
* Remove commented-out and debugging code before completion.
* Verify every new import exists in the dependency manifest.
* Add appropriate title, description, and social metadata for public pages.

### Strategic Omissions

Check for common missing pieces:

* Privacy and terms links where the product requires them
* Back navigation for every non-root view
* A useful not-found page
* Client-side form validation
* A skip-to-content link
* Consent handling where required by jurisdiction

## Upgrade Techniques

Choose techniques that fit the product rather than applying them by default:

* Purposeful variable-font transitions
* Outlined-to-filled display text
* Text masks using relevant imagery or video
* Broken-grid or asymmetric composition
* Deliberate negative space
* Sticky card stacks or split-screen scrolling
* Staggered entry and scroll-driven reveals
* Spring motion for interactions that need physicality
* Restrained glass, spotlight borders, grain, or tinted shadows

## Fix Priority

Apply changes in this order when the current design has no stronger constraint:

1. Improve typography.
2. Clean up the color palette.
3. Complete interaction states.
4. Correct layout and spacing.
5. Replace generic components.
6. Add loading, empty, and error states.
7. Polish the type scale and visual rhythm.

## Rules

* Work with the existing technology stack.
* Preserve existing functionality and public behavior.
* Check the dependency manifest before importing a library.
* Confirm the Tailwind version before changing Tailwind configuration.
* Use vanilla CSS when the project has no frontend framework.
* Keep changes focused and reviewable.
* Test after each bounded change.

> Adapted from the MIT-licensed redesign skill by Leonxlnx. See `LICENSE`.
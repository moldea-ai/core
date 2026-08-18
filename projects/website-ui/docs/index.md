---
title: Website UI foundations
navigationTitle: Overview
description: Shared Astro and Tailwind foundations for moldea public websites.
order: 0
---

# Shared foundations without shared site identity

`@moldea.ai/website-ui` centralizes the visual and interactive contracts that must stay consistent between moldea public websites. It owns semantic design tokens, common global classes, accessible action controls, theme behavior, base-aware navigation primitives, indeterminate client-navigation progress, and static local search behavior.

The package does not own complete headers, footers, page layouts, site metadata, navigation structure, generated documentation content, marketing copy, public assets, canonical origins, or persistence keys. Those contracts remain with each website so the shared package does not turn distinct applications into a single coupled layout.

## Public boundaries

- `styles.css` provides Tailwind, the Ubuntu Sans variable font, shared tokens, global focus behavior, responsive shells, action states, prose, tables, light/dark themes, and reduced-motion behavior.
- `tokens.css` exposes the design tokens without the global component layer when a consumer needs only the theme contract.
- `site`, `search`, and `theme` expose framework-neutral TypeScript utilities.
- component subpaths expose source Astro components that are compiled by the consuming Astro application, including `navigation-progress` for Astro `ClientRouter` preparation feedback.

Use the generated API reference for the exact TypeScript utility surface and the package README for component entry points.

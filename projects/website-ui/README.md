# `@moldea.ai/website-ui`

Shared Astro foundations for moldea public websites.

The package owns the reusable design tokens, global website primitives, interaction states, base-path and theme utilities, and small accessible Astro components used by the package and skill websites. Each website continues to own its page composition, navigation copy, content generation, SEO identity, public assets, site URL, and theme storage key.

## Install after release

```bash
pnpm add @moldea.ai/website-ui@1.1.0
```

The package currently supports Astro `7.2.2` and Tailwind CSS `4.3.3` exactly. Import the shared stylesheet once from the website's global stylesheet:

```css
@import '@moldea.ai/website-ui/styles.css';
```

Tailwind scans the shipped Astro components through the package stylesheet's explicit source declaration.

## Utilities

```typescript
import { searchDocuments } from '@moldea.ai/website-ui/search';
import { withBase } from '@moldea.ai/website-ui/site';
import { isDarkTheme } from '@moldea.ai/website-ui/theme';
```

`parseSearchDocuments` accepts only complete search records with safe root-relative result URLs. Base-path failures and invalid generated search indexes throw `WebsiteUiConfigurationException` with stable error codes.

## Components

Every component has a dedicated public subpath:

- `@moldea.ai/website-ui/action-button`
- `@moldea.ai/website-ui/action-link`
- `@moldea.ai/website-ui/brand-logo`
- `@moldea.ai/website-ui/breadcrumbs`
- `@moldea.ai/website-ui/inline-brand-text`
- `@moldea.ai/website-ui/local-search`
- `@moldea.ai/website-ui/navigation-progress`
- `@moldea.ai/website-ui/theme-bootstrap`
- `@moldea.ai/website-ui/theme-control`

`ThemeBootstrap` belongs in the document head before rendered content. Pass the same app-owned storage key to `ThemeControl`. Mount `NavigationProgress` once near the start of the document body in websites that use Astro's `ClientRouter`; it reports client navigation preparation without taking ownership of the app's layout. `BrandLogo` receives app-owned asset paths and labels rather than embedding one site's identity. `LocalSearch` receives app-owned copy, routes, and the generated index URL.

## Development

From the monorepo root:

```bash
pnpm --filter @moldea.ai/website-ui typecheck
pnpm --filter @moldea.ai/website-ui build
pnpm --filter @moldea.ai/website-ui test:unit
pnpm --filter @moldea.ai/website-ui test:integration
pnpm --filter @moldea.ai/website-ui test
```

The integration suite verifies the packed public surface and a real Astro consumer fixture. Publishing the package is a separate release operation and is not part of ordinary website development.

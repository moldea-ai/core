# Packages website

`@moldea.ai/packages-website` is the private Astro application that renders the public technical documentation for the open-source `moldea` packages ecosystem. It is an application under `/apps/**`, not a first-class package, npm artifact, package-catalog entry, or source of package compatibility truth.

## Source model

The build discovers immediate public implemented projects from `/projects/**`, validates their manifests and package-owned `docs/**`, derives dependencies from manifests, extracts API reference data from actual public TypeScript exports, and reads adapter status only through the repository's strict parser for `compatibility/runtimes.yaml`.

The ignored `.generated/model.json` file is a deterministic build cache. Do not edit it. Authored website content is limited to landing-page framing, components, design-system tokens, accessibility labels, and other presentation concerns. Package behavior belongs in each project's docs; adapter compatibility belongs in the matrix.

## Commands

Run these from the repository root:

| Command                                                 | Purpose                                                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm website:dev`                                      | Generate the content model and run Astro locally.                                        |
| `pnpm docs:generate`                                    | Write the ignored deterministic content model.                                           |
| `pnpm docs:check`                                       | Validate discovery, docs, exports, adapters, and routes without writing source.          |
| `pnpm website:build`                                    | Generate, build static HTML and the local search index, then validate artifact links.    |
| `pnpm website:check`                                    | Run the complete non-browser website verification sequence.                              |
| `pnpm --filter @moldea.ai/packages-website test:e2e`    | Run focused browser accessibility, theme, navigation, search, and 320px overflow checks. |
| `pnpm --filter @moldea.ai/packages-website check:links` | Revalidate an existing production artifact.                                              |

The default build inputs are `SITE_URL=https://packages.moldea.ai` and `BASE_PATH=/`, matching the established custom-domain deployment. Set both values explicitly to build for another mount point, such as `SITE_URL=https://moldea-ai.github.io BASE_PATH=/packages/` for the GitHub project-site URL. Internal links, assets, canonical metadata, Open Graph images, sitemap URLs, search results, robots, and `llms.txt` are all derived from these inputs.

## Design and rendering

The application uses Astro static output, Tailwind CSS 4's CSS-first configuration, Ubuntu Sans Variable, local Lucide Astro icons, and semantic OKLCH tokens recreated from the current platform UI. Light and dark themes have distinct token sets. Visible prose renders standalone `moldea` references as inline code so the product name remains distinct from surrounding copy. The pre-paint initializer applies system or persisted preference before rendering, while small browser scripts own theme selection, mobile-native disclosure behavior, reduced-motion-aware route transitions, and the generated local search index. Core documentation remains ordinary static HTML when JavaScript is disabled.

The sibling platform repository is a design and specification reference only. The build never imports it, links it as a workspace, fetches private files, or requires it in CI.

## Deployment

Pull requests build and verify the site without deploying it. Relevant pushes to `main` rebuild from the exact pushed commit, read the configured origin and base path from GitHub Pages, pass those values to Astro and the artifact checks, upload `apps/website/dist` with GitHub's official Pages artifact action, and deploy through the `github-pages` environment. The workflow is separate from npm publication.

If Pages has never been enabled, a repository owner must once select **GitHub Actions** under **Settings → Pages → Build and deployment → Source**. Normal publication is automatic after that setting; no recurring manual dispatch or artifact promotion is required.

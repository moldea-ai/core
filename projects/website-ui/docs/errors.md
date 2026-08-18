---
title: Website UI errors
navigationTitle: Errors
description: Stable configuration exception contracts exposed by Website UI.
order: 1
---

# Configuration errors

`WebsiteUiConfigurationException` extends `Exception` from `error-message-utils` and exposes one of these stable contracts:

- `INVALID_BASE_PATH`: The website base path contains unsupported URL characters.
- `INVALID_SEARCH_INDEX`: The documentation search index is invalid.

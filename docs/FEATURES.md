# LiteGPX Features

This is the active feature and use-case index. Each feature doc is intentionally small: one description, concrete code references, verification commands or scripts, and one Gherkin scenario.

Related docs:

- [PRODUCT.md](PRODUCT.md) for product contract and non-goals.
- [DATA.md](DATA.md) for route/map data ownership and generated artifacts.
- [../AGENTS.md](../AGENTS.md) for workspace workflow and rules.
- [docs/archive/](archive/) for superseded narrative notes that are no longer active contracts.

## Feature Docs

- [Mobile offline navigation](features/mobile-offline-navigation.md)
- [Mobile app settings](features/mobile-app-settings.md)
- [Data service route corridor generation](features/data-service-route-corridor-generation.md)
- [Data service provider enrichment](features/data-service-provider-enrichment.md)
- [Web route creation](features/web-route-creation.md)
- [Web GPX import and editing](features/web-gpx-import-editing.md)
- [Web mobile route management](features/web-mobile-route-management.md)
- [Web map data management](features/web-map-data-management.md)
- [Web mobile workspace save](features/web-mobile-workspace-save.md)
- [Web planning detail download](features/web-planning-detail-download.md)

## Update Rules

- Update the matching feature doc whenever behavior changes.
- Keep code references pointed at the owning file after refactors.
- Prefer adding or updating one simple scenario over expanding long narrative docs.

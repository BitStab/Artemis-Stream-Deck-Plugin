# Marketplace revision notes

New Marketplace product build **0.7.0**.

Changes made for Elgato review feedback:

- Product name changed from `Artemis-RGB` to `Artemis RGB Controller`.
- Plugin UUID is `com.it-stecher.artemis-rgb-controller`.
- Manifest/package version is `0.7.0` / `0.7.0.0`.
- Property Inspector help/status text now uses styled cards instead of unstyled free text.
- Property Inspector filenames changed to avoid stale UI caching.
- `Stream Deck +` branding spacing normalized in visible English strings.
- Node debug mode removed from the release manifest.

## Marketplace revision fix: variable labels

- Variable technical keys are now independent from Stream Deck display labels.
- Editing the display label no longer updates the Artemis JSON schema title.
- Existing Artemis variable names/titles remain unchanged when the Stream Deck label is edited.
- The Property Inspector calls this field **Display label** to make the distinction explicit.

- Boolean Variable Button states now use dynamic OFF/ON toggle icons; non-boolean variables keep the neutral icon.

## Native Property Inspector revision

The three Property Inspectors were reworked to integrate more closely with the Stream Deck application UI:

- custom colored information panels removed
- compact, neutral status indicators
- Stream Deck / SDPI-styled buttons
- native-looking section separators
- theme-neutral custom styling using inherited colors and `color-scheme`
- equal-width Min / Max fields retained
- compact Host / Port layout
- unobtrusive help text with information indicator
- explicit Save Settings control while retaining automatic persistence
- separate cache-busting Property Inspector paths

The plugin version is `0.7.0.0` for the new Marketplace product.

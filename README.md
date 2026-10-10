# Artemis-RGB Stream Deck Plugin
<img width="1774" height="887" alt="Artemis RGB Controller Setup" src="https://github.com/user-attachments/assets/acb48463-77ab-42e3-a6e1-35f1fc5c6dde" />

Control [Artemis RGB](https://artemis-rgb.com/) directly from an Elgato Stream Deck or Stream Deck+.

This plugin provides profile switching and configurable Artemis JSON variables for both regular Stream Deck keys and Stream Deck+ dials. It communicates with Artemis through its local Web API and is designed to keep the Stream Deck workflow simple while leaving RGB logic inside Artemis.

> Current development version: **0.6.6-dev**

---

<img width="1774" height="887" alt="Artemis RGB Controller – Neon UI-Banner" src="https://github.com/user-attachments/assets/a2634f88-0736-4cdd-82c6-d22dfe987a4f" />

## Features

### Profile Select

Load an Artemis profile directly from your Stream Deck.

**On a regular key**
- Select an Artemis profile in the Property Inspector.
- Press the key to load that profile.

**On a Stream Deck+ dial**
- Rotate the dial to browse available Artemis profiles.
- Press the dial to load the selected profile.

When a profile is loaded, the plugin uses Artemis' profile suspension API to make the selected profile exclusive:
- all other profiles are suspended;
- the selected profile is unsuspended.

This provides a simple "select one active profile" workflow.

---
<img width="1774" height="887" alt="Artemis RGB Controller Workflow" src="https://github.com/user-attachments/assets/1c236423-5a16-4d56-b45c-e045e524c9ff" />

### Variable Button

Create or control Artemis JSON variables from a regular Stream Deck key.

Supported scalar types:

| Type | Button behavior |
| --- | --- |
| `boolean` | Toggle between `false` and `true` |
| `number` | Toggle between Target A and Target B |
| `integer` | Toggle between Target A and Target B |
| `string` | Toggle between Target A and Target B |
| `enum` | Toggle between two configured values |

Examples:

```text
Gaming Mode
false <-> true
```

```text
Brightness
25% <-> 100%
```

```text
Lighting Mode
Ambient <-> Gaming
```

For numeric variables, the schema can also contain:
- minimum;
- maximum;
- default value;
- suffix.

The suffix is display metadata used by the plugin, for example `%`, `°C`, `x`, or `ms`.

---

### Variable Dial

Control Artemis variables with a Stream Deck+ encoder.

Supported types:

#### Number / Integer

Rotate the dial to increase or decrease the value.

Available settings:
- Minimum
- Maximum
- Step
- Default
- Suffix

Example:

```text
RGB Brightness
Min:     0
Max:     100
Step:    5
Default: 100
Suffix:  %
```

Dial behavior:

```text
30% -> 35% -> 40% -> 45%
```

Pressing the dial resets the variable to its configured default value.

#### Boolean

- Rotate right: `ON`
- Rotate left: `OFF`
- Press: toggle `ON / OFF`

#### String / Enum

Rotate through the available values.

Example:

```text
Static
Breathing
Rainbow
Reactive
```

If the Artemis JSON schema contains an `enum`, the plugin automatically uses those values as dial options.

---

## Artemis JSON Variables

The plugin uses the official **JSON Modules Web API** provided by Artemis.

By default, variables can be stored inside a module such as:

```text
streamdeck
├── gamingMode
├── brightness
├── effectSpeed
└── lightingMode
```

These variables become part of the Artemis data model and can then be used inside Artemis profiles, for example for:
- activation conditions;
- layer conditions;
- effect parameters;
- brightness values;
- effect speed;
- mode selection;
- custom logic.

### Automatic variable creation

Variables do not need to be created manually in Artemis.

When creating a new variable from the Stream Deck Property Inspector, the plugin can create or extend the Artemis JSON schema automatically.

Supported schema types:
- `boolean`
- `number`
- `integer`
- `string`

For numeric variables, the plugin can also store:
- `minimum`
- `maximum`
- `multipleOf` for the dial step
- `default`
- `x-suffix`

---

## Delete Variables

Unused variables can be removed directly from the Property Inspector.

1. Select an existing Artemis variable.
2. Click **Delete selected variable**.
3. Confirm the deletion.

Only the selected property is removed from the JSON module schema. Other variables in the same module remain untouched.

---

## Connection Settings

The Artemis connection is shared globally by all plugin actions.

Default configuration:

```text
Protocol: http
Host:     127.0.0.1
Port:     9696
```

The host and port can be changed from the Property Inspector.

This also allows the plugin to connect to an Artemis instance running on another machine, provided the Artemis Web Server is configured to allow remote access and the network/firewall configuration permits it.

---

## Required Artemis Features

The following Artemis Web API features are required.

### Profiles Web API

Required for:
- reading profile categories;
- reading profiles;
- suspending / unsuspending profiles;
- Profile Select.

### JSON Modules Web API

Required for:
- creating JSON modules;
- creating variables;
- updating variable schemas;
- writing variable values;
- deleting variables.

Make sure these features are installed and enabled in Artemis before using the corresponding Stream Deck actions.

---

## Stream Deck Actions

| Action | Keypad | Stream Deck+ Dial | Description |
| --- | :---: | :---: | --- |
| Profile Select | Yes | Yes | Select and load an Artemis profile |
| Variable Button | Yes | No | Toggle or switch between variable target values |
| Variable Dial | No | Yes | Adjust numeric values or cycle through variable states |

---

## Localization

The plugin includes localization for all Stream Deck plugin languages currently supported by the project:

- English
- German
- Spanish
- French
- Japanese
- Korean
- Simplified Chinese
- Traditional Chinese

Localization includes:
- action names;
- action tooltips;
- Property Inspector labels;
- runtime feedback;
- dial trigger descriptions;
- status messages.

English is used as the fallback language.

---

## Icons

The plugin uses a minimal Material-style icon set designed for good readability on small Stream Deck displays.

Current visual mapping:

| Action | Icon concept |
| --- | --- |
| Profile Select | Layers |
| Variable Button | Toggle |
| Variable Dial | Tune |
| Plugin category | Palette |

Icons are intentionally simple and high-contrast to remain readable on both regular Stream Deck keys and Stream Deck+ displays.

---

## Installation

### Development installation

Requirements:
- Elgato Stream Deck software 7.1 or newer
- Node.js 24
- npm
- Artemis RGB with the required Web API features

Clone the repository and install dependencies:

```bash
npm install
```

Build the plugin:

```bash
npm run build
```

For development with automatic rebuild/restart:

```bash
npm run watch
```

The development script rebuilds the plugin and restarts:

```text
com.it-stecher.artemis-rgb
```

---

## Project Structure

```text
artemis-rgb/
├── src/
│   ├── actions/
│   │   ├── profile-select.ts
│   │   ├── variable-button.ts
│   │   └── variable-dial.ts
│   ├── artemis/
│   │   ├── artemis-client.ts
│   │   └── artemis-types.ts
│   └── plugin.ts
│
├── com.it-stecher.artemis-rgb.sdPlugin/
│   ├── manifest.json
│   ├── *.html
│   ├── imgs/
│   └── locale files
│
├── rollup.config.mjs
├── package.json
└── tsconfig.json
```

The Artemis HTTP communication is intentionally kept behind `ArtemisClient` instead of being spread throughout individual actions.

---

## How Profile Selection Works

The official Artemis Profiles Web API currently exposes profile suspension rather than a dedicated "force activate" endpoint.

For that reason, loading a profile works by:

```text
1. Read all profiles
2. Suspend every other profile
3. Unsuspend the selected profile
```

For normal profiles this provides the expected exclusive profile-switching behavior.

### Profiles with activation conditions

If a profile contains its own Artemis activation condition, unsuspending it does not necessarily force the condition to become true.

A future Artemis companion plugin may provide a stronger direct profile/layer control API if required.

---

## Variable State Handling

Artemis JSON modules are implemented internally as dynamic data-model children.

The current official Artemis Data Model Web API does not expose these dynamic child values in a way that can be reliably used for round-trip synchronization.

Because of this, the Stream Deck plugin stores the last value it wrote as persistent action state and synchronizes that state back to Artemis.

This means:

- button toggles remain deterministic;
- dial values survive Stream Deck restarts;
- values created and controlled by this plugin remain consistent.

### Current limitation

If the same JSON variable is changed externally inside another application, the Stream Deck plugin may not automatically detect that change.

True bidirectional runtime synchronization would require additional support on the Artemis side.

---

## Example Setup

### Gaming mode button

Create a Boolean variable:

```text
Module:   streamdeck
Variable: gamingMode
Type:     boolean
```

The button toggles:

```text
false <-> true
```

Inside Artemis, use `gamingMode` as a condition for a gaming-specific layer or effect.

---

### Brightness dial

Create a Number variable:

```text
Module:   streamdeck
Variable: brightness
Type:     number

Min:      0
Max:      100
Step:     5
Default:  100
Suffix:   %
```

The Stream Deck+ dial can then adjust the value in 5% steps.

Inside Artemis, bind the variable to the desired brightness or effect parameter.

---

### Lighting mode dial

Create a String/Enum variable containing:

```text
Ambient
Gaming
Reactive
Off
```

Rotating the dial cycles through the available modes.

Artemis can use the selected value in profile or layer conditions.

---

## Troubleshooting

### Artemis profiles do not appear

Check that:
- Artemis is running;
- the configured host and port are correct;
- the Artemis Web Server is enabled;
- the **Profiles Web API** feature is enabled.

Default endpoint:

```text
http://127.0.0.1:9696/profiles
```

---

### JSON variables do not appear

Check that the **JSON Modules Web API** feature is enabled.

The plugin expects the JSON Modules controller under:

```text
/json-modules
```

---

### A dial action does not appear in Stream Deck

Make sure you are browsing the **Dials** tab in the Stream Deck action list.

`Variable Dial` is intentionally registered only for encoders.

`Variable Button` is intentionally registered only for regular keys.

---

### Changes to the plugin are not visible

During development, Stream Deck may cache manifest, localization, icon, or Property Inspector resources.

Try:

```bash
streamdeck restart com.it-stecher.artemis-rgb
```

For manifest or localization changes, completely restarting the Stream Deck application may also be required.

---

## Current Limitations

- No direct Artemis layer API is currently exposed by the official Web API.
- Layer enable/disable control is therefore not yet implemented.
- Direct layer-property editing is not yet implemented.
- External changes to JSON variable runtime values are not automatically synchronized back to Stream Deck.
- Profile loading relies on suspend/unsuspend behavior provided by the official Profiles Web API.

---

## Planned Features

Possible future additions include:

- direct layer selection;
- layer enable / disable / toggle;
- layer property control;
- better two-way variable synchronization;
- Artemis companion plugin for advanced control;
- additional Stream Deck+ feedback layouts;
- optional JSON module cleanup when the last variable is deleted;
- automatic capability detection for available Artemis Web API features.

---

## Technology

The Stream Deck plugin is built with:

- TypeScript
- Node.js
- `@elgato/streamdeck`
- `@elgato/cli`
- SDPI Components
- Rollup
- native `fetch()`
- Artemis Web API

---

## Contributing

Issues, testing feedback, translations and pull requests are welcome.

When reporting a problem, please include:
- Stream Deck software version;
- Artemis version;
- plugin version;
- action type;
- relevant Stream Deck plugin log output;
- whether the issue occurs on a regular key, Stream Deck+ dial, or both.

---

## Disclaimer

This is an independent integration for Artemis RGB and Elgato Stream Deck.

Artemis RGB and Elgato Stream Deck are trademarks or products of their respective owners.

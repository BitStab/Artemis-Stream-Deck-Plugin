# Artemis RGB Controller

Control Artemis RGB profiles and variables directly from Elgato Stream Deck and Stream Deck +.

## Features

- **Profile Select** — press a key to load a profile, or rotate a Stream Deck + dial to choose one and press to load it.
- **Variable Button** — control Boolean, number, integer, string and enum-style Artemis JSON variables from a key. Numeric and string values can switch between Target A and Target B.
- **Variable Dial** — adjust number/integer variables with Min, Max, Step, Default and Suffix; toggle Boolean values; cycle through string/enum choices.
- **Variable management** — create and delete JSON variables from the Property Inspector.
- **Localization** — English, German, Spanish, French, Japanese, Korean, Simplified Chinese and Traditional Chinese.

## Artemis requirements

Enable the official Artemis Web API features:

- **Profiles Web API** for profile selection
- **JSON Modules Web API** for variable actions

Default connection:

```text
http://127.0.0.1:9696
```

Host, port and protocol are configurable in the Property Inspector.

## Actions

| Action | Key | Dial |
| --- | :---: | :---: |
| Profile Select | Yes | Yes |
| Variable Button | Yes | No |
| Variable Dial | No | Yes |

## Development

Requirements: Stream Deck 7.1+, Node.js 24, npm and Artemis RGB.

```bash
npm install
npm run build
```

Development mode:

```bash
npm run watch
```

Plugin UUID: `com.it-stecher.artemis-rgb-controller`

## Current limitations

- The official Artemis Web API does not currently expose direct layer control.
- JSON variable changes made externally may not automatically synchronize back to Stream Deck.
- Profile selection uses the Artemis suspend/unsuspend API.

## Disclaimer

This is an independent integration for Artemis RGB and Elgato Stream Deck. Artemis RGB and Elgato Stream Deck are products or trademarks of their respective owners.

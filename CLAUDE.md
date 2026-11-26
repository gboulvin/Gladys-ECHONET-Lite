# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for **ECHONET Lite**, the Japanese
home network protocol (UDP port 3610) spoken by air conditioners, water
heaters, lights, smart meters, solar inverters, batteries... It is a Node.js
service (Node 22+, ESM, no build step) running in its own sandboxed Docker
container, talking to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency, and to the devices over the LAN. Local only: no
cloud, no account. It started from the official template
[integration-template-js](https://github.com/GladysAssistant/integration-template-js).

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/integration.test.js      # one file
node --test --test-name-pattern "motion"  # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing.

## Architecture

```
index.js                          SDK wiring only: handlers registered before connect()
src/integration.js                runtime: discovery, polling, commands, scene triggers, health
src/echonet/frame.js              ECHONET Lite frames, property maps (pure, no I/O)
src/echonet/client.js             UDP client: port 3610, TID matching, per-node queue, retries
src/echonet/classes.js            supported device classes: EPC <-> Gladys feature mapping
src/echonet/manufacturers.js      manufacturer codes, product code, identification number
src/discovery.js                  core broadcast + configured hosts + subnet sweep, node description
src/devices.js                    ECHONET object <-> Gladys device (external ids, params)
src/actions.js                    manifest `actions` (Configuration screen buttons)
src/scenes.js                     scene action handlers (manifest `scene_actions`)
src/widgets.js                    dashboard widget handlers (manifest `widgets`)
src/i18n.js                       user-facing messages, en / fr / de / es
src/config.js                     DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
gladys-assistant-integration.json manifest: name, config_schema, actions, scenes, widgets...
docs/{en,fr,de,es}.md             user documentation, re-hosted by Gladys (en + fr mandatory)
test/                             node --test, fake Gladys (SDK) + simulated ECHONET network
test/helpers/simulator.js         in-memory ECHONET Lite nodes answering Get / SetC
.github/scripts/release.mjs       release helpers (manifest bump, changelog), tested in test/
```

## Rules

- **External ids are forever.** A device is
  `gladys.externalIds('echonet', '<node id>-<eoj>')`, the node id being the
  ECHONET identification number (EPC 0x83) or, without one, the IP address.
  Feature keys (`power`, `mode`, `target-temperature`...) are part of the
  external id: never rename one. The same goes for every key users store:
  manifest `config_schema`, `actions`, widget and scene keys.
- **Every feature carries `name`, `min`, `max`, `read_only` and
  `has_feedback`**: Gladys stores them NOT NULL (`test/devices.test.js`
  checks every class).
- **Adding a device class** = one entry in `DEVICE_CLASSES`
  (`src/echonet/classes.js`) with its features (EPC, decode, optional
  setEpc/encode) and its name in the four languages, plus tests in
  `test/classes.test.js`. Gladys value enums (AC mode, fan speed, cover
  state...) come from the Gladys server constants: reuse those of
  `classes.js`.
- **The device params are the source of truth** to reach a device (IP, EOJ,
  property maps): polling and commands must work after a restart without a
  discovery.
- **Network**: the container cannot broadcast to the LAN; broadcast goes
  through `gladys.scanNetwork('udp-active-broadcast')`, everything else is
  unicast to port 3610. Requests to one node stay serialized (the client
  queue): ECHONET adapters drop concurrent requests.
- **Scene triggers** fire on transitions from a known state only (no event on
  the first read), with flat data keys declared in the manifest.
- **The container rootfs is read-only.** Write only under `/data`. Never log
  tokens, passwords or API keys.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow moves the section.
- **Manifest.** Texts are multi-language objects. `keywords` and `countries`
  need `gladys_version` >= 5.3.0, scene and widget fields >= 5.1.0. The
  catalog `description` holds 10 to 100 characters per language.
  `test/manifest.test.js` ties the manifest to the code: change both sides
  together.
- **User-facing text is in four languages: English, French, German and
  Spanish** — manifest texts, messages of `src/i18n.js`, class names, and
  `docs/en.md`, `docs/fr.md`, `docs/de.md`, `docs/es.md`, kept in sync. The
  tests refuse a missing translation.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network: use the simulator.

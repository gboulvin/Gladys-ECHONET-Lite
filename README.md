# ECHONET Lite for Gladys Assistant

External integration for [Gladys Assistant](https://gladysassistant.com) that
controls **ECHONET Lite** devices over the local network: air conditioners,
EcoCute and other water heaters, lights, blinds and shutters, electric locks,
smart electricity meters, solar inverters, storage batteries and sensors.

ECHONET Lite is the home network standard of the Japanese market (Mitsubishi
Electric, Daikin, Panasonic, Sharp, Fujitsu General, Toshiba, HEMS
gateways...). This integration covers the same ground as the Home Assistant
[echonetlite_homeassistant](https://github.com/scottyphillips/echonetlite_homeassistant)
custom component, built on the official
[Gladys integration template](https://github.com/GladysAssistant/integration-template-js)
and SDK.

- **Local only** (manifest `transports: ["local"]`): UDP port 3610, no
  account, no cloud.
- **Languages**: English, French, German, Spanish.
- **Countries**: Japan (`countries: ["JP"]`), where ECHONET Lite devices are
  sold; the integration stays reachable from the catalog search everywhere.
- **Requires Gladys ≥ 5.3.0.**

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md).

## Features

| Surface               | What                                                                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Devices               | air conditioner, water heaters, lights, blinds/shutters, lock, floor heater, smart meter, distribution board, solar, battery, temperature / humidity / presence sensors, on/off for any other class |
| Discovery             | broadcast through the Gladys core, listed IP addresses, optional subnet sweep                                                                                                                       |
| Configuration actions | `discover` (search now), `test_host` (probe one IP address)                                                                                                                                         |
| Scene triggers        | `motion_detected`, `fault_detected`, `device_unreachable`                                                                                                                                           |
| Scene actions         | `set_air_conditioner`, `refresh_device`, `read_property`, `write_property`                                                                                                                          |
| Dashboard widgets     | `devices_status`, `air_conditioner`, `energy`                                                                                                                                                       |

Only the functions a device really offers are created: the integration reads
its Get/Set property maps (EPC 0x9F/0x9E), and a property the device does not
accept from the network is published read-only.

## How it reaches the devices

The integration container sits on a Docker bridge network, which cannot
broadcast to the LAN. Discovery therefore combines:

1. a mediated broadcast: the Gladys core broadcasts the ECHONET Lite
   "self-node instance list" request (manifest `network_discovery`,
   `udp-active-broadcast` on port 3610) and relays the answers;
2. the IP addresses listed in the configuration;
3. optionally, a unicast sweep of a subnet (/22 to /32);
4. the devices already added, so they stay discoverable.

Everything else (Get, SetC) is unicast to port 3610, which crosses the NAT.
The IP address, the ECHONET object (EOJ) and the property maps are stored in
the device params, so polling and commands work right after a restart.

## Project structure

```
.
├─ index.js                     # SDK wiring (no protocol logic)
├─ src/
│  ├─ integration.js            # runtime: discovery, polling, commands, triggers, health
│  ├─ echonet/
│  │  ├─ frame.js               # ECHONET Lite frames and property maps (pure)
│  │  ├─ client.js              # UDP client (port 3610, TID matching, queue, retries)
│  │  ├─ classes.js             # device classes: EPC <-> Gladys features
│  │  └─ manufacturers.js       # manufacturer / product / identification codes
│  ├─ discovery.js              # node discovery and description
│  ├─ devices.js                # ECHONET object <-> Gladys device
│  ├─ actions.js                # Configuration screen buttons
│  ├─ scenes.js                 # scene actions
│  ├─ widgets.js                # dashboard widgets
│  ├─ i18n.js                   # messages in en / fr / de / es
│  └─ config.js                 # config defaults + normalization
├─ docs/{en,fr,de,es}.md        # user documentation
├─ test/                        # node --test, fake Gladys + simulated ECHONET network
├─ gladys-assistant-integration.json
├─ Dockerfile                   # Node 24 Alpine, read-only rootfs ready
├─ CHANGELOG.md · CLAUDE.md · SECURITY.md
└─ .github/workflows/           # CI, Release, multi-arch build, GitHub Releases
```

## Development

```bash
npm install
npm run format:check
npm run lint
npm test
```

The tests run against the fake Gladys of the SDK and an in-memory ECHONET Lite
network (`test/helpers/simulator.js`): they never touch the real network.

Run it locally against a Gladys instance:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="echonet-lite" \
LOG_LEVEL=debug \
npm start
```

Check the store rules before a release:

```bash
npx github:GladysAssistant/integration-store .
```

## Release

Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md),
then run **Actions → Release → Run workflow** (patch, minor or major): the
workflow bumps the version in `package.json` and the manifest, rolls the
changelog, tags, builds the `linux/amd64` + `linux/arm64` image to
`ghcr.io/gboulvin/gladys-echonet-lite` and publishes the GitHub Release.

Add the `gladys-assistant-integration` GitHub topic to the repository so the
store indexer finds it.

## License

Apache-2.0

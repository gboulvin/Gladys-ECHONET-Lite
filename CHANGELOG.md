# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-11-26

### Added

- ECHONET Lite integration for Gladys Assistant, local only (no account, no
  cloud), started from the official JavaScript integration template.
- Discovery of the ECHONET Lite nodes: broadcast through the Gladys core
  (`udp-active-broadcast` on port 3610), IP addresses listed in the
  configuration, optional unicast sweep of a subnet, and a "Test an IP
  address" action.
- Devices: air conditioners (on/off, mode, target temperature, fan speed,
  room and outdoor temperature, humidity), electric and instantaneous water
  heaters, lights (on/off, brightness), blinds and shutters, electric locks,
  floor heaters, smart electricity meters, distribution board meters, solar
  power generation, storage batteries, temperature, humidity and presence
  sensors, and on/off control of any other ECHONET Lite device.
- Only the functions a device really offers are created, read-only when the
  device does not accept them from the network (property maps 0x9E/0x9F).
- Scene triggers: motion detected, device fault, device offline.
- Scene actions: set an air conditioner in one step, refresh a device, read
  or write any ECHONET Lite property.
- Dashboard widgets: devices status, air conditioner (live readings and quick
  controls), energy (grid, solar, battery).
- Per-device "local" / "unreachable" transport badge.
- English, French, German and Spanish texts, manifest and documentation.
- Catalog: `climate`, `energy` and `protocols` categories, search keywords,
  available in Japan.

[Unreleased]: https://github.com/gboulvin/Gladys-ECHONET-Lite/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/gboulvin/Gladys-ECHONET-Lite/releases/tag/v1.0.0

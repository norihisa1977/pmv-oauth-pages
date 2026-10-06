# PMV PWA r1 — Vendored Crypto Asset Manifest

Status: RELEASE-CANDIDATE / NOT ACTIVE
Date: 2026-10-06
Upstream: jedisct1/libsodium.js
Upstream ref: 0.8.4

The ESM wrapper import specifier was changed only from `libsodium-sumo` to `./libsodium-sumo.mjs` so runtime loading is same-origin.

## SHA-256
- libsodium-wrappers.mjs: 5f8560f2d9822d138ca4ff1a63cbb1c378115140f2905438d7458b514cb9f608
- libsodium-sumo.mjs: 4c94708f7e78eac7a32b29e2ce0ff96f4bd599d78c129f27bf8a061e20776c8c
- LICENSE: ce7b8ba14db085aadb72359226ccf7273225db31dad653242a7726a10dabbbd4

## Policy
- Third-party CDN crypto runtime: PROHIBITED
- Runtime dependency origin: SAME-ORIGIN ONLY
- Auto-upgrade: PROHIBITED
- Version: PINNED 0.8.4
- Production activation: NOT AUTHORIZED

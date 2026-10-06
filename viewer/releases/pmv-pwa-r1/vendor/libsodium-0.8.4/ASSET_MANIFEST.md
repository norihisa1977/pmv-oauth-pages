# PMV PWA r1 — Vendored Crypto Asset Manifest

Status: RELEASE-CANDIDATE / NOT ACTIVE
Date: 2026-10-06
Upstream: jedisct1/libsodium.js
Upstream ref: 0.8.4

The ESM wrapper import specifier was changed only from `libsodium-sumo` to `./libsodium-sumo.mjs` so runtime loading is same-origin.

## SHA-256
- libsodium-wrappers.mjs: d996f24dc79373c488309c06b5b0787921357369ee162455b6b17e6fc82d1c11
- libsodium-sumo.mjs: 629719980ba5b49d38432608f95bb270fae599f7dc72bc82f623815aadb4b8c3
- LICENSE: 9ba4b024e039602e304522dfe6225f6cc67e666b371bc97bd346d515f68bfba8

## Policy
- Third-party CDN crypto runtime: PROHIBITED
- Runtime dependency origin: SAME-ORIGIN ONLY
- Auto-upgrade: PROHIBITED
- Version: PINNED 0.8.4
- Production activation: NOT AUTHORIZED

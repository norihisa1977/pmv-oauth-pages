# PMV iPhone PWA Feasibility Evidence — 2026-10-06

STATUS = NON-NORMATIVE
CANONICAL_CHANGE = NONE
PRODUCTION_CHANGE = NONE
PRODUCTION_MEDIA_ACCESS = NONE
PURPOSE = Record completed iPhone Safari feasibility evidence and identify required Production deltas before any Production adoption.

## Hard constraints

- H1: PMV additional recurring cost = 0
- H2: No periodic re-signing or re-installation
- H3: Secret photos/videos viewable on iPhone
- H4: Plaintext media / Production KEK / Media DEK must not be persistently stored
- H5: Loss of iPhone / PWA / browser storage must not destroy existing Recovery Authority and reconstruction must remain possible

## P0 — Browser Capability

RESULT = PASS

Observed on iPhone Safari:
- secureContext = true
- WebAssembly = true
- IndexedDB = true
- WebCryptoSubtle = true
- PublicKeyCredential = true
- ManagedMediaSource = true
- StorageEstimateAPI = true
- StoragePersistAPI = true
- ServiceWorker = true

## P1 — Argon2id

RESULT = PASS
KDF_STRENGTH_PARITY_CANDIDATE = YES

Parameters:
- Argon2id13
- opslimit = 3
- output = 32 bytes

Observed:
- 256 MiB: 3/3 PASS, median 531 ms
- 384 MiB: 3/3 PASS, median 815 ms
- 512 MiB: 3/3 PASS, median 1094 ms

No crash/reload/termination observed during these runs.

## P2 — Synthetic Photo Crypto

RESULT = PASS

Observed:
- XChaCha20-Poly1305-IETF available
- decrypt 3/3 PASS
- wrong key fail-closed PASS
- ciphertext tamper fail-closed PASS
- AAD tamper fail-closed PASS
- memory Blob display PASS
- test code persistent write = NONE
- reload requires re-run/unlock

## P3 — Synthetic Video / Managed Media Source

RESULT = PASS

Observed:
- ManagedMediaSource available
- MIME supported: video/mp4; codecs="avc1.42c00a"
- synthetic encrypted part count = 13
- tampered part fail-closed PASS
- sourceopen PASS
- SourceBuffer created PASS
- append parts 0..12 PASS
- endOfStream PASS
- loadedmetadata PASS
- duration = 120.0 seconds
- seeks 30/60/90 seconds = 3/3 PASS
- playback ended PASS
- waiting events = 0
- stalled events = 0
- media errors = 0
- persistent write by test code = NONE
- P3_MMS_VIDEO = PASS

Note: This PoC proves the browser video path and independent AEAD-part handling. It does not claim byte-for-byte identity with the current Production 5 MiB video segment format.

## P4 — Browser OAuth / Drive Token Model

RESULT = PASS

Origin:
- https://pmv.ishida-cpa.jp

Observed:
- GIS token client init PASS
- requested/granted scope = https://www.googleapis.com/auth/drive.file
- access token received PASS
- bearer token lifetime approximately 3600 seconds
- refresh_token field absent
- access token persistent write by test code = NO
- Drive about.get HTTP 200 / PASS
- simulated expiry performed
- automatic renewal attempted = false
- explicit user gesture required = true
- explicit renew returned a fresh access token PASS
- in-memory token clear PASS
- token revoke request PASS

## P5 — Loss / Recovery

RESULT = PASS

Synthetic wrapper:
- KDF = Argon2id13
- opslimit = 3
- memlimit = 536870912 bytes
- output = 32 bytes
- AEAD = XChaCha20-Poly1305-IETF

Observed after browser-local state loss:
- localStorage = 0
- sessionStorage = 0
- Cache = 0
- IndexedDB = 0
- Google reauthorization access token PASS
- refresh_token field absent
- Drive about.get HTTP 200 / PASS
- external wrapped package present PASS
- remembered synthetic password used PASS
- synthetic KEK reconstructed PASS
- reconstructed KEK zeroized PASS
- browser-local sole recovery secret = false
- Production Recovery Authority touched = NO

## Feasibility classification

PWA_FEASIBILITY = PASS
CLASSIFICATION = FEASIBLE_WITH_DELTA

Hard-constraint disposition:
- H1 = SATISFIABLE
- H2 = SATISFIABLE
- H3 = SATISFIABLE
- H4 = SATISFIABLE_IN_POC
- H5 = SATISFIABLE_IN_POC

Required specification-delta areas:
- D53: Viewer Core / iPhone implementation model
- D54-A: credential and wrapped-key storage model
- D54-B: browser OAuth token model
- D54-C: DPoP disposition for browser path
- DA: Normal Access authority / reconstructability model

## T1 — Viewer code delivery integrity

CURRENT_POC_T1 = UNACCEPTABLE_FOR_PRODUCTION

Reasons:
1. PoC crypto pages load libsodium executable code from jsDelivr.
2. P4/P5 load Google Identity Services JavaScript into the page.
3. Any third-party or mutable remote script executing in the same browsing context as a PMV password or unwrapped key material can read/exfiltrate that material.
4. GitHub Pages delivery itself is a code-delivery trust root and must be explicitly accepted or constrained before Production use.

Production promotion MUST NOT occur until T1 is separately CLOSED.

Minimum T1 design requirements before Production adoption:
- no third-party CDN cryptographic executable code in the key-handling context;
- cryptographic JS/WASM must be self-hosted and release-pinned;
- key-handling page must have a restrictive CSP and no unnecessary third-party script execution;
- Google OAuth code must be isolated from the PMV password / KEK / DEK handling context;
- Production release assets must be immutable/versioned and integrity-verifiable;
- update activation must not silently replace a previously trusted release while key material is live;
- failure of integrity verification must fail closed.

## Production gate

PRODUCTION_AUTHORIZED = NO

Required order:
1. Close T1 design.
2. Produce Evidence -> Impact -> Specification Delta.
3. Explicitly accept Canonical Delta.
4. Only then design a Production migration with rollback and no plaintext migration.

# PMV iPhone PWA Feasibility PoC Acceptance v0.1

NON-NORMATIVE
Date: 2026-10-05
Production data access: PROHIBITED
Canonical change: NONE

## Hard constraints
H1 Additional recurring PMV cost = 0
H2 No periodic re-sign/reinstall requirement
H3 iPhone can view PMV photo/video
H4 No persistent plaintext Media / Production KEK / Media DEK
H5 Loss of iPhone/PWA/browser data must not damage Recovery Authority

## Trust gate
T1 Viewer code delivery integrity status must be classified as ACCEPTABLE / UNACCEPTABLE / UNVERIFIED before Production adoption.

## Delta labels
D53 Viewer Core
D54-A Credential storage
D54-B OAuth token model
D54-C DPoP disposition
DA Authority model

## Mandatory ordering
ACCEPTANCE_THRESHOLDS_FIXED_BEFORE_POC = REQUIRED

## P0 Browser capability gate
PASS requires:
- secureContext = true
- WebAssembly = true
- IndexedDB = true
- WebCrypto subtle = true
- PublicKeyCredential = true
- StorageManager estimate = supported
- At least one of ManagedMediaSource / MediaSource = supported
- No Production PMV data or credentials used

## P1 Argon2id feasibility gate
Test algorithm = Argon2id 1.3, opslimit = 3, output = 32 bytes.
Test memory in ascending order: 256 MiB, 384 MiB, 512 MiB.

Compatibility minimum:
- 256 MiB: 3/3 successful derivations
- no browser crash, reload, OS termination, or allocation failure
- median runtime <= 3000 ms

Windows-equivalence target:
- 512 MiB: 3/3 successful derivations
- no browser crash, reload, OS termination, or allocation failure
- median runtime <= 3000 ms

Classification:
- 512 MiB target PASS => KDF strength parity candidate
- only 256/384 MiB PASS => platform-specific KDF Delta required before Production
- 256 MiB FAIL => PWA password-gated Normal Access KDF infeasible

## P2 Synthetic photo crypto gate
Fixture must be synthetic and generated outside Production.
PASS requires:
- PMV-compatible XChaCha20-Poly1305 decrypt succeeds 3/3
- wrong key fails closed
- ciphertext/tag/AAD tamper fails closed
- plaintext is displayed from memory only
- no automatic write to Photos, Files, Downloads, IndexedDB, Cache Storage, or localStorage
- page reload requires re-unlock
- background/session lifecycle behavior recorded

## P3 Synthetic video gate
Fixture must be synthetic and use PMV-compatible independent AEAD segments.
PASS requires:
- >=120 seconds continuous playback
- zero fatal playback stalls attributable to decrypt/buffer pipeline
- three seeks succeed
- tampered segment fails closed
- no persistent plaintext media file
- peak browser behavior does not terminate/reload the app

## P4 OAuth browser gate
Production media access remains prohibited during this gate.
PASS requires:
- Google Identity Services browser token model works with drive.file
- access token held in memory only
- expired token requires explicit user gesture to renew
- no refresh token stored in browser
- reauthorization UX documented
- D54-B impact recorded

## P5 Loss/recovery gate
PASS requires:
- deleting Home Screen web app/browser storage does not affect Recovery Authority
- no browser-local item is the sole copy of a recovery-critical secret
- reinstallation/reconstruction inputs are explicitly documented

## Production promotion
PoC success does NOT authorize Production use.
Promotion requires Evidence -> Impact -> Specification Delta -> explicit acceptance.

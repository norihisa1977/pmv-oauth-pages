# PC-7A — Ciphertext Wrapper Drive Placement / PWA Retrieval

Status: IMPLEMENTED / RUNTIME EVIDENCE REQUIRED
Date: 2026-10-06
Release candidate: pmv-pwa-r1
Production Viewer activation: NO

## Purpose

Place only the ciphertext-only PWA wrapped Production KEK package in Google Drive
and verify that the iPhone PWA can retrieve and validate the package using the
browser drive.file token model.

## Object identity

Drive object name:
pmv-pwa-wrapped-kek-v1.json

Expected package:
format_id = PMV-PWA-WRAPPED-KEK-V1
vault_id = pmv-v1-production
key_generation = 1
kdf = Argon2id13
kdf_opslimit = 3
kdf_memlimit_bytes = 536870912
kdf_output_bytes = 32
aead = XChaCha20-Poly1305-IETF

## Security boundary

Permitted to upload:
- ciphertext-only wrapper JSON

Prohibited:
- PMV Password
- password-derived wrapping key
- plaintext Production KEK
- Media DEK
- plaintext media
- refresh token

The iPhone retrieval test MUST NOT decrypt the wrapper yet. It verifies only:
- OAuth context isolation
- Drive lookup
- exact one-object selection
- wrapper download
- wrapper structural validation
- expected vault_id / key_generation / AAD binding
- no persistent access-token write by test code

## Acceptance

DRIVE_WRAPPER_OBJECT_CREATED=PASS
DRIVE_WRAPPER_LOOKUP_COUNT=1
DRIVE_WRAPPER_DOWNLOAD=PASS
WRAPPER_FORMAT_VALID=PASS
VAULT_BINDING_VALID=PASS
KEY_GENERATION_BINDING_VALID=PASS
AAD_BINDING_VALID=PASS
PRODUCTION_KEK_DECRYPTED=NO
PRODUCTION_MEDIA_ACCESS=NONE

# PC-5 — Production Normal Access Wrapped KEK Package Format v1

Status: FIXED CANDIDATE FORMAT / RUNTIME VALIDATION REQUIRED
Date: 2026-10-06
Release: pmv-pwa-r1
Production activation: NO
Production KEK access: NONE
Production media access: NONE
Recovery Authority change: NONE

## Purpose
Define the ciphertext-only package format that may later wrap the existing Production KEK for the iPhone PWA Normal Access path. This document does NOT authorize creation of a Production wrapper.

## Format
format_id = PMV-PWA-WRAPPED-KEK-V1
format_version = 1

Required fields:
format_id
format_version
vault_id
key_generation
kdf
kdf_opslimit
kdf_memlimit_bytes
kdf_output_bytes
salt_b64
aead
nonce_b64
aad
wrapped_kek_ciphertext_b64
created_at_utc

## Fixed cryptographic parameters
kdf = Argon2id13
kdf_opslimit = 3
kdf_memlimit_bytes = 536870912
kdf_output_bytes = 32
aead = XChaCha20-Poly1305-IETF
salt length = 16 bytes
nonce length = 24 bytes
wrapped plaintext length = 32 bytes
authentication tag length = 16 bytes
wrapped ciphertext length = 48 bytes

## AAD binding
AAD MUST be the exact UTF-8 sequence:
PMV-PWA-WRAPPED-KEK-V1|vault_id=<vault_id>|key_generation=<key_generation>

No whitespace normalization, case folding, reordering, truncation, alternate separator, or inferred default is permitted.

The stored aad field MUST exactly match the canonical string derived from vault_id and key_generation.

## Key generation binding
key_generation MUST be an integer >= 1.
A wrapper for one key_generation MUST NOT be accepted for another key_generation.
Any mismatch between package key_generation, expected vault key_generation, and AAD key_generation MUST fail closed.

## Vault binding
vault_id MUST be non-empty and exact.
Any mismatch between package vault_id, expected vault_id, and AAD vault_id MUST fail closed.

## Recovery Authority invariant
This wrapper is Normal Access material only.
It MUST NOT replace Recovery Authority, alter the recovery file, become the sole Recovery secret, require media re-encryption, require Production KEK rotation, or modify existing Windows Normal Access wrapping.
Deleting the PWA wrapper MUST leave existing Recovery Authority intact.

## Persistence rule
The package itself is ciphertext-only and MAY be persisted or remotely retrieved only after separate Production Change Control authorization.
The PWA MUST NOT persist PMV Password, password-derived wrapping key, plaintext Production KEK, Media DEK, plaintext media, or Drive access token.

## Fail-closed parser requirements
Reject unknown format_id, unsupported format_version, missing/extra security-critical field, invalid base64, salt length != 16, nonce length != 24, non-canonical KDF parameters, non-canonical AEAD, invalid key_generation, empty vault_id, non-canonical aad, or wrapped ciphertext length != 48 bytes.

## Production gate
No Production wrapped KEK package may be created until:
WRAPPER_FORMAT_FIXED=PASS
AAD_BINDING_FIXED=PASS
KEY_GENERATION_BINDING_FIXED=PASS
RECOVERY_AUTHORITY_INDEPENDENCE=PASS
PC5_RUNTIME_VALIDATION=PASS

# PC-6 — Production PWA Wrapper Creation Execution Plan

Status: EXECUTION AUTHORIZED BY OWNER / NOT YET EXECUTED
Date: 2026-10-06
Release candidate: pmv-pwa-r1

## Fixed Production identity

vault_id = pmv-v1-production
key_generation = 1

Existing Windows Normal Access authority remains:
PMV Password -> Argon2id13(3, 536870912, 32) -> XChaCha20-Poly1305 unwrap -> Production KEK.

Existing Recovery Authority remains independent and unchanged.

## Execution method

PC-6 MUST use the existing Rust Windows Normal Access authority
`windows_normal_access::unlock_production_kek_interactive`
to obtain the already-existing 32-byte Production KEK in process memory.

The Production KEK MUST NOT be:
- printed to stdout/stderr;
- placed in an environment variable;
- written to a temporary plaintext file;
- copied to PowerShell;
- logged.

Immediately after unlock, a separate PWA Normal Access wrapping key is derived from the owner-entered PWA PMV Password using:
- Argon2id13
- opslimit = 3
- memlimit = 536870912
- output = 32 bytes
- independent random 16-byte salt

The existing Production KEK is wrapped with:
- XChaCha20-Poly1305-IETF
- random 24-byte nonce
- exact AAD:
  PMV-PWA-WRAPPED-KEK-V1|vault_id=pmv-v1-production|key_generation=1

The only persistent output is the ciphertext-only package:
%LOCALAPPDATA%\PMV\production_v1\iphone\pwa_wrapped_kek_v1.json

## Required package format

The package MUST conform exactly to PC5_WRAPPED_KEK_FORMAT_V1.md.

## Memory handling

After encryption:
- Production KEK buffer MUST be zeroized.
- PWA wrapping key MUST be zeroized.
- password strings MUST be zeroized as far as supported by the Rust process.
- no plaintext KEK value may be emitted.

## This stage does not

- upload the wrapper to Drive;
- modify Production media;
- modify Windows Normal Access;
- modify the Recovery file;
- rotate the Production KEK;
- activate the PWA Viewer.

## Acceptance

PRODUCTION_KEK_UNLOCK_IN_PROCESS=PASS
PRODUCTION_KEK_STDOUT=NONE
PRODUCTION_KEK_ENV_TRANSFER=NONE
PWA_WRAPPER_CREATED=PASS
WRAPPER_FORMAT_V1=PASS
PRODUCTION_KEK_IDENTITY=UNCHANGED
RECOVERY_AUTHORITY_CHANGED=NO
WINDOWS_NORMAL_ACCESS_CHANGED=NO
PRODUCTION_MEDIA_CHANGED=NO

PC-6 remains OPEN until the ciphertext-only package is created and validated.

# PMV iPhone PWA Feasibility Assessment

STATUS = NON-NORMATIVE
DATE = 2026-10-06
CANONICAL_CHANGE = NONE
PRODUCTION_CHANGE = NONE
PRODUCTION_MEDIA_ACCESS = NONE

## Decision

CLASSIFICATION = FEASIBLE_WITH_DELTA

Completed PoC:
- P0 Browser Capability = PASS
- P1 Argon2id13 512 MiB = PASS
- P2 Synthetic Photo Crypto = PASS
- P3 Synthetic Video / Managed Media Source = PASS
- P4 Browser OAuth / Drive Token Model = PASS
- P5 Loss / Recovery = PASS

Hard constraints:
- H1 additional recurring cost = 0: SATISFIABLE
- H2 no periodic re-sign/reinstall: SATISFIABLE
- H3 iPhone secret photo/video viewing: SATISFIABLE
- H4 no persistent plaintext media / Production KEK / Media DEK: SATISFIABLE_IN_POC
- H5 loss of iPhone/PWA/browser storage must not destroy Recovery Authority: SATISFIABLE_IN_POC

Required Canonical Delta areas:
- D53 Viewer Core / implementation model
- D54-A credential and wrapped-key storage model
- D54-B browser OAuth token model
- D54-C DPoP disposition
- DA authority/recovery reconstruction model
- T1 remote code-delivery Trust Root

Production implementation remains prohibited until T1 and the Canonical Delta are explicitly accepted.

# PMV Drive Visibility Audit CLI

Status: implementation candidate for the `drive.file` Production visibility audit.

## Security boundary

This CLI:

- requires the intended OAuth client ID;
- requires the access token in the process environment as `PMV_DRIVE_ACCESS_TOKEN`;
- verifies token audience/client ID and scope via Google's OAuth tokeninfo endpoint;
- rejects tokens missing `drive.file`;
- rejects tokens containing broad Drive scopes `drive` or `drive.readonly`;
- uses only Drive `files.get(fileId, fields=id,size)` for the visibility test;
- never calls `files.list`;
- never uses `alt=media`;
- never downloads Production media bodies;
- never mutates Production files or permissions;
- classifies 403/404 as `NOT_VISIBLE`, not as deletion.

## Input

UTF-8 text file, one fileId per line. Blank lines and lines beginning with `#` are ignored.

Do not commit Production fileId lists to GitHub.

## Run

```text
PMV_DRIVE_ACCESS_TOKEN=<token> \
cargo run --release -- \
  --input ./file_ids.txt \
  --client-id <expected-client-id>.apps.googleusercontent.com \
  --output ./drive-visibility-audit.json
```

Start with the already-proven representative Production photo's three IDs (record / manifest / encrypted photo blob). Only after that control test passes should the audit be expanded to the Production set.

## Meaning of PASS

`DRIVE_VISIBILITY_AUDIT=PASS` means the audit procedure completed according to this contract. It does **not** mean all target files were visible. Use `ALL_TARGETS_VISIBLE=YES|NO` for that conclusion.

## Evidence fields

The JSON evidence contains the client ID, fixed scope, timestamp, SHA-256 of the input file, counts, and per-ID classification. The access token is never written to evidence.

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$validator = Join-Path $scriptDir "Prepare-PmvPhotoCatalogBackfill.ps1"

if (-not (Test-Path $validator -PathType Leaf)) {
    throw "BACKFILL_DRYRUN_VALIDATOR_MISSING=$validator"
}

& $validator -DryRun

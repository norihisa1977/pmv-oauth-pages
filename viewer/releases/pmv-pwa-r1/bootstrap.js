const status = document.getElementById("status");

function setStatus(lines) {
  status.textContent = Array.isArray(lines) ? lines.join("\n") : String(lines);
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2,"0")).join("");
}

async function sha256Text(text) {
  const bytes = new TextEncoder().encode(text);
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}

async function fetchText(path) {
  const r = await fetch(path, {cache:"no-store", credentials:"omit"});
  if (!r.ok) throw new Error("FETCH_FAILED:" + path + ":" + r.status);
  return await r.text();
}

async function main() {
  const report = [];
  try {
    if (!isSecureContext || !crypto?.subtle) throw new Error("SECURE_CONTEXT_REQUIRED");
    report.push("SECURE_CONTEXT=PASS");

    const manifestResp = await fetch("./release-manifest.json", {cache:"no-store", credentials:"omit"});
    if (!manifestResp.ok) throw new Error("MANIFEST_FETCH_FAILED:" + manifestResp.status);
    const manifest = await manifestResp.json();

    if (manifest.release_id !== "pmv-pwa-r1") throw new Error("RELEASE_ID_MISMATCH");
    report.push("RELEASE_ID=pmv-pwa-r1");
    report.push("MANIFEST_LOAD=PASS");

    const sumoPath = "./vendor/libsodium-0.8.4/libsodium-sumo.mjs";
    const wrapperPath = "./vendor/libsodium-0.8.4/libsodium-wrappers.mjs";

    const [sumoText, wrapperText] = await Promise.all([
      fetchText(sumoPath),
      fetchText(wrapperPath)
    ]);

    const [sumoHash, wrapperHash] = await Promise.all([
      sha256Text(sumoText),
      sha256Text(wrapperText)
    ]);

    const expectedSumoHash = manifest.assets["vendor/libsodium-0.8.4/libsodium-sumo.mjs"].sha256;
    const expectedWrapperHash = manifest.assets["vendor/libsodium-0.8.4/libsodium-wrappers.mjs"].sha256;

    report.push("LIBSODIUM_SUMO_EXPECTED_SHA256=" + expectedSumoHash);
    report.push("LIBSODIUM_SUMO_ACTUAL_SHA256=" + sumoHash);
    report.push("LIBSODIUM_WRAPPER_EXPECTED_SHA256=" + expectedWrapperHash);
    report.push("LIBSODIUM_WRAPPER_ACTUAL_SHA256=" + wrapperHash);

    if (sumoHash !== expectedSumoHash) {
      throw new Error("ASSET_HASH_MISMATCH:libsodium-sumo.mjs");
    }
    if (wrapperHash !== expectedWrapperHash) {
      throw new Error("ASSET_HASH_MISMATCH:libsodium-wrappers.mjs");
    }

    report.push("LIBSODIUM_SUMO_HASH=PASS");
    report.push("LIBSODIUM_WRAPPER_HASH=PASS");

    const sumoBlob = new Blob([sumoText], {type:"text/javascript"});
    const sumoUrl = URL.createObjectURL(sumoBlob);

    const rewrittenWrapper = wrapperText.replace(
      'import e from"./libsodium-sumo.mjs";',
      'import e from"' + sumoUrl + '";'
    );
    if (rewrittenWrapper === wrapperText) throw new Error("WRAPPER_IMPORT_REWRITE_FAILED");

    const wrapperBlob = new Blob([rewrittenWrapper], {type:"text/javascript"});
    const wrapperUrl = URL.createObjectURL(wrapperBlob);

    try {
      const mod = await import(wrapperUrl);
      const sodium = mod.default;
      await sodium.ready;
      if (typeof sodium.crypto_pwhash !== "function") throw new Error("ARGON2ID_API_MISSING");
      if (typeof sodium.crypto_aead_xchacha20poly1305_ietf_decrypt !== "function") throw new Error("XCHACHA_API_MISSING");
      report.push("VERIFIED_LIBSODIUM_IMPORT=PASS");
      report.push("ARGON2ID_API=PASS");
      report.push("XCHACHA20POLY1305_API=PASS");
      report.push("RELEASE_INTEGRITY=PASS");
      report.push("PRODUCTION_DATA_ACCESS=NONE");
      report.push("PRODUCTION_SECRETS_ACCESS=NONE");
      setStatus(report);
    } finally {
      URL.revokeObjectURL(wrapperUrl);
      URL.revokeObjectURL(sumoUrl);
    }
  } catch (e) {
    report.push("RELEASE_INTEGRITY=FAIL");
    report.push("FAIL_CLOSED=PASS");
    report.push("ERROR=" + String(e?.message || e));
    report.push("PRODUCTION_DATA_ACCESS=NONE");
    report.push("PRODUCTION_SECRETS_ACCESS=NONE");
    setStatus(report);
  }
}

main();

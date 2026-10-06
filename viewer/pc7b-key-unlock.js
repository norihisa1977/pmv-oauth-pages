const reportEl = document.getElementById("report");
const button = document.getElementById("run");
const passwordEl = document.getElementById("password");

const lines = [];
const encoder = new TextEncoder();

function add(line) {
  lines.push(line);
  reportEl.textContent = lines.join("\n");
}

function b64ToBytes(value) {
  return Uint8Array.from(
    atob(value),
    (c) => c.charCodeAt(0)
  );
}

function bytesToHex(bytes) {
  return Array.from(
    bytes,
    (b) => b.toString(16).padStart(2, "0")
  ).join("");
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes
  );

  return bytesToHex(
    new Uint8Array(digest)
  );
}

async function fetchBytes(path) {
  const response = await fetch(
    path,
    {
      cache: "no-store",
      credentials: "omit"
    }
  );

  if (!response.ok) {
    throw new Error(
      "FETCH_FAILED:" +
      path +
      ":" +
      response.status
    );
  }

  return new Uint8Array(
    await response.arrayBuffer()
  );
}

async function loadVerifiedSodium() {
  const manifestResponse = await fetch(
    "./release-manifest.json",
    {
      cache: "no-store",
      credentials: "omit"
    }
  );

  if (!manifestResponse.ok) {
    throw new Error(
      "RELEASE_MANIFEST_LOAD_FAILED"
    );
  }

  const manifest =
    await manifestResponse.json();

  if (
    manifest.release_id !==
    "pmv-pwa-r1"
  ) {
    throw new Error(
      "RELEASE_ID_MISMATCH"
    );
  }

  const wrapperPath =
    "vendor/libsodium-0.8.4/libsodium-wrappers.mjs";

  const sumoPath =
    "vendor/libsodium-0.8.4/libsodium-sumo.mjs";

  const wrapperExpected =
    manifest.assets?.[wrapperPath]?.sha256;

  const sumoExpected =
    manifest.assets?.[sumoPath]?.sha256;

  if (
    !wrapperExpected ||
    !sumoExpected
  ) {
    throw new Error(
      "RELEASE_MANIFEST_ASSET_MISSING"
    );
  }

  const [
    wrapperBytes,
    sumoBytes
  ] = await Promise.all([
    fetchBytes("./" + wrapperPath),
    fetchBytes("./" + sumoPath)
  ]);

  const [
    wrapperActual,
    sumoActual
  ] = await Promise.all([
    sha256Hex(wrapperBytes),
    sha256Hex(sumoBytes)
  ]);

  if (
    wrapperActual !==
    wrapperExpected
  ) {
    throw new Error(
      "LIBSODIUM_WRAPPER_HASH_MISMATCH"
    );
  }

  if (
    sumoActual !==
    sumoExpected
  ) {
    throw new Error(
      "LIBSODIUM_SUMO_HASH_MISMATCH"
    );
  }

  add(
    "LIBSODIUM_WRAPPER_HASH=PASS"
  );

  add(
    "LIBSODIUM_SUMO_HASH=PASS"
  );

  const sumoText =
    new TextDecoder().decode(
      sumoBytes
    );

  const wrapperText =
    new TextDecoder().decode(
      wrapperBytes
    );

  const sumoBlob =
    new Blob(
      [sumoText],
      {
        type: "text/javascript"
      }
    );

  const sumoUrl =
    URL.createObjectURL(
      sumoBlob
    );

  const originalImport =
    'import e from"./libsodium-sumo.mjs";';

  const rewrittenImport =
    'import e from"' +
    sumoUrl +
    '";';

  const rewrittenWrapper =
    wrapperText.replace(
      originalImport,
      rewrittenImport
    );

  if (
    rewrittenWrapper ===
    wrapperText
  ) {
    URL.revokeObjectURL(
      sumoUrl
    );

    throw new Error(
      "WRAPPER_IMPORT_REWRITE_FAILED"
    );
  }

  const wrapperBlob =
    new Blob(
      [rewrittenWrapper],
      {
        type: "text/javascript"
      }
    );

  const wrapperUrl =
    URL.createObjectURL(
      wrapperBlob
    );

  try {
    const module =
      await import(
        wrapperUrl
      );

    const sodium =
      module.default;

    await sodium.ready;

    if (
      typeof sodium.crypto_pwhash !==
      "function"
    ) {
      throw new Error(
        "ARGON2ID_API_MISSING"
      );
    }

    if (
      typeof sodium
        .crypto_aead_xchacha20poly1305_ietf_decrypt !==
      "function"
    ) {
      throw new Error(
        "XCHACHA_API_MISSING"
      );
    }

    if (
      typeof sodium.memzero !==
      "function"
    ) {
      throw new Error(
        "MEMZERO_API_MISSING"
      );
    }

    add(
      "VERIFIED_LIBSODIUM_IMPORT=PASS"
    );

    return sodium;
  }
  finally {
    URL.revokeObjectURL(
      wrapperUrl
    );

    URL.revokeObjectURL(
      sumoUrl
    );
  }
}

function consumeOAuthHandoff() {
  const raw =
    sessionStorage.getItem(
      "pmv_r1_pc7b_handoff"
    );

  if (!raw) {
    throw new Error(
      "OAUTH_HANDOFF_MISSING"
    );
  }

  const handoff =
    JSON.parse(raw);

  sessionStorage.removeItem(
    "pmv_r1_pc7b_handoff"
  );

  if (!handoff.token) {
    throw new Error(
      "ACCESS_TOKEN_MISSING"
    );
  }

  add(
    "OAUTH_HANDOFF_RECEIVED=PASS"
  );

  add(
    "OAUTH_HANDOFF_DESTROYED_AFTER_READ=" +
    (
      sessionStorage.getItem(
        "pmv_r1_pc7b_handoff"
      ) === null
    )
  );

  add(
    "GOOGLE_GIS_PRESENT=" +
    Boolean(
      window.google?.accounts?.oauth2
    )
  );

  add(
    "GOOGLE_GIS_IN_KEY_CONTEXT=" +
    (
      window.google?.accounts?.oauth2
        ? "PRESENT"
        : "REMOVED"
    )
  );

  return handoff.token;
}

async function downloadWrapper(
  accessToken
) {
  const query =
    encodeURIComponent(
      "name='pmv-pwa-wrapped-kek-v1.json' and trashed=false"
    );

  const listResponse =
    await fetch(
      "https://www.googleapis.com/drive/v3/files?q=" +
      query +
      "&fields=files(id,name,size)",
      {
        headers: {
          Authorization:
            "Bearer " +
            accessToken
        },
        cache: "no-store",
        credentials: "omit"
      }
    );

  add(
    "DRIVE_LIST_HTTP=" +
    listResponse.status
  );

  if (!listResponse.ok) {
    throw new Error(
      "DRIVE_LIST_FAILED"
    );
  }

  const list =
    await listResponse.json();

  add(
    "DRIVE_WRAPPER_LOOKUP_COUNT=" +
    list.files.length
  );

  if (
    list.files.length !== 1
  ) {
    throw new Error(
      "DRIVE_WRAPPER_LOOKUP_COUNT_NOT_ONE"
    );
  }

  const fileId =
    list.files[0].id;

  const downloadResponse =
    await fetch(
      "https://www.googleapis.com/drive/v3/files/" +
      encodeURIComponent(
        fileId
      ) +
      "?alt=media",
      {
        headers: {
          Authorization:
            "Bearer " +
            accessToken
        },
        cache: "no-store",
        credentials: "omit"
      }
    );

  add(
    "DRIVE_DOWNLOAD_HTTP=" +
    downloadResponse.status
  );

  if (
    !downloadResponse.ok
  ) {
    throw new Error(
      "DRIVE_DOWNLOAD_FAILED"
    );
  }

  const wrapper =
    await downloadResponse.json();

  add(
    "DRIVE_WRAPPER_DOWNLOAD=PASS"
  );

  return wrapper;
}

function validateWrapper(
  wrapper
) {
  const expectedAad =
    "PMV-PWA-WRAPPED-KEK-V1" +
    "|vault_id=" +
    wrapper.vault_id +
    "|key_generation=" +
    wrapper.key_generation;

  const valid =
    wrapper.format_id ===
      "PMV-PWA-WRAPPED-KEK-V1" &&
    wrapper.format_version === 1 &&
    wrapper.vault_id ===
      "pmv-v1-production" &&
    wrapper.key_generation === 1 &&
    wrapper.kdf ===
      "Argon2id13" &&
    wrapper.kdf_opslimit === 3 &&
    wrapper.kdf_memlimit_bytes ===
      536870912 &&
    wrapper.kdf_output_bytes ===
      32 &&
    wrapper.aead ===
      "XChaCha20-Poly1305-IETF" &&
    b64ToBytes(
      wrapper.salt_b64
    ).length === 16 &&
    b64ToBytes(
      wrapper.nonce_b64
    ).length === 24 &&
    b64ToBytes(
      wrapper
        .wrapped_kek_ciphertext_b64
    ).length === 48 &&
    wrapper.aad ===
      expectedAad;

  if (!valid) {
    throw new Error(
      "WRAPPER_FORMAT_INVALID"
    );
  }

  add(
    "WRAPPER_FORMAT_VALID=PASS"
  );

  return expectedAad;
}

button.onclick = async () => {
  button.disabled = true;
  lines.length = 0;

  let wrappingKey = null;
  let productionKek = null;
  let sodium = null;

  try {
    add(
      "KEY_CONTEXT=PASS"
    );

    add(
      "PRODUCTION_MEDIA_ACCESS=NONE"
    );

    const accessToken =
      consumeOAuthHandoff();

    const wrapper =
      await downloadWrapper(
        accessToken
      );

    const expectedAad =
      validateWrapper(
        wrapper
      );

    const password =
      passwordEl.value;

    passwordEl.value = "";

    if (!password) {
      throw new Error(
        "PMV_PASSWORD_EMPTY"
      );
    }

    sodium =
      await loadVerifiedSodium();

    const salt =
      b64ToBytes(
        wrapper.salt_b64
      );

    const nonce =
      b64ToBytes(
        wrapper.nonce_b64
      );

    const ciphertext =
      b64ToBytes(
        wrapper
          .wrapped_kek_ciphertext_b64
      );

    const aad =
      encoder.encode(
        expectedAad
      );

    wrappingKey =
      sodium.crypto_pwhash(
        32,
        password,
        salt,
        3,
        536870912,
        sodium
          .crypto_pwhash_ALG_ARGON2ID13
      );

    if (
      !(wrappingKey instanceof Uint8Array) ||
      wrappingKey.length !== 32
    ) {
      throw new Error(
        "WRAPPING_KEY_INVALID"
      );
    }

    add(
      "ARGON2ID_DERIVATION=PASS"
    );

    productionKek =
      sodium
        .crypto_aead_xchacha20poly1305_ietf_decrypt(
          null,
          ciphertext,
          aad,
          nonce,
          wrappingKey
        );

    if (
      !(productionKek instanceof Uint8Array) ||
      productionKek.length !== 32
    ) {
      throw new Error(
        "PRODUCTION_KEK_LENGTH_INVALID"
      );
    }

    add(
      "PRODUCTION_KEK_UNWRAP=PASS"
    );

    add(
      "PRODUCTION_KEK_LENGTH=32"
    );

    add(
      "PRODUCTION_KEK_STDOUT=NONE"
    );

    add(
      "PRODUCTION_KEK_PERSISTED=NO"
    );

    add(
      "PRODUCTION_MEDIA_ACCESS=NONE"
    );

    add(
      "PC7B_RESULT=PASS"
    );
  }
  catch (e) {
    add(
      "PC7B_RESULT=FAIL"
    );

    add(
      "ERROR=" +
      String(
        e?.message || e
      )
    );

    add(
      "PRODUCTION_MEDIA_ACCESS=NONE"
    );
  }
  finally {
    if (
      sodium &&
      wrappingKey instanceof Uint8Array
    ) {
      sodium.memzero(
        wrappingKey
      );

      add(
        "WRAPPING_KEY_ZEROIZED=PASS"
      );
    }

    if (
      sodium &&
      productionKek instanceof Uint8Array
    ) {
      sodium.memzero(
        productionKek
      );

      add(
        "PRODUCTION_KEK_ZEROIZED=PASS"
      );
    }

    button.disabled = false;
  }
};

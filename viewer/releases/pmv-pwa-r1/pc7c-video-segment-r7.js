const WRAPPER_NAME =
  "pmv-pwa-wrapped-kek-v1.json";

const RECORD_FILE_ID =
  "1Gy7RwaNTMrNRMjTED474i_dhHT5L-oqx";

const MANIFEST_FILE_ID =
  "1LEhe3RCD54ev6L3BPWEUMirtyx1xOc49";

const VIDEO_FILE_ID =
  "1XXTNdwiZ0Eat37mecOhhzYsqBcFf8y-4";

const EXPECTED_VAULT_ID =
  "pmv-v1-production";

const EXPECTED_MEDIA_ID =
  "video-1790512590050-3c3970b5ea1cb8e5";

const EXPECTED_KEY_GENERATION = 1;

const EXPECTED_MANIFEST_OBJECT =
  "049cd24365bb7dfc890a883dfe814ef7.manifest";

const EXPECTED_VIDEO_OBJECT =
  "c25b9f6d47d8fbff1bf8ed526b052899.blob";

const reportEl =
  document.getElementById("report");

const button =
  document.getElementById("run");

const passwordEl =
  document.getElementById("password");

const playbackFrame =
  document.getElementById("playbackFrame");

const clearButton =
  document.getElementById("clear");

let currentPlaybackParts = null;
let activeSodium = null;

const lines = [];
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function add(line) {
  lines.push(line);
  reportEl.textContent = lines.join("\n");
}

function b64ToBytes(value) {
  return Uint8Array.from(
    atob(value),
    c => c.charCodeAt(0)
  );
}

function hexToBytes(value) {
  if (
    typeof value !== "string" ||
    value.length % 2 !== 0
  ) {
    throw new Error("HEX_FORMAT_INVALID");
  }

  const out = new Uint8Array(value.length / 2);

  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(
      value.slice(i * 2, i * 2 + 2),
      16
    );
  }

  return out;
}

function bytesToHex(bytes) {
  return Array.from(
    bytes,
    b => b.toString(16).padStart(2, "0")
  ).join("");
}

async function sha256Hex(bytes) {
  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      bytes
    );

  return bytesToHex(
    new Uint8Array(digest)
  );
}

async function fetchBytes(path) {
  const response =
    await fetch(
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
  const manifestResponse =
    await fetch(
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

  const releaseManifest =
    await manifestResponse.json();

  if (releaseManifest.release_id !== "pmv-pwa-r1") {
    throw new Error("RELEASE_ID_MISMATCH");
  }

  const wrapperPath =
    "vendor/libsodium-0.8.4/libsodium-wrappers.mjs";

  const sumoPath =
    "vendor/libsodium-0.8.4/libsodium-sumo.mjs";

  const wrapperExpected =
    releaseManifest.assets?.[wrapperPath]?.sha256;

  const sumoExpected =
    releaseManifest.assets?.[sumoPath]?.sha256;

  if (!wrapperExpected || !sumoExpected) {
    throw new Error("RELEASE_MANIFEST_ASSET_MISSING");
  }

  const [wrapperBytes, sumoBytes] =
    await Promise.all([
      fetchBytes("./" + wrapperPath),
      fetchBytes("./" + sumoPath)
    ]);

  const [wrapperActual, sumoActual] =
    await Promise.all([
      sha256Hex(wrapperBytes),
      sha256Hex(sumoBytes)
    ]);

  if (wrapperActual !== wrapperExpected) {
    throw new Error("LIBSODIUM_WRAPPER_HASH_MISMATCH");
  }

  if (sumoActual !== sumoExpected) {
    throw new Error("LIBSODIUM_SUMO_HASH_MISMATCH");
  }

  add("LIBSODIUM_WRAPPER_HASH=PASS");
  add("LIBSODIUM_SUMO_HASH=PASS");

  const sumoText =
    decoder.decode(sumoBytes);

  const wrapperText =
    decoder.decode(wrapperBytes);

  const sumoUrl =
    URL.createObjectURL(
      new Blob(
        [sumoText],
        {type: "text/javascript"}
      )
    );

  const originalImport =
    'import e from"./libsodium-sumo.mjs";';

  const rewrittenImport =
    'import e from"' + sumoUrl + '";';

  const rewrittenWrapper =
    wrapperText.replace(
      originalImport,
      rewrittenImport
    );

  if (rewrittenWrapper === wrapperText) {
    URL.revokeObjectURL(sumoUrl);
    throw new Error("WRAPPER_IMPORT_REWRITE_FAILED");
  }

  const wrapperUrl =
    URL.createObjectURL(
      new Blob(
        [rewrittenWrapper],
        {type: "text/javascript"}
      )
    );

  try {
    const module =
      await import(wrapperUrl);

    const sodium =
      module.default;

    await sodium.ready;

    if (
      typeof sodium.crypto_pwhash !== "function" ||
      typeof sodium
        .crypto_aead_xchacha20poly1305_ietf_decrypt !== "function" ||
      typeof sodium.memzero !== "function"
    ) {
      throw new Error("REQUIRED_SODIUM_API_MISSING");
    }

    add("VERIFIED_LIBSODIUM_IMPORT=PASS");
    return sodium;
  }
  finally {
    URL.revokeObjectURL(wrapperUrl);
    URL.revokeObjectURL(sumoUrl);
  }
}

function consumeOAuthHandoff() {
  const raw =
    sessionStorage.getItem(
      "pmv_r1_pc7c_video_handoff"
    );

  if (!raw) {
    throw new Error("OAUTH_HANDOFF_MISSING");
  }

  const handoff =
    JSON.parse(raw);

  sessionStorage.removeItem(
    "pmv_r1_pc7c_video_handoff"
  );

  if (!handoff.token) {
    throw new Error("ACCESS_TOKEN_MISSING");
  }

  add("OAUTH_HANDOFF_RECEIVED=PASS");

  add(
    "OAUTH_HANDOFF_DESTROYED_AFTER_READ=" +
    (
      sessionStorage.getItem(
        "pmv_r1_pc7c_video_handoff"
      ) === null
    )
  );

  add(
    "GOOGLE_GIS_PRESENT=" +
    Boolean(window.google?.accounts?.oauth2)
  );

  return handoff.token;
}

async function driveDownload(
  accessToken,
  fileId,
  label
) {
  const response =
    await fetch(
      "https://www.googleapis.com/drive/v3/files/" +
      encodeURIComponent(fileId) +
      "?alt=media",
      {
        headers: {
          Authorization:
            "Bearer " + accessToken
        },
        cache: "no-store",
        credentials: "omit"
      }
    );

  add(label + "_HTTP=" + response.status);

  if (!response.ok) {
    throw new Error(label + "_DOWNLOAD_FAILED");
  }

  return new Uint8Array(
    await response.arrayBuffer()
  );
}

async function driveRange(
  accessToken,
  fileId,
  start,
  end
) {
  const response =
    await fetch(
      "https://www.googleapis.com/drive/v3/files/" +
      encodeURIComponent(fileId) +
      "?alt=media",
      {
        headers: {
          Authorization:
            "Bearer " + accessToken,
          Range:
            "bytes=" + start + "-" + end
        },
        cache: "no-store",
        credentials: "omit"
      }
    );

  add(
    "VIDEO_RANGE_HTTP=" +
    response.status
  );

  if (response.status !== 206) {
    throw new Error(
      "VIDEO_RANGE_HTTP_NOT_206"
    );
  }

  const contentRange =
    response.headers.get("content-range");

  add(
    "VIDEO_CONTENT_RANGE_EXPOSED=" +
    Boolean(contentRange)
  );

  const bytes =
    new Uint8Array(
      await response.arrayBuffer()
    );

  const expectedLength =
    end - start + 1;

  if (bytes.length !== expectedLength) {
    throw new Error(
      "VIDEO_RANGE_RESPONSE_LENGTH_MISMATCH"
    );
  }

  add("VIDEO_RANGE_RESPONSE_LENGTH_MATCH=PASS");

  return bytes;
}

async function downloadWrapper(accessToken) {
  const query =
    encodeURIComponent(
      "name='" +
      WRAPPER_NAME +
      "' and trashed=false"
    );

  const listResponse =
    await fetch(
      "https://www.googleapis.com/drive/v3/files?q=" +
      query +
      "&fields=files(id,name,size)",
      {
        headers: {
          Authorization:
            "Bearer " + accessToken
        },
        cache: "no-store",
        credentials: "omit"
      }
    );

  add(
    "DRIVE_WRAPPER_LIST_HTTP=" +
    listResponse.status
  );

  if (!listResponse.ok) {
    throw new Error("DRIVE_WRAPPER_LIST_FAILED");
  }

  const list =
    await listResponse.json();

  if (list.files.length !== 1) {
    throw new Error("DRIVE_WRAPPER_LOOKUP_COUNT_NOT_ONE");
  }

  const bytes =
    await driveDownload(
      accessToken,
      list.files[0].id,
      "DRIVE_WRAPPER_DOWNLOAD"
    );

  add("DRIVE_WRAPPER_DOWNLOAD=PASS");

  return JSON.parse(
    decoder.decode(bytes)
  );
}

function validateWrapper(wrapper) {
  const expectedAad =
    "PMV-PWA-WRAPPED-KEK-V1" +
    "|vault_id=" +
    wrapper.vault_id +
    "|key_generation=" +
    wrapper.key_generation;

  const valid =
    wrapper.format_id === "PMV-PWA-WRAPPED-KEK-V1" &&
    wrapper.format_version === 1 &&
    wrapper.vault_id === EXPECTED_VAULT_ID &&
    wrapper.key_generation === EXPECTED_KEY_GENERATION &&
    wrapper.kdf === "Argon2id13" &&
    wrapper.kdf_opslimit === 3 &&
    wrapper.kdf_memlimit_bytes === 536870912 &&
    wrapper.kdf_output_bytes === 32 &&
    wrapper.aead === "XChaCha20-Poly1305-IETF" &&
    b64ToBytes(wrapper.salt_b64).length === 16 &&
    b64ToBytes(wrapper.nonce_b64).length === 24 &&
    b64ToBytes(wrapper.wrapped_kek_ciphertext_b64).length === 48 &&
    wrapper.aad === expectedAad;

  if (!valid) {
    throw new Error("WRAPPER_FORMAT_INVALID");
  }

  add("WRAPPER_FORMAT_VALID=PASS");
  return expectedAad;
}

function validateRecord(record) {
  const valid =
    record.format_version === 1 &&
    record.vault_id === EXPECTED_VAULT_ID &&
    record.media_id === EXPECTED_MEDIA_ID &&
    record.key_generation === EXPECTED_KEY_GENERATION &&
    record.manifest_object_name === EXPECTED_MANIFEST_OBJECT &&
    record.video_object_name === EXPECTED_VIDEO_OBJECT &&
    typeof record.wrapped_media_dek?.nonce_hex === "string" &&
    record.wrapped_media_dek.nonce_hex.length === 48 &&
    typeof record.wrapped_media_dek?.ciphertext_hex === "string" &&
    record.wrapped_media_dek.ciphertext_hex.length === 96;

  if (!valid) {
    throw new Error("PRODUCTION_VIDEO_RECORD_INVALID");
  }

  add("PRODUCTION_VIDEO_RECORD_VALID=PASS");
}

function validateManifest(manifest) {
  if (
    manifest.format_version !== 1 ||
    manifest.cipher_suite !== "XChaCha20-Poly1305-IETF" ||
    manifest.stream_algorithm !== null ||
    manifest.nonce_length !== 24 ||
    manifest.tag_length !== 16 ||
    manifest.vault_id !== EXPECTED_VAULT_ID ||
    manifest.media_id !== EXPECTED_MEDIA_ID ||
    !Number.isSafeInteger(manifest.segment_count) ||
    manifest.segment_count < 1 ||
    !Array.isArray(manifest.segments) ||
    manifest.segments.length !== manifest.segment_count
  ) {
    throw new Error("VIDEO_MANIFEST_INVALID");
  }

  let expectedOffset = 0;
  let totalPlain = 0;
  let totalCipher = 0;

  for (let i = 0; i < manifest.segments.length; i++) {
    const seg = manifest.segments[i];

    if (
      seg.segment_index !== i ||
      seg.offset !== expectedOffset ||
      !Number.isSafeInteger(seg.plaintext_length) ||
      seg.plaintext_length < 1 ||
      seg.plaintext_length > manifest.segment_size_bytes ||
      seg.ciphertext_length !== seg.plaintext_length + 16 ||
      typeof seg.nonce_hex !== "string" ||
      seg.nonce_hex.length !== 48
    ) {
      throw new Error("VIDEO_MANIFEST_SEGMENT_INVALID");
    }

    expectedOffset += seg.ciphertext_length;
    totalPlain += seg.plaintext_length;
    totalCipher += seg.ciphertext_length;
  }

  if (
    totalPlain !== manifest.total_plaintext_length ||
    totalCipher !== manifest.total_ciphertext_length ||
    manifest.source_plaintext_length !== manifest.total_plaintext_length
  ) {
    throw new Error("VIDEO_MANIFEST_TOTAL_INVALID");
  }

  add("VIDEO_MANIFEST_VALID=PASS");
}

async function clearVideo() {
  try {
    if (
      playbackFrame?.contentWindow &&
      playbackFrame.src !== "about:blank"
    ) {
      playbackFrame.contentWindow.postMessage(
        {type: "PMV_VIDEO_CLEAR"},
        location.origin
      );
      add("VIDEO_SW_CLEAR_SENT=YES");
    }

    if (
      activeSodium &&
      Array.isArray(currentPlaybackParts)
    ) {
      for (const part of currentPlaybackParts) {
        if (part instanceof Uint8Array) {
          activeSodium.memzero(part);
        }
      }

      currentPlaybackParts = null;
      add("VIDEO_SOURCE_BUFFERS_ZEROIZED=PASS");
    }

    clearButton.disabled = true;
  }
  catch (e) {
    add("VIDEO_CLEAR=FAIL");
    add("VIDEO_CLEAR_ERROR=" + String(e?.message || e));
  }
}

clearButton.onclick = () => {
  clearVideo();
};

window.addEventListener("pagehide", () => {
  try {
    if (playbackFrame?.contentWindow && playbackFrame.src !== "about:blank") {
      playbackFrame.contentWindow.postMessage(
        {type: "PMV_VIDEO_CLEAR"},
        location.origin
      );
    }
    if (activeSodium && Array.isArray(currentPlaybackParts)) {
      for (const part of currentPlaybackParts) {
        if (part instanceof Uint8Array) activeSodium.memzero(part);
      }
      currentPlaybackParts = null;
    }
  } catch (_) {}
});

let playbackReadyPromise = null;

function ensurePlaybackFrame() {
  if (playbackReadyPromise) return playbackReadyPromise;

  playbackReadyPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("VIDEO_PLAYBACK_FRAME_TIMEOUT")),
      10000
    );

    function onMessage(event) {
      if (
        event.origin !== location.origin ||
        event.source !== playbackFrame.contentWindow ||
        event.data?.source !== "PMV_PC7C_PLAYBACK_R7"
      ) return;

      const data = event.data;

      if (data.type === "READY") {
        clearTimeout(timer);
        add("VIDEO_SW_CONTROLLER=PASS");
        add("VIDEO_SW_READY=PASS");
        resolve();
      } else if (data.type === "LOADEDMETADATA") {
        add("VIDEO_LOADEDMETADATA=PASS");
        add("VIDEO_DURATION_SECONDS=" + data.duration);
      } else if (data.type === "CANPLAY") {
        add("VIDEO_CANPLAY=PASS");
      } else if (data.type === "PLAYING") {
        add("VIDEO_PLAY_EVENT=PASS");
      } else if (data.type === "SEEKED") {
        add("VIDEO_SEEK_EVENT=PASS");
        add("VIDEO_CURRENT_TIME=" + data.currentTime);
      } else if (data.type === "VIDEO_ERROR") {
        add("VIDEO_ELEMENT_ERROR=FAIL");
        add("VIDEO_ELEMENT_ERROR_CODE=" + data.code);
      } else if (data.type === "ERROR") {
        add("VIDEO_PLAYBACK_FRAME_ERROR=" + data.message);
      }
    }

    window.addEventListener("message", onMessage);
    playbackFrame.src =
      "./pc7c-video-playback-r7/index.html";
  });

  return playbackReadyPromise;
}

button.onclick = async () => {
  button.disabled = true;
  lines.length = 0;

  let sodium = null;
  let wrappingKey = null;
  let productionKek = null;
  let mediaDek = null;
  let segmentPlaintext = null;

  try {
    add("KEY_CONTEXT=PASS");
    add("PRODUCTION_VIDEO_ACCESS=READ_ONLY");

    const accessToken =
      consumeOAuthHandoff();

    const wrapper =
      await downloadWrapper(accessToken);

    const wrapperAad =
      validateWrapper(wrapper);

    const recordBytes =
      await driveDownload(
        accessToken,
        RECORD_FILE_ID,
        "PRODUCTION_VIDEO_RECORD_DOWNLOAD"
      );

    const record =
      JSON.parse(
        decoder.decode(recordBytes)
      );

    add("PRODUCTION_VIDEO_RECORD_DOWNLOAD=PASS");
    validateRecord(record);

    const password =
      passwordEl.value;

    passwordEl.value = "";

    if (!password) {
      throw new Error("PMV_PASSWORD_EMPTY");
    }

    sodium =
      await loadVerifiedSodium();

    activeSodium = sodium;

    wrappingKey =
      sodium.crypto_pwhash(
        32,
        password,
        b64ToBytes(wrapper.salt_b64),
        3,
        536870912,
        sodium.crypto_pwhash_ALG_ARGON2ID13
      );

    if (
      !(wrappingKey instanceof Uint8Array) ||
      wrappingKey.length !== 32
    ) {
      throw new Error("WRAPPING_KEY_INVALID");
    }

    add("ARGON2ID_DERIVATION=PASS");

    productionKek =
      sodium
        .crypto_aead_xchacha20poly1305_ietf_decrypt(
          null,
          b64ToBytes(
            wrapper.wrapped_kek_ciphertext_b64
          ),
          encoder.encode(wrapperAad),
          b64ToBytes(wrapper.nonce_b64),
          wrappingKey
        );

    if (
      !(productionKek instanceof Uint8Array) ||
      productionKek.length !== 32
    ) {
      throw new Error("PRODUCTION_KEK_LENGTH_INVALID");
    }

    add("PRODUCTION_KEK_UNWRAP=PASS");

    const mediaDekAad =
      "pmv:v1:key-wrap\n" +
      "purpose=media-dek\n" +
      "vault_id=" + record.vault_id + "\n" +
      "subject_id=" + record.media_id + "\n" +
      "key_generation=" + record.key_generation + "\n";

    mediaDek =
      sodium
        .crypto_aead_xchacha20poly1305_ietf_decrypt(
          null,
          hexToBytes(
            record.wrapped_media_dek.ciphertext_hex
          ),
          encoder.encode(mediaDekAad),
          hexToBytes(
            record.wrapped_media_dek.nonce_hex
          ),
          productionKek
        );

    if (
      !(mediaDek instanceof Uint8Array) ||
      mediaDek.length !== 32
    ) {
      throw new Error("MEDIA_DEK_LENGTH_INVALID");
    }

    add("MEDIA_DEK_UNWRAP=PASS");

    const manifestEnvelope =
      await driveDownload(
        accessToken,
        MANIFEST_FILE_ID,
        "PRODUCTION_VIDEO_MANIFEST_DOWNLOAD"
      );

    add("PRODUCTION_VIDEO_MANIFEST_DOWNLOAD=PASS");

    if (manifestEnvelope.length < 40) {
      throw new Error("VIDEO_MANIFEST_ENVELOPE_INVALID");
    }

    const manifestNonce =
      manifestEnvelope.slice(0, 24);

    const manifestCiphertext =
      manifestEnvelope.slice(24);

    const manifestAad =
      "pmv:v1:manifest\n" +
      "vault_id=" + record.vault_id + "\n" +
      "media_id=" + record.media_id + "\n";

    let manifestPlaintext = null;

    try {
      manifestPlaintext =
        sodium
          .crypto_aead_xchacha20poly1305_ietf_decrypt(
            null,
            manifestCiphertext,
            encoder.encode(manifestAad),
            manifestNonce,
            mediaDek
          );

      add("PRODUCTION_VIDEO_MANIFEST_AEAD_AUTH=PASS");

      const manifest =
        JSON.parse(
          decoder.decode(manifestPlaintext)
        );

      add("PRODUCTION_VIDEO_MANIFEST_JSON=PASS");

      validateManifest(manifest);

      const seg =
        manifest.segments[0];

      const start =
        seg.offset;

      const end =
        seg.offset +
        seg.ciphertext_length -
        1;

      add("VIDEO_SEGMENT_INDEX=0");
      add("VIDEO_RANGE_START=" + start);
      add("VIDEO_RANGE_END=" + end);

      const segmentCiphertext =
        await driveRange(
          accessToken,
          VIDEO_FILE_ID,
          start,
          end
        );

      if (
        segmentCiphertext.length !==
        seg.ciphertext_length
      ) {
        throw new Error("VIDEO_RANGE_LENGTH_MISMATCH");
      }

      add("VIDEO_RANGE_LENGTH_MATCH=PASS");

      const segmentAad =
        "vault_id=" + manifest.vault_id + "\n" +
        "media_id=" + manifest.media_id + "\n" +
        "format_version=" + manifest.format_version + "\n" +
        "segment_index=" + seg.segment_index + "\n" +
        "segment_count=" + manifest.segment_count + "\n" +
        "plaintext_length=" + seg.plaintext_length + "\n";

      segmentPlaintext =
        sodium
          .crypto_aead_xchacha20poly1305_ietf_decrypt(
            null,
            segmentCiphertext,
            encoder.encode(segmentAad),
            hexToBytes(seg.nonce_hex),
            mediaDek
          );

      if (
        segmentPlaintext.length !==
        seg.plaintext_length
      ) {
        throw new Error("VIDEO_SEGMENT_PLAINTEXT_LENGTH_MISMATCH");
      }

      add("VIDEO_SEGMENT_AEAD_DECRYPT=PASS");
      add("VIDEO_SEGMENT_PLAINTEXT_LENGTH_MATCH=PASS");

      const maxTransientBytes =
        256 * 1024 * 1024;

      add("VIDEO_TOTAL_PLAINTEXT_BYTES=" + manifest.total_plaintext_length);
      add("VIDEO_SEGMENT_COUNT=" + manifest.segment_count);

      if (manifest.total_plaintext_length > maxTransientBytes) {
        throw new Error("VIDEO_PLAYBACK_TRANSIENT_MEMORY_CAP_EXCEEDED");
      }

      const playbackParts = [segmentPlaintext];

      for (let i = 1; i < manifest.segments.length; i++) {
        const s = manifest.segments[i];

        const ctext =
          await driveRange(
            accessToken,
            VIDEO_FILE_ID,
            s.offset,
            s.offset + s.ciphertext_length - 1
          );

        if (ctext.length !== s.ciphertext_length) {
          throw new Error("VIDEO_PLAYBACK_RANGE_LENGTH_MISMATCH:" + i);
        }

        const aad =
          "vault_id=" + manifest.vault_id + "\n" +
          "media_id=" + manifest.media_id + "\n" +
          "format_version=" + manifest.format_version + "\n" +
          "segment_index=" + s.segment_index + "\n" +
          "segment_count=" + manifest.segment_count + "\n" +
          "plaintext_length=" + s.plaintext_length + "\n";

        const p =
          sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
            null,
            ctext,
            encoder.encode(aad),
            hexToBytes(s.nonce_hex),
            mediaDek
          );

        if (p.length !== s.plaintext_length) {
          throw new Error("VIDEO_PLAYBACK_SEGMENT_LENGTH_MISMATCH:" + i);
        }

        playbackParts.push(p);
      }

      add("VIDEO_ALL_SEGMENTS_AEAD_DECRYPT=PASS");

      const sourceName =
        String(manifest.source_file_name || "").toLowerCase();

      const extMatch =
        sourceName.match(/\.([a-z0-9]+)$/);

      const sourceExt =
        extMatch ? extMatch[1] : "unknown";

      add("VIDEO_SOURCE_EXTENSION=" + sourceExt);

      const probeParts =
        playbackParts.slice(0, Math.min(playbackParts.length, 4));

      let probeLength = 0;
      for (const part of probeParts) {
        probeLength += Math.min(part.length, 1024 * 1024);
      }

      const probe =
        new Uint8Array(probeLength);

      let probeOffset = 0;
      for (const part of probeParts) {
        const take =
          part.subarray(0, Math.min(part.length, 1024 * 1024));
        probe.set(take, probeOffset);
        probeOffset += take.length;
      }

      const ascii =
        Array.from(
          probe,
          b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : "."
        ).join("");

      const tags = [
        "ftyp",
        "qt  ",
        "isom",
        "mp41",
        "mp42",
        "avc1",
        "hvc1",
        "hev1",
        "av01",
        "vp09",
        "mp4a",
        "ac-3",
        "ec-3"
      ].filter(tag => ascii.includes(tag));

      add("VIDEO_CONTAINER_CODEC_TAGS=" + (tags.length ? tags.join(",") : "NONE"));

      function findAscii(bytes, text) {
        const target = Array.from(text, ch => ch.charCodeAt(0));
        outer:
        for (let i = 0; i <= bytes.length - target.length; i++) {
          for (let j = 0; j < target.length; j++) {
            if (bytes[i + j] !== target[j]) continue outer;
          }
          return i;
        }
        return -1;
      }

      function findAsciiAcrossParts(parts, text) {
        const target = Array.from(text, ch => ch.charCodeAt(0));
        let globalOffset = 0;

        for (let pIndex = 0; pIndex < parts.length; pIndex++) {
          const part = parts[pIndex];

          outer:
          for (let i = 0; i <= part.length - target.length; i++) {
            for (let j = 0; j < target.length; j++) {
              if (part[i + j] !== target[j]) continue outer;
            }

            return {
              partIndex: pIndex,
              localOffset: i,
              globalOffset: globalOffset + i
            };
          }

          globalOffset += part.length;
        }

        return null;
      }

      const topLevelTags = ["ftyp","moov","mdat","free","wide","uuid"];
      for (const tag of topLevelTags) {
        const hit = findAsciiAcrossParts(playbackParts, tag);
        add(
          "VIDEO_BOX_" + tag.toUpperCase() + "_OFFSET=" +
          (hit ? hit.globalOffset : "NOT_FOUND")
        );
      }

      const avcCHit =
        findAsciiAcrossParts(playbackParts, "avcC");

      if (avcCHit) {
        const part = playbackParts[avcCHit.partIndex];
        const i = avcCHit.localOffset;

        if (i + 8 <= part.length) {
          const profile = part[i + 5];
          const compat = part[i + 6];
          const level = part[i + 7];

          const codec =
            "avc1." +
            [profile, compat, level]
              .map(v => v.toString(16).padStart(2, "0"))
              .join("")
              .toUpperCase();

          add("VIDEO_AVCC_OFFSET=" + avcCHit.globalOffset);
          add("VIDEO_AVC_CODEC=" + codec);
          add("VIDEO_AVC_PROFILE_IDC=" + profile);
          add("VIDEO_AVC_LEVEL_IDC=" + level);
          add(
            "VIDEO_CANPLAYTYPE_EXACT=" +
            document.createElement("video").canPlayType('video/mp4; codecs="' + codec + ', mp4a.40.2"')
          );
        }
        else {
          add("VIDEO_AVC_CODEC=CROSSES_SEGMENT_BOUNDARY");
        }
      }
      else {
        add("VIDEO_AVC_CODEC=NOT_FOUND");
      }

      let mime = "application/octet-stream";

      if (
        tags.includes("qt  ") ||
        sourceExt === "mov"
      ) {
        mime = "video/quicktime";
      }
      else if (
        tags.includes("ftyp") ||
        ["mp4","m4v"].includes(sourceExt)
      ) {
        mime = "video/mp4";
      }

      add("VIDEO_MIME_CANDIDATE=" + mime);
      add("VIDEO_CANPLAYTYPE=" + document.createElement("video").canPlayType(mime));

      sodium.memzero(probe);

      function readU32BE(bytes, offset) {
        return (
          (bytes[offset] * 0x1000000) +
          (bytes[offset + 1] << 16) +
          (bytes[offset + 2] << 8) +
          bytes[offset + 3]
        ) >>> 0;
      }

      function writeU32BE(bytes, offset, value) {
        bytes[offset] = (value >>> 24) & 0xff;
        bytes[offset + 1] = (value >>> 16) & 0xff;
        bytes[offset + 2] = (value >>> 8) & 0xff;
        bytes[offset + 3] = value & 0xff;
      }

      function virtualSlices(parts, start, end) {
        const out = [];
        let base = 0;

        for (const part of parts) {
          const partStart = base;
          const partEnd = base + part.length;

          if (end <= partStart) break;

          if (start < partEnd && end > partStart) {
            const localStart = Math.max(0, start - partStart);
            const localEnd = Math.min(part.length, end - partStart);
            out.push(part.subarray(localStart, localEnd));
          }

          base = partEnd;
        }

        return out;
      }

      function virtualCopy(parts, start, end) {
        const slices = virtualSlices(parts, start, end);
        const out = new Uint8Array(end - start);
        let off = 0;

        for (const slice of slices) {
          out.set(slice, off);
          off += slice.length;
        }

        if (off !== out.length) {
          throw new Error("VIDEO_VIRTUAL_COPY_LENGTH_MISMATCH");
        }

        return out;
      }

      function patchChunkOffsetsForFastStart(moovBytes, delta) {
        let stcoCount = 0;
        let co64Count = 0;
        let patchedEntries = 0;

        for (let i = 4; i + 12 <= moovBytes.length; i++) {
          const a = moovBytes[i];
          const b = moovBytes[i + 1];
          const d = moovBytes[i + 2];
          const e = moovBytes[i + 3];

          const isStco =
            a === 0x73 && b === 0x74 && d === 0x63 && e === 0x6f;

          const isCo64 =
            a === 0x63 && b === 0x6f && d === 0x36 && e === 0x34;

          if (!isStco && !isCo64) continue;

          const boxStart = i - 4;
          const boxSize = readU32BE(moovBytes, boxStart);

          if (boxSize < 16 || boxStart + boxSize > moovBytes.length) {
            continue;
          }

          const entryCount = readU32BE(moovBytes, i + 8);
          const entrySize = isStco ? 4 : 8;
          const entriesStart = i + 12;
          const entriesEnd = entriesStart + entryCount * entrySize;

          if (entriesEnd > boxStart + boxSize) {
            continue;
          }

          if (isStco) {
            stcoCount++;

            for (let n = 0; n < entryCount; n++) {
              const p = entriesStart + n * 4;
              const oldValue = readU32BE(moovBytes, p);
              const nextValue = oldValue + delta;

              if (nextValue > 0xffffffff) {
                throw new Error("VIDEO_FASTSTART_STCO_OVERFLOW");
              }

              writeU32BE(moovBytes, p, nextValue >>> 0);
              patchedEntries++;
            }
          }
          else {
            co64Count++;

            for (let n = 0; n < entryCount; n++) {
              const p = entriesStart + n * 8;

              const hi = BigInt(readU32BE(moovBytes, p));
              const lo = BigInt(readU32BE(moovBytes, p + 4));
              const oldValue = (hi << 32n) | lo;
              const nextValue = oldValue + BigInt(delta);

              writeU32BE(
                moovBytes,
                p,
                Number((nextValue >> 32n) & 0xffffffffn)
              );

              writeU32BE(
                moovBytes,
                p + 4,
                Number(nextValue & 0xffffffffn)
              );

              patchedEntries++;
            }
          }

          i = boxStart + boxSize - 1;
        }

        add("VIDEO_FASTSTART_STCO_BOXES=" + stcoCount);
        add("VIDEO_FASTSTART_CO64_BOXES=" + co64Count);
        add("VIDEO_FASTSTART_OFFSET_ENTRIES_PATCHED=" + patchedEntries);

        if (patchedEntries === 0) {
          throw new Error("VIDEO_FASTSTART_NO_CHUNK_OFFSETS_PATCHED");
        }
      }

      function readType(bytes, offset) {
        return String.fromCharCode(
          bytes[offset],
          bytes[offset + 1],
          bytes[offset + 2],
          bytes[offset + 3]
        );
      }

      function parseTopLevelBoxes(parts, totalLength, label) {
        let offset = 0;
        const boxes = [];
        let guard = 0;

        while (offset < totalLength && guard++ < 64) {
          if (offset + 8 > totalLength) {
            throw new Error(label + "_TRUNCATED_BOX_HEADER");
          }

          const header = virtualCopy(parts, offset, Math.min(offset + 16, totalLength));
          let size = readU32BE(header, 0);
          const type = readType(header, 4);
          let headerSize = 8;

          if (size === 1) {
            if (header.length < 16) {
              throw new Error(label + "_TRUNCATED_EXTENDED_SIZE");
            }

            const hi = BigInt(readU32BE(header, 8));
            const lo = BigInt(readU32BE(header, 12));
            const size64 = (hi << 32n) | lo;

            if (size64 > BigInt(Number.MAX_SAFE_INTEGER)) {
              throw new Error(label + "_BOX_TOO_LARGE");
            }

            size = Number(size64);
            headerSize = 16;
          }
          else if (size === 0) {
            size = totalLength - offset;
          }

          if (size < headerSize || offset + size > totalLength) {
            throw new Error(
              label + "_INVALID_BOX:" + type + ":" + offset + ":" + size
            );
          }

          boxes.push({type, offset, size});
          offset += size;
        }

        if (offset !== totalLength) {
          throw new Error(label + "_TOPLEVEL_LENGTH_MISMATCH");
        }

        add(
          label + "_TOPLEVEL_BOXES=" +
          boxes.map(b => b.type + "@" + b.offset + "+" + b.size).join(",")
        );
        add(label + "_TOPLEVEL_PARSE=PASS");

        return boxes;
      }

      const originalBoxes =
        parseTopLevelBoxes(
          playbackParts,
          manifest.total_plaintext_length,
          "VIDEO_ORIGINAL_MP4"
        );

      const originalMdat =
        originalBoxes.find(b => b.type === "mdat");

      const originalMoov =
        originalBoxes.find(b => b.type === "moov");

      if (!originalMdat || !originalMoov) {
        throw new Error("VIDEO_MP4_REQUIRED_BOX_MISSING");
      }

      const esdsHit =
        findAsciiAcrossParts(playbackParts, "esds");

      if (esdsHit) {
        const start =
          Math.max(0, esdsHit.globalOffset - 4);

        const end =
          Math.min(
            manifest.total_plaintext_length,
            start + 256
          );

        const esdsBytes =
          virtualCopy(playbackParts, start, end);

        add("VIDEO_ESDS_OFFSET=" + esdsHit.globalOffset);
        add(
          "VIDEO_ESDS_PREFIX_HEX=" +
          bytesToHex(esdsBytes.slice(0, Math.min(96, esdsBytes.length)))
        );
      }
      else {
        add("VIDEO_ESDS_OFFSET=NOT_FOUND");
      }

      const mdatTypeOffsetHit =
        {
          globalOffset: originalMdat.offset + 4
        };

      const moovTypeOffsetHit =
        {
          globalOffset: originalMoov.offset + 4
        };

      let blobParts = playbackParts;
      let fastStartApplied = false;
      let transientMoov = null;
      let removedPrefixBytes = 0;

      if (
        mdatTypeOffsetHit &&
        moovTypeOffsetHit &&
        moovTypeOffsetHit.globalOffset > mdatTypeOffsetHit.globalOffset
      ) {
        const mdatStart = mdatTypeOffsetHit.globalOffset - 4;
        const moovStart = moovTypeOffsetHit.globalOffset - 4;

        const moovHeader =
          virtualCopy(playbackParts, moovStart, moovStart + 8);

        const moovSize =
          readU32BE(moovHeader, 0);

        if (
          moovSize < 8 ||
          moovStart + moovSize > manifest.total_plaintext_length
        ) {
          throw new Error("VIDEO_FASTSTART_INVALID_MOOV_SIZE");
        }

        transientMoov =
          virtualCopy(
            playbackParts,
            moovStart,
            moovStart + moovSize
          );

        const uuidBox =
          originalBoxes.find(
            b => b.type === "uuid" &&
                 b.offset < originalMdat.offset
          );

        const prefixEnd =
          uuidBox ? uuidBox.offset : originalMdat.offset;

        removedPrefixBytes =
          uuidBox ? uuidBox.size : 0;

        const chunkOffsetDelta =
          moovSize - removedPrefixBytes;

        patchChunkOffsetsForFastStart(
          transientMoov,
          chunkOffsetDelta
        );

        blobParts = [
          ...virtualSlices(playbackParts, 0, prefixEnd),
          transientMoov,
          ...virtualSlices(
            playbackParts,
            originalMdat.offset,
            originalMoov.offset
          ),
          ...virtualSlices(
            playbackParts,
            originalMoov.offset + originalMoov.size,
            manifest.total_plaintext_length
          )
        ];

        const fastStartTotalLength =
          manifest.total_plaintext_length -
          removedPrefixBytes;

        parseTopLevelBoxes(
          blobParts,
          fastStartTotalLength,
          "VIDEO_FASTSTART_MP4"
        );

        fastStartApplied = true;

        add("VIDEO_FASTSTART_APPLIED=YES");
        add("VIDEO_FASTSTART_UUID_STRIPPED=" + Boolean(uuidBox));
        add("VIDEO_FASTSTART_UUID_BYTES_REMOVED=" + removedPrefixBytes);
        add("VIDEO_FASTSTART_CHUNK_OFFSET_DELTA=" + chunkOffsetDelta);
        add("VIDEO_FASTSTART_MOOV_SIZE=" + moovSize);
        add("VIDEO_FASTSTART_NEW_MOOV_OFFSET=" + prefixEnd);
      }
      else {
        add("VIDEO_FASTSTART_APPLIED=NO");
      }

      const expectedBlobSize =
        manifest.total_plaintext_length -
        removedPrefixBytes;

      const transferParts =
        blobParts.map(part => {
          const copy = new Uint8Array(part.length);
          copy.set(part);
          return copy.buffer;
        });

      let transferTotal = 0;
      for (const buffer of transferParts) {
        transferTotal += buffer.byteLength;
      }

      if (transferTotal !== expectedBlobSize) {
        throw new Error("VIDEO_SW_TRANSFER_LENGTH_MISMATCH");
      }

      add("VIDEO_SW_TRANSFER_LENGTH_MATCH=PASS");
      add("VIDEO_MIME=" + mime);

      await clearVideo();
      await ensurePlaybackFrame();

      const swReadyPromise =
        new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("VIDEO_SW_SET_TIMEOUT")),
            5000
          );

          function onMessage(event) {
            if (
              event.origin !== location.origin ||
              event.source !== playbackFrame.contentWindow ||
              event.data?.source !== "PMV_PC7C_PLAYBACK_R7" ||
              event.data?.type !== "SET_RESULT"
            ) return;

            clearTimeout(timer);
            window.removeEventListener("message", onMessage);

            if (!event.data.ok) {
              reject(new Error("VIDEO_SW_SET_FAILED"));
              return;
            }
            resolve(event.data);
          }
          window.addEventListener("message", onMessage);
        });

      playbackFrame.contentWindow.postMessage(
        {
          type: "PMV_VIDEO_SET",
          parts: transferParts,
          totalLength: transferTotal,
          mime
        },
        location.origin,
        transferParts
      );

      const swResult =
        await swReadyPromise;

      if (
        swResult.totalLength !== transferTotal
      ) {
        throw new Error(
          "VIDEO_SW_SET_LENGTH_MISMATCH"
        );
      }

      add("VIDEO_SW_BUFFER_SET=PASS");

      currentPlaybackParts =
        transientMoov
          ? [...playbackParts, transientMoov]
          : playbackParts;

      playbackFrame.contentWindow.postMessage(
        {type: "PMV_VIDEO_PLAY"},
        location.origin
      );

      clearButton.disabled = false;

      add("VIDEO_VIRTUAL_RANGE_SOURCE_ACTIVE=YES");
      add("VIDEO_PLAINTEXT_FILE_CREATED=NO");
      add("VIDEO_PLAINTEXT_PERSISTED=NO");
      add("VIDEO_SOURCE_BUFFERS_HELD_UNTIL_CLEAR=YES");
      add("PC7C_VIDEO_SEGMENT_RESULT=PASS");
      add("PC7C_VIDEO_PLAYBACK_PREP=PASS");

      segmentPlaintext = null;
    }
    finally {
      if (
        manifestPlaintext instanceof Uint8Array
      ) {
        sodium.memzero(manifestPlaintext);
        add("VIDEO_MANIFEST_PLAINTEXT_ZEROIZED=PASS");
      }
    }

  }
  catch (e) {
    add("PC7C_VIDEO_SEGMENT_RESULT=FAIL");
    add("ERROR=" + String(e?.message || e));
  }
  finally {
    if (
      sodium &&
      segmentPlaintext instanceof Uint8Array
    ) {
      sodium.memzero(segmentPlaintext);
      add("VIDEO_SEGMENT_PLAINTEXT_ZEROIZED=PASS");
    }

    if (
      sodium &&
      mediaDek instanceof Uint8Array
    ) {
      sodium.memzero(mediaDek);
      add("MEDIA_DEK_ZEROIZED=PASS");
    }

    if (
      sodium &&
      productionKek instanceof Uint8Array
    ) {
      sodium.memzero(productionKek);
      add("PRODUCTION_KEK_ZEROIZED=PASS");
    }

    if (
      sodium &&
      wrappingKey instanceof Uint8Array
    ) {
      sodium.memzero(wrappingKey);
      add("WRAPPING_KEY_ZEROIZED=PASS");
    }

    add("PRODUCTION_KEK_PERSISTED=NO");
    add("MEDIA_DEK_PERSISTED=NO");

    button.disabled = false;
  }
};

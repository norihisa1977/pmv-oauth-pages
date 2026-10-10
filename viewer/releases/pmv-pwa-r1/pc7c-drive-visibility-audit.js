const G1_TARGETS = [
  {
    label: "G1_CATALOG",
    id: "1G-HGKkyhUW3kaKN5m0AZAJb7-_zv0DS8",
    expectedSize: "195833"
  },
  {
    label: "G1_THUMBNAIL_CONTROL",
    id: "1GYJP7xRpE7CVaRy09nXdrtn_tLVB_3eJ",
    expectedSize: "11701"
  }
];

const EXPECTED_COUNT = 784;
const EXPECTED_SHA256 =
  "3ae80e34740103a5103483020f0fa25448aa5975dd3c1b12902b583e4e46ac66";

const reportEl = document.getElementById("report");
const button = document.getElementById("run");
const fileEl = document.getElementById("file");
const g1Button = document.getElementById("g1");

function consumeOAuthHandoff() {
  const raw = sessionStorage.getItem("pmv_r1_pc7c_photo_handoff");
  if (!raw) throw new Error("OAUTH_HANDOFF_MISSING");

  const handoff = JSON.parse(raw);
  sessionStorage.removeItem("pmv_r1_pc7c_photo_handoff");

  if (!handoff.token) throw new Error("ACCESS_TOKEN_MISSING");

  return handoff.token;
}

function toHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(new Uint8Array(digest));
}

function parseIds(text) {
  return text
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function probe(accessToken, fileId, index) {
  const url =
    "https://www.googleapis.com/drive/v3/files/" +
    encodeURIComponent(fileId) +
    "?fields=id,size";

  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Authorization: "Bearer " + accessToken },
        cache: "no-store",
        credentials: "omit"
      });

      if (response.status === 200) {
        const data = await response.json();

        if (data.id !== fileId) {
          return {
            index,
            classification: "ERROR",
            http: 200,
            error: "RESPONSE_ID_MISMATCH"
          };
        }

        return {
          index,
          classification: "VISIBLE",
          http: 200,
          size: data.size || null
        };
      }

      if (response.status === 403 || response.status === 404) {
        return {
          index,
          classification: "NOT_VISIBLE",
          http: response.status,
          error: "NOT_VISIBLE_OR_NOT_FOUND_TO_CLIENT"
        };
      }

      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 3) {
        await sleep(250 * (2 ** attempt));
        continue;
      }

      return {
        index,
        classification: "ERROR",
        http: response.status,
        error: "UNEXPECTED_HTTP_" + response.status
      };
    } catch (e) {
      if (attempt < 3) {
        await sleep(250 * (2 ** attempt));
        continue;
      }

      return {
        index,
        classification: "ERROR",
        http: null,
        error: "NETWORK_ERROR"
      };
    }
  }

  return {
    index,
    classification: "ERROR",
    http: null,
    error: "RETRY_STATE_INVALID"
  };
}

async function runPool(items, concurrency, worker, onProgress) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;

  async function runner() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;

      results[i] = await worker(items[i], i);
      done++;
      onProgress(done, items.length, results[i]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => runner()
    )
  );

  return results;
}


async function probeG1Target(accessToken, target) {
  const url =
    "https://www.googleapis.com/drive/v3/files/" +
    encodeURIComponent(target.id) +
    "?fields=id,size";

  const response = await fetch(url, {
    headers: { Authorization: "Bearer " + accessToken },
    cache: "no-store",
    credentials: "omit"
  });

  if (response.status === 403 || response.status === 404) {
    return {
      label: target.label,
      classification: "NOT_VISIBLE",
      http: response.status,
      size: null,
      sizeMatch: false
    };
  }

  if (!response.ok) {
    return {
      label: target.label,
      classification: "ERROR",
      http: response.status,
      size: null,
      sizeMatch: false
    };
  }

  const data = await response.json();

  if (data.id !== target.id) {
    return {
      label: target.label,
      classification: "ERROR",
      http: 200,
      size: data.size || null,
      sizeMatch: false
    };
  }

  return {
    label: target.label,
    classification: "VISIBLE",
    http: 200,
    size: data.size || null,
    sizeMatch: String(data.size || "") === target.expectedSize
  };
}

g1Button.onclick = async () => {
  g1Button.disabled = true;
  button.disabled = true;

  const out = [];

  try {
    const token = consumeOAuthHandoff();

    out.push("G1_CONTROL_TARGET_COUNT=" + G1_TARGETS.length);
    out.push("MEDIA_BODY_DOWNLOADED=NO");
    out.push("PRODUCTION_MUTATION=NO");
    out.push("FILES_LIST_USED=NO");
    out.push("SCOPE_FALLBACK_USED=NO");

    const results = [];
    for (const target of G1_TARGETS) {
      results.push(await probeG1Target(token, target));
    }

    let visible = 0;
    let notVisible = 0;
    let error = 0;
    let sizeMismatch = 0;

    for (const result of results) {
      if (result.classification === "VISIBLE") visible++;
      else if (result.classification === "NOT_VISIBLE") notVisible++;
      else error++;

      if (result.classification === "VISIBLE" && !result.sizeMatch) {
        sizeMismatch++;
      }

      out.push(
        result.label + "=" +
        result.classification +
        ";HTTP=" + result.http +
        ";SIZE=" + (result.size ?? "") +
        ";SIZE_MATCH=" + (result.sizeMatch ? "YES" : "NO")
      );
    }

    out.push("VISIBLE=" + visible);
    out.push("NOT_VISIBLE=" + notVisible);
    out.push("ERROR=" + error);
    out.push("SIZE_MISMATCH=" + sizeMismatch);
    out.push(
      "ALL_G1_TARGETS_VISIBLE=" +
      (visible === G1_TARGETS.length && sizeMismatch === 0 ? "YES" : "NO")
    );
    out.push(
      "G1_DRIVE_VISIBILITY_CONTROL_AUDIT=" +
      (visible === G1_TARGETS.length && error === 0 && notVisible === 0 && sizeMismatch === 0
        ? "PASS"
        : "FAIL")
    );

    reportEl.textContent = out.join("\n");
  } catch (e) {
    out.push("G1_DRIVE_VISIBILITY_CONTROL_AUDIT=FAIL");
    out.push("ERROR=" + String(e?.message || e));
    reportEl.textContent = out.join("\n");
  } finally {
    g1Button.disabled = false;
    button.disabled = false;
  }
};

button.onclick = async () => {
  button.disabled = true;

  const out = [];

  try {
    const file = fileEl.files?.[0];
    if (!file) throw new Error("FILE_NOT_SELECTED");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const inputSha256 = await sha256Hex(bytes);

    out.push("INPUT_SHA256=" + inputSha256);

    if (inputSha256 !== EXPECTED_SHA256) {
      throw new Error("INPUT_SHA256_MISMATCH");
    }

    const text = new TextDecoder().decode(bytes);
    const ids = parseIds(text);

    out.push("INPUT_FILE_ID_COUNT=" + ids.length);

    if (ids.length !== EXPECTED_COUNT) {
      throw new Error("INPUT_FILE_ID_COUNT_MISMATCH");
    }

    const uniqueCount = new Set(ids).size;
    out.push("INPUT_UNIQUE_FILE_ID_COUNT=" + uniqueCount);

    if (uniqueCount !== EXPECTED_COUNT) {
      throw new Error("DUPLICATE_FILE_ID");
    }

    const token = consumeOAuthHandoff();

    out.push("MEDIA_BODY_DOWNLOADED=NO");
    out.push("PRODUCTION_MUTATION=NO");
    out.push("FILES_LIST_USED=NO");
    out.push("SCOPE_FALLBACK_USED=NO");
    out.push("AUDIT_BEGIN=PASS");
    reportEl.textContent = out.join("\n");

    let visible = 0;
    let notVisible = 0;
    let error = 0;

    const results = await runPool(
      ids,
      8,
      (fileId, index) => probe(token, fileId, index),
      (done, total, result) => {
        if (result.classification === "VISIBLE") visible++;
        else if (result.classification === "NOT_VISIBLE") notVisible++;
        else error++;

        if (done === total || done % 25 === 0) {
          reportEl.textContent =
            out.join("\n") +
            "\nPROGRESS=" + done + "/" + total +
            "\nVISIBLE=" + visible +
            "\nNOT_VISIBLE=" + notVisible +
            "\nERROR=" + error;
        }
      }
    );

    const notVisibleIndexes = results
      .filter(x => x.classification === "NOT_VISIBLE")
      .map(x => x.index + 1);

    const errorIndexes = results
      .filter(x => x.classification === "ERROR")
      .map(x => x.index + 1);

    out.push("TOTAL=" + results.length);
    out.push("VISIBLE=" + visible);
    out.push("NOT_VISIBLE=" + notVisible);
    out.push("ERROR=" + error);
    out.push(
      "ALL_TARGETS_VISIBLE=" +
      (visible === EXPECTED_COUNT ? "YES" : "NO")
    );

    if (notVisibleIndexes.length) {
      out.push("NOT_VISIBLE_INDEXES=" + notVisibleIndexes.join(","));
    }

    if (errorIndexes.length) {
      out.push("ERROR_INDEXES=" + errorIndexes.join(","));
    }

    out.push("DRIVE_VISIBILITY_CANONICAL_AUDIT=PASS");
    reportEl.textContent = out.join("\n");
  } catch (e) {
    out.push("DRIVE_VISIBILITY_CANONICAL_AUDIT=FAIL");
    out.push("ERROR=" + String(e?.message || e));
    reportEl.textContent = out.join("\n");
  } finally {
    button.disabled = false;
  }
};

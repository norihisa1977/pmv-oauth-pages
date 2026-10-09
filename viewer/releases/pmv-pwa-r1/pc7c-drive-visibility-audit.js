const TARGETS = [
  { label: "RECORD", fileId: "1G-mMzviIITpUllqnCbnjAlzguo7aX_0w" },
  { label: "MANIFEST", fileId: "1ulDSALMuVaRxMMffUtc_wczVdxP5ve4D" },
  { label: "PHOTO_BLOB", fileId: "1NSXI22fnprN8KH8tv2kh3nGZBD1nnas_" }
];

const reportEl = document.getElementById("report");
const button = document.getElementById("run");

function consumeOAuthHandoff() {
  const raw = sessionStorage.getItem("pmv_r1_pc7c_photo_handoff");
  if (!raw) throw new Error("OAUTH_HANDOFF_MISSING");
  const handoff = JSON.parse(raw);
  sessionStorage.removeItem("pmv_r1_pc7c_photo_handoff");
  if (!handoff.token) throw new Error("ACCESS_TOKEN_MISSING");
  return handoff.token;
}

async function probe(accessToken, target) {
  const response = await fetch(
    "https://www.googleapis.com/drive/v3/files/" +
      encodeURIComponent(target.fileId) +
      "?fields=id,size",
    {
      headers: { Authorization: "Bearer " + accessToken },
      cache: "no-store",
      credentials: "omit"
    }
  );

  if (response.status === 200) {
    const data = await response.json();
    if (data.id !== target.fileId) {
      return { ...target, classification: "ERROR", http: 200, error: "RESPONSE_ID_MISMATCH" };
    }
    return { ...target, classification: "VISIBLE", http: 200, size: data.size || null };
  }

  if (response.status === 403 || response.status === 404) {
    return {
      ...target,
      classification: "NOT_VISIBLE",
      http: response.status,
      error: "NOT_VISIBLE_OR_NOT_FOUND_TO_CLIENT"
    };
  }

  return {
    ...target,
    classification: "ERROR",
    http: response.status,
    error: "UNEXPECTED_HTTP_" + response.status
  };
}

button.onclick = async () => {
  button.disabled = true;
  const out = [];
  try {
    const token = consumeOAuthHandoff();
    out.push("CONTROL_TARGET_COUNT=3");
    out.push("MEDIA_BODY_DOWNLOADED=NO");
    out.push("PRODUCTION_MUTATION=NO");
    reportEl.textContent = out.join("\n");

    const results = [];
    for (const target of TARGETS) {
      const result = await probe(token, target);
      results.push(result);
      out.push(
        result.label + "=" +
        result.classification +
        ";HTTP=" + result.http +
        (result.size ? ";SIZE=" + result.size : "")
      );
      reportEl.textContent = out.join("\n");
    }

    const visible = results.filter(x => x.classification === "VISIBLE").length;
    const notVisible = results.filter(x => x.classification === "NOT_VISIBLE").length;
    const error = results.filter(x => x.classification === "ERROR").length;

    out.push("VISIBLE=" + visible);
    out.push("NOT_VISIBLE=" + notVisible);
    out.push("ERROR=" + error);
    out.push("ALL_TARGETS_VISIBLE=" + (visible === TARGETS.length ? "YES" : "NO"));
    out.push("DRIVE_VISIBILITY_CONTROL_AUDIT=PASS");
    reportEl.textContent = out.join("\n");
  } catch (e) {
    out.push("DRIVE_VISIBILITY_CONTROL_AUDIT=FAIL");
    out.push("ERROR=" + String(e?.message || e));
    reportEl.textContent = out.join("\n");
  } finally {
    button.disabled = false;
  }
};

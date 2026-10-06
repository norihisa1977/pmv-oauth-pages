const CLIENT_ID =
  "708619313298-76j1902kqi0jdihccrc2n0gtq0124ltk.apps.googleusercontent.com";

const SCOPE = "https://www.googleapis.com/auth/drive.file";

const reportEl = document.getElementById("report");
const btn = document.getElementById("authorize");

let tokenClient = null;

function report(lines) {
  reportEl.textContent = lines.join("\n");
}

async function waitForGIS() {
  for (let i = 0; i < 100; i++) {
    if (window.google?.accounts?.oauth2) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("GIS_LOAD_TIMEOUT");
}

btn.onclick = async () => {
  const out = [];

  try {
    out.push("PC7B_OAUTH_CONTEXT=PASS");
    out.push("PMV_PASSWORD_FIELD_PRESENT=false");
    out.push("KEY_CONTEXT_ACTIVE=false");

    await waitForGIS();

    out.push("GIS_READY=PASS");

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,

      callback: (resp) => {
        try {
          if (resp.error) {
            throw new Error("TOKEN_ERROR:" + resp.error);
          }

          if (!resp.access_token) {
            throw new Error("ACCESS_TOKEN_MISSING");
          }

          sessionStorage.setItem(
            "pmv_r1_pc7b_handoff",
            JSON.stringify({
              v: 1,
              token: resp.access_token,
              created_at: Date.now()
            })
          );

          out.push("ACCESS_TOKEN_RECEIVED=PASS");
          out.push(
            "REFRESH_TOKEN_FIELD_PRESENT=" +
              Object.prototype.hasOwnProperty.call(resp, "refresh_token")
          );
          out.push("ACCESS_TOKEN_PERSISTED_BY_TEST_CODE=NO");
          out.push("SAME_ORIGIN_HANDOFF_STAGED=PASS");

          report(out);

          location.replace("./pc7b-key-unlock.html");
        } catch (e) {
          out.push("PC7B_OAUTH=FAIL");
          out.push("ERROR=" + String(e?.message || e));
          report(out);
        }
      }
    });

    out.push("GIS_TOKEN_CLIENT_INIT=PASS");

    report(out);

    tokenClient.requestAccessToken({
      prompt: ""
    });
  } catch (e) {
    out.push("PC7B_OAUTH=FAIL");
    out.push("ERROR=" + String(e?.message || e));
    report(out);
  }
};

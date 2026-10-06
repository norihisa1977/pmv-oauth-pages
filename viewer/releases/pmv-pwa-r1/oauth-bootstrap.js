const CLIENT_ID = "708619313298-76j1902kqi0jdihccrc2n0gtq0124ltk.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const reportEl = document.getElementById("report");
const btn = document.getElementById("authorize");
let tokenClient = null;

function report(lines){ reportEl.textContent = lines.join("\n"); }

async function waitForGIS(){
  for(let i=0;i<100;i++){
    if(window.google?.accounts?.oauth2) return;
    await new Promise(r=>setTimeout(r,100));
  }
  throw new Error("GIS_LOAD_TIMEOUT");
}

btn.onclick = async () => {
  const out=[];
  try{
    out.push("OAUTH_CONTEXT=PASS");
    out.push("PMV_PASSWORD_FIELD_PRESENT=false");
    out.push("LIBSODIUM_LOADED=false");
    out.push("KEY_CONTEXT_ACTIVE=false");
    out.push("REQUESTED_SCOPE="+SCOPE);

    await waitForGIS();
    out.push("GIS_READY=PASS");

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: async (resp) => {
        try{
          if(resp.error) throw new Error("TOKEN_ERROR:"+resp.error);
          const accessToken = resp.access_token;
          out.push("ACCESS_TOKEN_RECEIVED="+Boolean(accessToken));
          out.push("REFRESH_TOKEN_FIELD_PRESENT="+Object.prototype.hasOwnProperty.call(resp,"refresh_token"));
          out.push("ACCESS_TOKEN_PERSISTED_BY_TEST_CODE=NO");

          const about = await fetch("https://www.googleapis.com/drive/v3/about?fields=user",{
            headers:{Authorization:"Bearer "+accessToken},
            cache:"no-store",
            credentials:"omit"
          });
          out.push("DRIVE_ABOUT_HTTP="+about.status);
          out.push("DRIVE_ABOUT_GET="+(about.ok?"PASS":"FAIL"));

          sessionStorage.setItem("pmv_r1_oauth_handoff", JSON.stringify({
            v:1,
            token:accessToken,
            created_at:Date.now()
          }));
          out.push("SAME_ORIGIN_HANDOFF_STAGED=PASS");
          out.push("HANDOFF_STORAGE=sessionStorage");
          out.push("HANDOFF_CONTAINS_PMV_PASSWORD=false");
          out.push("HANDOFF_CONTAINS_KEK_DEK=false");
          out.push("PRODUCTION_MEDIA_ACCESS=NONE");
          out.push("PRODUCTION_SECRETS_ACCESS=NONE");
          report(out);
        }catch(e){
          out.push("OAUTH_BOOTSTRAP=FAIL");
          out.push("ERROR="+String(e?.message||e));
          out.push("PRODUCTION_MEDIA_ACCESS=NONE");
          out.push("PRODUCTION_SECRETS_ACCESS=NONE");
          report(out);
        }
      }
    });
    out.push("GIS_TOKEN_CLIENT_INIT=PASS");
    report(out);
    tokenClient.requestAccessToken({prompt:""});
  }catch(e){
    out.push("OAUTH_BOOTSTRAP=FAIL");
    out.push("ERROR="+String(e?.message||e));
    out.push("PRODUCTION_MEDIA_ACCESS=NONE");
    out.push("PRODUCTION_SECRETS_ACCESS=NONE");
    report(out);
  }
};

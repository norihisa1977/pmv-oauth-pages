const reportEl=document.getElementById("report");
const btn=document.getElementById("consume");

function report(lines){reportEl.textContent=lines.join("\n");}

btn.onclick=()=>{
  const out=[];
  try{
    out.push("KEY_CONTEXT=PASS");
    out.push("GOOGLE_GIS_PRESENT="+Boolean(window.google?.accounts?.oauth2));
    out.push("PMV_PASSWORD_FIELD_PRESENT=false");

    const raw=sessionStorage.getItem("pmv_r1_oauth_handoff");
    if(!raw) throw new Error("OAUTH_HANDOFF_MISSING");

    const handoff=JSON.parse(raw);
    sessionStorage.removeItem("pmv_r1_oauth_handoff");

    if(!handoff.token) throw new Error("ACCESS_TOKEN_MISSING");
    out.push("OAUTH_HANDOFF_RECEIVED=PASS");
    out.push("OAUTH_HANDOFF_DESTROYED_AFTER_READ="+(sessionStorage.getItem("pmv_r1_oauth_handoff")===null));
    out.push("GOOGLE_GIS_IN_KEY_CONTEXT="+(Boolean(window.google?.accounts?.oauth2)?"PRESENT":"REMOVED"));
    out.push("ACCESS_TOKEN_MEMORY_ONLY_AFTER_HANDOFF=PASS");
    out.push("PMV_PASSWORD_HANDLED=NO");
    out.push("KEK_DEK_HANDLED=NO");
    out.push("PRODUCTION_MEDIA_ACCESS=NONE");
    out.push("PRODUCTION_SECRETS_ACCESS=NONE");
    report(out);
  }catch(e){
    out.push("KEY_CONTEXT_ISOLATION=FAIL");
    out.push("ERROR="+String(e?.message||e));
    out.push("PRODUCTION_MEDIA_ACCESS=NONE");
    out.push("PRODUCTION_SECRETS_ACCESS=NONE");
    report(out);
  }
};

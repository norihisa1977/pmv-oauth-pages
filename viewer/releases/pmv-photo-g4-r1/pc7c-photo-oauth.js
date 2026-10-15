const SCOPE="https://www.googleapis.com/auth/drive.file";
const CLIENT_ID="708619313298-76j1902kqi0jdihccrc2n0gtq0124ltk.apps.googleusercontent.com";
const HANDOFF_KEY="pmv_g4_pc7c_photo_handoff";
const button=document.getElementById("authorize"),report=document.getElementById("report");
let pending=false;
async function waitForGIS(){
 for(let i=0;i<100;i++){if(window.google?.accounts?.oauth2)return;await new Promise(resolve=>setTimeout(resolve,100));}
 throw Error("GIS_LOAD_TIMEOUT");
}
button.onclick=async()=>{
 if(pending)return;pending=true;button.disabled=true;
 try {
  await waitForGIS();
  google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:SCOPE,include_granted_scopes:false,callback:r=>{
   try{
    pending=false;button.disabled=false;
    if(r.error)throw Error("TOKEN_ERROR="+String(r.error));
    if(!r.access_token)throw Error("ACCESS_TOKEN_MISSING");
    const scopes=typeof r.scope==="string"?r.scope.trim().split(/\s+/):[];
    if(!scopes.includes(SCOPE))throw Error("REQUIRED_SCOPE_MISSING");
    const expires=Number(r.expires_in),now=Date.now();
    if(!Number.isFinite(expires)||expires<=5||expires>3600)throw Error("TOKEN_EXPIRY_INVALID");
    sessionStorage.setItem(HANDOFF_KEY,JSON.stringify({v:1,scope:SCOPE,token:r.access_token,created_at:now,expires_at:now+expires*1000}));
    r.access_token=null;report.textContent="OAUTH_HANDOFF_STAGED";location.replace("./pc7c-photo-view.html");
   }catch(e){if(r&&"access_token" in r)r.access_token=null;report.textContent="OAUTH_FAILED="+String(e?.message||e);}
  },error_callback:()=>{pending=false;button.disabled=false;report.textContent="OAUTH_CANCELLED";}}).requestAccessToken({prompt:""});
 }catch(e){pending=false;button.disabled=false;report.textContent=String(e.message);}
};

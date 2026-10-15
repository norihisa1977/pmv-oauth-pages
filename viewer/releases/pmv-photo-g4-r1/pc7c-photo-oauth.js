const SCOPE="https://www.googleapis.com/auth/drive.file";
const CLIENT_ID="708619313298-76j1902kqi0jdihccrc2n0gtq0124ltk.apps.googleusercontent.com";
const button=document.getElementById("authorize"),report=document.getElementById("report");
const nonce=location.hash.slice(1),parent=window.opener;
let pending=false;
button.onclick=()=>{
 if(pending)return;pending=true;button.disabled=true;
 try {
  if(!parent||!nonce||document.hidden)throw Error("KEY_CONTEXT_REQUIRED");
  if(!window.google?.accounts?.oauth2)throw Error("GIS_NOT_READY");
  google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:SCOPE,include_granted_scopes:false,callback:r=>{
   pending=false;button.disabled=false;
   if(r.error||!r.access_token||r.scope!==SCOPE||!Number.isFinite(Number(r.expires_in))||Number(r.expires_in)<=5||Number(r.expires_in)>3600||document.hidden){report.textContent="OAUTH_FAILED";return;}
   parent.postMessage({type:"PMV_G4_OAUTH",nonce,scope:SCOPE,token:r.access_token,expires_at:Date.now()+Number(r.expires_in)*1000},location.origin);
   r.access_token=null;report.textContent="OAUTH_HANDOFF_SENT";window.close();
  },error_callback:()=>{pending=false;button.disabled=false;report.textContent="OAUTH_CANCELLED";}}).requestAccessToken({prompt:""});
 }catch(e){pending=false;button.disabled=false;report.textContent=String(e.message);}
};

const reportEl=document.getElementById("report");
const lines=[];
const add=x=>{lines.push(x);reportEl.textContent=lines.join("\n");};
const b64len=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)).length;
const canonical=p=>"PMV-PWA-WRAPPED-KEK-V1|vault_id="+p.vault_id+"|key_generation="+p.key_generation;

(async()=>{
  try{
    add("KEY_CONTEXT=PASS");
    add("GOOGLE_GIS_PRESENT="+Boolean(window.google?.accounts?.oauth2));

    const raw=sessionStorage.getItem("pmv_r1_pc7_handoff");
    if(!raw) throw new Error("OAUTH_HANDOFF_MISSING");
    const handoff=JSON.parse(raw);
    sessionStorage.removeItem("pmv_r1_pc7_handoff");

    if(!handoff.token) throw new Error("ACCESS_TOKEN_MISSING");

    add("OAUTH_HANDOFF_RECEIVED=PASS");
    add("OAUTH_HANDOFF_DESTROYED_AFTER_READ="+(sessionStorage.getItem("pmv_r1_pc7_handoff")===null));
    add("GOOGLE_GIS_IN_KEY_CONTEXT="+(Boolean(window.google?.accounts?.oauth2)?"PRESENT":"REMOVED"));

    const q=encodeURIComponent("name='pmv-pwa-wrapped-kek-v1.json' and trashed=false");
    const list=await fetch("https://www.googleapis.com/drive/v3/files?q="+q+"&fields=files(id,name,size,modifiedTime)",{
      headers:{Authorization:"Bearer "+handoff.token},
      cache:"no-store",
      credentials:"omit"
    });

    add("DRIVE_LIST_HTTP="+list.status);
    if(!list.ok) throw new Error("DRIVE_LIST_FAILED");

    const lj=await list.json();
    add("DRIVE_WRAPPER_LOOKUP_COUNT="+lj.files.length);

    if(lj.files.length!==1) throw new Error("DRIVE_WRAPPER_LOOKUP_COUNT_NOT_ONE");

    const dl=await fetch("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(lj.files[0].id)+"?alt=media",{
      headers:{Authorization:"Bearer "+handoff.token},
      cache:"no-store",
      credentials:"omit"
    });

    add("DRIVE_DOWNLOAD_HTTP="+dl.status);
    if(!dl.ok) throw new Error("DRIVE_DOWNLOAD_FAILED");

    const p=JSON.parse(await dl.text());
    add("DRIVE_WRAPPER_DOWNLOAD=PASS");

    const valid=
      p.format_id==="PMV-PWA-WRAPPED-KEK-V1" &&
      p.format_version===1 &&
      p.vault_id==="pmv-v1-production" &&
      p.key_generation===1 &&
      p.kdf==="Argon2id13" &&
      p.kdf_opslimit===3 &&
      p.kdf_memlimit_bytes===536870912 &&
      p.kdf_output_bytes===32 &&
      b64len(p.salt_b64)===16 &&
      p.aead==="XChaCha20-Poly1305-IETF" &&
      b64len(p.nonce_b64)===24 &&
      b64len(p.wrapped_kek_ciphertext_b64)===48 &&
      p.aad===canonical(p);

    add("WRAPPER_FORMAT_VALID="+(valid?"PASS":"FAIL"));
    add("VAULT_BINDING_VALID="+(p.vault_id==="pmv-v1-production"?"PASS":"FAIL"));
    add("KEY_GENERATION_BINDING_VALID="+(p.key_generation===1?"PASS":"FAIL"));
    add("AAD_BINDING_VALID="+(p.aad===canonical(p)?"PASS":"FAIL"));
    add("PRODUCTION_KEK_DECRYPTED=NO");
    add("PRODUCTION_MEDIA_ACCESS=NONE");
    add("ACCESS_TOKEN_PERSISTED_BY_TEST_CODE=NO");
    add("PC7A_RESULT="+(valid?"PASS":"FAIL"));
  }catch(e){
    add("PC7A_RESULT=FAIL");
    add("ERROR="+String(e?.message||e));
    add("PRODUCTION_KEK_DECRYPTED=NO");
    add("PRODUCTION_MEDIA_ACCESS=NONE");
  }
})();
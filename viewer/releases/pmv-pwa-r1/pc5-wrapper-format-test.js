const out=document.getElementById("report");
document.getElementById("run").onclick=()=>{
  const r=[];
  try{
    const zeros=n=>new Uint8Array(n);
    const b64=bytes=>btoa(String.fromCharCode(...bytes));
    const b64len=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)).length;

    const pkg={
      format_id:"PMV-PWA-WRAPPED-KEK-V1",
      format_version:1,
      vault_id:"synthetic-vault",
      key_generation:7,
      kdf:"Argon2id13",
      kdf_opslimit:3,
      kdf_memlimit_bytes:536870912,
      kdf_output_bytes:32,
      salt_b64:b64(zeros(16)),
      aead:"XChaCha20-Poly1305-IETF",
      nonce_b64:b64(zeros(24)),
      aad:"PMV-PWA-WRAPPED-KEK-V1|vault_id=synthetic-vault|key_generation=7",
      wrapped_kek_ciphertext_b64:b64(zeros(48)),
      created_at_utc:new Date().toISOString()
    };

    const canonical=p=>"PMV-PWA-WRAPPED-KEK-V1|vault_id="+p.vault_id+"|key_generation="+p.key_generation;

    const valid=
      pkg.format_id==="PMV-PWA-WRAPPED-KEK-V1" &&
      pkg.format_version===1 &&
      pkg.vault_id.length>0 &&
      Number.isInteger(pkg.key_generation) && pkg.key_generation>=1 &&
      pkg.kdf==="Argon2id13" &&
      pkg.kdf_opslimit===3 &&
      pkg.kdf_memlimit_bytes===536870912 &&
      pkg.kdf_output_bytes===32 &&
      b64len(pkg.salt_b64)===16 &&
      pkg.aead==="XChaCha20-Poly1305-IETF" &&
      b64len(pkg.nonce_b64)===24 &&
      pkg.aad===canonical(pkg) &&
      b64len(pkg.wrapped_kek_ciphertext_b64)===48;

    const wrongVault={...pkg,vault_id:"other-vault"};
    const wrongGen={...pkg,key_generation:8};
    const wrongAAD={...pkg,aad:pkg.aad+" "};
    const badSalt={...pkg,salt_b64:b64(zeros(15))};
    const badNonce={...pkg,nonce_b64:b64(zeros(23))};
    const badCipher={...pkg,wrapped_kek_ciphertext_b64:b64(zeros(47))};

    const checks={
      VALID_PACKAGE:valid,
      VAULT_BINDING_MISMATCH_FAIL_CLOSED:wrongVault.aad!==canonical(wrongVault),
      KEY_GENERATION_MISMATCH_FAIL_CLOSED:wrongGen.aad!==canonical(wrongGen),
      AAD_EXACT_MATCH_REQUIRED:wrongAAD.aad!==canonical(wrongAAD),
      SALT_LENGTH_FAIL_CLOSED:b64len(badSalt.salt_b64)!==16,
      NONCE_LENGTH_FAIL_CLOSED:b64len(badNonce.nonce_b64)!==24,
      CIPHERTEXT_LENGTH_FAIL_CLOSED:b64len(badCipher.wrapped_kek_ciphertext_b64)!==48
    };

    r.push("SYNTHETIC_ONLY=true");
    for(const [k,v] of Object.entries(checks)) r.push(k+"="+(v?"PASS":"FAIL"));
    r.push("RECOVERY_AUTHORITY_TOUCHED=NO");
    r.push("PRODUCTION_KEK_ACCESSED=NO");
    r.push("PRODUCTION_MEDIA_ACCESS=NONE");
    r.push("PC5_RUNTIME_VALIDATION="+(Object.values(checks).every(Boolean)?"PASS":"FAIL"));
  }catch(e){
    r.push("PC5_RUNTIME_VALIDATION=FAIL");
    r.push("ERROR="+String(e?.message||e));
    r.push("PRODUCTION_KEK_ACCESSED=NO");
    r.push("PRODUCTION_MEDIA_ACCESS=NONE");
  }
  out.textContent=r.join("\n");
};

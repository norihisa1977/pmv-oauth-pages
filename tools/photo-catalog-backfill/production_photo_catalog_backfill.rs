use pmv_core::{
    encrypt_segment, generate_key, restore_photo_local, unwrap_media_dek, WrappedKeyV1,
    AEAD_KEY_BYTES, AEAD_NONCE_BYTES,
};
use pmv_core::windows_normal_access::unlock_production_kek_interactive;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    env,
    fs,
    path::{Path},
    process::Command,
};
use zeroize::Zeroize;

const VAULT_ID: &str = "pmv-v1-production";
const KEY_GENERATION: u64 = 1;
const PHOTO_COUNT: usize = 392;
const CATALOG_FORMAT: &str = "PMV-PHOTO-CATALOG-V0";
const THUMBNAIL_FORMAT: &str = "PMV-PHOTO-THUMBNAIL-V0";

#[derive(Debug, Clone, Deserialize)]
struct CloudRow {
    status: String,
    media_id: String,
    kind: String,
    manifest_file_id: String,
    media_file_id: String,
    manifest_bytes: u64,
    media_bytes: u64,
}

#[derive(Debug, Clone, Deserialize)]
struct ProductionPhotoRecord {
    vault_id: String,
    media_id: String,
    key_generation: u64,
    wrapped_media_dek: WrappedKeyV1,
    manifest_object_name: String,
    photo_object_name: String,
}

#[derive(Debug, Serialize)]
struct CatalogEncryptedPackage {
    format: String,
    vault_id: String,
    generation: u64,
    key_generation: u64,
    cipher_suite: String,
    wrapped_catalog_dek: WrappedKeyV1,
    catalog_nonce_hex: String,
    catalog_ciphertext_hex: String,
}

fn random_nonce() -> Result<[u8; AEAD_NONCE_BYTES], String> {
    let mut random = generate_key()?;
    let mut nonce = [0u8; AEAD_NONCE_BYTES];
    nonce.copy_from_slice(&random[..AEAD_NONCE_BYTES]);
    random.zeroize();
    Ok(nonce)
}

fn thumbnail_aad(media_id: &str) -> Vec<u8> {
    format!(
        "pmv:photo-thumbnail:v0\nvault_id={VAULT_ID}\nmedia_id={media_id}\nobject_role=thumbnail\nthumbnail_format={THUMBNAIL_FORMAT}\nkey_generation={KEY_GENERATION}\n"
    )
    .into_bytes()
}

fn catalog_wrap_aad(generation: u64) -> Vec<u8> {
    format!(
        "pmv:v1:key-wrap\npurpose=photo-catalog-dek\nvault_id={VAULT_ID}\nsubject_id={CATALOG_FORMAT}:generation:{generation}\nkey_generation={KEY_GENERATION}\n"
    )
    .into_bytes()
}

fn catalog_body_aad(generation: u64) -> Vec<u8> {
    format!(
        "pmv:photo-catalog:v0\nvault_id={VAULT_ID}\nformat={CATALOG_FORMAT}\ngeneration={generation}\n"
    )
    .into_bytes()
}

fn read_canonical_photo_rows(production_dir: &Path) -> Result<Vec<CloudRow>, String> {
    let state_path = production_dir
        .join("migration")
        .join("full_media_cloud_state.jsonl");

    let content = fs::read_to_string(&state_path)
        .map_err(|e| format!("read cloud state failed: {e}"))?;

    let mut by_media = BTreeMap::<String, CloudRow>::new();

    for (line_number, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let row: CloudRow = serde_json::from_str(trimmed)
            .map_err(|e| format!("cloud state JSON invalid at line {}: {e}", line_number + 1))?;

        if row.status == "CLOUD_VERIFIED" && row.kind == "PHOTO" {
            if row.media_id.is_empty()
                || row.manifest_file_id.is_empty()
                || row.media_file_id.is_empty()
            {
                return Err(format!("canonical cloud row missing field: {}", row.media_id));
            }

            by_media.insert(row.media_id.clone(), row);
        }
    }

    let rows: Vec<CloudRow> = by_media.into_values().collect();

    if rows.len() != PHOTO_COUNT {
        return Err(format!(
            "CANONICAL_PHOTO_COUNT_MISMATCH={} EXPECTED={PHOTO_COUNT}",
            rows.len()
        ));
    }

    Ok(rows)
}

fn stage_thumbnails(
    production_dir: &Path,
    work_dir: &Path,
    thumbnail_script: &Path,
    generation: u64,
) -> Result<(), String> {
    if generation == 0 {
        return Err("CATALOG_GENERATION_INVALID".into());
    }

    let rows = read_canonical_photo_rows(production_dir)?;
    let encrypted_dir = work_dir.join("encrypted-thumbnails");
    let plain_dir = work_dir.join("transient-plaintext");

    fs::create_dir_all(&encrypted_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&plain_dir).map_err(|e| e.to_string())?;

    let mut vault_kek = unlock_production_kek_interactive()?;

    let operation = (|| -> Result<(), String> {
        for (ordinal, row) in rows.iter().enumerate() {
            let media_dir = production_dir.join("media").join(&row.media_id);
            let record_path = media_dir.join("production_record.json");

            let record: ProductionPhotoRecord = serde_json::from_slice(
                &fs::read(&record_path)
                    .map_err(|e| format!("read production record {} failed: {e}", row.media_id))?,
            )
            .map_err(|e| format!("parse production record {} failed: {e}", row.media_id))?;

            if record.vault_id != VAULT_ID
                || record.media_id != row.media_id
                || record.key_generation != KEY_GENERATION
            {
                return Err(format!("PRODUCTION_RECORD_AUTHORITY_MISMATCH={}", row.media_id));
            }

            let manifest_path = media_dir.join(&record.manifest_object_name);
            let photo_path = media_dir.join(&record.photo_object_name);

            let manifest_len = fs::metadata(&manifest_path)
                .map_err(|e| format!("manifest metadata {} failed: {e}", row.media_id))?
                .len();
            let photo_len = fs::metadata(&photo_path)
                .map_err(|e| format!("photo metadata {} failed: {e}", row.media_id))?
                .len();

            if manifest_len != row.manifest_bytes || photo_len != row.media_bytes {
                return Err(format!("CANONICAL_LOCAL_SIZE_MISMATCH={}", row.media_id));
            }

            let plain_photo = plain_dir.join(format!("{}-source.bin", row.media_id));
            let plain_thumb = plain_dir.join(format!("{}-thumb.jpg", row.media_id));
            let encrypted_thumb = encrypted_dir.join(format!("{ordinal:06}.thumb.enc"));

            let _ = fs::remove_file(&plain_photo);
            let _ = fs::remove_file(&plain_thumb);
            let _ = fs::remove_file(&encrypted_thumb);

            let mut media_dek = unwrap_media_dek(
                &record.vault_id,
                &record.media_id,
                record.key_generation,
                &vault_kek,
                &record.wrapped_media_dek,
            )?;

            let item_result = (|| -> Result<(), String> {
                restore_photo_local(
                    &record.vault_id,
                    &record.media_id,
                    &media_dek,
                    &manifest_path,
                    &plain_photo,
                )?;

                let status = Command::new("powershell.exe")
                    .arg("-NoProfile")
                    .arg("-NonInteractive")
                    .arg("-ExecutionPolicy")
                    .arg("Bypass")
                    .arg("-File")
                    .arg(thumbnail_script)
                    .arg("-InputPath")
                    .arg(&plain_photo)
                    .arg("-OutputPath")
                    .arg(&plain_thumb)
                    .arg("-MaxDimension")
                    .arg("320")
                    .arg("-JpegQuality")
                    .arg("82")
                    .status()
                    .map_err(|e| format!("thumbnail generator launch failed: {e}"))?;

                if !status.success() {
                    return Err(format!("THUMBNAIL_GENERATION_FAILED={}", row.media_id));
                }

                let mut thumbnail_plaintext = fs::read(&plain_thumb)
                    .map_err(|e| format!("read thumbnail plaintext failed: {e}"))?;

                if thumbnail_plaintext.is_empty() {
                    return Err(format!("THUMBNAIL_PLAINTEXT_EMPTY={}", row.media_id));
                }

                let nonce = random_nonce()?;
                let ciphertext = encrypt_segment(
                    &media_dek,
                    &nonce,
                    &thumbnail_plaintext,
                    &thumbnail_aad(&row.media_id),
                )?;

                let mut envelope = Vec::with_capacity(AEAD_NONCE_BYTES + ciphertext.len());
                envelope.extend_from_slice(&nonce);
                envelope.extend_from_slice(&ciphertext);

                fs::write(&encrypted_thumb, &envelope)
                    .map_err(|e| format!("write encrypted thumbnail failed: {e}"))?;

                thumbnail_plaintext.zeroize();
                envelope.zeroize();

                Ok(())
            })();

            media_dek.zeroize();
            let _ = fs::remove_file(&plain_photo);
            let _ = fs::remove_file(&plain_thumb);

            item_result?;

            if plain_photo.exists() || plain_thumb.exists() {
                return Err(format!("TEMP_PLAINTEXT_REMAIN={}", row.media_id));
            }

            println!(
                "THUMBNAIL_STAGE_PASS={}/{} MEDIA_ID={}",
                ordinal + 1,
                PHOTO_COUNT,
                row.media_id
            );
        }

        Ok(())
    })();

    vault_kek.zeroize();

    if let Err(e) = operation {
        let _ = fs::remove_dir_all(&plain_dir);
        return Err(e);
    }

    let _ = fs::remove_dir_all(&plain_dir);

    let encrypted_count = fs::read_dir(&encrypted_dir)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().extension().and_then(|x| x.to_str()) == Some("enc"))
        .count();

    if encrypted_count != PHOTO_COUNT {
        return Err(format!("THUMBNAIL_STAGE_COUNT_MISMATCH={encrypted_count}"));
    }

    println!("PHOTO_CATALOG_BACKFILL_STAGE=PASS");
    println!("PHOTO_COUNT={PHOTO_COUNT}");
    println!("THUMBNAIL_ENCRYPTED={PHOTO_COUNT}");
    println!("TEMP_PLAINTEXT_REMAIN=0");

    Ok(())
}

fn read_thumbnail_ids_from_env() -> Result<Vec<String>, String> {
    let raw = env::var("PMV_CATALOG_THUMBNAIL_FILE_IDS_JSON")
        .map_err(|_| "CATALOG_THUMBNAIL_FILE_IDS_ENV_MISSING".to_string())?;

    let ids: Vec<String> =
        serde_json::from_str(&raw).map_err(|e| format!("thumbnail file ID JSON invalid: {e}"))?;

    if ids.len() != PHOTO_COUNT {
        return Err(format!(
            "THUMBNAIL_FILE_ID_COUNT_MISMATCH={} EXPECTED={PHOTO_COUNT}",
            ids.len()
        ));
    }

    if ids.iter().any(|id| id.trim().is_empty()) {
        return Err("THUMBNAIL_FILE_ID_EMPTY".into());
    }

    let mut unique = std::collections::BTreeSet::new();
    for id in &ids {
        if !unique.insert(id.clone()) {
            return Err(format!("DUPLICATE_THUMBNAIL_FILE_ID={id}"));
        }
    }

    Ok(ids)
}

fn encrypt_catalog_from_env(
    production_dir: &Path,
    encrypted_path: &Path,
    generation: u64,
) -> Result<(), String> {
    if generation == 0 {
        return Err("CATALOG_GENERATION_INVALID".into());
    }

    let rows = read_canonical_photo_rows(production_dir)?;
    let thumbnail_ids = read_thumbnail_ids_from_env()?;

    let created_at = env::var("PMV_CATALOG_CREATED_AT")
        .map_err(|_| "CATALOG_CREATED_AT_ENV_MISSING".to_string())?;

    let entries: Vec<serde_json::Value> = rows
        .iter()
        .enumerate()
        .map(|(ordinal, row)| {
            serde_json::json!({
                "ordinal": ordinal,
                "media_id": row.media_id,
                "manifest_file_id": row.manifest_file_id,
                "photo_file_id": row.media_file_id,
                "thumbnail_file_id": thumbnail_ids[ordinal],
                "capture_time": serde_json::Value::Null
            })
        })
        .collect();

    let catalog = serde_json::json!({
        "format": CATALOG_FORMAT,
        "vault_id": VAULT_ID,
        "generation": generation,
        "photo_count": PHOTO_COUNT,
        "created_at": created_at,
        "entries": entries
    });

    let mut catalog_plain =
        serde_json::to_vec(&catalog).map_err(|e| format!("serialize catalog failed: {e}"))?;

    let mut vault_kek = unlock_production_kek_interactive()?;
    let mut catalog_dek = generate_key()?;

    let operation = (|| -> Result<CatalogEncryptedPackage, String> {
        let wrap_nonce = random_nonce()?;
        let wrapped_ciphertext = encrypt_segment(
            &vault_kek,
            &wrap_nonce,
            &catalog_dek,
            &catalog_wrap_aad(generation),
        )?;

        let catalog_nonce = random_nonce()?;
        let catalog_ciphertext = encrypt_segment(
            &catalog_dek,
            &catalog_nonce,
            &catalog_plain,
            &catalog_body_aad(generation),
        )?;

        Ok(CatalogEncryptedPackage {
            format: "PMV-PHOTO-CATALOG-ENCRYPTED-V0".into(),
            vault_id: VAULT_ID.into(),
            generation,
            key_generation: KEY_GENERATION,
            cipher_suite: "XChaCha20-Poly1305-IETF".into(),
            wrapped_catalog_dek: WrappedKeyV1 {
                nonce_hex: hex::encode(wrap_nonce),
                ciphertext_hex: hex::encode(wrapped_ciphertext),
            },
            catalog_nonce_hex: hex::encode(catalog_nonce),
            catalog_ciphertext_hex: hex::encode(catalog_ciphertext),
        })
    })();

    catalog_dek.zeroize();
    vault_kek.zeroize();
    catalog_plain.zeroize();

    let package = operation?;

    if encrypted_path.exists() {
        return Err("CATALOG_ENCRYPTED_OUTPUT_ALREADY_EXISTS".into());
    }

    fs::write(
        encrypted_path,
        serde_json::to_vec_pretty(&package).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    println!("PHOTO_CATALOG_ENCRYPT=PASS");
    println!("CATALOG_PLAINTEXT_PERSISTED=NO");
    println!("CATALOG_GENERATION={generation}");
    println!("CATALOG_ENTRY_COUNT={PHOTO_COUNT}");
    println!("CATALOG_ENCRYPTED_PATH={}", encrypted_path.display());

    Ok(())
}

fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().collect();

    match args.get(1).map(String::as_str) {
        Some("stage-thumbnails") if args.len() == 6 => {
            let generation = args[5]
                .parse::<u64>()
                .map_err(|_| "CATALOG_GENERATION_INVALID".to_string())?;

            stage_thumbnails(
                Path::new(&args[2]),
                Path::new(&args[3]),
                Path::new(&args[4]),
                generation,
            )
        }
        Some("encrypt-catalog-from-env") if args.len() == 5 => {
            let generation = args[4]
                .parse::<u64>()
                .map_err(|_| "CATALOG_GENERATION_INVALID".to_string())?;

            encrypt_catalog_from_env(Path::new(&args[2]), Path::new(&args[3]), generation)
        }
        _ => Err(
            "usage: production_photo_catalog_backfill stage-thumbnails <production_dir> <work_dir> <thumbnail_script> <generation> | encrypt-catalog-from-env <production_dir> <catalog_encrypted_json> <generation>"
                .into(),
        ),
    }
}

fn main() {
    if let Err(e) = run() {
        eprintln!("{e}");
        std::process::exit(1);
    }
}

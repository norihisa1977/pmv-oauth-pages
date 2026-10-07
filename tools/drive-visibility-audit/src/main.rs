use clap::Parser;
use reqwest::blocking::Client;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{env, fs, path::PathBuf, thread, time::Duration};

const DRIVE_FILE_SCOPE: &str = "https://www.googleapis.com/auth/drive.file";
const FORMAT_ID: &str = "PMV-DRIVE-VISIBILITY-AUDIT-V1";

#[derive(Parser, Debug)]
#[command(name = "pmv-drive-visibility-audit")]
struct Args {
    /// UTF-8 text file containing one Google Drive fileId per line.
    #[arg(long)]
    input: PathBuf,

    /// Expected OAuth client ID. Recorded in evidence and checked against tokeninfo when available.
    #[arg(long)]
    client_id: String,

    /// JSON evidence output path.
    #[arg(long)]
    output: PathBuf,

    /// Maximum retry count for 429 and selected 5xx responses.
    #[arg(long, default_value_t = 3)]
    max_retries: u32,
}

#[derive(Debug, Deserialize)]
struct TokenInfo {
    #[serde(default)]
    audience: Option<String>,
    #[serde(default)]
    aud: Option<String>,
    #[serde(default)]
    scope: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DriveMetadata {
    id: String,
    #[serde(default)]
    size: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum Classification {
    Visible,
    NotVisible,
    Error,
}

#[derive(Debug, Serialize)]
struct AuditResult {
    file_id: String,
    classification: Classification,
    http_status: Option<u16>,
    size: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
struct Evidence {
    audit_format: &'static str,
    client_id: String,
    scope: &'static str,
    checked_at: String,
    metadata_fields: &'static str,
    body_downloaded: bool,
    production_mutation: bool,
    input_sha256: String,
    total: usize,
    visible: usize,
    not_visible: usize,
    error: usize,
    all_targets_visible: bool,
    results: Vec<AuditResult>,
}

fn main() {
    if let Err(e) = run() {
        eprintln!("DRIVE_VISIBILITY_AUDIT=FAIL");
        eprintln!("ERROR={e}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();

    let token =
        env::var("PMV_DRIVE_ACCESS_TOKEN").map_err(|_| "PMV_DRIVE_ACCESS_TOKEN is not set")?;

    if token.trim().is_empty() {
        return Err("PMV_DRIVE_ACCESS_TOKEN is empty".into());
    }

    let input_bytes = fs::read(&args.input)?;
    let input_sha256 = hex::encode(Sha256::digest(&input_bytes));
    let input_text = String::from_utf8(input_bytes)?;

    let file_ids: Vec<String> = input_text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(ToOwned::to_owned)
        .collect();

    if file_ids.is_empty() {
        return Err("input contains no file IDs".into());
    }

    let client = Client::builder()
        .user_agent("pmv-drive-visibility-audit/0.1")
        .timeout(Duration::from_secs(20))
        .build()?;

    verify_token_context(&client, &token, &args.client_id)?;

    let mut results = Vec::with_capacity(file_ids.len());

    for file_id in &file_ids {
        results.push(probe_file(&client, &token, file_id, args.max_retries));
    }

    if results.len() != file_ids.len() {
        return Err("INPUT_OUTPUT_COUNT_MISMATCH".into());
    }

    let visible = results
        .iter()
        .filter(|r| matches!(r.classification, Classification::Visible))
        .count();
    let not_visible = results
        .iter()
        .filter(|r| matches!(r.classification, Classification::NotVisible))
        .count();
    let error = results
        .iter()
        .filter(|r| matches!(r.classification, Classification::Error))
        .count();

    let evidence = Evidence {
        audit_format: FORMAT_ID,
        client_id: args.client_id.clone(),
        scope: DRIVE_FILE_SCOPE,
        checked_at: chrono::Utc::now().to_rfc3339(),
        metadata_fields: "id,size",
        body_downloaded: false,
        production_mutation: false,
        input_sha256,
        total: results.len(),
        visible,
        not_visible,
        error,
        all_targets_visible: visible == results.len(),
        results,
    };

    fs::write(&args.output, serde_json::to_vec_pretty(&evidence)?)?;

    println!("DRIVE_VISIBILITY_AUDIT=PASS");
    println!("CLIENT_ID={}", args.client_id);
    println!("SCOPE=drive.file");
    println!("TOTAL={}", evidence.total);
    println!("VISIBLE={}", evidence.visible);
    println!("NOT_VISIBLE={}", evidence.not_visible);
    println!("ERROR={}", evidence.error);
    println!(
        "ALL_TARGETS_VISIBLE={}",
        if evidence.all_targets_visible {
            "YES"
        } else {
            "NO"
        }
    );
    println!("MEDIA_BODY_DOWNLOADED=NO");
    println!("PRODUCTION_MUTATION=NO");

    Ok(())
}

fn verify_token_context(
    client: &Client,
    token: &str,
    expected_client_id: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let response = client
        .get("https://oauth2.googleapis.com/tokeninfo")
        .query(&[("access_token", token)])
        .send()?;

    if !response.status().is_success() {
        return Err(format!("TOKENINFO_HTTP_{}", response.status().as_u16()).into());
    }

    let info: TokenInfo = response.json()?;

    let audience = info
        .audience
        .or(info.aud)
        .ok_or("TOKENINFO_CLIENT_ID_MISSING")?;

    if audience != expected_client_id {
        return Err("OAUTH_CLIENT_ID_MISMATCH".into());
    }

    let scope_text = info.scope.ok_or("TOKENINFO_SCOPE_MISSING")?;
    let scopes: Vec<&str> = scope_text.split_whitespace().collect();

    if !scopes.iter().any(|s| *s == DRIVE_FILE_SCOPE) {
        return Err("OAUTH_SCOPE_MISMATCH".into());
    }

    let forbidden = [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/drive.readonly",
    ];

    if scopes.iter().any(|s| forbidden.contains(s)) {
        return Err("OAUTH_SCOPE_TOO_BROAD".into());
    }

    Ok(())
}

fn probe_file(client: &Client, token: &str, file_id: &str, max_retries: u32) -> AuditResult {
    let url = format!(
        "https://www.googleapis.com/drive/v3/files/{}",
        percent_encode_path_segment(file_id)
    );

    for attempt in 0..=max_retries {
        let response = client
            .get(&url)
            .query(&[("fields", "id,size")])
            .bearer_auth(token)
            .send();

        match response {
            Ok(resp) => {
                let status = resp.status();

                if status == StatusCode::OK {
                    match resp.json::<DriveMetadata>() {
                        Ok(meta) if meta.id == file_id => {
                            return AuditResult {
                                file_id: file_id.to_owned(),
                                classification: Classification::Visible,
                                http_status: Some(200),
                                size: meta.size,
                                error: None,
                            };
                        }
                        Ok(_) => {
                            return error_result(file_id, Some(200), "RESPONSE_ID_MISMATCH");
                        }
                        Err(e) => {
                            return error_result(
                                file_id,
                                Some(200),
                                &format!("JSON_PARSE_FAILED:{e}"),
                            );
                        }
                    }
                }

                if status == StatusCode::FORBIDDEN || status == StatusCode::NOT_FOUND {
                    return AuditResult {
                        file_id: file_id.to_owned(),
                        classification: Classification::NotVisible,
                        http_status: Some(status.as_u16()),
                        size: None,
                        error: Some("NOT_VISIBLE_OR_NOT_FOUND_TO_CLIENT".to_string()),
                    };
                }

                if retryable(status) && attempt < max_retries {
                    backoff(attempt);
                    continue;
                }

                return error_result(
                    file_id,
                    Some(status.as_u16()),
                    &format!("UNEXPECTED_HTTP_{}", status.as_u16()),
                );
            }
            Err(e) => {
                if attempt < max_retries {
                    backoff(attempt);
                    continue;
                }
                return error_result(file_id, None, &format!("NETWORK_ERROR:{e}"));
            }
        }
    }

    error_result(file_id, None, "UNREACHABLE_RETRY_STATE")
}

fn retryable(status: StatusCode) -> bool {
    matches!(status.as_u16(), 429 | 500 | 502 | 503 | 504)
}

fn backoff(attempt: u32) {
    let millis = 250_u64.saturating_mul(1_u64 << attempt.min(5));
    thread::sleep(Duration::from_millis(millis));
}

fn error_result(file_id: &str, status: Option<u16>, message: &str) -> AuditResult {
    AuditResult {
        file_id: file_id.to_owned(),
        classification: Classification::Error,
        http_status: status,
        size: None,
        error: Some(message.to_string()),
    }
}

fn percent_encode_path_segment(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

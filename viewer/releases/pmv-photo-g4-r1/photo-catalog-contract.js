(function (root) {
  "use strict";
  const VAULT = "pmv-v1-production";
  const SET = "51dcb4c605920b1520d8ec21b97d02a2c4e19adecce1ba792e3b5a78823b2f57";
  const hex = (s, n) => typeof s === "string" && new RegExp(`^[a-f0-9]{${n}}$`, "i").test(s);
  const id = s => typeof s === "string" && /^[A-Za-z0-9_-]{10,}$/.test(s);
  function validateRelease(r) {
    if (!r || r.format !== "PMV-PHOTO-CATALOG-RELEASE-V1" || r.vault_id !== VAULT || r.key_generation !== 1 ||
        !Number.isSafeInteger(r.generation) || r.generation !== 4 || r.photo_count !== 353 ||
        !id(r.catalog_file_id) || r.catalog_file_id !== "1DgwU9ZGLd2vdoGgxmu3yfP3RSXbcwCDN" || r.catalog_bytes !== 430227 || r.catalog_sha256 !== "7ee177dd316af464c28e1fdc050266fcbb0689a9b3b3e6cdb2754807e44ae3e7" || r.target_set_sha256 !== "f2feea5d1a9b9f123d34f94690e7aa43d77415a1ff5bc9c62ec1e93d35f8133e" ||
        !hex(r.catalog_sha256, 64) || !hex(r.target_set_sha256, 64) || r.media_ids_sha256_utf8_lf !== SET)
      throw new Error("PHOTO_CATALOG_RELEASE_INVALID");
    return Object.freeze({ ...r });
  }
  async function validateCatalog(c, r, sha256) {
    validateRelease(r);
    if (!c || c.format !== "PMV-PHOTO-CATALOG-V1" || c.vault_id !== VAULT || c.generation !== r.generation ||
        c.photo_count !== r.photo_count || c.target_set_sha256 !== r.target_set_sha256 ||
        c.media_ids_sha256_utf8_lf !== r.media_ids_sha256_utf8_lf || !Array.isArray(c.entries) || c.entries.length !== r.photo_count)
      throw new Error("PHOTO_CATALOG_PLAINTEXT_INVALID");
    const media = new Set(), originals = new Set(), thumbnails = new Set();
    const leaf = s => typeof s === "string" && !!s && !/[\\/:]/.test(s) && s !== "." && s !== "..";
    c.entries.forEach((e, i) => {
      if (!e || e.ordinal !== i || !/^photo-[0-9]+-[a-f0-9]+$/.test(e.media_id) || media.has(e.media_id) ||
          !id(e.manifest_file_id) || !id(e.photo_file_id) || !id(e.thumbnail_file_id) ||
          originals.has(e.manifest_file_id) || originals.has(e.photo_file_id) || e.manifest_file_id === e.photo_file_id ||
          thumbnails.has(e.thumbnail_file_id) || !leaf(e.manifest_object_name) || !leaf(e.photo_object_name) ||
          !hex(e.wrapped_media_dek?.nonce_hex, 48) || !hex(e.wrapped_media_dek?.ciphertext_hex, 96))
        throw new Error("PHOTO_CATALOG_ENTRY_INVALID=" + i);
      media.add(e.media_id); originals.add(e.manifest_file_id); originals.add(e.photo_file_id); thumbnails.add(e.thumbnail_file_id);
    });
    if (originals.has(r.catalog_file_id) || thumbnails.has(r.catalog_file_id) || [...thumbnails].some(v => originals.has(v)))
      throw new Error("PHOTO_CATALOG_OBJECT_ID_REUSED");
    const setText = [...media].sort().join("\n") + "\n";
    if (await sha256(new TextEncoder().encode(setText)) !== r.media_ids_sha256_utf8_lf)
      throw new Error("PHOTO_CATALOG_MEDIA_ID_SET_MISMATCH");
    return c;
  }
  const api = Object.freeze({ validateRelease, validateCatalog });
  root.PmvPhotoCatalogContract = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);

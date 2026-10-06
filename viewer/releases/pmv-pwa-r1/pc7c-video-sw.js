let videoParts = null;
let videoTotalLength = 0;
let videoMime = "video/mp4";
let partOffsets = null;

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

function zeroVideo() {
  if (Array.isArray(videoParts)) {
    for (const part of videoParts) {
      if (part instanceof Uint8Array) {
        part.fill(0);
      }
    }
  }

  videoParts = null;
  partOffsets = null;
  videoTotalLength = 0;
}

self.addEventListener("message", event => {
  const data = event.data || {};

  if (data.type === "PMV_VIDEO_SET") {
    zeroVideo();

    videoParts = (data.parts || []).map(buffer => new Uint8Array(buffer));
    videoTotalLength = Number(data.totalLength || 0);
    videoMime = String(data.mime || "video/mp4");

    partOffsets = [];
    let offset = 0;

    for (const part of videoParts) {
      partOffsets.push(offset);
      offset += part.length;
    }

    const ok =
      videoParts.length > 0 &&
      offset === videoTotalLength;

    if (!ok) {
      zeroVideo();
    }

    event.source?.postMessage({
      type: "PMV_VIDEO_SET_RESULT",
      ok,
      totalLength: ok ? videoTotalLength : 0
    });

    return;
  }

  if (data.type === "PMV_VIDEO_CLEAR") {
    zeroVideo();

    event.source?.postMessage({
      type: "PMV_VIDEO_CLEAR_RESULT",
      ok: true
    });
  }
});

function parseRange(value, total) {
  if (!value) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match) return null;

  let start;
  let end;

  if (match[1] === "" && match[2] !== "") {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, total - suffix);
    end = total - 1;
  }
  else {
    start = Number(match[1]);
    end = match[2] === "" ? total - 1 : Number(match[2]);
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= total
  ) {
    return null;
  }

  end = Math.min(end, total - 1);
  return {start, end};
}

function copyRange(start, endInclusive) {
  const length = endInclusive - start + 1;
  const out = new Uint8Array(length);
  let written = 0;

  for (let i = 0; i < videoParts.length && written < length; i++) {
    const part = videoParts[i];
    const partStart = partOffsets[i];
    const partEnd = partStart + part.length - 1;

    if (endInclusive < partStart) break;
    if (start > partEnd) continue;

    const localStart = Math.max(0, start - partStart);
    const localEndExclusive =
      Math.min(part.length, endInclusive - partStart + 1);

    const slice = part.subarray(localStart, localEndExclusive);
    out.set(slice, written);
    written += slice.length;
  }

  if (written !== length) {
    throw new Error("PMV_SW_RANGE_COPY_MISMATCH");
  }

  return out;
}

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  if (!url.pathname.endsWith("/pc7c-video-virtual.mp4")) {
    return;
  }

  event.respondWith((async () => {
    if (!Array.isArray(videoParts) || videoTotalLength <= 0) {
      return new Response("PMV video unavailable", {status: 503});
    }

    const rangeHeader = event.request.headers.get("range");
    const range = parseRange(rangeHeader, videoTotalLength);

    if (rangeHeader && !range) {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": "bytes */" + videoTotalLength,
          "Accept-Ranges": "bytes"
        }
      });
    }

    if (range) {
      const body = copyRange(range.start, range.end);

      return new Response(body, {
        status: 206,
        headers: {
          "Content-Type": videoMime,
          "Accept-Ranges": "bytes",
          "Content-Range":
            "bytes " + range.start + "-" + range.end + "/" + videoTotalLength,
          "Content-Length": String(body.length),
          "Cache-Control": "no-store"
        }
      });
    }

    const body = copyRange(0, videoTotalLength - 1);

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": videoMime,
        "Accept-Ranges": "bytes",
        "Content-Length": String(body.length),
        "Cache-Control": "no-store"
      }
    });
  })());
});

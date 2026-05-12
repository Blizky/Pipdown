import { stitchSnapsLocally } from "./localStitch.js";
import { getCachedDigest, putCachedDigest } from "./storage.js";
import { APP_NAME } from "./config.js";

function buildSignature(snaps, aspectRatio, outroKey = "") {
  const ordered = snaps.sort((a, b) => a.orderIndex - b.orderIndex);
  const ids = ordered.map((snap) => snap.id).join("|");
  return `${aspectRatio}::${ids}::${outroKey}`;
}

export function getDigestSignature(snaps, aspectRatio, outroKey = "") {
  return buildSignature(snaps, aspectRatio, outroKey);
}

export async function ensureLocalDigestCache({ dateKey, snaps, aspectRatio, userName = "" }) {
  const outroKey = `${dateKey}|${String(userName || "").trim()}`;
  const signature = buildSignature(snaps, aspectRatio, outroKey);
  const cached = await getCachedDigest(dateKey);
  if (cached && cached.signature === signature) return cachedToResult(cached);

  const ordered = snaps.sort((a, b) => a.orderIndex - b.orderIndex);
  if (!ordered.length) throw new Error("No snaps to export.");

  const blob = await stitchSnapsLocally(ordered, {
    aspectRatio,
    preserveCaptureAspect: true,
    outro: {
      durationSec: 2,
      date: dateKey,
      userName,
      appName: APP_NAME,
    },
  });
  await putCachedDigest({
    dateKey,
    signature,
    aspectRatio,
    videoBlob: blob,
  });

  const fresh = await getCachedDigest(dateKey);
  return cachedToResult(fresh);
}

function cachedToResult(cached) {
  const blob = new Blob([cached.videoBytes], { type: cached.videoType || "video/mp4" });
  return {
    blob,
    url: URL.createObjectURL(blob),
    signature: cached.signature,
    cached: true,
  };
}

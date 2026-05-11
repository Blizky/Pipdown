import { stitchSnapsLocally } from "./localStitch.js";
import { getCachedDigest, putCachedDigest } from "./storage.js";

function buildSignature(snaps, aspectRatio) {
  const ordered = snaps.sort((a, b) => a.orderIndex - b.orderIndex);
  const ids = ordered.map((snap) => snap.id).join("|");
  return `${aspectRatio}::${ids}`;
}

export function getDigestSignature(snaps, aspectRatio) {
  return buildSignature(snaps, aspectRatio);
}

export async function ensureLocalDigestCache({ dateKey, snaps, aspectRatio }) {
  const signature = buildSignature(snaps, aspectRatio);
  const cached = await getCachedDigest(dateKey);
  if (cached && cached.signature === signature) return cachedToResult(cached);

  const ordered = snaps.sort((a, b) => a.orderIndex - b.orderIndex);
  if (!ordered.length) throw new Error("No snaps to export.");

  const blob = await stitchSnapsLocally(ordered, {
    aspectRatio,
    preserveCaptureAspect: true,
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

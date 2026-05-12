import { APP_NAME, BLIZLAB_EXPORT_ENDPOINT } from "./config.js";
import { ensureLocalDigestCache, getDigestSignature } from "./digestCache.js";

export async function exportDigest(dayData) {
  const orderedSnaps = dayData.snaps.sort((a, b) => a.orderIndex - b.orderIndex);
  const highlight = orderedSnaps.find((snap) => snap.highlight);
  const metadata = {
    date: dayData.dateKey,
    userName: dayData.userName,
    appName: APP_NAME,
    aspectRatio: dayData.aspectRatio,
    highlightSnapId: highlight?.id || "",
    favoriteMaxDurationSec: 3,
  };
  const signature = getDigestSignature(dayData.snaps, dayData.aspectRatio, `${dayData.dateKey}|${String(dayData.userName || "").trim()}`);

  if (!orderedSnaps.length) {
    throw new Error("No snaps to export.");
  }

  if (!BLIZLAB_EXPORT_ENDPOINT) {
    const cachedResult = await ensureLocalDigestCache({
      dateKey: dayData.dateKey,
      snaps: dayData.snaps,
      aspectRatio: dayData.aspectRatio,
      userName: dayData.userName,
    });
    return {
      ...cachedResult,
      metadata,
      mocked: true,
      stale: cachedResult.signature !== signature,
    };
  }

  const body = new FormData();
  body.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));

  orderedSnaps.forEach((snap, index) => {
    const extension = snap.videoBlob.type.includes("mp4") ? "mp4" : "webm";
    body.append("clips", snap.videoBlob, `${String(index).padStart(3, "0")}-${snap.id}.${extension}`);
  });

  const response = await fetch(BLIZLAB_EXPORT_ENDPOINT, {
    method: "POST",
    body,
  });

  if (!response.ok) {
    // If server export fails, fallback to local stitch so user still gets a digest.
    const cachedResult = await ensureLocalDigestCache({
      dateKey: dayData.dateKey,
      snaps: dayData.snaps,
      aspectRatio: dayData.aspectRatio,
      userName: dayData.userName,
    });
    return {
      ...cachedResult,
      metadata,
      mocked: true,
      stale: cachedResult.signature !== signature,
    };
  }

  const blob = await response.blob();
  return {
    blob,
    url: URL.createObjectURL(blob),
    metadata,
    mocked: false,
  };
}

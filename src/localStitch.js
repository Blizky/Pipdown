function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickMimeType() {
  const candidates = ["video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return candidates.find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  }) || "";
}

function aspectToSize(aspectRatio = "1:1") {
  const table = {
    "1:1": [1200, 1200],
  };
  const [w, h] = table[aspectRatio] || table["1:1"];
  return { width: w, height: h };
}

function even(value) {
  const rounded = Math.max(2, Math.round(Number(value) || 2));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

async function probeVideoSize(blob) {
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;

  const url = URL.createObjectURL(blob);
  video.src = url;
  await waitForEvent(video, "loadedmetadata");
  const size = {
    width: even(video.videoWidth || 2),
    height: even(video.videoHeight || 2),
  };
  URL.revokeObjectURL(url);
  return size;
}

function waitForEvent(target, eventName) {
  return new Promise((resolve, reject) => {
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onFail = () => {
      cleanup();
      reject(new Error(`Media error while waiting for ${eventName}.`));
    };
    const cleanup = () => {
      target.removeEventListener(eventName, onOk);
      target.removeEventListener("error", onFail);
    };
    target.addEventListener(eventName, onOk, { once: true });
    target.addEventListener("error", onFail, { once: true });
  });
}

async function playClipToCanvas({ clipBlob, videoEl, ctx, width, height, fps = 30 }) {
  const url = URL.createObjectURL(clipBlob);
  videoEl.src = url;
  videoEl.currentTime = 0;
  await waitForEvent(videoEl, "loadedmetadata");

  const frameMs = Math.round(1000 / fps);
  let timerId = 0;
  let running = true;
  const draw = () => {
    if (!running) return;
    if (videoEl.readyState >= 2) {
      drawContain(ctx, videoEl, width, height);
    }
  };
  draw();
  timerId = window.setInterval(draw, frameMs);

  try {
    await videoEl.play();
    await waitForEvent(videoEl, "ended");
  } finally {
    running = false;
    window.clearInterval(timerId);
    videoEl.pause();
    URL.revokeObjectURL(url);
    await sleep(frameMs);
  }
}

export async function stitchSnapsLocally(snaps, options = {}) {
  if (!Array.isArray(snaps) || !snaps.length) {
    throw new Error("No visible snaps to export.");
  }
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder unavailable for local stitching.");
  }

  let target = aspectToSize(options.aspectRatio);
  if (options.preserveCaptureAspect && snaps[0]?.videoBlob) {
    try {
      target = await probeVideoSize(snaps[0].videoBlob);
    } catch {
      // Fallback to aspect-based target when metadata probe fails.
    }
  }
  const { width, height } = target;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create local stitch canvas.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const outputFps = 30;
  const stream = canvas.captureStream(outputFps);
  const mimeType = pickMimeType();
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data?.size) chunks.push(event.data);
  };

  const videoEl = document.createElement("video");
  videoEl.muted = true;
  videoEl.playsInline = true;

  const done = new Promise((resolve, reject) => {
    recorder.onstop = () => {
      if (!chunks.length) {
        reject(new Error("Local stitch produced no video output."));
        return;
      }
      resolve(new Blob(chunks, { type: recorder.mimeType || "video/mp4" }));
    };
    recorder.onerror = () => reject(recorder.error || new Error("Recorder failed during local stitch."));
  });

  recorder.start(250);

  try {
    for (let i = 0; i < snaps.length; i += 1) {
      await playClipToCanvas({ clipBlob: snaps[i].videoBlob, videoEl, ctx, width, height, fps: outputFps });
      options.onProgress?.({
        clip: i + 1,
        totalClips: snaps.length,
        progress: (i + 1) / snaps.length,
      });
    }
  } finally {
    if (recorder.state !== "inactive") {
      try {
        recorder.requestData();
      } catch {
        // Ignore early requestData failures.
      }
      recorder.stop();
    }
    stream.getTracks().forEach((track) => track.stop());
  }

  return done;
}

function drawContain(ctx, sourceVideo, targetWidth, targetHeight) {
  const sw = sourceVideo.videoWidth || targetWidth;
  const sh = sourceVideo.videoHeight || targetHeight;

  const sourceRatio = sw / sh;
  const targetRatio = targetWidth / targetHeight;

  let dw = targetWidth;
  let dh = targetHeight;
  if (sourceRatio > targetRatio) {
    dh = Math.round(targetWidth / sourceRatio);
  } else {
    dw = Math.round(targetHeight * sourceRatio);
  }

  const dx = Math.floor((targetWidth - dw) / 2);
  const dy = Math.floor((targetHeight - dh) / 2);

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(sourceVideo, dx, dy, dw, dh);
}

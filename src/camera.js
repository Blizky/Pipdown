export class CameraController {
  constructor({ video, canvas, placeholder, status, progressCircle, recordingOverlay, recordingStatus }) {
    this.video = video;
    this.canvas = canvas;
    this.placeholder = placeholder;
    this.status = status;
    this.progressCircle = progressCircle;
    this.recordingOverlay = recordingOverlay;
    this.recordingStatus = recordingStatus;
    this.stream = null;
    this.isRecording = false;
    this.progressAnimation = null;
  }

  async start({ deviceId = "", aspectRatio = "1:1" } = {}) {
    this.stop();

    const captureTarget = getCaptureTarget(aspectRatio);
    const videoConstraints = {
      aspectRatio: captureTarget.aspect,
      width: { ideal: captureTarget.width },
      height: { ideal: captureTarget.height },
      facingMode: deviceId ? undefined : { ideal: "environment" },
      deviceId: deviceId ? { exact: deviceId } : undefined,
    };

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false,
    });

    this.video.srcObject = this.stream;
    await this.video.play();
    this.placeholder.hidden = true;
    this.status.textContent = "Ready";
    return this.stream;
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  captureStill() {
    const width = this.video.videoWidth || 960;
    const height = this.video.videoHeight || 720;
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.getContext("2d").drawImage(this.video, 0, 0, width, height);
    return new Promise((resolve) => {
      this.canvas.toBlob((blob) => {
        resolve({
          blob,
          url: this.canvas.toDataURL("image/jpeg", 0.88),
        });
      }, "image/jpeg", 0.88);
    });
  }

  async recordClip(durationSeconds) {
    if (!this.stream || this.isRecording) return null;

    if (typeof MediaRecorder === "undefined") {
      throw new Error("MediaRecorder is not available in this browser.");
    }

    this.isRecording = true;
    this.setProgress(0);
    this.recordingOverlay.hidden = false;
    this.recordingStatus.textContent = `Recording ${durationSeconds}s`;
    this.animateProgress(durationSeconds * 1000);
    let blob;
    try {
      blob = await recordBlobFromStream(this.stream, durationSeconds);
    } catch (error) {
      if (!supportsCanvasCapture()) throw error;
      this.recordingStatus.textContent = "Recording fallback...";
      blob = await recordBlobFromCanvas(this.video, durationSeconds);
    }

    this.isRecording = false;
    this.recordingOverlay.hidden = true;
    this.canvas.classList.remove("is-visible");
    cancelAnimationFrame(this.progressAnimation);
    this.status.textContent = "Saved";
    return blob;
  }

  animateProgress(durationMs) {
    const startedAt = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - startedAt) / durationMs, 1);
      this.setProgress(progress);
      if (progress < 1) this.progressAnimation = requestAnimationFrame(tick);
    };
    this.progressAnimation = requestAnimationFrame(tick);
  }

  setProgress(progress) {
    const circumference = 2 * Math.PI * 52;
    this.progressCircle.style.strokeDasharray = `${circumference}`;
    this.progressCircle.style.strokeDashoffset = `${circumference * (1 - progress)}`;
  }
}

export async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === "videoinput");
}

function pickMimeType() {
  const candidates = ["video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function createRecorder(stream) {
  const preferred = pickMimeType();
  const attempts = preferred
    ? [preferred, "", "video/mp4", "video/webm"]
    : ["", "video/mp4", "video/webm"];

  let lastError;
  for (const mimeType of attempts) {
    try {
      return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to initialize MediaRecorder.");
}

async function recordBlobFromStream(stream, durationSeconds) {
  const recorder = createRecorder(stream);
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data?.size) chunks.push(event.data);
  };

  const done = new Promise((resolve, reject) => {
    recorder.onstop = () => {
      if (!chunks.length) {
        reject(new Error("No video data captured. Try a different camera or reload the page."));
        return;
      }
      resolve(new Blob(chunks, { type: recorder.mimeType || "video/mp4" }));
    };
    recorder.onerror = () => reject(recorder.error || new Error("Recorder error."));
  });

  recorder.start(250);
  await sleep(durationSeconds * 1000);
  if (recorder.state !== "inactive") {
    try {
      recorder.requestData();
    } catch (_error) {
      // Some browsers throw if called too early; safe to ignore.
    }
    recorder.stop();
  }

  return done;
}

async function recordBlobFromCanvas(videoEl, durationSeconds) {
  const width = videoEl.videoWidth || 960;
  const height = videoEl.videoHeight || 720;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const stream = canvas.captureStream(30);

  let rafId = 0;
  let running = true;
  const draw = () => {
    if (!running) return;
    ctx.drawImage(videoEl, 0, 0, width, height);
    rafId = requestAnimationFrame(draw);
  };
  draw();

  try {
    return await recordBlobFromStream(stream, durationSeconds);
  } finally {
    running = false;
    cancelAnimationFrame(rafId);
    stream.getTracks().forEach((track) => track.stop());
  }
}

function supportsCanvasCapture() {
  return typeof HTMLCanvasElement !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCaptureTarget(aspectRatio) {
  const table = {
    "1:1": { width: 1200, height: 1200, aspect: 1 },
  };
  return table[aspectRatio] || table["1:1"];
}

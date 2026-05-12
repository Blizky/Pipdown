import { CameraController, listCameras } from "./camera.js";
import { ensureLocalDigestCache } from "./digestCache.js";
import { exportDigest } from "./exportApi.js";
import { LibraryController, todayKey } from "./library.js";
import { SettingsController } from "./settings.js";
import { addSnap, clearAllCache, getSnapsByDay } from "./storage.js";

const els = {
  previewFrame: document.querySelector("#previewFrame"),
  video: document.querySelector("#cameraVideo"),
  canvas: document.querySelector("#stillCanvas"),
  placeholder: document.querySelector("#cameraPlaceholder"),
  status: document.querySelector("#cameraStatus"),
  progressCircle: document.querySelector("#progressCircle"),
  recordingOverlay: document.querySelector("#recordingOverlay"),
  recordingStatus: document.querySelector("#recordingStatus"),
  shutter: document.querySelector("#shutterButton"),
  settingsPanel: document.querySelector("#settingsPanel"),
  settingsToggle: document.querySelector("#settingsToggle"),
  settingsClose: document.querySelector("#settingsClose"),
  userNameInput: document.querySelector("#userNameInput"),
  durationSelect: document.querySelector("#durationSelect"),
  cameraSelect: document.querySelector("#cameraSelect"),
  clearCacheButton: document.querySelector("#clearCacheButton"),
  drawer: document.querySelector("#libraryDrawer"),
  drawerHandle: document.querySelector("#drawerHandle"),
  dayList: document.querySelector("#dayList"),
  snapList: document.querySelector("#snapList"),
  selectedDayTitle: document.querySelector("#selectedDayTitle"),
  selectedDayThumb: document.querySelector("#selectedDayThumb"),
  selectedDayStart: document.querySelector("#selectedDayStart"),
  exportButton: document.querySelector("#exportButton"),
  exportResult: document.querySelector("#exportResult"),
  digestPreviewModal: document.querySelector("#digestPreviewModal"),
  digestPreviewVideo: document.querySelector("#digestPreviewVideo"),
  digestPreviewClose: document.querySelector("#digestPreviewClose"),
  digestPreviewSave: document.querySelector("#digestPreviewSave"),
};

const camera = new CameraController({
  video: els.video,
  canvas: els.canvas,
  placeholder: els.placeholder,
  status: els.status,
  progressCircle: els.progressCircle,
  recordingOverlay: els.recordingOverlay,
  recordingStatus: els.recordingStatus,
});

const settingsController = new SettingsController({
  panel: els.settingsPanel,
  toggleButton: els.settingsToggle,
  closeButton: els.settingsClose,
  userNameInput: els.userNameInput,
  durationSelect: els.durationSelect,
  cameraSelect: els.cameraSelect,
  clearCacheButton: els.clearCacheButton,
  previewFrame: els.previewFrame,
});

const library = new LibraryController({
  drawer: els.drawer,
  handle: els.drawerHandle,
  dayList: els.dayList,
  snapList: els.snapList,
  selectedDayTitle: els.selectedDayTitle,
  selectedDayThumb: els.selectedDayThumb,
  selectedDayStart: els.selectedDayStart,
  exportButton: els.exportButton,
  exportResult: els.exportResult,
  digestPreviewModal: els.digestPreviewModal,
  digestPreviewVideo: els.digestPreviewVideo,
  digestPreviewClose: els.digestPreviewClose,
  digestPreviewSave: els.digestPreviewSave,
});

let settings;

async function init() {
  await requestPersistentStorage();

  settings = await settingsController.init(
    async (nextSettings, change) => {
      settings = nextSettings;
      if (change.cameraChanged) await startCamera();
    },
    async () => {
      await clearAllCache();
      window.location.reload();
    },
  );

  library.init(handleExport, handleSnapMutation);
  await library.render(todayKey());
  bindCapture();
  bindPreviewTapToStart();

  if (!navigator.mediaDevices?.getUserMedia) {
    els.status.textContent = "Camera unavailable here. Use HTTPS (or localhost on this device).";
    els.shutter.disabled = true;
    els.placeholder.hidden = false;
    return;
  }

  await startCamera();
  await hydrateCameraList();
}

async function startCamera() {
  try {
    els.status.textContent = "Starting camera...";
    await camera.start({
      deviceId: settings.cameraDeviceId,
      aspectRatio: settings.aspectRatio,
    });
    els.shutter.disabled = false;
  } catch (error) {
    els.status.textContent = "Tap preview to allow camera. If on phone, use HTTPS.";
    els.placeholder.hidden = false;
    els.shutter.disabled = true;
    console.error(error);
  }
}

function bindPreviewTapToStart() {
  const requestStart = async () => {
    if (camera.stream || !navigator.mediaDevices?.getUserMedia) return;
    await startCamera();
    if (camera.stream) await hydrateCameraList();
  };

  els.previewFrame.addEventListener("click", requestStart);
  els.placeholder.addEventListener("click", requestStart);
}

async function hydrateCameraList() {
  try {
    const cameras = await listCameras();
    await settingsController.setCameras(cameras);
  } catch (error) {
    console.warn("Unable to list cameras", error);
  }
}

function bindCapture() {
  els.shutter.addEventListener("click", async () => {
    if (camera.isRecording) return;

    els.shutter.disabled = true;
    els.status.textContent = "Capturing...";

    try {
      const still = await camera.captureStill();
      const videoBlob = await camera.recordClip(settings.duration);
      const dateKey = todayKey();
      const timestamp = Date.now();

      await addSnap({
        id: crypto.randomUUID(),
        dateKey,
        timestamp,
        stillBlob: still.blob,
        stillUrl: still.url,
        videoBlob,
        duration: settings.duration,
        orderIndex: 0,
        hidden: false,
        highlight: false,
      });

      await library.render(dateKey);
      queueDigestRefresh(dateKey);
    } catch (error) {
      els.status.textContent = `Capture failed: ${error?.message || "Unknown error"}`;
      console.error(error);
      await restartCameraAfterFailure();
    } finally {
      els.shutter.disabled = false;
    }
  });
}

async function restartCameraAfterFailure() {
  try {
    await startCamera();
  } catch (_error) {
    // Keep original failure visible; user can retry with tap-to-start.
  }
}

async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return;
  try {
    await navigator.storage.persist();
  } catch (_error) {
    // Best effort only.
  }
}

async function handleSnapMutation({ action, dateKey }) {
  if (action === "delete" || action === "left" || action === "right" || action === "star") {
    queueDigestRefresh(dateKey);
  }
}

function queueDigestRefresh(dateKey) {
  void (async () => {
    try {
      els.status.textContent = "Updating digest...";
      const snaps = await getSnapsByDay(dateKey);
      await ensureLocalDigestCache({
        dateKey,
        snaps,
        aspectRatio: settings.aspectRatio,
        userName: settings.userName,
      });
      els.status.textContent = "Digest ready";
    } catch (_error) {
      els.status.textContent = "Digest will refresh on export";
    }
  })();
}

async function handleExport(dateKey) {
  els.exportButton.disabled = true;
  els.exportButton.textContent = "Exporting...";
  library.showExportLoading();

  try {
    const snaps = await getSnapsByDay(dateKey);
    const result = await exportDigest({
      dateKey,
      snaps,
      userName: settings.userName,
      aspectRatio: settings.aspectRatio,
    });
    library.showExportResult(result);
    els.status.textContent = "Digest ready";
  } catch (error) {
    els.exportResult.hidden = false;
    els.exportResult.textContent = error.message;
    console.error(error);
  } finally {
    els.exportButton.disabled = false;
    els.exportButton.textContent = "Export / Share";
  }
}

init();

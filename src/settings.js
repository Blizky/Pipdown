import { ASPECT_RATIOS, DEFAULT_SETTINGS } from "./config.js";
import { getSettings, saveSettings } from "./storage.js";

export class SettingsController {
  constructor({
    panel,
    toggleButton,
    closeButton,
    userNameInput,
    durationSelect,
    cameraSelect,
    clearCacheButton,
    previewFrame,
  }) {
    this.panel = panel;
    this.toggleButton = toggleButton;
    this.closeButton = closeButton;
    this.userNameInput = userNameInput;
    this.durationSelect = durationSelect;
    this.cameraSelect = cameraSelect;
    this.clearCacheButton = clearCacheButton;
    this.previewFrame = previewFrame;
    this.settings = DEFAULT_SETTINGS;
    this.onChange = () => {};
    this.onClearCache = async () => {};
  }

  async init(onChange, onClearCache) {
    this.onChange = onChange;
    this.onClearCache = onClearCache;
    this.settings = await getSettings(DEFAULT_SETTINGS);
    this.settings.aspectRatio = "1:1";
    await saveSettings(this.settings);
    this.render();
    this.bind();
    return this.settings;
  }

  bind() {
    this.toggleButton.addEventListener("click", () => this.open());
    this.closeButton.addEventListener("click", () => this.close());

    [this.userNameInput, this.durationSelect, this.cameraSelect].forEach((field) => {
      field.addEventListener("change", () => this.updateFromForm());
    });

    this.userNameInput.addEventListener("input", () => this.updateFromForm(false));
    this.clearCacheButton.addEventListener("click", () => this.handleClearCache());
  }

  async setCameras(cameras) {
    const current = this.settings.cameraDeviceId;
    this.cameraSelect.innerHTML = `<option value="">Default camera</option>`;

    cameras.forEach((camera, index) => {
      const option = document.createElement("option");
      option.value = camera.deviceId;
      option.textContent = camera.label || `Camera ${index + 1}`;
      this.cameraSelect.append(option);
    });

    this.cameraSelect.value = [...this.cameraSelect.options].some((option) => option.value === current) ? current : "";
    this.settings.cameraDeviceId = this.cameraSelect.value;
    await saveSettings(this.settings);
  }

  render() {
    this.userNameInput.value = this.settings.userName;
    this.durationSelect.value = String(this.settings.duration);
    this.cameraSelect.value = this.settings.cameraDeviceId;
    this.applyAspectRatio();
  }

  async updateFromForm(notify = true) {
    const next = {
      userName: this.userNameInput.value.trim(),
      duration: Number(this.durationSelect.value),
      aspectRatio: "1:1",
      cameraDeviceId: this.cameraSelect.value,
    };

    const cameraChanged = next.cameraDeviceId !== this.settings.cameraDeviceId;
    this.settings = next;
    this.applyAspectRatio();
    await saveSettings(this.settings);
    if (notify) this.onChange(this.settings, { cameraChanged });
  }

  applyAspectRatio() {
    Object.values(ASPECT_RATIOS).forEach((className) => this.previewFrame.classList.remove(className));
    this.previewFrame.classList.add(ASPECT_RATIOS["1:1"]);
  }

  open() {
    this.panel.hidden = false;
  }

  close() {
    this.panel.hidden = true;
  }

  async handleClearCache() {
    const confirmed = window.confirm("Clear all local snaps and settings cache?");
    if (!confirmed) return;
    await this.onClearCache();
  }
}

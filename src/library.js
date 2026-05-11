import { deleteSnap, getDays, getSnapsByDay, reorderSnap, setHighlight } from "./storage.js";

export class LibraryController {
  constructor({
    drawer,
    handle,
    dayList,
    snapList,
    selectedDayTitle,
    selectedDayThumb,
    selectedDayStart,
    exportButton,
    exportResult,
    digestPreviewModal,
    digestPreviewVideo,
    digestPreviewClose,
    digestPreviewSave,
  }) {
    this.drawer = drawer;
    this.handle = handle;
    this.dayList = dayList;
    this.snapList = snapList;
    this.selectedDayTitle = selectedDayTitle;
    this.selectedDayThumb = selectedDayThumb;
    this.selectedDayStart = selectedDayStart;
    this.exportButton = exportButton;
    this.exportResult = exportResult;
    this.digestPreviewModal = digestPreviewModal;
    this.digestPreviewVideo = digestPreviewVideo;
    this.digestPreviewClose = digestPreviewClose;
    this.digestPreviewSave = digestPreviewSave;
    this.selectedDateKey = todayKey();
    this.onExport = () => {};
    this.onSnapMutation = async () => {};
    this.previewSaveBlob = null;
    this.previewSaveName = "pipdown-video.mp4";
  }

  init(onExport, onSnapMutation) {
    this.onExport = onExport;
    this.onSnapMutation = onSnapMutation;
    this.handle.addEventListener("click", () => this.toggle());
    this.exportButton.addEventListener("click", () => this.onExport(this.selectedDateKey));
    this.digestPreviewClose.addEventListener("click", () => this.closeDigestPreview());
    this.digestPreviewSave.addEventListener("click", () => this.savePreviewVideo());
    this.digestPreviewModal.addEventListener("click", (event) => {
      if (event.target === this.digestPreviewModal) this.closeDigestPreview();
    });
    this.render();
  }

  async render(dateKey = this.selectedDateKey) {
    const days = await getDays();
    if (!days.length) {
      this.selectedDateKey = todayKey();
      this.selectedDayTitle.textContent = "Today";
      if (this.dayList) this.dayList.innerHTML = "";
      this.snapList.innerHTML = "";
      return;
    }

    this.selectedDateKey = days.some((day) => day.dateKey === dateKey) ? dateKey : days[0].dateKey;
    this.selectedDayTitle.textContent = formatDay(this.selectedDateKey);

    const selectedSnaps = await getSnapsByDay(this.selectedDateKey);
    const latestSelected = [...selectedSnaps].sort((a, b) => b.timestamp - a.timestamp)[0];
    if (latestSelected?.stillUrl) {
      this.selectedDayThumb.src = latestSelected.stillUrl;
      this.selectedDayThumb.hidden = false;
      this.selectedDayStart.hidden = true;
    } else {
      this.selectedDayThumb.hidden = true;
      this.selectedDayStart.hidden = false;
    }
    if (this.dayList) this.dayList.innerHTML = "";
    const snaps = await getSnapsByDay(this.selectedDateKey);
    this.renderSnaps(this.snapList, snaps);
    this.bindSnapListEvents(snaps);
  }

  renderSnaps(container, snaps) {
    if (!snaps.length) {
      container.innerHTML = `<p class="empty-state">No snaps for this day.</p>`;
      return;
    }

    container.innerHTML = snaps
      .map(
        (snap) => `
      <article class="snap-item">
        <div class="snap-thumb-wrap" data-snap-id="${snap.id}">
          <img class="snap-thumb-large" src="${snap.stillUrl}" alt="Snap thumbnail" />
          <strong class="snap-time">${new Date(snap.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</strong>
          <button type="button" data-action="star" data-snap-id="${snap.id}" class="icon-action overlay top-right" aria-label="Toggle favorite">
            <img src="./assets/icons/${snap.highlight ? "star_fill" : "star_line"}.svg" alt="" />
          </button>
          <button type="button" data-action="left" data-snap-id="${snap.id}" class="icon-action overlay bottom-left" aria-label="Move earlier">
            <img src="./assets/icons/square_arrow_left_fill.svg" alt="" />
          </button>
          <button type="button" data-action="right" data-snap-id="${snap.id}" class="icon-action overlay bottom-mid" aria-label="Move later">
            <img src="./assets/icons/square_arrow_right_fill.svg" alt="" />
          </button>
          <button type="button" data-action="delete" data-snap-id="${snap.id}" class="icon-action overlay bottom-right" aria-label="Delete snap">
            <img src="./assets/icons/delete_2_fill.svg" alt="" />
          </button>
        </div>
      </article>
    `,
      )
      .join("");
  }

  bindSnapListEvents(snaps) {
    this.snapList.onclick = async (event) => {
      const actionEl = event.target.closest("[data-action]");
      if (actionEl) {
        const action = actionEl.dataset.action;
        const snapId = actionEl.dataset.snapId;
        if (!snapId) return;
        const snap = snaps.find((item) => item.id === snapId);
        if (!snap) return;
        await this.handleSnapAction(action, snap);
        return;
      }

      if (event.target.closest(".snap-thumb-wrap")) {
        const snapId = event.target.closest(".snap-thumb-wrap")?.dataset.snapId;
        const snap = snaps.find((item) => item.id === snapId);
        if (snap) this.openClipPreview(snap);
      }
    };
  }

  async handleSnapAction(action, snap) {
    if (action === "left") await reorderSnap(snap.dateKey, snap.id, -1);
    if (action === "right") await reorderSnap(snap.dateKey, snap.id, 1);
    if (action === "star") await setHighlight(snap.dateKey, snap.id);
    if (action === "delete") await deleteSnap(snap.id);
    await this.onSnapMutation({ action, dateKey: snap.dateKey });
    await this.render(snap.dateKey);
  }

  toggle() {
    const open = this.drawer.classList.toggle("is-open");
    this.handle.setAttribute("aria-expanded", String(open));
  }

  showExportResult(result) {
    this.exportResult.hidden = true;
    this.openDigestPreview(result.url, result.blob, `pipdown-${result.metadata.date}.mp4`);
  }

  showExportLoading() {
    this.exportResult.hidden = false;
    this.exportResult.innerHTML = `
      <div class="export-loading">
        <span class="loading-spinner" aria-hidden="true"></span>
        <strong>Producing digest...</strong>
      </div>
    `;
  }

  openDigestPreview(url, blob = null, fileName = "pipdown-video.mp4") {
    this.previewSaveBlob = blob;
    this.previewSaveName = fileName;
    this.digestPreviewVideo.src = url;
    this.digestPreviewModal.hidden = false;
    this.digestPreviewVideo.play().catch(() => {});
  }

  openClipPreview(snap) {
    const url = URL.createObjectURL(snap.videoBlob);
    this.openDigestPreview(url, snap.videoBlob, `pipdown-${snap.dateKey}-${snap.id}.mp4`);
  }

  closeDigestPreview() {
    this.digestPreviewModal.hidden = true;
    this.digestPreviewVideo.pause();
    this.digestPreviewVideo.removeAttribute("src");
    this.digestPreviewVideo.load();
  }

  async savePreviewVideo() {
    if (!this.previewSaveBlob) return;
    const file = new File([this.previewSaveBlob], this.previewSaveName, { type: this.previewSaveBlob.type || "video/mp4" });

    if (navigator.share) {
      try {
        await navigator.share({ files: [file], title: "Pipdown video", text: "Save Video" });
        return;
      } catch (_error) {
        // Fall through to local download.
      }
    }

    const url = URL.createObjectURL(this.previewSaveBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = this.previewSaveName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}

export function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function formatDay(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

const canvas = document.querySelector("#previewCanvas");
const ctx = canvas.getContext("2d");
const photoInput = document.querySelector("#photoInput");
const dropZone = document.querySelector("#dropZone");
const zoomRange = document.querySelector("#zoomRange");
const resetButton = document.querySelector("#resetButton");
const downloadButton = document.querySelector("#downloadButton");
const downloadSelectedButton = document.querySelector("#downloadSelectedButton");
const shareButton = document.querySelector("#shareButton");
const canvasStatus = document.querySelector("#canvasStatus");
const captionText = document.querySelector("#captionText");
const copyCaptionButtons = document.querySelectorAll("[data-copy-caption]");
const facebookButtons = document.querySelectorAll("[data-share-facebook]");
const instagramButtons = document.querySelectorAll("[data-share-instagram]");
const formatOptionInputs = document.querySelectorAll("[data-format-option]");
const formatPreviewButtons = document.querySelectorAll("[data-preview-format]");
const selectAllFormatsButton = document.querySelector("#selectAllFormatsButton");
const formatHint = document.querySelector("#formatHint");

const FORMAT_CONFIG = [
  {
    id: "print",
    name: "Print / original",
    shortName: "Print",
    src: "assets/frame.png",
    fileName: "meu-inner-child-print-original.png",
  },
  {
    id: "post",
    name: "Instagram post",
    shortName: "Post",
    src: "assets/frame-instagram-post.png",
    fileName: "meu-inner-child-instagram-post.png",
  },
  {
    id: "story",
    name: "Instagram story",
    shortName: "Story",
    src: "assets/frame-instagram-story.png",
    fileName: "meu-inner-child-instagram-story.png",
  },
];

const formats = new Map(
  FORMAT_CONFIG.map((config) => [
    config.id,
    {
      ...config,
      image: new Image(),
      ready: false,
      windowRect: null,
      baseScale: 1,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    },
  ]),
);

const state = {
  activeFormatId: "print",
  selectedFormatIds: new Set(FORMAT_CONFIG.map((format) => format.id)),
  photo: null,
  photoUrl: "",
  dragStart: null,
  startOffsetX: 0,
  startOffsetY: 0,
  revealStart: 0,
  revealDuration: 1150,
  revealFrame: 0,
};

const defaultCaption = () => {
  const link = window.location.protocol === "file:" ? "[link]" : window.location.href.split("#")[0];

  return `June 1st is Children’s Day in Romania and in several European countries. While the United Nations marks World Children’s Day on November 20, we are using this June 1st moment to celebrate the childlike curiosity behind every civic voice.

MEU Timișoara launches “Give the floor to your inner child”, a June 1st challenge reminding us that before we spoke about Europe, democracy and public policy, we were children asking big questions about the world.

I’m joining the challenge because every delegate, policymaker, journalist, negotiator or changemaker was once a child with imagination, curiosity and the courage to believe things could be different.

Challenge accepted from: [names]

I’m passing it on to: [names]

Upload your childhood photo, create your MEU frame and give the floor to your inner child.

Frame generator: ${link}

#MEUTimisoara #GiveTheFloor #InnerChild #EuropeStartsWithQuestions`;
};

captionText.value = defaultCaption();
loadFormats();

photoInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) loadPhoto(file);
});

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
  });
});

dropZone.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file) loadPhoto(file);
});

formatPreviewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveFormat(button.dataset.previewFormat);
  });
});

formatOptionInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (input.checked) {
      state.selectedFormatIds.add(input.value);
    } else {
      state.selectedFormatIds.delete(input.value);
    }

    if (state.selectedFormatIds.size === 0) {
      state.selectedFormatIds.add(state.activeFormatId);
    }

    syncFormatControls();
    updateControls();
  });
});

selectAllFormatsButton.addEventListener("click", () => {
  FORMAT_CONFIG.forEach((format) => state.selectedFormatIds.add(format.id));
  syncFormatControls();
  updateControls();
});

zoomRange.addEventListener("input", () => {
  const format = activeFormat();
  format.zoom = Number(zoomRange.value);
  clampFormatOffsets(format);
  render();
});

resetButton.addEventListener("click", () => {
  if (!state.photo) return;
  clearPhoto();
});

downloadButton.addEventListener("click", async () => {
  if (!state.photo) return;

  await downloadFormat(activeFormat());
});

downloadSelectedButton.addEventListener("click", async () => {
  if (!state.photo) return;

  const selectedFormats = FORMAT_CONFIG
    .map((config) => formats.get(config.id))
    .filter((format) => state.selectedFormatIds.has(format.id));

  canvasStatus.textContent =
    selectedFormats.length > 1 ? `Downloading ${selectedFormats.length} formats` : "Downloading selected format";

  for (const format of selectedFormats) {
    await downloadFormat(format, false);
    await delay(220);
  }

  canvasStatus.textContent = "Selected formats downloaded";
});

shareButton.addEventListener("click", async () => {
  const text = captionText.value.trim();

  if (navigator.share) {
    try {
      await navigator.share({
        title: "Give the Floor to Your Inner Child",
        text,
        url: window.location.protocol === "file:" ? undefined : window.location.href.split("#")[0],
      });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  await copyCaption();
});

copyCaptionButtons.forEach((button) => {
  button.addEventListener("click", copyCaption);
});

facebookButtons.forEach((button) => {
  button.addEventListener("click", shareToFacebook);
});

instagramButtons.forEach((button) => {
  button.addEventListener("click", shareToInstagram);
});

canvas.addEventListener("pointerdown", (event) => {
  if (!state.photo) return;

  canvas.setPointerCapture(event.pointerId);
  const point = canvasPoint(event);
  const format = activeFormat();
  state.dragStart = point;
  state.startOffsetX = format.offsetX;
  state.startOffsetY = format.offsetY;
  canvasStatus.textContent = `Drag to place the ${format.shortName.toLowerCase()} version`;
});

canvas.addEventListener("pointermove", (event) => {
  if (!state.photo || !state.dragStart) return;

  const point = canvasPoint(event);
  const format = activeFormat();
  format.offsetX = state.startOffsetX + point.x - state.dragStart.x;
  format.offsetY = state.startOffsetY + point.y - state.dragStart.y;
  clampFormatOffsets(format);
  render();
});

["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
  canvas.addEventListener(eventName, () => {
    if (!state.dragStart) return;
    state.dragStart = null;
    canvasStatus.textContent = "Ready to download";
  });
});

function loadFormats() {
  formats.forEach((format) => {
    format.image.onload = () => {
      format.ready = true;
      format.windowRect = detectTransparentWindow(format.image);

      if (state.photo) {
        fitPhotoToFormat(format);
      }

      if (format.id === state.activeFormatId) {
        resizeCanvasToFormat(format);
      }

      updateControls();
      render();
    };

    format.image.src = format.src;
  });
}

function setActiveFormat(formatId) {
  if (!formats.has(formatId)) return;

  state.activeFormatId = formatId;
  const format = activeFormat();
  resizeCanvasToFormat(format);
  syncFormatControls();
  updateControls();
  render();
}

function activeFormat() {
  return formats.get(state.activeFormatId);
}

function resizeCanvasToFormat(format) {
  if (!format?.ready) return;

  if (canvas.width !== format.image.naturalWidth || canvas.height !== format.image.naturalHeight) {
    canvas.width = format.image.naturalWidth;
    canvas.height = format.image.naturalHeight;
  }
}

async function copyCaption() {
  const text = captionText.value;

  try {
    await navigator.clipboard.writeText(text);
    flashCopyState("Caption copied");
  } catch {
    captionText.focus();
    captionText.select();
    document.execCommand("copy");
    flashCopyState("Caption copied");
  }
}

async function shareToFacebook() {
  await copyCaption();

  const targetUrl = window.location.protocol === "file:" ? "" : window.location.href.split("#")[0];
  const shareUrl = targetUrl
    ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(targetUrl)}`
    : "https://www.facebook.com/";

  window.open(shareUrl, "_blank", "noopener,noreferrer");
  canvasStatus.textContent = "Caption copied for Facebook";
}

async function shareToInstagram() {
  await copyCaption();
  window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
  canvasStatus.textContent = "Caption copied for Instagram";
}

function flashCopyState(message) {
  canvasStatus.textContent = message;
  window.setTimeout(() => {
    canvasStatus.textContent = state.photo ? "Ready to download" : "Upload to reveal the frame";
  }, 1800);
}

function loadPhoto(file) {
  if (!file.type.startsWith("image/")) {
    canvasStatus.textContent = "Choose an image file";
    return;
  }

  if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);

  const img = new Image();
  state.photoUrl = URL.createObjectURL(file);
  img.onload = () => {
    state.photo = img;
    formats.forEach((format) => {
      if (format.ready) fitPhotoToFormat(format);
    });
    zoomRange.disabled = false;
    resetButton.disabled = false;
    downloadButton.disabled = false;
    downloadSelectedButton.disabled = false;
    startFrameReveal();
    canvasStatus.textContent = "Drag, zoom, then download";
  };
  img.onerror = () => {
    canvasStatus.textContent = "This image could not be opened";
  };
  img.src = state.photoUrl;
}

function clearPhoto() {
  cancelAnimationFrame(state.revealFrame);
  if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);

  state.photo = null;
  state.photoUrl = "";
  state.dragStart = null;
  state.revealStart = 0;

  formats.forEach((format) => {
    format.zoom = 1;
    format.offsetX = 0;
    format.offsetY = 0;
  });

  photoInput.value = "";
  zoomRange.value = "1";
  zoomRange.disabled = true;
  resetButton.disabled = true;
  downloadButton.disabled = true;
  downloadSelectedButton.disabled = true;
  canvasStatus.textContent = "Upload to reveal the frame";

  updateControls();
  render();
}

function detectTransparentWindow(frame) {
  const sample = document.createElement("canvas");
  const sampleCtx = sample.getContext("2d", { willReadFrequently: true });
  sample.width = frame.naturalWidth;
  sample.height = frame.naturalHeight;
  sampleCtx.drawImage(frame, 0, 0);

  const data = sampleCtx.getImageData(0, 0, sample.width, sample.height).data;
  const xStart = Math.floor(sample.width * 0.14);
  const xEnd = Math.floor(sample.width * 0.86);
  const yStart = Math.floor(sample.height * 0.12);
  const yEnd = Math.floor(sample.height * 0.9);
  let minX = sample.width;
  let minY = sample.height;
  let maxX = 0;
  let maxY = 0;

  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const alpha = data[(y * sample.width + x) * 4 + 3];
      if (alpha < 20) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (minX > maxX || minY > maxY) {
    return {
      x: sample.width * 0.24,
      y: sample.height * 0.21,
      width: sample.width * 0.52,
      height: sample.height * 0.64,
    };
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function fitPhotoToFormat(format) {
  if (!state.photo || !format.windowRect) return;

  const rect = format.windowRect;
  format.baseScale = Math.max(rect.width / state.photo.naturalWidth, rect.height / state.photo.naturalHeight) * 1.05;
  format.zoom = 1;
  format.offsetX = 0;
  format.offsetY = 0;
  clampFormatOffsets(format);
}

function clampFormatOffsets(format) {
  if (!state.photo || !format.windowRect) return;

  const rect = format.windowRect;
  const scale = format.baseScale * format.zoom;
  const drawWidth = state.photo.naturalWidth * scale;
  const drawHeight = state.photo.naturalHeight * scale;
  const maxX = Math.max(0, (drawWidth - rect.width) / 2);
  const maxY = Math.max(0, (drawHeight - rect.height) / 2);

  format.offsetX = Math.max(-maxX, Math.min(maxX, format.offsetX));
  format.offsetY = Math.max(-maxY, Math.min(maxY, format.offsetY));
}

function startFrameReveal() {
  cancelAnimationFrame(state.revealFrame);
  state.revealStart = performance.now();

  const tick = (time) => {
    render(time);
    const progress = Math.min(1, (time - state.revealStart) / state.revealDuration);
    if (progress < 1) {
      state.revealFrame = requestAnimationFrame(tick);
    }
  };

  state.revealFrame = requestAnimationFrame(tick);
}

function render(time = performance.now()) {
  const format = activeFormat();
  if (!format?.ready) return;

  resizeCanvasToFormat(format);
  document.body.classList.toggle("has-photo", Boolean(state.photo));
  drawComposition(canvas, format, { time, reveal: true });
  updateControls();
}

function drawComposition(targetCanvas, format, options = {}) {
  const targetCtx = targetCanvas.getContext("2d");
  const width = format.image.naturalWidth;
  const height = format.image.naturalHeight;

  if (targetCanvas.width !== width || targetCanvas.height !== height) {
    targetCanvas.width = width;
    targetCanvas.height = height;
  }

  targetCtx.clearRect(0, 0, width, height);
  drawPaperBase(targetCtx, width, height);

  if (state.photo && format.windowRect) {
    drawPhoto(targetCtx, format);
  } else if (format.windowRect) {
    drawEmptyPhotoArea(targetCtx, format);
  }

  if (state.photo && format.image.complete) {
    drawFrame(targetCtx, format, width, height, options);
  }
}

function drawFrame(targetCtx, format, width, height, options = {}) {
  const shouldReveal = options.reveal && format.id === state.activeFormatId;
  const rawProgress = shouldReveal && state.revealStart
    ? Math.min(1, (options.time - state.revealStart) / state.revealDuration)
    : 1;
  const progress = easeOutCubic(rawProgress);

  targetCtx.save();
  targetCtx.globalAlpha = 0.16 + progress * 0.84;
  targetCtx.beginPath();
  targetCtx.rect(0, 0, width, height * Math.max(0.08, progress));
  targetCtx.clip();
  targetCtx.drawImage(format.image, 0, 0, width, height);
  targetCtx.restore();

  if (rawProgress < 1) {
    const sweepY = height * progress;
    const gradient = targetCtx.createLinearGradient(0, sweepY - 80, 0, sweepY + 80);
    gradient.addColorStop(0, "rgba(255, 250, 241, 0)");
    gradient.addColorStop(0.5, "rgba(255, 232, 163, 0.78)");
    gradient.addColorStop(1, "rgba(255, 250, 241, 0)");

    targetCtx.save();
    targetCtx.globalCompositeOperation = "screen";
    targetCtx.fillStyle = gradient;
    targetCtx.fillRect(0, sweepY - 90, width, 180);
    targetCtx.restore();
  }

  if (rawProgress >= 1 && shouldReveal) {
    state.revealStart = 0;
  }
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function drawPaperBase(targetCtx, width, height) {
  targetCtx.fillStyle = "#f7f1e8";
  targetCtx.fillRect(0, 0, width, height);
  targetCtx.fillStyle = "rgba(6, 68, 184, 0.05)";

  for (let x = 0; x < width; x += 36) {
    targetCtx.fillRect(x, 0, 1, height);
  }

  for (let y = 0; y < height; y += 36) {
    targetCtx.fillRect(0, y, width, 1);
  }
}

function drawEmptyPhotoArea(targetCtx, format) {
  const rect = format.windowRect;
  targetCtx.save();
  targetCtx.beginPath();
  targetCtx.rect(rect.x, rect.y, rect.width, rect.height);
  targetCtx.clip();

  const gradient = targetCtx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
  gradient.addColorStop(0, "#fff7df");
  gradient.addColorStop(0.5, "#d7ece8");
  gradient.addColorStop(1, "#fffaf1");
  targetCtx.fillStyle = gradient;
  targetCtx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const inset = Math.max(28, Math.min(rect.width, rect.height) * 0.07);
  targetCtx.strokeStyle = "rgba(5, 53, 141, 0.45)";
  targetCtx.lineWidth = Math.max(3, Math.min(rect.width, rect.height) * 0.008);
  targetCtx.setLineDash([18, 18]);
  targetCtx.strokeRect(rect.x + inset, rect.y + inset, rect.width - inset * 2, rect.height - inset * 2);
  targetCtx.setLineDash([]);

  targetCtx.fillStyle = "#05358d";
  targetCtx.font = `900 ${Math.max(28, Math.min(52, rect.width * 0.08))}px Inter, sans-serif`;
  targetCtx.textAlign = "center";
  targetCtx.fillText("Upload your photo", rect.x + rect.width / 2, rect.y + rect.height / 2 - 16);
  targetCtx.font = `${Math.max(24, Math.min(38, rect.width * 0.06))}px Schoolbell, cursive`;
  targetCtx.fillStyle = "#f4b000";
  targetCtx.fillText("then reveal the frame", rect.x + rect.width / 2, rect.y + rect.height / 2 + 42);
  targetCtx.restore();
}

function drawPhoto(targetCtx, format) {
  const rect = format.windowRect;
  const scale = format.baseScale * format.zoom;
  const drawWidth = state.photo.naturalWidth * scale;
  const drawHeight = state.photo.naturalHeight * scale;
  const x = rect.x + rect.width / 2 - drawWidth / 2 + format.offsetX;
  const y = rect.y + rect.height / 2 - drawHeight / 2 + format.offsetY;

  targetCtx.save();
  targetCtx.beginPath();
  targetCtx.rect(rect.x, rect.y, rect.width, rect.height);
  targetCtx.clip();
  targetCtx.drawImage(state.photo, x, y, drawWidth, drawHeight);
  targetCtx.restore();
}

async function downloadFormat(format, announce = true) {
  if (!state.photo || !format?.ready) return;

  const exportCanvas = document.createElement("canvas");
  drawComposition(exportCanvas, format, { reveal: false });
  const blob = await canvasToBlob(exportCanvas);
  if (!blob) return;

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = format.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);

  if (announce) {
    canvasStatus.textContent = `${format.name} downloaded`;
  }
}

function canvasToBlob(sourceCanvas) {
  return new Promise((resolve) => {
    sourceCanvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function updateControls() {
  const format = activeFormat();
  const hasPhoto = Boolean(state.photo);
  const allSelected = state.selectedFormatIds.size === FORMAT_CONFIG.length;
  const selectedNames = FORMAT_CONFIG
    .filter((config) => state.selectedFormatIds.has(config.id))
    .map((config) => config.shortName)
    .join(", ");

  zoomRange.value = format?.zoom ?? 1;
  zoomRange.disabled = !hasPhoto;
  resetButton.disabled = !hasPhoto;
  downloadButton.disabled = !hasPhoto;
  downloadSelectedButton.disabled = !hasPhoto || state.selectedFormatIds.size === 0;
  downloadButton.textContent = format ? `Download ${format.shortName}` : "Download preview";
  selectAllFormatsButton.textContent = allSelected ? "All selected" : "Select all";
  formatHint.textContent = format
    ? `Previewing ${format.name}. Selected exports: ${selectedNames || format.shortName}.`
    : "Choose an export format.";

  syncFormatControls(false);
}

function syncFormatControls(syncChecks = true) {
  formatOptionInputs.forEach((input) => {
    if (syncChecks) input.checked = state.selectedFormatIds.has(input.value);
  });

  document.querySelectorAll("[data-format-card]").forEach((card) => {
    card.classList.toggle("is-active", card.dataset.formatCard === state.activeFormatId);
  });
}

function canvasPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
    y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
  };
}

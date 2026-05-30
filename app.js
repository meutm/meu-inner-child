const canvas = document.querySelector("#previewCanvas");
const ctx = canvas.getContext("2d");
const photoInput = document.querySelector("#photoInput");
const dropZone = document.querySelector("#dropZone");
const zoomRange = document.querySelector("#zoomRange");
const resetButton = document.querySelector("#resetButton");
const downloadButton = document.querySelector("#downloadButton");
const shareButton = document.querySelector("#shareButton");
const canvasStatus = document.querySelector("#canvasStatus");
const captionText = document.querySelector("#captionText");
const copyCaptionButtons = document.querySelectorAll("[data-copy-caption]");
const facebookButtons = document.querySelectorAll("[data-share-facebook]");
const instagramButtons = document.querySelectorAll("[data-share-instagram]");

const state = {
  frame: new Image(),
  photo: null,
  photoUrl: "",
  windowRect: null,
  baseScale: 1,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
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

state.frame.onload = () => {
  canvas.width = state.frame.naturalWidth;
  canvas.height = state.frame.naturalHeight;
  state.windowRect = detectTransparentWindow(state.frame);
  if (state.photo) fitPhotoToWindow();
  render();
};

state.frame.src = "assets/frame.png";
captionText.value = defaultCaption();

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

zoomRange.addEventListener("input", () => {
  state.zoom = Number(zoomRange.value);
  clampOffsets();
  render();
});

resetButton.addEventListener("click", () => {
  if (!state.photo) return;
  fitPhotoToWindow();
  render();
});

downloadButton.addEventListener("click", () => {
  if (!state.photo) return;

  state.revealStart = 0;
  render();
  canvas.toBlob((blob) => {
    if (!blob) return;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "meu-timisoara-inner-child-frame.png";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }, "image/png");
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
  state.dragStart = point;
  state.startOffsetX = state.offsetX;
  state.startOffsetY = state.offsetY;
  canvasStatus.textContent = "Drag to place the memory";
});

canvas.addEventListener("pointermove", (event) => {
  if (!state.photo || !state.dragStart) return;

  const point = canvasPoint(event);
  state.offsetX = state.startOffsetX + point.x - state.dragStart.x;
  state.offsetY = state.startOffsetY + point.y - state.dragStart.y;
  clampOffsets();
  render();
});

["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
  canvas.addEventListener(eventName, () => {
    if (!state.dragStart) return;
    state.dragStart = null;
    canvasStatus.textContent = "Ready to download";
  });
});

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
    canvasStatus.textContent = state.photo ? "Ready to download" : "Drop a childhood photo to begin";
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
    fitPhotoToWindow();
    zoomRange.disabled = false;
    resetButton.disabled = false;
    downloadButton.disabled = false;
    startFrameReveal();
    canvasStatus.textContent = "Drag, zoom, then download";
  };
  img.onerror = () => {
    canvasStatus.textContent = "This image could not be opened";
  };
  img.src = state.photoUrl;
}

function detectTransparentWindow(frame) {
  const sample = document.createElement("canvas");
  const sampleCtx = sample.getContext("2d", { willReadFrequently: true });
  sample.width = frame.naturalWidth;
  sample.height = frame.naturalHeight;
  sampleCtx.drawImage(frame, 0, 0);

  const data = sampleCtx.getImageData(0, 0, sample.width, sample.height).data;
  const xStart = Math.floor(sample.width * 0.16);
  const xEnd = Math.floor(sample.width * 0.84);
  const yStart = Math.floor(sample.height * 0.13);
  const yEnd = Math.floor(sample.height * 0.88);
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

function fitPhotoToWindow() {
  if (!state.photo || !state.windowRect) return;

  const rect = state.windowRect;
  state.baseScale = Math.max(rect.width / state.photo.naturalWidth, rect.height / state.photo.naturalHeight) * 1.05;
  state.zoom = 1;
  state.offsetX = 0;
  state.offsetY = 0;
  zoomRange.value = "1";
  clampOffsets();
}

function clampOffsets() {
  if (!state.photo || !state.windowRect) return;

  const rect = state.windowRect;
  const scale = state.baseScale * state.zoom;
  const drawWidth = state.photo.naturalWidth * scale;
  const drawHeight = state.photo.naturalHeight * scale;
  const maxX = Math.max(0, (drawWidth - rect.width) / 2);
  const maxY = Math.max(0, (drawHeight - rect.height) / 2);

  state.offsetX = Math.max(-maxX, Math.min(maxX, state.offsetX));
  state.offsetY = Math.max(-maxY, Math.min(maxY, state.offsetY));
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
  const width = canvas.width;
  const height = canvas.height;

  document.body.classList.toggle("has-photo", Boolean(state.photo));
  ctx.clearRect(0, 0, width, height);
  drawPaperBase(width, height);

  if (state.photo && state.windowRect) {
    drawPhoto();
  } else if (state.windowRect) {
    drawEmptyPhotoArea();
  }

  if (state.photo && state.frame.complete) {
    drawFrameReveal(width, height, time);
  }
}

function drawFrameReveal(width, height, time) {
  const rawProgress = state.revealStart
    ? Math.min(1, (time - state.revealStart) / state.revealDuration)
    : 1;
  const progress = easeOutCubic(rawProgress);

  ctx.save();
  ctx.globalAlpha = 0.16 + progress * 0.84;
  ctx.beginPath();
  ctx.rect(0, 0, width, height * Math.max(0.08, progress));
  ctx.clip();
  ctx.drawImage(state.frame, 0, 0, width, height);
  ctx.restore();

  if (rawProgress < 1) {
    const sweepY = height * progress;
    const gradient = ctx.createLinearGradient(0, sweepY - 80, 0, sweepY + 80);
    gradient.addColorStop(0, "rgba(255, 250, 241, 0)");
    gradient.addColorStop(0.5, "rgba(255, 232, 163, 0.78)");
    gradient.addColorStop(1, "rgba(255, 250, 241, 0)");

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = gradient;
    ctx.fillRect(0, sweepY - 90, width, 180);
    ctx.restore();
  }

  if (rawProgress >= 1) {
    state.revealStart = 0;
  }
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function drawPaperBase(width, height) {
  ctx.fillStyle = "#f7f1e8";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(6, 68, 184, 0.05)";

  for (let x = 0; x < width; x += 36) {
    ctx.fillRect(x, 0, 1, height);
  }

  for (let y = 0; y < height; y += 36) {
    ctx.fillRect(0, y, width, 1);
  }
}

function drawEmptyPhotoArea() {
  const rect = state.windowRect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();

  const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
  gradient.addColorStop(0, "#fff7df");
  gradient.addColorStop(0.5, "#d7ece8");
  gradient.addColorStop(1, "#fffaf1");
  ctx.fillStyle = gradient;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  ctx.strokeStyle = "rgba(5, 53, 141, 0.45)";
  ctx.lineWidth = 5;
  ctx.setLineDash([18, 18]);
  ctx.strokeRect(rect.x + 42, rect.y + 42, rect.width - 84, rect.height - 84);
  ctx.setLineDash([]);

  ctx.fillStyle = "#05358d";
  ctx.font = "900 52px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Upload your photo", rect.x + rect.width / 2, rect.y + rect.height / 2 - 16);
  ctx.font = "38px Schoolbell, cursive";
  ctx.fillStyle = "#f4b000";
  ctx.fillText("then reveal the frame", rect.x + rect.width / 2, rect.y + rect.height / 2 + 42);
  ctx.restore();
}

function drawPhoto() {
  const rect = state.windowRect;
  const scale = state.baseScale * state.zoom;
  const drawWidth = state.photo.naturalWidth * scale;
  const drawHeight = state.photo.naturalHeight * scale;
  const x = rect.x + rect.width / 2 - drawWidth / 2 + state.offsetX;
  const y = rect.y + rect.height / 2 - drawHeight / 2 + state.offsetY;

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  ctx.drawImage(state.photo, x, y, drawWidth, drawHeight);
  ctx.restore();
}

function canvasPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
    y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
  };
}

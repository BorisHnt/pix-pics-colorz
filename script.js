const imageInput = document.getElementById("image-input");
const uploadButton = document.getElementById("upload-button");
const recolorButton = document.getElementById("recolor-button");
const downloadButton = document.getElementById("download-button");
const paletteInput = document.getElementById("palette-input");
const paletteFeedback = document.getElementById("palette-feedback");
const recognizedColorsContainer = document.getElementById("recognized-colors");
const usedColorsContainer = document.getElementById("used-colors");
const statusMessage = document.getElementById("status-message");
const originalCanvas = document.getElementById("original-canvas");
const editedCanvas = document.getElementById("edited-canvas");
const originalPlaceholder = document.getElementById("original-placeholder");
const editedPlaceholder = document.getElementById("edited-placeholder");

const originalContext = originalCanvas.getContext("2d", { willReadFrequently: true });
const editedContext = editedCanvas.getContext("2d", { willReadFrequently: true });

let currentImage = null;
let currentObjectUrl = null;

function parsePaletteInput(rawValue) {
  const entries = rawValue
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const validColors = [];
  const validSet = new Set();
  const invalidEntries = [];

  for (const entry of entries) {
    const normalized = entry.startsWith("#") ? entry.slice(1) : entry;
    const cleanValue = normalized.toLowerCase();

    if (!/^[0-9a-f]{6}$/.test(cleanValue)) {
      invalidEntries.push(entry);
      continue;
    }

    const hex = `#${cleanValue}`;

    if (!validSet.has(hex)) {
      validSet.add(hex);
      validColors.push({
        hex,
        rgb: hexToRgb(hex),
      });
    }
  }

  return { validColors, invalidEntries };
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function renderSwatches(container, colors, emptyMessage) {
  container.textContent = "";

  if (!colors.length) {
    const emptyState = document.createElement("p");
    emptyState.className = "swatch-empty";
    emptyState.textContent = emptyMessage;
    container.appendChild(emptyState);
    return;
  }

  for (const color of colors) {
    const item = document.createElement("div");
    item.className = "swatch-item";

    const chip = document.createElement("span");
    chip.className = "swatch-chip";
    chip.style.backgroundColor = color.hex;

    const code = document.createElement("span");
    code.className = "swatch-code";
    code.textContent = color.hex;

    item.append(chip, code);
    container.appendChild(item);
  }
}

function updatePalettePreview() {
  const { validColors, invalidEntries } = parsePaletteInput(paletteInput.value);

  renderSwatches(
    recognizedColorsContainer,
    validColors,
    "No valid palette colors detected."
  );

  if (!validColors.length) {
    paletteFeedback.textContent = "No valid 6-digit hex colors detected.";
    paletteFeedback.classList.add("is-error");
    return { validColors, invalidEntries };
  }

  const invalidLabel = invalidEntries.length
    ? ` ${invalidEntries.length} invalid entr${invalidEntries.length > 1 ? "ies were" : "y was"} ignored.`
    : "";

  paletteFeedback.textContent = `${validColors.length} valid color${validColors.length > 1 ? "s" : ""} detected.${invalidLabel}`;
  paletteFeedback.classList.toggle("is-error", invalidEntries.length > 0);

  return { validColors, invalidEntries };
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("is-error", isError);
}

function setCanvasVisibility(canvas, placeholder, visible) {
  canvas.classList.toggle("is-visible", visible);
  placeholder.hidden = visible;
}

function drawOriginalImage(image) {
  originalCanvas.width = image.naturalWidth;
  originalCanvas.height = image.naturalHeight;
  originalContext.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
  originalContext.drawImage(image, 0, 0);
  setCanvasVisibility(originalCanvas, originalPlaceholder, true);
}

function clearEditedPreview() {
  editedContext.clearRect(0, 0, editedCanvas.width, editedCanvas.height);
  editedCanvas.width = 0;
  editedCanvas.height = 0;
  setCanvasVisibility(editedCanvas, editedPlaceholder, false);
  renderSwatches(usedColorsContainer, [], "No recolored output yet.");
  downloadButton.disabled = true;
}

function getClosestPaletteColor(r, g, b, palette) {
  let bestMatch = palette[0];
  let smallestDistance = Number.POSITIVE_INFINITY;

  for (const color of palette) {
    const redDiff = r - color.rgb.r;
    const greenDiff = g - color.rgb.g;
    const blueDiff = b - color.rgb.b;
    const distance = redDiff * redDiff + greenDiff * greenDiff + blueDiff * blueDiff;

    if (distance < smallestDistance) {
      smallestDistance = distance;
      bestMatch = color;
    }
  }

  return bestMatch;
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

async function recolorCurrentImage() {
  const { validColors, invalidEntries } = updatePalettePreview();

  if (!currentImage) {
    renderSwatches(usedColorsContainer, [], "No recolored output yet.");
    if (!validColors.length) {
      setStatus("Enter at least one valid 6-digit hex color before recoloring.", true);
    } else {
      setStatus("Palette ready. Load an image to recolor.");
    }
    return;
  }

  if (!validColors.length) {
    clearEditedPreview();
    setStatus("Recoloring blocked: no valid palette colors were found.", true);
    return;
  }

  setStatus("Processing image...");
  await waitForNextPaint();

  const sourceImageData = originalContext.getImageData(0, 0, originalCanvas.width, originalCanvas.height);
  const outputImageData = new ImageData(
    new Uint8ClampedArray(sourceImageData.data),
    sourceImageData.width,
    sourceImageData.height
  );
  const usedColorMap = new Map();
  const data = outputImageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];

    if (alpha === 0) {
      continue;
    }

    const closestColor = getClosestPaletteColor(data[index], data[index + 1], data[index + 2], validColors);
    data[index] = closestColor.rgb.r;
    data[index + 1] = closestColor.rgb.g;
    data[index + 2] = closestColor.rgb.b;
    usedColorMap.set(closestColor.hex, closestColor);
  }

  editedCanvas.width = outputImageData.width;
  editedCanvas.height = outputImageData.height;
  editedContext.putImageData(outputImageData, 0, 0);
  setCanvasVisibility(editedCanvas, editedPlaceholder, true);
  downloadButton.disabled = false;

  renderSwatches(
    usedColorsContainer,
    Array.from(usedColorMap.values()),
    "No palette colors were used."
  );

  const invalidSummary = invalidEntries.length
    ? ` ${invalidEntries.length} invalid entr${invalidEntries.length > 1 ? "ies were" : "y was"} ignored.`
    : "";

  setStatus(
    `Image recolored with ${validColors.length} palette color${validColors.length > 1 ? "s" : ""}. ${usedColorMap.size} color${usedColorMap.size > 1 ? "s are" : " is"} present in the result.${invalidSummary}`
  );
}

function loadImageFromFile(file) {
  if (!file) {
    return;
  }

  if (file.type && !file.type.startsWith("image/")) {
    setStatus("The selected file is not a valid image.", true);
    return;
  }

  const image = new Image();

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
  }

  const objectUrl = URL.createObjectURL(file);
  currentObjectUrl = objectUrl;

  image.onload = async () => {
    if (currentObjectUrl === objectUrl) {
      currentObjectUrl = null;
    }
    URL.revokeObjectURL(objectUrl);
    currentImage = image;
    drawOriginalImage(image);
    clearEditedPreview();
    setStatus("Image loaded. Applying current palette...");
    await recolorCurrentImage();
  };

  image.onerror = () => {
    if (currentObjectUrl === objectUrl) {
      currentObjectUrl = null;
    }
    URL.revokeObjectURL(objectUrl);
    currentImage = null;
    clearEditedPreview();
    setCanvasVisibility(originalCanvas, originalPlaceholder, false);
    setStatus("Unable to read this file as an image.", true);
  };

  image.src = objectUrl;
}

function downloadEditedImage() {
  if (downloadButton.disabled || !editedCanvas.width || !editedCanvas.height) {
    return;
  }

  editedCanvas.toBlob((blob) => {
    if (!blob) {
      setStatus("Download failed while generating the PNG.", true);
      return;
    }

    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "recolored-image.png";
    link.click();
    URL.revokeObjectURL(downloadUrl);
  }, "image/png");
}

uploadButton.addEventListener("click", () => {
  imageInput.click();
});

imageInput.addEventListener("change", (event) => {
  const [file] = event.target.files || [];
  loadImageFromFile(file);
  imageInput.value = "";
});

recolorButton.addEventListener("click", () => {
  recolorCurrentImage();
});

downloadButton.addEventListener("click", downloadEditedImage);

paletteInput.addEventListener("input", () => {
  updatePalettePreview();

  if (!currentImage) {
    return;
  }

  setStatus('Palette updated. Click "Recolor image" to apply the new colors.');
});

updatePalettePreview();
renderSwatches(usedColorsContainer, [], "No recolored output yet.");

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
const renderingModeSelect = document.getElementById("rendering-mode");
const modeDescription = document.getElementById("mode-description");
const ditherStrengthInput = document.getElementById("dither-strength");
const ditherStrengthValue = document.getElementById("dither-strength-value");
const pixelSizeInput = document.getElementById("pixel-size");
const pixelSizeValue = document.getElementById("pixel-size-value");
const sortPaletteCheckbox = document.getElementById("sort-palette");
const preserveTransparencyCheckbox = document.getElementById("preserve-transparency");
const ditherField = document.getElementById("dither-field");
const pixelField = document.getElementById("pixel-field");
const viewerModal = document.getElementById("viewer-modal");
const viewerCloseButton = document.getElementById("viewer-close");
const viewerViewport = document.getElementById("viewer-viewport");
const viewerCanvas = document.getElementById("viewer-canvas");
const viewerTitle = document.getElementById("viewer-title");

const originalContext = originalCanvas.getContext("2d", { willReadFrequently: true });
const editedContext = editedCanvas.getContext("2d", { willReadFrequently: true });
const viewerContext = viewerCanvas.getContext("2d");

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const BAYER_8X8 = [
  [0, 48, 12, 60, 3, 51, 15, 63],
  [32, 16, 44, 28, 35, 19, 47, 31],
  [8, 56, 4, 52, 11, 59, 7, 55],
  [40, 24, 36, 20, 43, 27, 39, 23],
  [2, 50, 14, 62, 1, 49, 13, 61],
  [34, 18, 46, 30, 33, 17, 45, 29],
  [10, 58, 6, 54, 9, 57, 5, 53],
  [42, 26, 38, 22, 41, 25, 37, 21],
];

const RENDER_MODES = {
  nearest: {
    label: "Nearest color",
    description: "Direct palette mapping with no dithering. Clean, flat, and literal.",
    usesDither: false,
    usesPixelSize: false,
    transform: applyNearestColor,
  },
  bayer4: {
    label: "Ordered dithering Bayer 4x4",
    description: "Compact retro dithering with visible graphic structure and strong transitions.",
    usesDither: true,
    usesPixelSize: false,
    transform: applyOrderedDither4x4,
  },
  bayer8: {
    label: "Ordered dithering Bayer 8x8",
    description: "Finer ordered dithering for smoother palette-limited gradients.",
    usesDither: true,
    usesPixelSize: false,
    transform: applyOrderedDither8x8,
  },
  floyd: {
    label: "Floyd-Steinberg dithering",
    description: "Classic error diffusion with more photographic, organic transitions.",
    usesDither: true,
    usesPixelSize: false,
    transform: applyFloydSteinberg,
  },
  atkinson: {
    label: "Atkinson dithering",
    description: "Softer diffusion with a crunchy old-school pixel-art feel.",
    usesDither: true,
    usesPixelSize: false,
    transform: applyAtkinson,
  },
  luminance: {
    label: "Luminance ramp mapping",
    description: "Maps pixels along a dark-to-light palette ramp for controlled tonal gradients.",
    usesDither: false,
    usesPixelSize: false,
    transform: applyLuminanceRamp,
  },
  posterized: {
    label: "Posterized bands",
    description: "Reduces the image into hard tonal steps for sharper, stylized banding.",
    usesDither: false,
    usesPixelSize: false,
    transform: applyPosterizedBands,
  },
  block: {
    label: "Block / pixel mode",
    description: "Builds the result from square blocks for a bold palette-mapped pixelized look.",
    usesDither: false,
    usesPixelSize: true,
    transform: applyBlockPixelMode,
  },
  hybrid: {
    label: "Hybrid mode",
    description: "Blends light pixelation with ordered dithering for compact retro gradients.",
    usesDither: true,
    usesPixelSize: true,
    transform: applyHybridMode,
  },
};

let currentImage = null;
let currentObjectUrl = null;
const viewerState = {
  isOpen: false,
  offsetX: 0,
  offsetY: 0,
  startOffsetX: 0,
  startOffsetY: 0,
  pointerStartX: 0,
  pointerStartY: 0,
  pointerId: null,
};

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
      const rgb = hexToRgb(hex);
      validSet.add(hex);
      validColors.push({
        hex,
        rgb,
        luminance: getLuminance(rgb.r, rgb.g, rgb.b),
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

function getLuminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
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

function sortPaletteByLuminance(colors) {
  return [...colors].sort((first, second) => first.luminance - second.luminance);
}

function getModeConfig() {
  return RENDER_MODES[renderingModeSelect.value] || RENDER_MODES.nearest;
}

function preparePalette(colors, forceSort = false) {
  if (forceSort || sortPaletteCheckbox.checked) {
    return sortPaletteByLuminance(colors);
  }

  return [...colors];
}

function getPreviewPalette(colors) {
  const mode = getModeConfig();
  return preparePalette(colors, mode === RENDER_MODES.luminance);
}

function updatePalettePreview() {
  const { validColors, invalidEntries } = parsePaletteInput(paletteInput.value);
  const previewPalette = getPreviewPalette(validColors);

  renderSwatches(
    recognizedColorsContainer,
    previewPalette,
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
  const sortedLabel = previewPalette.length > 1 && (sortPaletteCheckbox.checked || getModeConfig() === RENDER_MODES.luminance)
    ? " Palette preview is sorted by luminance."
    : "";

  paletteFeedback.textContent = `${validColors.length} valid color${validColors.length > 1 ? "s" : ""} detected.${invalidLabel}${sortedLabel}`;
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

function clampByte(value) {
  return Math.max(0, Math.min(255, value));
}

function createImageDataClone(sourceImageData) {
  return new ImageData(
    new Uint8ClampedArray(sourceImageData.data),
    sourceImageData.width,
    sourceImageData.height
  );
}

function createBlankImageData(sourceImageData) {
  return new ImageData(sourceImageData.width, sourceImageData.height);
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

function addUsedColor(usedColorMap, color) {
  if (!usedColorMap.has(color.hex)) {
    usedColorMap.set(color.hex, color);
  }
}

function setOutputPixel(outputData, index, color, alpha, preserveTransparency) {
  outputData[index] = color.rgb.r;
  outputData[index + 1] = color.rgb.g;
  outputData[index + 2] = color.rgb.b;
  outputData[index + 3] = preserveTransparency ? alpha : (alpha === 0 ? 0 : 255);
}

function getOrderedOffset(x, y, matrix, strength) {
  const size = matrix.length;
  const value = matrix[y % size][x % size];
  const normalized = (value + 0.5) / (size * size) - 0.5;
  return normalized * strength * 160;
}

function getScaledOrderedOffset(x, y, matrix, strength, cellSize) {
  const safeCellSize = Math.max(1, cellSize);
  const scaledX = Math.floor(x / safeCellSize);
  const scaledY = Math.floor(y / safeCellSize);
  return getOrderedOffset(scaledX, scaledY, matrix, strength);
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function getViewerBounds() {
  const viewportWidth = viewerViewport.clientWidth;
  const viewportHeight = viewerViewport.clientHeight;
  const centeredX = Math.round((viewportWidth - viewerCanvas.width) / 2);
  const centeredY = Math.round((viewportHeight - viewerCanvas.height) / 2);

  return {
    minX: viewerCanvas.width > viewportWidth ? viewportWidth - viewerCanvas.width : centeredX,
    maxX: viewerCanvas.width > viewportWidth ? 0 : centeredX,
    minY: viewerCanvas.height > viewportHeight ? viewportHeight - viewerCanvas.height : centeredY,
    maxY: viewerCanvas.height > viewportHeight ? 0 : centeredY,
  };
}

function clampViewerOffsets(offsetX, offsetY) {
  const bounds = getViewerBounds();

  return {
    offsetX: Math.min(bounds.maxX, Math.max(bounds.minX, offsetX)),
    offsetY: Math.min(bounds.maxY, Math.max(bounds.minY, offsetY)),
  };
}

function applyViewerTransform() {
  viewerCanvas.style.transform = `translate(${viewerState.offsetX}px, ${viewerState.offsetY}px)`;
}

function centerViewerImage() {
  const centeredX = Math.round((viewerViewport.clientWidth - viewerCanvas.width) / 2);
  const centeredY = Math.round((viewerViewport.clientHeight - viewerCanvas.height) / 2);
  const clamped = clampViewerOffsets(centeredX, centeredY);

  viewerState.offsetX = clamped.offsetX;
  viewerState.offsetY = clamped.offsetY;
  applyViewerTransform();
}

function openViewer(sourceCanvas, label) {
  if (!sourceCanvas.width || !sourceCanvas.height || !sourceCanvas.classList.contains("is-visible")) {
    return;
  }

  viewerCanvas.width = sourceCanvas.width;
  viewerCanvas.height = sourceCanvas.height;
  viewerContext.clearRect(0, 0, viewerCanvas.width, viewerCanvas.height);
  viewerContext.drawImage(sourceCanvas, 0, 0);
  viewerTitle.textContent = `${label} full size preview`;
  viewerModal.hidden = false;
  document.body.classList.add("viewer-open");
  viewerState.isOpen = true;

  requestAnimationFrame(() => {
    centerViewerImage();
  });
}

function closeViewer() {
  viewerModal.hidden = true;
  document.body.classList.remove("viewer-open");
  viewerViewport.classList.remove("is-dragging");
  viewerState.isOpen = false;
  viewerState.pointerId = null;
}

function startViewerDrag(event) {
  if (!viewerState.isOpen || !viewerCanvas.width || !viewerCanvas.height) {
    return;
  }

  viewerState.pointerId = event.pointerId;
  viewerState.pointerStartX = event.clientX;
  viewerState.pointerStartY = event.clientY;
  viewerState.startOffsetX = viewerState.offsetX;
  viewerState.startOffsetY = viewerState.offsetY;
  viewerViewport.classList.add("is-dragging");
  viewerCanvas.setPointerCapture(event.pointerId);
}

function moveViewerDrag(event) {
  if (viewerState.pointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.clientX - viewerState.pointerStartX;
  const deltaY = event.clientY - viewerState.pointerStartY;
  const clamped = clampViewerOffsets(
    viewerState.startOffsetX + deltaX,
    viewerState.startOffsetY + deltaY
  );

  viewerState.offsetX = clamped.offsetX;
  viewerState.offsetY = clamped.offsetY;
  applyViewerTransform();
}

function stopViewerDrag(event) {
  if (viewerState.pointerId !== event.pointerId) {
    return;
  }

  viewerViewport.classList.remove("is-dragging");
  viewerState.pointerId = null;
}

function buildRenderContext(validColors) {
  const mode = getModeConfig();
  const forceSortedPalette = mode === RENDER_MODES.luminance;

  return {
    mode,
    palette: preparePalette(validColors, forceSortedPalette),
    sourceImageData: originalContext.getImageData(0, 0, originalCanvas.width, originalCanvas.height),
    ditherStrength: Number.parseInt(ditherStrengthInput.value, 10) / 100,
    pixelSize: Number.parseInt(pixelSizeInput.value, 10),
    preserveTransparency: preserveTransparencyCheckbox.checked,
  };
}

function applyNearestColor(context) {
  const outputImageData = createImageDataClone(context.sourceImageData);
  const outputData = outputImageData.data;
  const usedColorMap = new Map();

  for (let index = 0; index < outputData.length; index += 4) {
    const alpha = outputData[index + 3];

    if (alpha === 0) {
      continue;
    }

    const closestColor = getClosestPaletteColor(
      outputData[index],
      outputData[index + 1],
      outputData[index + 2],
      context.palette
    );
    setOutputPixel(outputData, index, closestColor, alpha, context.preserveTransparency);
    addUsedColor(usedColorMap, closestColor);
  }

  return { imageData: outputImageData, usedColors: context.palette.filter((color) => usedColorMap.has(color.hex)) };
}

function applyOrderedDither(context, matrix) {
  const outputImageData = createImageDataClone(context.sourceImageData);
  const outputData = outputImageData.data;
  const width = outputImageData.width;
  const usedColorMap = new Map();

  for (let index = 0; index < outputData.length; index += 4) {
    const alpha = outputData[index + 3];

    if (alpha === 0) {
      continue;
    }

    const pixelNumber = index / 4;
    const x = pixelNumber % width;
    const y = Math.floor(pixelNumber / width);
    const offset = getOrderedOffset(x, y, matrix, context.ditherStrength);
    const closestColor = getClosestPaletteColor(
      clampByte(outputData[index] + offset),
      clampByte(outputData[index + 1] + offset),
      clampByte(outputData[index + 2] + offset),
      context.palette
    );

    setOutputPixel(outputData, index, closestColor, alpha, context.preserveTransparency);
    addUsedColor(usedColorMap, closestColor);
  }

  return { imageData: outputImageData, usedColors: context.palette.filter((color) => usedColorMap.has(color.hex)) };
}

function applyOrderedDither4x4(context) {
  return applyOrderedDither(context, BAYER_4X4);
}

function applyOrderedDither8x8(context) {
  return applyOrderedDither(context, BAYER_8X8);
}

function applyErrorDiffusion(context, diffusionPattern, divisor) {
  const sourceImageData = context.sourceImageData;
  const outputImageData = createImageDataClone(sourceImageData);
  const outputData = outputImageData.data;
  const workingData = new Float32Array(sourceImageData.data.length);
  const usedColorMap = new Map();
  const width = sourceImageData.width;
  const height = sourceImageData.height;

  for (let index = 0; index < sourceImageData.data.length; index += 1) {
    workingData[index] = sourceImageData.data[index];
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = sourceImageData.data[index + 3];

      if (alpha === 0) {
        continue;
      }

      const originalRed = clampByte(workingData[index]);
      const originalGreen = clampByte(workingData[index + 1]);
      const originalBlue = clampByte(workingData[index + 2]);
      const closestColor = getClosestPaletteColor(
        originalRed,
        originalGreen,
        originalBlue,
        context.palette
      );

      setOutputPixel(outputData, index, closestColor, alpha, context.preserveTransparency);
      addUsedColor(usedColorMap, closestColor);

      const redError = (originalRed - closestColor.rgb.r) * context.ditherStrength;
      const greenError = (originalGreen - closestColor.rgb.g) * context.ditherStrength;
      const blueError = (originalBlue - closestColor.rgb.b) * context.ditherStrength;

      for (const step of diffusionPattern) {
        const targetX = x + step.x;
        const targetY = y + step.y;

        if (targetX < 0 || targetX >= width || targetY < 0 || targetY >= height) {
          continue;
        }

        const targetIndex = (targetY * width + targetX) * 4;
        const targetAlpha = sourceImageData.data[targetIndex + 3];

        if (targetAlpha === 0) {
          continue;
        }

        const ratio = step.weight / divisor;
        workingData[targetIndex] += redError * ratio;
        workingData[targetIndex + 1] += greenError * ratio;
        workingData[targetIndex + 2] += blueError * ratio;
      }
    }
  }

  return { imageData: outputImageData, usedColors: context.palette.filter((color) => usedColorMap.has(color.hex)) };
}

function applyFloydSteinberg(context) {
  const pattern = [
    { x: 1, y: 0, weight: 7 },
    { x: -1, y: 1, weight: 3 },
    { x: 0, y: 1, weight: 5 },
    { x: 1, y: 1, weight: 1 },
  ];

  return applyErrorDiffusion(context, pattern, 16);
}

function applyAtkinson(context) {
  const pattern = [
    { x: 1, y: 0, weight: 1 },
    { x: 2, y: 0, weight: 1 },
    { x: -1, y: 1, weight: 1 },
    { x: 0, y: 1, weight: 1 },
    { x: 1, y: 1, weight: 1 },
    { x: 0, y: 2, weight: 1 },
  ];

  return applyErrorDiffusion(context, pattern, 8);
}

function applyLuminanceRamp(context) {
  const rampPalette = sortPaletteByLuminance(context.palette);
  const outputImageData = createImageDataClone(context.sourceImageData);
  const outputData = outputImageData.data;
  const usedColorMap = new Map();

  for (let index = 0; index < outputData.length; index += 4) {
    const alpha = outputData[index + 3];

    if (alpha === 0) {
      continue;
    }

    const luminance = getLuminance(outputData[index], outputData[index + 1], outputData[index + 2]);
    let bestMatch = rampPalette[0];
    let smallestDistance = Number.POSITIVE_INFINITY;

    for (const color of rampPalette) {
      const distance = Math.abs(luminance - color.luminance);

      if (distance < smallestDistance) {
        smallestDistance = distance;
        bestMatch = color;
      }
    }

    setOutputPixel(outputData, index, bestMatch, alpha, context.preserveTransparency);
    addUsedColor(usedColorMap, bestMatch);
  }

  return { imageData: outputImageData, usedColors: rampPalette.filter((color) => usedColorMap.has(color.hex)) };
}

function applyPosterizedBands(context) {
  const palette = context.palette.length > 1 ? context.palette : [context.palette[0]];
  const outputImageData = createImageDataClone(context.sourceImageData);
  const outputData = outputImageData.data;
  const usedColorMap = new Map();

  for (let index = 0; index < outputData.length; index += 4) {
    const alpha = outputData[index + 3];

    if (alpha === 0) {
      continue;
    }

    const luminance = getLuminance(outputData[index], outputData[index + 1], outputData[index + 2]);
    const scaled = luminance / 255;
    const bandIndex = Math.min(
      palette.length - 1,
      Math.floor(scaled * palette.length)
    );
    const color = palette[bandIndex];

    setOutputPixel(outputData, index, color, alpha, context.preserveTransparency);
    addUsedColor(usedColorMap, color);
  }

  return { imageData: outputImageData, usedColors: palette.filter((color) => usedColorMap.has(color.hex)) };
}

function fillBlock(outputData, width, startX, startY, blockWidth, blockHeight, color, alpha, preserveTransparency) {
  for (let offsetY = 0; offsetY < blockHeight; offsetY += 1) {
    for (let offsetX = 0; offsetX < blockWidth; offsetX += 1) {
      const index = ((startY + offsetY) * width + (startX + offsetX)) * 4;
      setOutputPixel(outputData, index, color, alpha, preserveTransparency);
    }
  }
}

function applyBlockPixelMode(context) {
  const sourceImageData = context.sourceImageData;
  const outputImageData = createBlankImageData(sourceImageData);
  const outputData = outputImageData.data;
  const sourceData = sourceImageData.data;
  const usedColorMap = new Map();
  const width = sourceImageData.width;
  const height = sourceImageData.height;

  for (let startY = 0; startY < height; startY += context.pixelSize) {
    for (let startX = 0; startX < width; startX += context.pixelSize) {
      const blockWidth = Math.min(context.pixelSize, width - startX);
      const blockHeight = Math.min(context.pixelSize, height - startY);
      let totalRed = 0;
      let totalGreen = 0;
      let totalBlue = 0;
      let totalAlpha = 0;
      let count = 0;

      for (let offsetY = 0; offsetY < blockHeight; offsetY += 1) {
        for (let offsetX = 0; offsetX < blockWidth; offsetX += 1) {
          const index = ((startY + offsetY) * width + (startX + offsetX)) * 4;
          const alpha = sourceData[index + 3];

          if (alpha === 0) {
            outputData[index + 3] = 0;
            continue;
          }

          totalRed += sourceData[index];
          totalGreen += sourceData[index + 1];
          totalBlue += sourceData[index + 2];
          totalAlpha += alpha;
          count += 1;
        }
      }

      if (count === 0) {
        continue;
      }

      const averageColor = getClosestPaletteColor(
        totalRed / count,
        totalGreen / count,
        totalBlue / count,
        context.palette
      );
      const averageAlpha = Math.round(totalAlpha / count);

      fillBlock(
        outputData,
        width,
        startX,
        startY,
        blockWidth,
        blockHeight,
        averageColor,
        averageAlpha,
        context.preserveTransparency
      );
      addUsedColor(usedColorMap, averageColor);
    }
  }

  return { imageData: outputImageData, usedColors: context.palette.filter((color) => usedColorMap.has(color.hex)) };
}

function applyHybridMode(context) {
  const sourceImageData = context.sourceImageData;
  const outputImageData = createBlankImageData(sourceImageData);
  const outputData = outputImageData.data;
  const sourceData = sourceImageData.data;
  const usedColorMap = new Map();
  const width = sourceImageData.width;
  const height = sourceImageData.height;
  const matrix = BAYER_4X4;

  for (let startY = 0; startY < height; startY += context.pixelSize) {
    for (let startX = 0; startX < width; startX += context.pixelSize) {
      const blockWidth = Math.min(context.pixelSize, width - startX);
      const blockHeight = Math.min(context.pixelSize, height - startY);
      let totalRed = 0;
      let totalGreen = 0;
      let totalBlue = 0;
      let totalAlpha = 0;
      let count = 0;

      for (let offsetY = 0; offsetY < blockHeight; offsetY += 1) {
        for (let offsetX = 0; offsetX < blockWidth; offsetX += 1) {
          const index = ((startY + offsetY) * width + (startX + offsetX)) * 4;
          const alpha = sourceData[index + 3];

          if (alpha === 0) {
            outputData[index + 3] = 0;
            continue;
          }

          totalRed += sourceData[index];
          totalGreen += sourceData[index + 1];
          totalBlue += sourceData[index + 2];
          totalAlpha += alpha;
          count += 1;
        }
      }

      if (count === 0) {
        continue;
      }

      const averageRed = totalRed / count;
      const averageGreen = totalGreen / count;
      const averageBlue = totalBlue / count;
      const averageAlpha = Math.round(totalAlpha / count);
      const offset = getScaledOrderedOffset(
        startX,
        startY,
        matrix,
        context.ditherStrength,
        context.pixelSize
      );
      const blockColor = getClosestPaletteColor(
        clampByte(averageRed + offset),
        clampByte(averageGreen + offset),
        clampByte(averageBlue + offset),
        context.palette
      );

      addUsedColor(usedColorMap, blockColor);

      for (let offsetY = 0; offsetY < blockHeight; offsetY += 1) {
        for (let offsetX = 0; offsetX < blockWidth; offsetX += 1) {
          const pixelX = startX + offsetX;
          const pixelY = startY + offsetY;
          const index = (pixelY * width + pixelX) * 4;
          const alpha = sourceData[index + 3];

          if (alpha === 0) {
            continue;
          }

          setOutputPixel(
            outputData,
            index,
            blockColor,
            context.preserveTransparency ? alpha : averageAlpha,
            context.preserveTransparency
          );
        }
      }
    }
  }

  return { imageData: outputImageData, usedColors: context.palette.filter((color) => usedColorMap.has(color.hex)) };
}

function updateControlValueLabels() {
  ditherStrengthValue.textContent = `${ditherStrengthInput.value}%`;
  pixelSizeValue.textContent = `${pixelSizeInput.value}px`;
}

function updateModeUI() {
  const mode = getModeConfig();
  const ditherDisabled = !mode.usesDither;
  const pixelDisabled = !mode.usesPixelSize;

  modeDescription.textContent = mode.description;
  ditherStrengthInput.disabled = ditherDisabled;
  pixelSizeInput.disabled = pixelDisabled;
  ditherField.classList.toggle("is-disabled", ditherDisabled);
  pixelField.classList.toggle("is-disabled", pixelDisabled);

  updatePalettePreview();
}

async function recolorCurrentImage() {
  const { validColors, invalidEntries } = updatePalettePreview();
  const mode = getModeConfig();

  if (!currentImage) {
    renderSwatches(usedColorsContainer, [], "No recolored output yet.");
    if (!validColors.length) {
      setStatus("Enter at least one valid 6-digit hex color before recoloring.", true);
    } else {
      setStatus(`Palette ready. Load an image to apply ${mode.label.toLowerCase()}.`);
    }
    return;
  }

  if (!validColors.length) {
    clearEditedPreview();
    setStatus("Recoloring blocked: no valid palette colors were found.", true);
    return;
  }

  setStatus(`Processing image with ${mode.label.toLowerCase()}...`);
  await waitForNextPaint();

  const renderContext = buildRenderContext(validColors);
  const result = renderContext.mode.transform(renderContext);
  const invalidSummary = invalidEntries.length
    ? ` ${invalidEntries.length} invalid entr${invalidEntries.length > 1 ? "ies were" : "y was"} ignored.`
    : "";

  editedCanvas.width = result.imageData.width;
  editedCanvas.height = result.imageData.height;
  editedContext.putImageData(result.imageData, 0, 0);
  setCanvasVisibility(editedCanvas, editedPlaceholder, true);
  downloadButton.disabled = false;

  renderSwatches(
    usedColorsContainer,
    result.usedColors,
    "No palette colors were used."
  );

  setStatus(
    `${mode.label} applied with ${renderContext.palette.length} palette color${renderContext.palette.length > 1 ? "s" : ""}. ${result.usedColors.length} color${result.usedColors.length > 1 ? "s are" : " is"} visible in the result.${invalidSummary}`
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
    setStatus("Image loaded. Applying current rendering mode...");
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

function handlePreviewActivation(canvas, label) {
  canvas.addEventListener("click", () => {
    openViewer(canvas, label);
  });

  canvas.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openViewer(canvas, label);
  });
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

  setStatus('Palette updated. Click "Recolor image" to apply the new colors and mode.');
});

renderingModeSelect.addEventListener("change", () => {
  updateModeUI();

  if (!currentImage) {
    setStatus("Rendering mode updated. Load an image or click recolor when ready.");
    return;
  }

  setStatus('Rendering mode updated. Click "Recolor image" to apply it.');
});

ditherStrengthInput.addEventListener("input", () => {
  updateControlValueLabels();

  if (currentImage) {
    setStatus('Dither strength updated. Click "Recolor image" to refresh the preview.');
  }
});

pixelSizeInput.addEventListener("input", () => {
  updateControlValueLabels();

  if (currentImage) {
    setStatus('Pixel size updated. Click "Recolor image" to refresh the preview.');
  }
});

sortPaletteCheckbox.addEventListener("change", () => {
  updatePalettePreview();

  if (currentImage) {
    setStatus('Palette ordering updated. Click "Recolor image" to apply it.');
  }
});

preserveTransparencyCheckbox.addEventListener("change", () => {
  if (currentImage) {
    setStatus('Transparency handling updated. Click "Recolor image" to apply it.');
  }
});

viewerCloseButton.addEventListener("click", closeViewer);

viewerModal.addEventListener("click", (event) => {
  if (event.target === viewerModal) {
    closeViewer();
  }
});

viewerCanvas.addEventListener("pointerdown", startViewerDrag);
viewerCanvas.addEventListener("pointermove", moveViewerDrag);
viewerCanvas.addEventListener("pointerup", stopViewerDrag);
viewerCanvas.addEventListener("pointercancel", stopViewerDrag);

window.addEventListener("resize", () => {
  if (viewerState.isOpen) {
    centerViewerImage();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && viewerState.isOpen) {
    closeViewer();
  }
});

updateControlValueLabels();
updateModeUI();
renderSwatches(usedColorsContainer, [], "No recolored output yet.");
handlePreviewActivation(originalCanvas, "Original image");
handlePreviewActivation(editedCanvas, "Recolored image");

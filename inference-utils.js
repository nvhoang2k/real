"use strict";

/**
 * Clamp a numeric value into the provided inclusive range.
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function softmax(values) {
  if (!values || typeof values.length !== "number" || values.length === 0) {
    return [];
  }

  let maxValue = values[0];
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] > maxValue) {
      maxValue = values[index];
    }
  }

  const exponents = new Array(values.length);
  let exponentSum = 0;
  for (let index = 0; index < values.length; index += 1) {
    const exponent = Math.exp(values[index] - maxValue);
    exponents[index] = exponent;
    exponentSum += exponent;
  }

  const safeSum = exponentSum || 1;
  return exponents.map((value) => value / safeSum);
}

function argmax(probabilities) {
  let bestIndex = 0;
  let bestValue = probabilities[0] || 0;

  for (let index = 1; index < probabilities.length; index += 1) {
    if (probabilities[index] > bestValue) {
      bestIndex = index;
      bestValue = probabilities[index];
    }
  }

  return {
    index: bestIndex,
    score: bestValue
  };
}

function sampleNearest(pixelData, targetWidth, targetHeight) {
  const output = new Float32Array(targetWidth * targetHeight * 3);
  const sourceWidth = pixelData.width;
  const sourceHeight = pixelData.height;
  const source = pixelData.data;

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(
      sourceHeight - 1,
      Math.floor((y / targetHeight) * sourceHeight)
    );

    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(
        sourceWidth - 1,
        Math.floor((x / targetWidth) * sourceWidth)
      );
      const sourceOffset = (sourceY * sourceWidth + sourceX) * 4;
      const targetOffset = (y * targetWidth + x) * 3;

      output[targetOffset] = source[sourceOffset] / 255;
      output[targetOffset + 1] = source[sourceOffset + 1] / 255;
      output[targetOffset + 2] = source[sourceOffset + 2] / 255;
    }
  }

  return output;
}

/**
 * Convert chunky RGBA pixel data into a normalized float32 NCHW tensor buffer.
 */
function toNchwTensorData(pixelData, targetWidth, targetHeight, normalization = {}) {
  const sampled = sampleNearest(pixelData, targetWidth, targetHeight);
  const chw = new Float32Array(targetWidth * targetHeight * 3);
  const mean = normalization.mean || [0.485, 0.456, 0.406];
  const std = normalization.std || [0.229, 0.224, 0.225];
  const planeSize = targetWidth * targetHeight;

  for (let index = 0; index < planeSize; index += 1) {
    const sourceOffset = index * 3;
    chw[index] = (sampled[sourceOffset] - mean[0]) / std[0];
    chw[index + planeSize] = (sampled[sourceOffset + 1] - mean[1]) / std[1];
    chw[index + planeSize * 2] = (sampled[sourceOffset + 2] - mean[2]) / std[2];
  }

  return chw;
}

module.exports = {
  argmax,
  clamp,
  sampleNearest,
  softmax,
  toNchwTensorData
};

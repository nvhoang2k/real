// NOTE: `engine.js` is a legacy script kept for quick command-line prototyping.
// The plugin now uses the unified runtime in `ai_runtime.js` together with the
// shared helper modules such as `mask-utils.js`, and the UI does not import
// this file.
const sharp = require("sharp");
const ort = require("onnxruntime-node");
const fs = require("fs");

let session;

// load model
async function loadModel() {
    session = await ort.InferenceSession.create("segmentation.onnx", {
        executionProviders: ["CPUExecutionProvider"]
    });
}

// run AI
async function runAI(imagePath) {
    const img = sharp(imagePath);

    const { data } = await img
        .resize(512,512)
        .raw()
        .toBuffer({ resolveWithObject: true });

    const input = new ort.Tensor("float32", Float32Array.from(data), [1,3,512,512]);

    const result = await session.run({ input });

    return result.output.data;
}

// load preset
function loadPreset(name) {
    return JSON.parse(fs.readFileSync(`presets/${name}.json`));
}

// process 1 ảnh
async function processImage(path, preset) {

    let img = sharp(path);

    // AI (window detect nhẹ)
    try {
        await runAI(path);
        img = img.gamma(0.9); // giả lập bảo vệ window
    } catch {}

    // apply preset
    img = img.modulate({
        brightness: preset.brightness,
        saturation: preset.saturation
    });

    img = img.gamma(preset.gamma);

    if (preset.sharpen) {
        img = img.sharpen(preset.sharpen);
    }

    const out = path.replace(".jpg", "_FINAL.jpg");

    await img.toFile(out);

    console.log("DONE:", out);
}

// batch
async function processBatch(files, presetName) {

    const preset = loadPreset(presetName);

    for (let f of files) {
        if (f.path.endsWith(".jpg")) {
            await processImage(f.path, preset);
        }
    }
}

module.exports = { loadModel, processBatch };

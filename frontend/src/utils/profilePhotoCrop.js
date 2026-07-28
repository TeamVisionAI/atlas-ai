const CROP_OUTPUT_SIZE = 512;

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read image file."));
    };

    image.src = objectUrl;
  });
}

function filePreservesTransparency(mimeType) {
  return mimeType === "image/png" || mimeType === "image/webp";
}

/**
 * Crop a square region from the source image and resize to 512x512 for avatar upload.
 * @param {File} file
 * @param {{ x: number, y: number, width: number, height: number }} pixelCrop
 * @returns {Promise<File>}
 */
export async function createCroppedProfilePhoto(file, pixelCrop) {
  const image = await loadImageFromFile(file);
  const canvas = document.createElement("canvas");
  canvas.width = CROP_OUTPUT_SIZE;
  canvas.height = CROP_OUTPUT_SIZE;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to prepare photo crop.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    CROP_OUTPUT_SIZE,
    CROP_OUTPUT_SIZE
  );

  const preserveAlpha = filePreservesTransparency(file.type);
  const outputType = preserveAlpha ? "image/png" : "image/jpeg";
  const extension = preserveAlpha ? "png" : "jpg";

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (!result) {
          reject(new Error("Unable to crop photo."));
          return;
        }

        resolve(result);
      },
      outputType,
      preserveAlpha ? undefined : 0.92
    );
  });

  return new File([blob], `avatar.${extension}`, { type: outputType });
}

export { CROP_OUTPUT_SIZE };

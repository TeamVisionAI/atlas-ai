/**
 * Local QR image generation for Campaign Manager (no external QR API).
 */

const QRCode = require("qrcode");

const ECC = "H";

async function renderQrPngBuffer(url) {
  return QRCode.toBuffer(String(url), {
    type: "png",
    errorCorrectionLevel: ECC,
    margin: 2,
    width: 1024,
    color: { dark: "#000000", light: "#FFFFFF" }
  });
}

async function renderQrSvgString(url) {
  return QRCode.toString(String(url), {
    type: "svg",
    errorCorrectionLevel: ECC,
    margin: 2,
    width: 1024,
    color: { dark: "#000000", light: "#FFFFFF" }
  });
}

module.exports = {
  ECC,
  renderQrPngBuffer,
  renderQrSvgString
};

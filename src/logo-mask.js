export async function loadLogoMask(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load logo SVG (${response.status}).`);
  const source = await response.text();
  const svgDocument = new DOMParser().parseFromString(source, 'image/svg+xml');
  const svg = svgDocument.documentElement;
  if (svgDocument.querySelector('parsererror') || svg.localName !== 'svg') throw new Error('logoUrl must point to a valid SVG.');
  const viewBox = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const width = viewBox?.[2] || parseFloat(svg.getAttribute('width'));
  const height = viewBox?.[3] || parseFloat(svg.getAttribute('height'));
  if (!(width > 0 && height > 0 && Number.isFinite(width / height))) throw new Error('The SVG needs a viewBox or explicit dimensions.');
  const rasterScale = Math.min(768 / height, 2048 / width);
  const rasterHeight = Math.max(1, Math.round(height * rasterScale));
  const rasterWidth = Math.max(1, Math.round(width * rasterScale));
  // Explicit pixel dimensions prevent percentage-sized SVGs from decoding differently across browsers.
  svg.setAttribute('width', String(rasterWidth));
  svg.setAttribute('height', String(rasterHeight));
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = rasterWidth; canvas.height = rasterHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not rasterize logo SVG.');
    context.drawImage(image, 0, 0, rasterWidth, rasterHeight);
    const rgba = context.getImageData(0, 0, rasterWidth, rasterHeight).data;
    const pixels = new Uint8Array(rasterWidth * rasterHeight);
    for (let index = 0; index < pixels.length; index++) pixels[index] = rgba[index * 4 + 3] > 127 ? 1 : 0;
    return { width: rasterWidth, height: rasterHeight, pixels };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

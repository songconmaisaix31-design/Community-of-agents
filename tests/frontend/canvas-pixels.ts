import type { Page } from "@playwright/test";

/** Detect actual rendered points, including antialiasing, against current theme colors.
 * This reads the canvas screenshot; it never obtains graph coordinates from the app.
 * Slate evidence lines cannot pass the cyan/green color-vector residual check.
 */
export async function canvasPoints(page: Page) {
  const canvas = page.locator(".cosmos-host canvas");
  const png = (await canvas.screenshot({ scale: "css" })).toString("base64");
  const points = await page.evaluate(async data => {
    const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
    const scratch = document.createElement("canvas"); scratch.width = img.width; scratch.height = img.height;
    const ctx = scratch.getContext("2d")!;
    const css = getComputedStyle(document.documentElement);
    const rgb = (name: string) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = css.getPropertyValue(name).trim(); ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
    const background = rgb("--graph-background"), colors = [rgb("--graph-agent"), rgb("--graph-platform")];
    ctx.clearRect(0, 0, scratch.width, scratch.height); ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, scratch.width, scratch.height).data;
    const mask = new Int8Array(scratch.width * scratch.height).fill(-1);
    const vectors = colors.map(color => color.map((c, i) => c - background[i]));
    for (let i = 0; i < mask.length; i++) {
      const delta = background.map((c, j) => pixels[i * 4 + j] - c);
      vectors.forEach((v, kind) => {
        const alpha = v.reduce((sum, n, j) => sum + n * delta[j], 0) / v.reduce((sum, n) => sum + n * n, 0);
        const residual = Math.sqrt(v.reduce((sum, n, j) => sum + (delta[j] - alpha * n) ** 2, 0));
        if (alpha >= 0.32 && alpha <= 1.1 && residual < 14) mask[i] = kind;
      });
    }
    const centers: { x: number; y: number; count: number; kind: number }[] = [];
    for (let start = 0; start < mask.length; start++) {
      if (mask[start] < 0) continue;
      const kind = mask[start], stack = [start]; mask[start] = -1;
      let xsum = 0, ysum = 0, count = 0;
      while (stack.length) {
        const i = stack.pop()!, x = i % scratch.width, y = Math.floor(i / scratch.width);
        xsum += x; ysum += y; count++;
        for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) {
          const nx = x + dx, ny = y + dy, ni = ny * scratch.width + nx;
          if (nx >= 0 && nx < scratch.width && ny >= 0 && ny < scratch.height && mask[ni] === kind) { mask[ni] = -1; stack.push(ni); }
        }
      }
      if (count >= 2) centers.push({ x: xsum / count, y: ysum / count, count, kind });
    }
    return centers;
  }, png);
  return { points, bounds: (await canvas.boundingBox())! };
}

import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";
let ready: Promise<unknown> | undefined;
export function startDemo() {
  if (!location.pathname.startsWith("/demo")) throw new Error("示例只能在示例空间启动。");
  if (!ready) { const worker = setupWorker(...handlers); ready = worker.start({ quiet: true, serviceWorker: { url: "/demo/mockServiceWorker.js", options: { scope: "/demo/" } }, onUnhandledRequest(request, print) { if (new URL(request.url).pathname.startsWith("/demo/api")) print.error(); } }); }
  return ready;
}

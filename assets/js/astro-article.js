import { initReadingProgress, typesetMath } from "./astro-runtime.js";

initReadingProgress();
try {
  await typesetMath();
} finally {
  window.RadiantBlazePageLoader?.hide();
}

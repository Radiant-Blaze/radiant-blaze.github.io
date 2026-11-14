import { initReadingProgress, typesetMath } from "./astro-runtime.js";

initReadingProgress();
const article = document.querySelector(".quest-article, [data-writeup], [data-markdown-post]");
try {
  await typesetMath(article);
} finally {
  window.RadiantBlazePageLoader?.hide();
}

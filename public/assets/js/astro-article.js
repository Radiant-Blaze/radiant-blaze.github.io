import { initReadingProgress, renderDiagrams, typesetMath } from "./astro-runtime.js?v=20261115-1";

initReadingProgress();
const article = document.querySelector(".quest-article, [data-writeup], [data-markdown-post]");
// Start the diagram import first so both CDN fetches overlap; the page loader
// still waits for MathJax and every diagram before it reveals the article.
const diagrams = renderDiagrams(article);
try {
  await typesetMath(article);
  await diagrams;
} finally {
  window.RadiantBlazePageLoader?.hide();
}

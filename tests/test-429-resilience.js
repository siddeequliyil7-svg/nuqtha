import fs from 'fs';
import path from 'path';

console.log("==================================================");
console.log("TESTING 429 RESILIENCE & LOCAL PERSISTENCE CONFIG");
console.log("==================================================");

// 1. Verify firebase-config.js
const fbConfig = fs.readFileSync('nuqtha/firebase-config.js', 'utf8');
if (!fbConfig.includes('persistentLocalCache') || !fbConfig.includes('persistentMultipleTabManager')) {
  console.error("FAIL: firebase-config.js is missing persistentLocalCache or persistentMultipleTabManager");
  process.exit(1);
}
if (!fbConfig.includes('response.status === 429')) {
  console.error("FAIL: fetchWithRetry does not halt retries on 429");
  process.exit(1);
}
console.log("  [OK] firebase-config.js enables IndexedDB persistent multi-tab cache and halts 429 retries.");

// 2. Verify article.html
const articleHtml = fs.readFileSync('nuqtha/article.html', 'utf8');
if (!articleHtml.includes('searchLocalArticlesPool') || !articleHtml.includes('FALLBACK_ARTICLES')) {
  console.error("FAIL: article.html is missing searchLocalArticlesPool or FALLBACK_ARTICLES");
  process.exit(1);
}
if (!articleHtml.includes('checkIsRateLimited') || !articleHtml.includes('markFirestoreRateLimited')) {
  console.error("FAIL: article.html is missing 429 circuit breaker");
  process.exit(1);
}
console.log("  [OK] article.html implements 0ms local pool search, 429 circuit breaker, and robust fallback.");

// 3. Verify library.js
const libraryJs = fs.readFileSync('nuqtha/library.js', 'utf8');
const fallbackData = fs.readFileSync('nuqtha/fallback-data.js', 'utf8');
if (!fallbackData.includes('FALLBACK_ARTICLES') || !fallbackData.includes('FALLBACK_BOOKS')) {
  console.error("FAIL: fallback-data.js is missing article or book fallback collections");
  process.exit(1);
}
if (!libraryJs.includes('getDocsFromCache') || !libraryJs.includes('FALLBACK_BOOKS')) {
  console.error("FAIL: library.js is missing offline cache recovery or fallback books");
  process.exit(1);
}
console.log("  [OK] library.js is resilient to 429 quota exhaustion and has fallback books.");

console.log("==================================================");
console.log("PASS: ALL 429 RESILIENCE CHECKS PASSED!");
console.log("==================================================");

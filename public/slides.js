// Reads a PDF in the browser with pdf.js: each page's text, and each page drawn as a
// JPEG about 1000px wide, ready for /api/slides.

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/';
export const MAX_SLIDES = 15;
const MAX_BODY = 3.8 * 1024 * 1024; // the whole request must stay under 4 MB

let pdfjs;
async function loadPdfJs() {
  if (!pdfjs) {
    pdfjs = await import(`${PDFJS}pdf.min.mjs`);
    pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS}pdf.worker.min.mjs`;
  }
  return pdfjs;
}

// onPage(number, count, canvas) is called as each page is drawn.
// Returns { slides: [{text, image}], total, used }.
export async function readPdf(file, onPage) {
  const { getDocument } = await loadPdfJs();
  let pdf;
  try {
    pdf = await getDocument({ data: await file.arrayBuffer() }).promise;
  } catch {
    throw new Error("That file couldn't be opened as a PDF. Try exporting it again.");
  }
  const total = pdf.numPages;
  const used = Math.min(total, MAX_SLIDES);
  const pages = [];
  for (let n = 1; n <= used; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => item.str + (item.hasEOL ? '\n' : ' '))
      .join('')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .trim();
    const viewport = page.getViewport({ scale: 1000 / page.getViewport({ scale: 1 }).width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    page.cleanup();
    pages.push({ text, canvas });
    onPage?.(n, used, canvas);
  }
  pdf.destroy();
  return { slides: encode(pages), total, used };
}

// Lower the JPEG quality, then the size, until the request fits under the limit.
function encode(pages) {
  const tries = [
    [1000, 0.75],
    [1000, 0.6],
    [1000, 0.45],
    [800, 0.45],
    [640, 0.4],
  ];
  for (const [width, quality] of tries) {
    const slides = pages.map((p) => ({ text: p.text, image: toJpeg(p.canvas, width, quality) }));
    if (JSON.stringify({ slides }).length < MAX_BODY) return slides;
  }
  throw new Error('These slides are too big to send, even shrunk. Try a deck with fewer slides.');
}

function toJpeg(canvas, width, quality) {
  if (canvas.width <= width) return canvas.toDataURL('image/jpeg', quality);
  const small = document.createElement('canvas');
  small.width = width;
  small.height = Math.round((canvas.height * width) / canvas.width);
  small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
  return small.toDataURL('image/jpeg', quality);
}

import * as pdfjsLib from 'pdfjs-dist';
import { GlobalWorkerOptions } from 'pdfjs-dist';
// @ts-ignore - The esbuild plugin converts this to a string export
import pdfWorkerCode from 'pdfjs-dist/build/pdf.worker.min.mjs';
import { App, TFile } from 'obsidian';
import { PdfPageInfo } from './pdf.types';

// Initialize PDF.js worker using blob URL (avoids external file dependency)
const workerBlob = new Blob([pdfWorkerCode], { type: 'application/javascript' });
GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);

/**
 * Load PDF metadata (page dimensions) from a vault file
 */
export async function loadPdfMetadata(app: App, filePath: string): Promise<PdfPageInfo[]> {
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const arrayBuffer = await app.vault.readBinary(file);
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const pages: PdfPageInfo[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.0 });
        pages.push({
            pageNumber: i,
            width: viewport.width,
            height: viewport.height,
        });
    }

    return pages;
}

/**
 * Render a single PDF page to a canvas at specified DPI
 */
export async function renderPdfPage(
    app: App,
    filePath: string,
    pageNumber: number,
    dpi: number = 150
): Promise<Blob> {
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const arrayBuffer = await app.vault.readBinary(file);
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(pageNumber);

    // Calculate scale based on DPI (PDF default is 72 DPI)
    const scale = dpi / 72;
    const viewport = page.getViewport({ scale });

    // Create canvas for rendering
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Failed to get canvas 2D context');
    }

    await page.render({
        canvasContext: context,
        viewport: viewport,
    }).promise;

    // Convert to blob
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to create blob from canvas'));
                }
            },
            'image/png',
            1.0
        );
    });
}

/**
 * Get total page count of a PDF
 */
export async function getPdfPageCount(app: App, filePath: string): Promise<number> {
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const arrayBuffer = await app.vault.readBinary(file);
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    return pdf.numPages;
}

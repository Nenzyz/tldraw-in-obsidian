import { Box, TLAssetId, TLShapeId } from "tldraw";

/**
 * Metadata for a single PDF page
 */
export interface PdfPageInfo {
    pageNumber: number;
    width: number;
    height: number;
    thumbnailDataUrl?: string;
}

/**
 * Represents a processed PDF page ready for tldraw
 */
export interface PdfPage {
    /** Base64-encoded image source */
    src: string;
    /** Canvas bounds for positioning */
    bounds: Box;
    /** Associated asset ID in tldraw */
    assetId: TLAssetId;
    /** Associated shape ID in tldraw */
    shapeId: TLShapeId;
}

/**
 * Complete PDF document structure
 */
export interface Pdf {
    /** Original filename */
    name: string;
    /** Processed pages */
    pages: PdfPage[];
    /** Original PDF buffer data */
    source: ArrayBuffer;
}

/**
 * Options for loading/rendering PDFs
 */
export interface PdfLoadOptions {
    /** Scale factor for rendering (default: 1.5) */
    visualScale?: number;
    /** Spacing between pages in pixels (default: 32) */
    pageSpacing?: number;
}

/**
 * Options passed from the import modal
 */
export interface PdfImportOptions {
    /** Selected page numbers (1-indexed) */
    selectedPages: number[];
    /** Whether to group pages together */
    groupPages: boolean;
    /** Spacing between pages in pixels */
    spacing: number;
    /** Render DPI (72-300) */
    dpi: number;
}

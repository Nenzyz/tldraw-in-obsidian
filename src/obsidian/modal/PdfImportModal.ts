import { App, Modal, Setting, TFile } from "obsidian";
import { loadPdfMetadata, PdfPageInfo, PdfImportOptions } from "src/components/pdf";

export class PdfImportCanceled extends Error {
    constructor() {
        super("PDF import canceled");
    }
}

/**
 * Modal for importing PDF files into tldraw
 * Allows page selection, DPI configuration, and grouping options
 */
export class PdfImportModal extends Modal {
    private file: TFile;
    private pages: PdfPageInfo[] = [];
    private selectedPages: Set<number> = new Set();
    private groupPages = false;
    private spacing = 32;
    private dpi = 150;
    private resolve?: (options: PdfImportOptions) => void;
    private reject?: (error: Error) => void;

    constructor(app: App, file: TFile) {
        super(app);
        this.file = file;
    }

    /**
     * Show the modal and return import options
     */
    static async show(app: App, file: TFile): Promise<PdfImportOptions> {
        const modal = new PdfImportModal(app, file);
        return new Promise((resolve, reject) => {
            modal.resolve = resolve;
            modal.reject = reject;
            modal.open();
        });
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("ptl-pdf-import-modal");

        contentEl.createEl("h2", { text: `Import PDF: ${this.file.name}` });

        // Show loading state
        const loadingEl = contentEl.createEl("p", { text: "Loading PDF..." });

        try {
            // Load PDF metadata
            this.pages = await loadPdfMetadata(this.app, this.file.path);
            loadingEl.remove();

            // Select all pages by default
            this.pages.forEach(p => this.selectedPages.add(p.pageNumber));

            this.renderContent();
        } catch (error) {
            loadingEl.setText(`Error loading PDF: ${error}`);
        }
    }

    private renderContent() {
        const { contentEl } = this;

        // Page count info
        contentEl.createEl("p", {
            text: `${this.pages.length} page${this.pages.length !== 1 ? "s" : ""} found`,
            cls: "ptl-pdf-info"
        });

        // Page selection section
        const pageSection = contentEl.createDiv({ cls: "ptl-pdf-section" });
        pageSection.createEl("h3", { text: "Select Pages" });

        // Bulk selection buttons
        const bulkButtons = pageSection.createDiv({ cls: "ptl-pdf-bulk-buttons" });

        const allBtn = bulkButtons.createEl("button", { text: "All" });
        allBtn.addEventListener("click", () => {
            this.pages.forEach(p => this.selectedPages.add(p.pageNumber));
            this.updatePageList();
        });

        const noneBtn = bulkButtons.createEl("button", { text: "None" });
        noneBtn.addEventListener("click", () => {
            this.selectedPages.clear();
            this.updatePageList();
        });

        // Range input
        const rangeContainer = pageSection.createDiv({ cls: "ptl-pdf-range" });
        rangeContainer.createEl("span", { text: "Range: " });
        const rangeInput = rangeContainer.createEl("input", {
            type: "text",
            placeholder: "e.g., 1-3, 5, 7-10",
            cls: "ptl-pdf-range-input"
        });
        rangeInput.value = this.pagesToRangeString();
        rangeInput.addEventListener("input", () => {
            this.parseRangeInput(rangeInput.value);
            this.updatePageList();
        });

        // Page checkboxes
        const pageList = pageSection.createDiv({ cls: "ptl-pdf-page-list" });
        this.pages.forEach(page => {
            const pageItem = pageList.createDiv({ cls: "ptl-pdf-page-item" });

            const checkbox = pageItem.createEl("input", { type: "checkbox" });
            checkbox.checked = this.selectedPages.has(page.pageNumber);
            checkbox.dataset.page = String(page.pageNumber);
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    this.selectedPages.add(page.pageNumber);
                } else {
                    this.selectedPages.delete(page.pageNumber);
                }
                rangeInput.value = this.pagesToRangeString();
            });

            pageItem.createEl("span", {
                text: `Page ${page.pageNumber} (${Math.round(page.width)}×${Math.round(page.height)})`
            });
        });

        // Options section
        const optionsSection = contentEl.createDiv({ cls: "ptl-pdf-section" });
        optionsSection.createEl("h3", { text: "Options" });

        // DPI setting
        new Setting(optionsSection)
            .setName("Render DPI")
            .setDesc("Higher DPI = sharper but larger images (72-300)")
            .addSlider(slider => {
                slider
                    .setLimits(72, 300, 1)
                    .setValue(this.dpi)
                    .setDynamicTooltip()
                    .onChange(value => {
                        this.dpi = value;
                    });
            });

        // Spacing setting
        new Setting(optionsSection)
            .setName("Page spacing")
            .setDesc("Pixels between pages")
            .addText(text => {
                text
                    .setValue(String(this.spacing))
                    .onChange(value => {
                        const parsed = parseInt(value);
                        if (!isNaN(parsed) && parsed >= 0) {
                            this.spacing = parsed;
                        }
                    });
            });

        // Group pages setting
        new Setting(optionsSection)
            .setName("Group pages")
            .setDesc("Group all pages as a single tldraw group")
            .addToggle(toggle => {
                toggle
                    .setValue(this.groupPages)
                    .onChange(value => {
                        this.groupPages = value;
                    });
            });

        // Action buttons
        const buttonContainer = contentEl.createDiv({ cls: "ptl-pdf-buttons" });

        const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
        cancelBtn.addEventListener("click", () => {
            this.reject?.(new PdfImportCanceled());
            this.close();
        });

        const importBtn = buttonContainer.createEl("button", {
            text: "Import",
            cls: "mod-cta"
        });
        importBtn.addEventListener("click", () => {
            if (this.selectedPages.size === 0) {
                // Show error
                const existing = contentEl.querySelector(".ptl-pdf-error");
                if (!existing) {
                    contentEl.createEl("p", {
                        text: "Please select at least one page",
                        cls: "ptl-pdf-error"
                    });
                }
                return;
            }

            this.resolve?.({
                selectedPages: Array.from(this.selectedPages).sort((a, b) => a - b),
                groupPages: this.groupPages,
                spacing: this.spacing,
                dpi: this.dpi,
            });
            this.close();
        });
    }

    private updatePageList() {
        const checkboxes = this.contentEl.querySelectorAll<HTMLInputElement>(
            ".ptl-pdf-page-item input[type='checkbox']"
        );
        checkboxes.forEach(checkbox => {
            const pageNum = parseInt(checkbox.dataset.page ?? "0");
            checkbox.checked = this.selectedPages.has(pageNum);
        });

        // Update range input
        const rangeInput = this.contentEl.querySelector<HTMLInputElement>(".ptl-pdf-range-input");
        if (rangeInput) {
            rangeInput.value = this.pagesToRangeString();
        }
    }

    private parseRangeInput(value: string) {
        this.selectedPages.clear();
        const parts = value.split(",").map(s => s.trim()).filter(Boolean);

        for (const part of parts) {
            if (part.includes("-")) {
                const [startStr, endStr] = part.split("-").map(s => s.trim());
                const start = parseInt(startStr);
                const end = parseInt(endStr);
                if (!isNaN(start) && !isNaN(end)) {
                    for (let i = Math.max(1, start); i <= Math.min(this.pages.length, end); i++) {
                        this.selectedPages.add(i);
                    }
                }
            } else {
                const num = parseInt(part);
                if (!isNaN(num) && num >= 1 && num <= this.pages.length) {
                    this.selectedPages.add(num);
                }
            }
        }
    }

    private pagesToRangeString(): string {
        const sorted = Array.from(this.selectedPages).sort((a, b) => a - b);
        if (sorted.length === 0) return "";

        const ranges: string[] = [];
        let rangeStart = sorted[0];
        let rangeEnd = sorted[0];

        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i] === rangeEnd + 1) {
                rangeEnd = sorted[i];
            } else {
                ranges.push(rangeStart === rangeEnd ? String(rangeStart) : `${rangeStart}-${rangeEnd}`);
                rangeStart = sorted[i];
                rangeEnd = sorted[i];
            }
        }
        ranges.push(rangeStart === rangeEnd ? String(rangeStart) : `${rangeStart}-${rangeEnd}`);

        return ranges.join(", ");
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        // If modal closed without resolution, reject
        if (this.reject) {
            this.reject(new PdfImportCanceled());
        }
    }
}

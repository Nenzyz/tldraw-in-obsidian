import { AssetRecordType, createShapeId, Editor, TLExportType, TLImageExportOptions, TLImageShape, TLShapeId, TLUiActionItem, TLUiActionsContextType, TLUiEventContextType, TLUiEventSource, TLUiOverrideHelpers, TLUiOverrides, useUiEvents } from "tldraw";
import { Platform, TFile } from "obsidian";
import TldrawPlugin from "src/main";
import { downloadBlob, getSaveFileCopyAction, getSaveFileCopyInVaultAction, importFileAction, OPEN_FILE_ACTION, SAVE_FILE_COPY_ACTION, SAVE_FILE_COPY_IN_VAULT_ACTION } from "src/utils/file";
import LassoSelectTool from "./tools/lasso-select-tool";
import { FileSearchModal } from "src/obsidian/modal/FileSearchModal";
import { PdfImportModal, PdfImportCanceled } from "src/obsidian/modal/PdfImportModal";
import { loadPdfMetadata, renderPdfPage } from "src/components/pdf";

export const IMPORT_PDF_ACTION = 'import-pdf';

const DEFAULT_CAMERA_STEPS = [0.1, 0.25, 0.5, 1, 2, 4, 8];

export const PLUGIN_ACTION_TOGGLE_ZOOM_LOCK = 'toggle-zoom-lock';

export function uiOverrides(plugin: TldrawPlugin): TLUiOverrides {
	const trackEvent = useUiEvents();
	return {
		tools(editor, tools, helpers) {
			// Add lasso select tool
			tools[LassoSelectTool.id] = {
				id: LassoSelectTool.id,
				label: 'Lasso' as any,
				icon: 'lasso',
				kbd: 's',
				onSelect() {
					editor.setCurrentTool(LassoSelectTool.id);
				},
			};
			return tools;
		},
		actions: (editor, actions, { msg, addDialog, addToast, paste }) => {
			const defaultDocumentName = msg("document.default-name");
			if (!Platform.isMobile) {
				actions[SAVE_FILE_COPY_ACTION] = getSaveFileCopyAction(
					editor,
					defaultDocumentName
				);
			}

			actions[SAVE_FILE_COPY_IN_VAULT_ACTION] = getSaveFileCopyInVaultAction(
				editor,
				defaultDocumentName,
				plugin
			);

			actions[OPEN_FILE_ACTION] = importFileAction(plugin, addDialog);

			(['jpeg', 'png', 'svg', 'webp'] satisfies TLExportType[]).map((e) => exportAllAsOverride(editor, actions, plugin, {
				exportOptions: {
					format: e,
				},
				defaultDocumentName,
				trackEvent
			}));

			actions['paste'] = pasteFromClipboardOverride(editor, { msg, paste, addToast });

			/**
			 * https://tldraw.dev/examples/editor-api/lock-camera-zoom
			 */
			actions[PLUGIN_ACTION_TOGGLE_ZOOM_LOCK] = {
				id: PLUGIN_ACTION_TOGGLE_ZOOM_LOCK,
				label: {
					default: 'Toggle zoom lock'
				},
				icon: PLUGIN_ACTION_TOGGLE_ZOOM_LOCK,
				kbd: '!k',
				readonlyOk: true,
				onSelect() {
					const isCameraZoomLockedAlready = editor.getCameraOptions().zoomSteps.length === 1
					editor.setCameraOptions({
						zoomSteps: isCameraZoomLockedAlready ? DEFAULT_CAMERA_STEPS : [editor.getZoomLevel()],
					})
				},
			}

			// PDF Import action
			actions[IMPORT_PDF_ACTION] = {
				id: IMPORT_PDF_ACTION,
				label: {
					default: 'Import PDF...'
				},
				icon: 'file',
				async onSelect() {
					try {
						await importPdfToEditor(editor, plugin);
					} catch (error) {
						if (error instanceof PdfImportCanceled) {
							return; // User canceled, not an error
						}
						console.error('PDF import failed:', error);
						addToast({
							title: 'PDF Import Failed',
							description: String(error),
							severity: 'error',
						});
					}
				},
			}

			return actions;
		},
	}
}

function exportAllAsOverride(editor: Editor, actions: TLUiActionsContextType, plugin: TldrawPlugin, options: {
	exportOptions?: TLImageExportOptions,
	trackEvent: TLUiEventContextType,
	defaultDocumentName: string
}) {
	const format = options.exportOptions?.format ?? 'png';
	const key = `export-all-as-${format}` as const;
	actions[key] = {
		...actions[key],
		async onSelect(source) {
			const ids = Array.from(editor.getCurrentPageShapeIds().values())
			if (ids.length === 0) return

			options.trackEvent('export-all-as', {
				// @ts-ignore
				format,
				source
			})

			const blob = (await editor.toImage(ids, options.exportOptions)).blob;

			const res = await downloadBlob(blob, `${options.defaultDocumentName}.${format}`, plugin);

			if (typeof res === 'object') {
				res.showResultModal()
			}
		}
	}
}

/**
 * Import a PDF file into the tldraw editor
 */
async function importPdfToEditor(editor: Editor, plugin: TldrawPlugin): Promise<void> {
	// Open file picker for PDF files
	const file = await new Promise<TFile>((resolve, reject) => {
		new FileSearchModal(plugin, {
			extensions: ['pdf'],
			onEmptyStateText: (searchPath) => `No PDF files found in ${searchPath}`,
			setSelection: (selection) => {
				if (selection instanceof TFile) {
					resolve(selection);
				} else {
					reject(new Error('Please select a PDF file'));
				}
			},
			onClose: () => {
				reject(new PdfImportCanceled());
			}
		}).open();
	});

	// Show import options modal
	const options = await PdfImportModal.show(plugin.app, file);

	// Get page metadata for dimensions
	const pageInfos = await loadPdfMetadata(plugin.app, file.path);

	// Calculate viewport center for placement
	const viewportBounds = editor.getViewportPageBounds();
	const startX = viewportBounds.x + viewportBounds.w / 2;
	let currentY = viewportBounds.y + 50;

	const shapeIds: TLShapeId[] = [];

	// Render and create shapes for each selected page
	for (const pageNum of options.selectedPages) {
		const pageInfo = pageInfos.find(p => p.pageNumber === pageNum);
		if (!pageInfo) continue;

		// Render the page to a blob
		const blob = await renderPdfPage(plugin.app, file.path, pageNum, options.dpi);

		// Calculate dimensions based on DPI
		const scale = options.dpi / 72;
		const width = pageInfo.width * scale;
		const height = pageInfo.height * scale;

		// Create asset from blob
		const assetFile = new File([blob], `${file.basename}-page-${pageNum}.png`, { type: 'image/png' });
		const asset = await editor.getAssetForExternalContent({ type: 'file', file: assetFile });

		if (!asset) {
			console.warn(`Failed to create asset for page ${pageNum}`);
			continue;
		}

		editor.createAssets([asset]);

		// Create image shape
		const shapeId = createShapeId();
		editor.createShape<TLImageShape>({
			id: shapeId,
			type: 'image',
			x: startX - width / 2,
			y: currentY,
			props: {
				assetId: asset.id,
				w: width,
				h: height,
			},
		});

		shapeIds.push(shapeId);
		currentY += height + options.spacing;
	}

	// Group pages if requested
	if (options.groupPages && shapeIds.length > 1) {
		editor.groupShapes(shapeIds);
	}

	// Select all created shapes
	if (shapeIds.length > 0) {
		editor.select(...shapeIds);
		editor.zoomToSelection();
	}
}

/**
 * Obsidian doesn't allow manual access to the clipboard API on mobile,
 * so we add a fallback when an error occurs on the initial clipboard read.
 */
function pasteFromClipboardOverride(
	editor: Editor,
	{
		addToast,
		msg,
		paste,
	}: Pick<TLUiOverrideHelpers, 'addToast' | 'msg' | 'paste'>
): TLUiActionItem {
	const pasteClipboard = (source: TLUiEventSource, items: ClipboardItem[]) => paste(
		items,
		source,
		source === 'context-menu' ? editor.inputs.currentPagePoint : undefined
	)
	return {
		id: 'paste',
		label: 'action.paste',
		kbd: '$v',
		onSelect(source) {
			// Adapted from src/lib/ui/context/actions.tsx of the tldraw library
			navigator.clipboard
				?.read()
				.then((clipboardItems) => {
					pasteClipboard(source, clipboardItems);
				})
				.catch((e) => {
					// Fallback to reading the clipboard as plain text.
					navigator.clipboard
						?.readText()
						.then((val) => {
							pasteClipboard(source, [
								new ClipboardItem(
									{
										'text/plain': new Blob([val], { type: 'text/plain' }),
									}
								)
							]);
						}).catch((ee) => {
							console.error({ e, ee });
							addToast({
								title: msg('action.paste-error-title'),
								description: msg('action.paste-error-description'),
								severity: 'error',
							})
						})
				})
		},
	};
}
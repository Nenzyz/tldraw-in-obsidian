import { createTLStore, defaultBindingUtils, defaultShapeUtils, TldrawFile, TLStore } from "tldraw"
import { CommentShapeUtil } from "src/tldraw/shapes/comment";

/**
 *
 * @param store The store to create a file from. Leave this undefined to create a blank tldraw file.
 * @returns
 */
export function createRawTldrawFile(store?: TLStore): TldrawFile {
    store ??= createTLStore({
        shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
        bindingUtils: defaultBindingUtils,
    });
	return {
		tldrawFileFormatVersion: 1,
		schema: store.schema.serialize(),
		records: store.allRecords(),
	}
}

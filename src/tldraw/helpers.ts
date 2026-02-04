import { TLDataDocument, TLDataDocumentStore, TldrawPluginMetaData } from "src/utils/document";
import { TLStore, createTLStore, defaultShapeUtils, defaultBindingUtils } from "tldraw";
import { CommentShapeUtil } from "src/tldraw/shapes/comment";

export function processInitialData(initialData: TLDataDocument): TLDataDocumentStore {
	// Always create a fresh store with CommentShapeUtil included
	// If initialData.store exists, get its snapshot and use it as the initial data
	const snapshot = initialData.store 
		? initialData.store.getStoreSnapshot()
		: undefined;

	const store = createTLStore({
		shapeUtils: [...defaultShapeUtils, CommentShapeUtil],
		bindingUtils: defaultBindingUtils,
		initialData: initialData.raw,
		snapshot: snapshot,
	});

	return { 
		meta: initialData.meta, 
		store 
	};
}

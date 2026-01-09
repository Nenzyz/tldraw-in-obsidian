import React, { useRef, useState } from 'react';
import { Editor, TLShapeId, useEditor, useValue } from 'tldraw';
import { VisibilityOff, VisibilityOn } from '../icons/VisibilityIcons';
import { capitalize } from 'src/utils/string';

/**
 * Gets the display name for a shape using the priority:
 * 1. shape.meta.name
 * 2. editor.getShapeUtil(shape).getText(shape)
 * 3. Capitalized shape type + " shape"
 */
function getShapeName(editor: Editor, shapeId: TLShapeId): string {
	const shape = editor.getShape(shapeId);
	if (!shape) return 'Unknown shape';
	return (
		(shape.meta.name as string) ||
		editor.getShapeUtil(shape).getText(shape) ||
		capitalize(shape.type) + ' shape'
	);
}

function ShapeItem({
	shapeId,
	depth,
	parentIsSelected,
	parentIsHidden,
}: {
	shapeId: TLShapeId;
	depth: number;
	parentIsSelected?: boolean;
	parentIsHidden?: boolean;
}) {
	const editor = useEditor();

	const shape = useValue('shape', () => editor.getShape(shapeId), [editor]);
	const children = useValue('children', () => editor.getSortedChildIdsForParent(shapeId), [editor]);
	const isHidden = useValue('isHidden', () => editor.isShapeHidden(shapeId), [editor]);
	const isSelected = useValue('isSelected', () => editor.getSelectedShapeIds().includes(shapeId), [
		editor,
	]);
	const shapeName = useValue('shapeName', () => getShapeName(editor, shapeId), [editor]);

	const [isEditingName, setIsEditingName] = useState(false);

	const timeSinceLastVisibilityToggle = useRef(Date.now());

	if (!shape) return null;

	return (
		<>
			{!!shape && (
				<div
					className={`ptl-shape-item${isSelected ? ' ptl-shape-item-selected' : ''}${parentIsSelected ? ' ptl-shape-item-child-selected' : ''}${isHidden ? ' ptl-shape-item-hidden' : ''}`}
					onDoubleClick={() => {
						setIsEditingName(true);
					}}
					onPointerDown={() => {
						if (editor.inputs.ctrlKey || editor.inputs.shiftKey) {
							if (isSelected) {
								editor.deselect(shape);
							} else {
								editor.select(...editor.getSelectedShapes(), shape);
							}
						} else {
							editor.select(shape);
						}
					}}
					style={{
						paddingLeft: 10 + depth * 20,
						opacity: isHidden ? 0.5 : 1,
					}}
				>
					{isEditingName ? (
						<input
							autoFocus
							className="ptl-shape-name-input"
							defaultValue={shapeName}
							onBlur={() => setIsEditingName(false)}
							onChange={(ev) => {
								if (shape.type === 'frame') {
									editor.updateShape({ ...shape, props: { ...shape.props, name: ev.target.value } });
								} else {
									editor.updateShape({ ...shape, meta: { ...shape.meta, name: ev.target.value } });
								}
							}}
							onKeyDown={(ev) => {
								if (ev.key === 'Enter' || ev.key === 'Escape') {
									ev.currentTarget.blur();
								}
							}}
						/>
					) : (
						<div className="ptl-shape-name">{shapeName}</div>
					)}
					<button
						className="ptl-shape-visibility-toggle"
						onPointerDown={(ev) => {
							ev.stopPropagation();
							const now = Date.now();
							if (now - timeSinceLastVisibilityToggle.current < 200) {
								// Double-click: force show
								editor.updateShape({
									...shape,
									meta: { ...shape.meta, hidden: false, force_show: true },
								});
								timeSinceLastVisibilityToggle.current = 0;
							} else {
								// Single click: toggle hidden
								editor.updateShape({
									...shape,
									meta: { ...shape.meta, hidden: !shape.meta.hidden, force_show: false },
								});
								timeSinceLastVisibilityToggle.current = now;
							}
						}}
					>
						{shape.meta.hidden ? <VisibilityOff /> : <VisibilityOn />}
					</button>
				</div>
			)}
			{!!children?.length && (
				<ShapeList
					shapeIds={children}
					depth={depth + 1}
					parentIsHidden={parentIsHidden || isHidden}
					parentIsSelected={parentIsSelected || isSelected}
				/>
			)}
		</>
	);
}

export function ShapeList({
	shapeIds,
	depth,
	parentIsSelected,
	parentIsHidden,
}: {
	shapeIds: TLShapeId[];
	depth: number;
	parentIsSelected?: boolean;
	parentIsHidden?: boolean;
}) {
	if (!shapeIds.length) return null;
	return (
		<div className="ptl-shape-tree">
			{shapeIds.map((shapeId) => (
				<ShapeItem
					key={shapeId}
					shapeId={shapeId}
					depth={depth}
					parentIsHidden={parentIsHidden}
					parentIsSelected={parentIsSelected}
				/>
			))}
		</div>
	);
}

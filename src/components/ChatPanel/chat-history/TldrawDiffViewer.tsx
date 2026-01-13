import React, { forwardRef, useRef, useMemo, useState } from 'react';
import {
    DefaultShapeWrapper,
    RecordsDiff,
    TLRecord,
    TLShape,
    TLShapeId,
    TLShapeWrapperProps,
} from 'tldraw';
import { TldrawViewer } from './TldrawViewer';

/**
 * Visualizes shape changes from a RecordsDiff.
 * Shows a summary by default, click to expand full preview.
 */
export function TldrawDiffViewer({ diff }: { diff: RecordsDiff<TLRecord> }) {
    const [expanded, setExpanded] = useState(false);

    // ALL hooks must be called before any early returns (React rules of hooks)
    const stats = useMemo(() => {
        const addedKeys = Object.keys(diff.added);
        const updatedKeys = Object.keys(diff.updated);
        const removedKeys = Object.keys(diff.removed);

        const added = addedKeys.filter(k => diff.added[k as TLShapeId]?.typeName === 'shape').length;
        const updated = updatedKeys.filter(k => diff.updated[k as TLShapeId]?.[0]?.typeName === 'shape').length;
        const removed = removedKeys.filter(k => diff.removed[k as TLShapeId]?.typeName === 'shape').length;

        return { added, updated, removed, total: added + updated + removed };
    }, [diff]);

    // Memoize shapes - must be called before early returns
    const diffShapes = useMemo(() => getDiffShapesFromDiff(diff), [diff]);

    // Stable reference for components prop (prevents remount loop from inline objects)
    const viewerComponentsRef = useRef({ ShapeWrapper: DiffShapeWrapper });

    // Early return for empty diff
    if (stats.total === 0) {
        return null;
    }

    // Show summary with click to expand
    if (!expanded) {
        const parts: string[] = [];
        if (stats.added > 0) parts.push(`+${stats.added}`);
        if (stats.updated > 0) parts.push(`~${stats.updated}`);
        if (stats.removed > 0) parts.push(`-${stats.removed}`);

        return (
            <button
                className="ptl-diff-summary"
                onClick={() => setExpanded(true)}
                title="Click to preview changes"
            >
                <span className="ptl-diff-summary-stats">{parts.join(' ')}</span>
                <span className="ptl-diff-summary-label">shapes • click to preview</span>
            </button>
        );
    }

    return (
        <div className="ptl-diff-viewer-expanded">
            <button
                className="ptl-diff-collapse-btn"
                onClick={() => setExpanded(false)}
            >
                Hide preview
            </button>
            <TldrawViewer shapes={diffShapes} components={viewerComponentsRef.current} />
        </div>
    );
}

/**
 * Extract shapes from a diff with change type metadata.
 */
function getDiffShapesFromDiff(diff: RecordsDiff<TLRecord>): TLShape[] {
    const diffShapes: TLShape[] = [];

    const numberOfShapes =
        Object.keys(diff.added).length +
        Object.keys(diff.updated).length +
        Object.keys(diff.removed).length;

    // Skip shadows if there are many shapes (performance)
    const showShadows = numberOfShapes < 20;

    // Process removed shapes
    for (const key in diff.removed) {
        const id = key as TLShapeId;
        const prevShape = diff.removed[id];
        if (prevShape.typeName !== 'shape') continue;
        const shape = {
            ...prevShape,
            opacity: showShadows ? prevShape.opacity : prevShape.opacity / 2,
            meta: { ...prevShape.meta, changeType: showShadows ? 'delete-shadow' : 'delete' },
        };

        if ('dash' in shape.props) {
            shape.props = {
                ...shape.props,
                dash: 'solid',
            };
        }

        diffShapes.push(shape);
    }

    // Process updated shapes
    for (const key in diff.updated) {
        const id = key as TLShapeId;

        const prevBefore = diff.updated[id][0];
        const prevAfter = diff.updated[id][1];
        if (prevBefore.typeName !== 'shape' || prevAfter.typeName !== 'shape') continue;

        const before = {
            ...prevBefore,
            id: (id + '-before') as TLShapeId,
            opacity: prevAfter.opacity / 2,
            meta: {
                ...prevBefore.meta,
                changeType: showShadows ? 'update-before-shadow' : 'update-before',
            },
        };

        const after = {
            ...prevAfter,
            meta: {
                ...prevAfter.meta,
                changeType: showShadows ? 'update-after-shadow' : 'update-after',
            },
        };

        if ('dash' in before.props) {
            before.props = {
                ...before.props,
                dash: 'dashed',
            };
        }
        if ('fill' in before.props) {
            before.props = {
                ...before.props,
                fill: 'none',
            };
        }
        if ('dash' in after.props) {
            after.props = {
                ...after.props,
                dash: 'solid',
            };
        }

        diffShapes.push(before);
        diffShapes.push(after);
    }

    // Process added shapes
    for (const key in diff.added) {
        const id = key as TLShapeId;
        const prevShape = diff.added[id];
        if (prevShape.typeName !== 'shape') continue;
        const shape = {
            ...prevShape,
            meta: {
                ...prevShape.meta,
                changeType: showShadows ? 'create-shadow' : 'create',
            },
        };
        if ('dash' in shape.props) {
            shape.props = {
                ...shape.props,
                dash: 'solid',
            };
        }
        diffShapes.push(shape);
    }

    return diffShapes;
}

/**
 * Custom shape wrapper that applies diff-specific CSS classes.
 */
const DiffShapeWrapper = forwardRef(function DiffShapeWrapper(
    { children, shape, isBackground }: TLShapeWrapperProps,
    ref: React.Ref<HTMLDivElement>
) {
    const changeType = shape.meta.changeType as string | undefined;

    return (
        <DefaultShapeWrapper
            ref={ref}
            shape={shape}
            isBackground={isBackground}
            className={changeType ? 'ptl-diff-shape-' + changeType : undefined}
        >
            {children}
        </DefaultShapeWrapper>
    );
});

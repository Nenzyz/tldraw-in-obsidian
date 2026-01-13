import React from 'react';
import { Editor } from 'tldraw';
import { CONTEXT_TYPE_DEFINITIONS, ContextItem } from '../../../ai/shared/types/ContextItem';
import { AgentIconType } from '../icons/AgentIcon';
import { PromptTag } from './PromptTag';

export function ContextItemTag({
	item,
	editor,
	onClick,
}: {
	item: ContextItem;
	editor: Editor;
	onClick?: () => void;
}) {
	const definition = CONTEXT_TYPE_DEFINITIONS[item.type];
	const name = definition.name(item, editor);
	// Cast icon to AgentIconType since CONTEXT_TYPE_DEFINITIONS uses a looser string type
	const icon = definition.icon as AgentIconType;

	return <PromptTag text={name} icon={icon} onClick={onClick} />;
}

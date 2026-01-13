import React from 'react';
import { AgentIcon, AgentIconType } from '../icons/AgentIcon';

export function PromptTag({
	text,
	icon,
	onClick,
}: {
	text: string;
	icon: AgentIconType;
	onClick?: () => void;
}) {
	return onClick ? (
		<button type="button" className="ptl-prompt-tag" onClick={onClick}>
			<AgentIcon type={icon} /> <span>{text}</span>
		</button>
	) : (
		<div className="ptl-prompt-tag">
			<AgentIcon type={icon} /> <span>{text}</span>
		</div>
	);
}

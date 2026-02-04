/**
 * File metadata utilities for persisting agent state in file frontmatter and meta objects
 *
 * For .md files: Uses frontmatter field "tldraw-agent-last-check"
 * For .tldr files: Uses meta object field "agentLastCheck"
 */

/**
 * Read the agent's last check timestamp from file content
 *
 * @param fileContent - Raw file content (markdown or JSON)
 * @param fileType - File extension ('md' or 'tldr')
 * @returns Unix milliseconds timestamp, or undefined if not found
 */
export function readAgentLastCheckTimestamp(
	fileContent: string,
	fileType: 'md' | 'tldr'
): number | undefined {
	if (fileType === 'md') {
		return readTimestampFromMarkdown(fileContent);
	} else {
		return readTimestampFromTldr(fileContent);
	}
}

/**
 * Write the agent's last check timestamp to file content
 *
 * @param fileContent - Raw file content (markdown or JSON)
 * @param fileType - File extension ('md' or 'tldr')
 * @param timestamp - Unix milliseconds timestamp
 * @returns Updated file content with new timestamp
 */
export function writeAgentLastCheckTimestamp(
	fileContent: string,
	fileType: 'md' | 'tldr',
	timestamp: number
): string {
	if (fileType === 'md') {
		return writeTimestampToMarkdown(fileContent, timestamp);
	} else {
		return writeTimestampToTldr(fileContent, timestamp);
	}
}

/**
 * Read timestamp from markdown frontmatter
 */
function readTimestampFromMarkdown(markdownContent: string): number | undefined {
	// Match frontmatter block
	const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
	const match = markdownContent.match(frontmatterRegex);

	if (!match) return undefined;

	const frontmatter = match[1];

	// Extract tldraw-agent-last-check value
	const timestampRegex = /^tldraw-agent-last-check:\s*(\d+)/m;
	const timestampMatch = frontmatter.match(timestampRegex);

	if (!timestampMatch) return undefined;

	return parseInt(timestampMatch[1], 10);
}

/**
 * Write timestamp to markdown frontmatter
 */
function writeTimestampToMarkdown(markdownContent: string, timestamp: number): string {
	// Match frontmatter block
	const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
	const match = markdownContent.match(frontmatterRegex);

	if (!match) {
		// No frontmatter exists, create one
		const newFrontmatter = `---
tldraw-file: true
tldraw-agent-last-check: ${timestamp}
---

${markdownContent}`;
		return newFrontmatter;
	}

	const frontmatter = match[1];

	// Check if tldraw-agent-last-check already exists
	const timestampRegex = /^tldraw-agent-last-check:\s*\d+/m;
	if (timestampRegex.test(frontmatter)) {
		// Update existing timestamp
		const updatedFrontmatter = frontmatter.replace(
			timestampRegex,
			`tldraw-agent-last-check: ${timestamp}`
		);
		return markdownContent.replace(frontmatterRegex, `---\n${updatedFrontmatter}\n---`);
	} else {
		// Add new timestamp field
		const updatedFrontmatter = `${frontmatter}\ntldraw-agent-last-check: ${timestamp}`;
		return markdownContent.replace(frontmatterRegex, `---\n${updatedFrontmatter}\n---`);
	}
}

/**
 * Read timestamp from .tldr meta object
 */
function readTimestampFromTldr(tldrContent: string): number | undefined {
	try {
		const parsed = JSON.parse(tldrContent);
		return parsed?.meta?.agentLastCheck;
	} catch (e) {
		console.error('Failed to parse .tldr file:', e);
		return undefined;
	}
}

/**
 * Write timestamp to .tldr meta object
 */
function writeTimestampToTldr(tldrContent: string, timestamp: number): string {
	try {
		const parsed = JSON.parse(tldrContent);

		if (!parsed.meta) {
			parsed.meta = {};
		}

		parsed.meta.agentLastCheck = timestamp;

		return JSON.stringify(parsed, null, 2);
	} catch (e) {
		console.error('Failed to parse .tldr file:', e);
		return tldrContent;
	}
}

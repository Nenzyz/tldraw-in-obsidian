import React, { useCallback, useState } from "react";
import Setting from "./Setting";
import useSettingsManager from "src/hooks/useSettingsManager";
import { DEFAULT_SETTINGS } from "src/obsidian/TldrawSettingsTab";
import useUserPluginSettings from "src/hooks/useUserPluginSettings";

export default function UserSettings() {
	const manager = useSettingsManager();
	const settings = useUserPluginSettings(manager);
	const [username, setUsername] = useState(settings.username || '');

	const onUsernameChanged = useCallback(async (value: string) => {
		setUsername(value);
		manager.settings.username = value.trim() || undefined;
		await manager.updateSettings(manager.settings);
	}, [manager]);

	return (
		<>
			<Setting.Container>
				<Setting
					heading={true}
					slots={{
						name: 'User Identity'
					}}
				/>
				<Setting
					slots={{
						name: 'Username',
						desc: (
							<>
								Your username for comment and reply attribution. This name will be attached to all comments and replies you create.
								{!settings.username && (
									<>
										<br />
										<code className="ptl-default-code">
											DEFAULT: User (or device ID)
										</code>
									</>
								)}
							</>
						),
						control: (
							<>
								<input
									type="text"
									value={username}
									onChange={(e) => onUsernameChanged(e.target.value)}
									placeholder="Enter your username..."
									style={{
										width: '100%',
										padding: '4px 8px',
										border: '1px solid var(--background-modifier-border)',
										borderRadius: '4px',
										backgroundColor: 'var(--background-primary)',
										color: 'var(--text-normal)',
									}}
								/>
							</>
						)
					}}
				/>
			</Setting.Container>
		</>
	);
}

// Mock Obsidian module for testing

export class App {}

export class Plugin {
    loadData = async () => ({});
    saveData = async () => undefined;
}

export class PluginSettingTab {
    containerEl = document.createElement('div');
}

export class Modal {
    app: App;
    contentEl = document.createElement('div');
    containerEl = document.createElement('div');
    modalEl = document.createElement('div');
    titleEl = document.createElement('div');

    constructor(app: App) {
        this.app = app;
    }

    open() {}
    close() {}
    onOpen() {}
    onClose() {}
}

export class SuggestModal<T> extends Modal {
    getSuggestions(_query: string): T[] | Promise<T[]> { return []; }
    renderSuggestion(_item: T, _el: HTMLElement): void {}
    onChooseSuggestion(_item: T, _evt: MouseEvent | KeyboardEvent): void {}
    setPlaceholder(_placeholder: string): void {}
}

export class Setting {
    settingEl = document.createElement('div');
    controlEl = document.createElement('div');
    descEl = document.createElement('div');
    infoEl = document.createElement('div');
    nameEl = document.createElement('div');
    setHeading = () => this;
    setTooltip = () => this;
    setClass = () => this;
    setDisabled = () => this;
    setName = () => this;
    setDesc = () => this;
    addText = () => this;
    addToggle = () => this;
    addDropdown = () => this;
    addButton = () => this;
}

export class ButtonComponent {
    buttonEl = document.createElement('button');
    onClick = () => this;
    setIcon = () => this;
    setButtonText = () => this;
    setTooltip = () => this;
    setCta = () => this;
    setDisabled = () => this;
}

export class DropdownComponent {
    selectEl = document.createElement('select');
    addOptions = () => this;
    addOption = () => this;
    onChange = () => this;
    setValue = () => this;
    setDisabled = () => this;
}

export class ToggleComponent {
    toggleEl = document.createElement('div');
    onChange = () => this;
    setValue = () => this;
}

export class TextComponent {
    inputEl = document.createElement('input');
    onChange = () => this;
    setValue = () => this;
    setPlaceholder = () => this;
}

export class ExtraButtonComponent {
    extraSettingsEl = document.createElement('div');
    onClick = () => this;
    setIcon = () => this;
    setTooltip = () => this;
    setDisabled = () => this;
}

export class MomentFormatComponent {
    inputEl = document.createElement('input');
    onChange = () => this;
    setValue = () => this;
    setPlaceholder = () => this;
    setDefaultFormat = () => this;
    setSampleEl = () => this;
}

export class Notice {
    constructor(_message: string, _timeout?: number) {}
}

export class TFile {
    path = '';
    name = '';
    basename = '';
    extension = '';
}

export class TFolder {
    path = '';
    name = '';
}

export class TAbstractFile {
    path = '';
    name = '';
}

export class Vault {
    getAbstractFileByPath = () => null;
    createFolder = async () => undefined;
    create = async () => new TFile();
    read = async () => '';
    modify = async () => undefined;
    delete = async () => undefined;
    rename = async () => undefined;
    getFiles = () => [];
    getAllLoadedFiles = () => [];
    adapter = {
        exists: async () => false,
        read: async () => '',
        write: async () => undefined,
    };
}

export class Workspace {
    on = () => ({ id: '' });
    off = () => {};
    getActiveFile = () => null;
    getLeaf = () => null;
    getLeavesOfType = () => [];
}

export class WorkspaceLeaf {
    view: ItemView | null = null;
    getViewState = () => ({});
    setViewState = async () => {};
}

export class ItemView {
    app: App;
    containerEl = document.createElement('div');
    contentEl = document.createElement('div');
    leaf: WorkspaceLeaf | null = null;

    constructor() {
        this.app = new App();
    }

    getViewType() { return ''; }
    getDisplayText() { return ''; }
}

export class MarkdownView extends ItemView {}
export class FileView extends ItemView {}
export class TextFileView extends FileView {}

export class Menu {
    addItem = () => this;
    showAtPosition = () => {};
    showAtMouseEvent = () => {};
}

export class MenuItem {
    setTitle = () => this;
    setIcon = () => this;
    onClick = () => this;
}

export function setIcon(_el: HTMLElement, _icon: string) {}

export function normalizePath(path: string) {
    return path;
}

export const Platform = {
    isDesktop: true,
    isMobile: false,
    isIosApp: false,
    isAndroidApp: false,
};

export class Component {
    load() {}
    unload() {}
    register(_cb: () => void) {}
    registerEvent(_event: any) {}
}

export class Events {
    on = () => ({ id: '' });
    off = () => {};
    trigger = () => {};
}

export function requestUrl(_url: any): Promise<any> {
    return Promise.resolve({ arrayBuffer: new ArrayBuffer(0) });
}

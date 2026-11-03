// #region Imports

import { computed, inject, Injectable, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import type { EffectiveSetting, EffectiveSettings, LabeledCommand, NxTargets, SettingsSourceFile } from '@pixel-brewery/wortlaut-contracts';
import type { ISettingRow } from '../contracts/ISettingRow';
import { AsyncValue, DesktopApi, formatName, presetName, ShellSession } from '@pixel-brewery/wortlaut-frontend-core';

// #endregion

/**
 * The tab of the view.
 */
export type CliNxTab = 'settings' | 'nx' | 'commands';

/**
 * How long a copy button says so.
 */
const COPIED_MS = 2000;

/**
 * The settings of a project in the order the view lists them, with what they are called there.
 */
const SETTING_LABELS: ReadonlyArray<readonly [key: string, label: string]> = [
    ['actions.detect.preset', 'Preset'],
    ['actions.detect.languages', 'Locales'],
    ['actions.detect.root', 'Source root'],
    ['actions.detect.resourceRoot', 'Resource root'],
    ['actions.detect.type', 'Format'],
    ['actions.detect.resourceKey.prefix', 'Key prefix'],
    ['actions.detect.resourceKey.suffix', 'Key suffix'],
    ['actions.analyze.baseLocale', 'Base locale'],
    ['actions.analyze.rules', 'Rules'],
    ['actions.analyze.usedKeys', 'Used keys'],
    ['actions.analyze.identicalKeys', 'Identical keys'],
    ['actions.analyze.identicalValues', 'Identical values'],
    ['rulePacks', 'Rule packs'],
    ['actions.transform.types', 'Transform'],
    ['actions.sort.order', 'Sort'],
    ['actions.generate.strategy', 'AI provider'],
    ['actions.generate.model', 'AI model'],
    ['actions.generate.apiKey', 'API key'],
    ['actions.generate.temperature', 'Temperature'],
    ['actions.generate.chunkSize', 'Chunk size'],
    ['actions.generate.limit', 'Limit'],
    ['actions.generate.locales', 'Target locales'],
    ['envFile', 'Environment file'],
    ['dryRun', 'Dry run']
];

/**
 * Settings that hold patterns, which the table counts instead of listing.
 */
const PATTERN_SETTINGS = new Set(['actions.analyze.usedKeys', 'actions.analyze.identicalKeys']);

/**
 * Says where a value comes from. A value from the setup was chosen in the app and lives in the profile.
 *
 * @param setting The setting.
 * @returns The label and its variant.
 */
export function describeSource(setting: Pick<EffectiveSetting, 'source'>): Pick<ISettingRow, 'from' | 'variant'> {
    const { kind, file } = setting.source;

    switch (kind) {
        case 'default':
            return { from: 'Default', variant: 'neutral' };
        case 'nx-target-defaults':
            return { from: 'nx.json targetDefaults', variant: 'info' };
        case 'nx-configuration':
            return { from: file ? `configuration in ${file}` : 'Nx configuration', variant: 'info' };
        case 'arguments':
            return { from: 'Project setup', variant: 'success' };
        default:
            return { from: file ?? kind, variant: 'info' };
    }
}

/**
 * Writes the value of a setting for the table. A token stays a token.
 *
 * @param key The setting.
 * @param value The value.
 * @returns The text.
 */
export function describeValue(key: string, value: unknown): string {
    if (Array.isArray(value)) {
        if (PATTERN_SETTINGS.has(key)) {
            return `${value.length} ${value.length === 1 ? 'pattern' : 'patterns'}`;
        }

        if (value.length === 0) {
            return key === 'actions.analyze.rules' ? 'All' : 'None';
        }

        return value.join(', ');
    }

    if (key === 'actions.detect.preset' && typeof value === 'string' && value) {
        return presetName(value);
    }

    if (key === 'actions.detect.type' && typeof value === 'string') {
        return formatName(value);
    }

    return value === null || value === undefined ? 'None' : String(value);
}

/**
 * Projects the settings for the table: known ones in their order, without defaults that say nothing.
 *
 * @param settings The settings from the engine.
 * @returns The rows.
 */
export function toSettingRows(settings: ReadonlyArray<EffectiveSetting>): Array<ISettingRow> {
    return SETTING_LABELS.flatMap(([key, label]) => {
        const setting = settings.find((candidate) => candidate.key === key);

        if (!setting) {
            return [];
        }

        // The default of the CLI says nothing about the app, whose title bar shows its own dry run.
        const isEmpty = setting.value === '' || setting.value === null || (Array.isArray(setting.value) && setting.value.length === 0) || key === 'dryRun';

        return setting.source.kind === 'default' && isEmpty ? [] : [{ key, label, value: describeValue(key, setting.value), ...describeSource(setting) }];
    });
}

/**
 * Owns the CLI and Nx view. The tabs of a project read its effective settings, and the commands work without one.
 */
@Injectable()
export class CliNxViewPresenter {

    // #region Fields

    private readonly _api = inject(DesktopApi);
    private readonly _shell = inject(ShellSession);
    private readonly _tab = signal<CliNxTab>('settings');
    private readonly _search = signal({ text: '' });
    private readonly _copied = signal<string | null>(null);
    private readonly _message = signal<string | null>(null);

    // #endregion

    // #region Properties

    /**
     * Gets whether a project is open.
     *
     * @readonly
     */
    public readonly hasProject = computed(() => this._shell.project() !== null);

    /**
     * Gets the effective settings of the open project.
     *
     * @readonly
     */
    public readonly effective = new AsyncValue<EffectiveSettings | null>(async () => {
        const project = this._shell.project();

        return project ? this._api.request('config.getEffective', { projectId: project.id }) : null;
    });

    /**
     * Gets the file most values come from.
     *
     * @readonly
     */
    public readonly source = new AsyncValue<SettingsSourceFile | null>(async () => {
        const project = this._shell.project();

        return project ? this._api.request('config.getSourceFile', { projectId: project.id }) : null;
    });

    /**
     * Gets the Nx side of the open project.
     *
     * @readonly
     */
    public readonly nx = new AsyncValue<NxTargets | null>(async () => {
        const project = this._shell.project();

        return project ? this._api.request('nx.targets', { projectId: project.id }) : null;
    });

    /**
     * Gets the commands of the CLI.
     *
     * @readonly
     */
    public readonly commands = new AsyncValue<Array<LabeledCommand>>(() => this._api.request('cli.commands', { projectId: this._shell.project()?.id ?? null }));

    /**
     * Gets the form of the command filter.
     *
     * @readonly
     */
    public readonly searchForm = form(this._search);

    /**
     * Gets the open tab.
     *
     * @readonly
     */
    public readonly tab = this._tab.asReadonly();

    /**
     * Gets the rows of the effective settings.
     *
     * @readonly
     */
    public readonly settingRows = computed(() => toSettingRows(this.effective.value()?.settings ?? []));

    /**
     * Gets the commands the filter leaves.
     *
     * @readonly
     */
    public readonly filteredCommands = computed(() => {
        const text = this._search().text.trim().toLocaleLowerCase('en');

        return (this.commands.value() ?? []).filter((row) => !text || row.label.toLocaleLowerCase('en').includes(text) || row.command.toLocaleLowerCase('en').includes(text));
    });

    /**
     * Gets the command that was just copied.
     *
     * @readonly
     */
    public readonly copied = this._copied.asReadonly();

    /**
     * Gets what went wrong with opening a file.
     *
     * @readonly
     */
    public readonly message = this._message.asReadonly();

    // #endregion

    // #region Methods

    /**
     * Loads the view.
     *
     * @returns When it is loaded.
     */
    public async load(): Promise<void> {
        await Promise.all([this.effective.reload(), this.source.reload(), this.nx.reload(), this.commands.reload()]);
    }

    /**
     * Opens a tab.
     *
     * @param tab The tab.
     */
    public openTab(tab: CliNxTab): void {
        this._tab.set(tab);
    }

    /**
     * Copies a command.
     *
     * @param command The command.
     * @returns When it is copied.
     */
    public async copy(command: string): Promise<void> {
        await this._api.request('clipboard.writeText', { text: command });
        this._copied.set(command);
        setTimeout(() => {
            this._copied.update((current) => current === command ? null : current);
        }, COPIED_MS);
    }

    /**
     * Opens the settings file outside of the app.
     *
     * @returns When it is open.
     */
    public async openSourceFile(): Promise<void> {
        const project = this._shell.project();

        this._message.set(null);

        if (project) {
            try {
                await this._api.request('config.openSourceFile', { projectId: project.id });
            } catch (error) {
                this._message.set(error instanceof Error ? error.message : String(error));
            }
        }
    }

    // #endregion

}

// #region Imports

import { ChangeDetectionStrategy, Component, computed, input, output, signal, viewChild } from '@angular/core';
import { form } from '@angular/forms/signals';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CheckboxComponent } from '@pixel-brewery/mosaik-elements-angular/components/check-box';
import { DialogActionsComponent, DialogComponent, DialogHeaderComponent, DialogHeaderTextComponent } from '@pixel-brewery/mosaik-elements-angular/components/dialog';
import { SearchBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/search-box';
import { LocaleLabelComponent } from '@pixel-brewery/wortlaut-frontend-ui';
import { localePickerOptions, selectedLocaleCodes } from './localePickerOptions';

// #endregion

/**
 * Adds ISO languages through a searchable, cancelable selection dialog.
 * The parent owns the project's locales and decides what to do with confirmed additions.
 */
@Component({
    selector: 'wortlaut-locale-picker',
    imports: [ButtonComponent, CheckboxComponent, DialogActionsComponent, DialogComponent, DialogHeaderComponent, DialogHeaderTextComponent, FormFieldDirective, LocaleLabelComponent, SearchBoxComponent],
    templateUrl: './LocalePickerComponent.html',
    styleUrl: './LocalePickerComponent.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LocalePickerComponent {

    // #region Fields

    private readonly _trigger = viewChild<ButtonComponent>('trigger');
    private readonly _dialog = viewChild(DialogComponent);
    private readonly _search = viewChild(SearchBoxComponent);
    private readonly _searchModel = signal({ text: '' });
    private readonly _selected = signal<ReadonlySet<string>>(new Set());
    private readonly _open = signal(false);
    private _closing = false;

    // #endregion

    // #region Properties

    /**
     * Existing base and target identifiers that cannot be added again.
     *
     * @readonly
     */
    public readonly excludedCodes = input<ReadonlyArray<string>>([]);

    /**
     * Confirmed additions only; closing or cancelling the dialog emits nothing.
     *
     * @readonly
     */
    public readonly localesAdded = output<ReadonlyArray<string>>();

    protected readonly isOpen = this._open.asReadonly();
    protected readonly searchForm = form(this._searchModel);
    protected readonly available = computed(() => localePickerOptions(this.excludedCodes()));
    protected readonly visible = computed(() => localePickerOptions(this.excludedCodes(), this._searchModel().text));
    protected readonly selected = this._selected.asReadonly();
    protected readonly selectedCodes = computed(() => selectedLocaleCodes(this._selected(), this.excludedCodes()));

    // #endregion

    // #region Methods

    /**
     * Starts a fresh dialog without changing the parent's project state.
     */
    protected open(): void {
        if (this._open() || this._closing || !this.available().length) {
            return;
        }

        this._closing = false;
        this._searchModel.set({ text: '' });
        this._selected.set(new Set());
        this._open.set(true);
    }

    /**
     * Focuses the mounted search input after the dialog's open state has rendered.
     */
    protected async onOpened(): Promise<void> {
        const dialog = this._dialog()?.elementRef.nativeElement;
        const search = this._search()?.elementRef.nativeElement;

        await dialog?.updateComplete;
        await search?.updateComplete;

        if (this._open() && !this._closing) {
            search?.focus();
        }
    }

    /**
     * Keeps checked choices across searches, while refusing excluded identifiers.
     *
     * @param code The offered language identifier.
     * @param checked Whether the language is checked.
     */
    protected setSelected(code: string, checked: boolean): void {
        if (this._closing || !this.available().some((language) => language.code === code)) {
            return;
        }

        this._selected.update((previous) => {
            if (previous.has(code) === checked) {
                return previous;
            }

            const next = new Set(previous);

            if (checked) {
                next.add(code);
            } else {
                next.delete(code);
            }

            return next;
        });
    }

    /**
     * Emits only allowed selections, then closes the picker once.
     */
    protected add(): void {
        const codes = this.selectedCodes();

        if (this._closing || !codes.length) {
            return;
        }

        this.close();
        this.localesAdded.emit(codes);
    }

    /**
     * Cancels through the dialog's own close and focus lifecycle.
     */
    protected close(): void {
        if (this._closing) {
            return;
        }

        this._closing = true;
        this._open.set(false);
    }

    /**
     * Blocks a submit while Escape is already closing the overlay.
     */
    protected onCloseAttempted(): void {
        this._closing = true;
    }

    /**
     * Discards draft state and restores the Plus button after the overlay closes.
     */
    protected onClosed(): void {
        this._open.set(false);
        this._closing = false;
        this._searchModel.set({ text: '' });
        this._selected.set(new Set());
        this._trigger()?.focus();
    }

    // #endregion

}

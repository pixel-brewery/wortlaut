// #region Imports

import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, viewChild } from '@angular/core';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { DialogComponent, DialogContentComponent } from '@pixel-brewery/mosaik-elements-angular/components/dialog';
import { EmptyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/empty';
import { IconComponent } from '@pixel-brewery/mosaik-elements-angular/components/icon';
import { ListComponent, ListItemComponent } from '@pixel-brewery/mosaik-elements-angular/components/list';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { SearchBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/search-box';
import { SearchPalettePresenter } from '../view-presenters/SearchPalettePresenter';

// #endregion

/**
 * The search of the title bar: type, walk the results with the arrow keys, and open one with Enter.
 */
@Component({
    selector: 'wortlaut-search-palette',
    imports: [DialogComponent, DialogContentComponent, EmptyStateComponent, FormFieldDirective, IconComponent, ListComponent, ListItemComponent, MessageComponent, SearchBoxComponent],
    templateUrl: './SearchPaletteComponent.html',
    styleUrl: './SearchPaletteComponent.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SearchPaletteComponent {

    // #region Fields

    private readonly _box = viewChild('box', { read: ElementRef });
    private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `SearchPaletteComponent` class.
     */
    public constructor() {
        // The box takes the keys as soon as the dialog shows it.
        effect(() => {
            const box = this._box()?.nativeElement as HTMLElement | undefined;

            if (this.presenter.isOpen() && box) {
                requestAnimationFrame(() => {
                    box.focus();
                });
            }
        });

        // The result that Enter opens stays in sight.
        effect(() => {
            if (this.presenter.activeId()) {
                requestAnimationFrame(() => {
                    this._host.nativeElement.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
                });
            }
        });
    }

    // #endregion

    // #region Properties

    /**
     * Gets the presenter.
     *
     * @readonly
     */
    protected readonly presenter = inject(SearchPalettePresenter);

    // #endregion

}

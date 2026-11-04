// #region Imports

import { afterRenderEffect, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, viewChild } from '@angular/core';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { BackdropComponent } from '@pixel-brewery/mosaik-elements-angular/components/backdrop';
import { CardComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { ClickableComponent } from '@pixel-brewery/mosaik-elements-angular/components/clickable';
import { EmptyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/empty';
import { IconComponent } from '@pixel-brewery/mosaik-elements-angular/components/icon';
import { KbdComponent } from '@pixel-brewery/mosaik-elements-angular/components/kbd';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { SearchBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/search-box';
import { SearchPalettePresenter } from '../view-presenters/SearchPalettePresenter';

// #endregion

/**
 * The search of the title bar: type, walk the results with the arrow keys, and open one with Enter.
 */
@Component({
    selector: 'wortlaut-search-palette',
    imports: [BackdropComponent, CardComponent, ClickableComponent, EmptyStateComponent, FormFieldDirective, IconComponent, KbdComponent, MessageComponent, SearchBoxComponent],
    templateUrl: './SearchPaletteComponent.html',
    styleUrl: './SearchPaletteComponent.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SearchPaletteComponent {

    // #region Fields

    private readonly _box = viewChild(SearchBoxComponent);
    private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
    private _opener: HTMLElement | null = null;

    // #endregion

    // #region Ctor

    /**
     * Constructs a new instance of the `SearchPaletteComponent` class.
     */
    public constructor() {
        effect(() => {
            if (this.presenter.isOpen()) {
                const opener = this._host.nativeElement.ownerDocument.activeElement;

                this._opener = opener instanceof HTMLElement ? opener : null;
            } else {
                this.restoreFocus();
            }
        });

        // The field's own render can follow Angular's, so retry focus on the next frame.
        afterRenderEffect((onCleanup) => {
            if (this.presenter.isOpen() && this._box()) {
                this.focusSearchField();

                const frame = requestAnimationFrame(() => this.focusSearchField());

                onCleanup(() => cancelAnimationFrame(frame));
            }
        });

        afterRenderEffect(() => {
            if (this.presenter.isOpen() && this.presenter.activeId()) {
                this._host.nativeElement.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
            }
        });

        inject(DestroyRef).onDestroy(() => this.restoreFocus());
    }

    // #endregion

    // #region Properties

    /**
     * Gets the presenter.
     *
     * @readonly
     */
    protected readonly presenter = inject(SearchPalettePresenter);

    /**
     * Gets the result announced while the search field keeps keyboard focus.
     *
     * @protected
     * @readonly
     */
    protected readonly activeItem = computed(() => this.presenter.items().find((item) => item.id === this.presenter.activeId()) ?? null);

    // #endregion

    // #region Methods

    /**
     * Keeps keyboard navigation inside the palette and delegates result selection.
     *
     * @protected
     * @param event - The key pressed in the palette.
     */
    protected onKeydown(event: KeyboardEvent): void {
        if (event.isComposing) {
            return;
        }

        if (event.key === 'Escape' || event.key === 'Tab') {
            event.preventDefault();
            event.stopPropagation();

            if (event.key === 'Escape') {
                this.presenter.close();
            } else {
                this.focusSearchField();
            }

            return;
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter') {
            event.stopPropagation();
            void this.presenter.onKey(event);
        }
    }

    /**
     * @private
     */
    private focusSearchField(): void {
        this._box()?.elementRef.nativeElement.focus();
    }

    /**
     * @private
     */
    private restoreFocus(): void {
        const opener = this._opener;

        this._opener = null;

        if (opener?.isConnected) {
            opener.focus();
        }
    }

    // #endregion

}

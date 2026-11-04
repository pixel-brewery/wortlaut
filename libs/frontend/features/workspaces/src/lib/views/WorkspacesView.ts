// #region Imports

import { afterRenderEffect, ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild, type OnInit } from '@angular/core';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { BadgeComponent } from '@pixel-brewery/mosaik-elements-angular/components/badge';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent, CardHeaderComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { ColorBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/color-box';
import { ColorSwatchComponent, ColorSwatchGroupComponent } from '@pixel-brewery/mosaik-elements-angular/components/color-swatch';
import { FileBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/file-box';
import { EmptyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/empty';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { MessageBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/message-box';
import { PressButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/press-button';
import { SegmentComponent, SegmentItemComponent } from '@pixel-brewery/mosaik-elements-angular/components/segment';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { SplitComponent } from '@pixel-brewery/mosaik-elements-angular/components/split';
import { FailureStateComponent, LoadingStateComponent, PaneSizeDirective, WorkspaceTileComponent } from '@pixel-brewery/wortlaut-frontend-ui';
import { WorkspacesViewPresenter } from '../view-presenters/WorkspacesViewPresenter';

// #endregion

/**
 * Groups workspace identity, project state and actions beside the form for a new one.
 */
@Component({
    selector: 'wortlaut-workspaces',
    host: { class: 'page-frame' },
    imports: [
        BadgeComponent,
        ButtonComponent,
        CardComponent,
        CardHeaderComponent,
        ColorBoxComponent,
        ColorSwatchComponent,
        ColorSwatchGroupComponent,
        EmptyStateComponent,
        FailureStateComponent,
        FormFieldDirective,
        FileBoxComponent,
        LoadingStateComponent,
        PaneSizeDirective,
        MessageComponent,
        MessageBoxComponent,
        PressButtonComponent,
        SplitComponent,
        SegmentComponent,
        SegmentItemComponent,
        TextBoxComponent,
        WorkspaceTileComponent
    ],
    providers: [WorkspacesViewPresenter],
    templateUrl: './WorkspacesView.html',
    styleUrl: './WorkspacesView.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkspacesView implements OnInit {

    // #region Fields

    private readonly _confirmation = viewChild(MessageBoxComponent);
    private readonly _element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    private readonly _focusRequest = signal<{ origin: HTMLElement | null } | null>(null);
    private _removalOrigin: HTMLElement | null = null;
    private _removalResult: 'ok' | 'cancel' | null = null;

    // #endregion

    // #region Ctor

    /** Applies the documented safe focus target when a confirmation is rendered. */
    public constructor() {
        afterRenderEffect(() => {
            const confirmation = this._confirmation();

            // open() applies MessageBox's safe initialResult focus after its parts have rendered.
            if (confirmation) {
                void confirmation.open();
            }
        });
        afterRenderEffect(() => {
            const request = this._focusRequest();

            if (!request) {
                return;
            }

            const target = request.origin?.isConnected
                ? request.origin
                : this._element.querySelector<HTMLElement>('[test-id^="workspace-open-"]:not([disabled])') ??
                    this._element.querySelector<HTMLElement>('[test-id="create-workspace"]:not([disabled])') ??
                    this._element.querySelector<HTMLElement>('[test-id="workspace-name"]');

            if (target) {
                void this.focusAfterRender(target);
            }
            this._focusRequest.set(null);
        });
    }

    // #endregion

    // #region Properties

    /**
     * Gets the presenter.
     *
     * @readonly
     */
    protected readonly presenter = inject(WorkspacesViewPresenter);

    // #endregion

    // #region Methods

    /**
     * @public
     * @override
     */
    public ngOnInit(): void {
        void this.presenter.workspaces.reload();
    }

    /**
     * Commits ColorBox's completed text edit or picker selection without feeding partial text back into the input.
     *
     * @param value The installed raw change value or the documented color-change detail.
     */
    protected onCustomColorChange(value: unknown): void {
        const color = typeof value === 'string'
            ? value
            : value !== null && typeof value === 'object' && 'color' in value && typeof value.color === 'string'
                ? value.color
                : undefined;

        this.presenter.pickCustomColor(color);
    }

    /**
     * Retains the actual trigger so cancelling returns focus after the native dialog closes.
     *
     * @param id The workspace selected by the completed press.
     */
    protected onRequestRemoval(id: string): void {
        if (this.presenter.removalTarget() || this.presenter.removingId() !== null || this.presenter.busy()) {
            return;
        }

        this._removalOrigin = Array.from(this._element.querySelectorAll<HTMLElement>('mosaik-press-button'))
            .find((element) => element.getAttribute('test-id') === `workspace-remove-${id}`) ?? null;
        this._removalResult = null;
        this.presenter.requestRemoval(id);
    }

    /**
     * Adapts Mosaik's installed raw result and its documented result envelope at the view boundary.
     * Unknown output is treated as cancellation.
     *
     * @param value The MessageBox output.
     */
    protected onRemovalResult(value: unknown): void {
        if (this._removalResult !== null || !this.presenter.removalTarget()) {
            return;
        }

        const result = typeof value === 'string'
            ? value
            : value !== null && typeof value === 'object' && 'result' in value && typeof value.result === 'string'
                ? value.result
                : 'cancel';

        // Mosaik closes after emitting dialogResult. Keep its native dialog mounted through that lifecycle.
        this._removalResult = result === 'ok' ? 'ok' : 'cancel';
    }

    /** Finishes the captured action only after Mosaik has closed and restored native focus. */
    protected onRemovalClosed(): void {
        if (!this.presenter.removalTarget()) {
            return;
        }

        const result = this._removalResult ?? 'cancel';
        const origin = this._removalOrigin;

        this._removalResult = null;
        this._removalOrigin = null;

        void this.presenter.resolveRemoval(result).then(() => {
            this._focusRequest.set({ origin });
        });
    }

    /** Waits for Mosaik to re-enable the trigger before forwarding focus into its native control. */
    private async focusAfterRender(target: HTMLElement): Promise<void> {
        if ('updateComplete' in target && target.updateComplete instanceof Promise) {
            await target.updateComplete;
        }

        if (target.isConnected && !this.presenter.removalTarget() && this.presenter.removingId() === null) {
            target.focus();
        }
    }

    // #endregion

}

// #region Imports

import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { FormFieldDirective } from '@pixel-brewery/mosaik-elements-angular';
import { ButtonComponent } from '@pixel-brewery/mosaik-elements-angular/components/button';
import { CardComponent, CardHeaderComponent } from '@pixel-brewery/mosaik-elements-angular/components/card';
import { ChipComponent } from '@pixel-brewery/mosaik-elements-angular/components/chip';
import { ChoiceComponent, ChoiceGroupComponent } from '@pixel-brewery/mosaik-elements-angular/components/choice';
import { EmptyStateComponent } from '@pixel-brewery/mosaik-elements-angular/components/empty';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import { PasswordBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/password-box';
import { SelectComponent, SelectItemComponent } from '@pixel-brewery/mosaik-elements-angular/components/select';
import { TableBodyCellComponent, TableBodyComponent, TableBodyRowComponent, TableComponent, TableHeaderCellComponent, TableHeaderComponent, TableHeaderRowComponent } from '@pixel-brewery/mosaik-elements-angular/components/table';
import { TextBoxComponent } from '@pixel-brewery/mosaik-elements-angular/components/text-box';
import { formatName } from '@pixel-brewery/wortlaut-frontend-core';
import { FailureStateComponent, LoadingStateComponent } from '@pixel-brewery/wortlaut-frontend-ui';
import { SetupViewPresenter } from '../view-presenters/SetupViewPresenter';

// #endregion

/**
 * Project setup: catalogs, locales and AI provider, outside the shell.
 */
@Component({
    selector: 'wortlaut-setup',
    imports: [
        ButtonComponent,
        CardComponent,
        CardHeaderComponent,
        ChipComponent,
        ChoiceComponent,
        ChoiceGroupComponent,
        EmptyStateComponent,
        FailureStateComponent,
        FormFieldDirective,
        LoadingStateComponent,
        MessageComponent,
        PasswordBoxComponent,
        SelectComponent,
        SelectItemComponent,
        TableBodyCellComponent,
        TableBodyComponent,
        TableBodyRowComponent,
        TableComponent,
        TableHeaderCellComponent,
        TableHeaderComponent,
        TableHeaderRowComponent,
        TextBoxComponent
    ],
    providers: [SetupViewPresenter],
    templateUrl: './SetupView.html',
    styleUrl: './SetupView.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SetupView implements OnInit {

    // #region Properties

    /**
     * Gets the presenter.
     *
     * @readonly
     */
    protected readonly presenter = inject(SetupViewPresenter);

    /**
     * Writes the name of a catalog format.
     *
     * @readonly
     */
    protected readonly formatName = formatName;

    // #endregion

    // #region Methods

    /**
     * @public
     * @override
     */
    public ngOnInit(): void {
        void this.presenter.load();
    }

    /**
     * Passes on what the user typed as a key.
     *
     * @param event The value of the password box.
     */
    protected onKey(event: unknown): void {
        // The password box hands over its value as the event.
        this.presenter.typeKey(String(event));
    }

    // #endregion

}

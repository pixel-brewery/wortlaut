// #region Imports

import { ChangeDetectionStrategy, Component } from '@angular/core';

// #endregion

/**
 * The mark of Wortlaut.
 */
@Component({
    selector: 'wortlaut-logo',
    template: `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"></path>
        </svg>
    `,
    styleUrl: './LogoComponent.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LogoComponent {}

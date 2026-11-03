// #region Imports

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AnchorComponent } from '@pixel-brewery/mosaik-elements-angular/components/anchor';
import { MessageComponent } from '@pixel-brewery/mosaik-elements-angular/components/message';
import type { WriteOutcome } from '@pixel-brewery/wortlaut-contracts';

// #endregion

/**
 * Writes what a control that writes did.
 *
 * @param outcome What happened.
 * @returns The message, or `null` for nothing to say.
 */
export function describeWrite(outcome: WriteOutcome | null): { variant: 'success' | 'info'; header: string; content: string; goesToReview: boolean } | null {
    if (!outcome) {
        return null;
    }

    const files = outcome.files.join(', ');

    switch (outcome.state) {
        case 'applied':
            return { variant: 'success', header: 'Written', content: files, goesToReview: false };
        case 'pending':
            return { variant: 'info', header: 'Waiting in Review', content: `Nothing was written. ${files}`, goesToReview: true };
        default:
            return { variant: 'info', header: 'Nothing to change', content: 'The files already hold this.', goesToReview: false };
    }
}

/**
 * What a control that writes did, in the words of the change set.
 */
@Component({
    selector: 'wortlaut-write-result',
    imports: [AnchorComponent, MessageComponent],
    template: `
        @for (message of messages(); track message.content) {
            <mosaik-message [variant]="message.variant" [header]="message.header" [content]="message.content" />
            @if (message.goesToReview) {
                <div class="review-link"><mosaik-anchor href="#/review" label="Open Review" /></div>
            }
        }
    `,
    styles: ':host { display: contents; } .review-link { flex: none; }',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WriteResultComponent {

    // #region Properties

    /**
     * Gets what happened.
     *
     * @readonly
     */
    public readonly outcome = input<WriteOutcome | null>(null);

    /**
     * Gets the message, in a list so a new one builds a new element.
     *
     * @readonly
     */
    protected readonly messages = computed(() => {
        const message = describeWrite(this.outcome());

        return message ? [message] : [];
    });

    // #endregion

}

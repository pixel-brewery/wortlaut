/**
 * Defines the reviewed CI baseline and complete native verification requirements.
 *
 * @internal
 */
export const verificationPolicy = Object.freeze({
    workflowFile: 'ci.yml',
    workflowPath: '.github/workflows/ci.yml',
    workflowName: 'Desktop quality',
    releaseWorkflowName: 'Continuous Desktop Release',
    requiredJobs: [
        'Classify changes',
        'Build and exercise desktop (ubuntu-latest)',
        'Build and exercise desktop (macos-latest)',
        'Build and exercise desktop (windows-latest)',
        'Quality Gate'
    ],
    requiredChecks: [
        'Build and exercise desktop (macos-latest)',
        'Build and exercise desktop (windows-latest)',
        'Quality Gate'
    ],
    reviewedCiSha256: '4c042524387b3f25da0430169f7a70d114c6f1661761bea12a1757f185106517'
});

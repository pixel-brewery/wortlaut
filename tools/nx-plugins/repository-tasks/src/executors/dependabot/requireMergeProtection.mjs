// #region Imports
import { verificationPolicy } from './verificationPolicy.mjs';
// #endregion

/**
 * Verifies actual enforced PR and strict native CI requirements without changing rules.
 *
 * @param request - The bounded GitHub metadata boundary.
 * @param repositoryPath - The independently resolved repository REST prefix.
 * @returns Whether every maintained required native check is enforced on main.
 * @internal
 */
export async function requireMergeProtection(request, repositoryPath) {
    const rules = await request('GET', `${repositoryPath}/rules/branches/main`);
    return (
        Array.isArray(rules) &&
        rules.some((rule) => rule.type === 'pull_request') &&
        rules.some(
            (rule) => rule.type === 'required_status_checks' &&
              rule.parameters?.strict_required_status_checks_policy === true &&
              verificationPolicy.requiredChecks.every((name) => rule.parameters.required_status_checks?.some(
                  (check) => check.context === name && check.integration_id === 15368
              ))
        )
    );
}

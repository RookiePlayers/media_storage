import type { UserConfig } from '@commitlint/types';

const config: UserConfig = {
    extends: ['@commitlint/config-conventional'],
    // Don't lint commits from dependabot or renovate - they might violate the max body line length
    ignores: [(commit: string) => commit.startsWith('build(deps):')],
    rules: {
        'body-max-line-length': [0, 'always', 600],
        'subject-case': [2, 'always', ['sentence-case', 'start-case', 'pascal-case']],
    },

};

export default config;
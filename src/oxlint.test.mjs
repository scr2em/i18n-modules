import { RuleTester } from 'oxlint/plugins-dev'
import { describe, it } from 'vitest'

import plugin from './oxlint.mjs'

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
	languageOptions: { parserOptions: { lang: 'tsx' } },
})

const imports = `import { Trans, type TranslateFunction, useI18n } from '@scr2em/i18n-modules'
import messages from './Page.i18n'
`

ruleTester.run('static-keys', plugin.rules['static-keys'], {
	valid: [
		`${imports}const { t } = useI18n(messages); t('title'); t(\`title\`)`,
		`${imports}const { t: translatePage } = useI18n(messages); translatePage('items', { count })`,
		`${imports}const page = <Trans messages={messages} i18nKey="terms" />`,
		`${imports}const page = <Trans messages={messages} i18nKey={'terms'} />`,
		// Another component named `Trans` is not checked.
		`const page = <Trans i18nKey={key} />`,
		// Another function named `t` is not checked.
		`const t = (key) => key; t(key)`,
	],
	invalid: [
		{
			code: `${imports}const { t } = useI18n(messages); t(key)`,
			errors: [/string literal/],
		},
		{
			code: `${imports}const { t } = useI18n(messages); t(\`items.\${kind}\`)`,
			errors: [/string literal/],
		},
		{
			code: `${imports}function Page() { return t(labels[kind]) }\nconst { t } = useI18n(messages)`,
			errors: [/string literal/],
		},
		{
			code: `${imports}const page = <Trans messages={messages} i18nKey={key} />`,
			errors: [/string literal/],
		},
		{
			code: `${imports}const page = <Trans messages={messages} />`,
			errors: [/string literal/],
		},
	],
})

ruleTester.run('colocated-messages', plugin.rules['colocated-messages'], {
	valid: [
		{
			code: `import messages from './Page.i18n'`,
			filename: '/app/src/Page.tsx',
		},
		{ code: `import data from './data.json'`, filename: '/app/src/Page.tsx' },
		{
			code: `import messages from './Page.i18n'`,
			filename: '/app/src/Page.test.tsx',
		},
		{
			code: `import messages from './Page.i18n'`,
			filename: '/app/src/Page.spec.ts',
		},
		{
			code: `import messages from './Page.i18n'`,
			filename: '/app/src/Page.stories.tsx',
		},
		{
			code: `import messages from './Page.i18n.ts'`,
			filename: '/app/src/Page.tsx',
		},
	],
	invalid: [
		{
			code: `import messages from './Other.i18n'`,
			filename: '/app/src/Page.tsx',
			errors: [/'\.\/Page\.i18n'/],
		},
		{
			code: `import messages from '../shared/Page.i18n'`,
			filename: '/app/src/Page.tsx',
			errors: [/'\.\/Page\.i18n'/],
		},
		{
			code: `import messages from './Other.i18n'`,
			filename: '/app/src/Page.test.tsx',
			errors: [/'\.\/Page\.i18n'/],
		},
		{
			code: `const messages = import('./Page.i18n')`,
			filename: '/app/src/Page.tsx',
			errors: [/import\(\)/],
		},
		{
			code: 'const messages = import(`./${name}.i18n`)',
			filename: '/app/src/Page.tsx',
			errors: [/import\(\)/],
		},
		{
			code: `export { default } from './Page.i18n'`,
			filename: '/app/src/Page.tsx',
			errors: [/Do not export/],
		},
		{
			code: `export * from './Page.i18n'`,
			filename: '/app/src/Page.tsx',
			errors: [/Do not export/],
		},
	],
})

ruleTester.run('no-messages-access', plugin.rules['no-messages-access'], {
	valid: [
		`${imports}const { t } = useI18n(messages)`,
		`${imports}const getSchema = (t: TranslateFunction<typeof messages>) => t('title')`,
		`${imports}const page = { messages: 1 }; page.messages`,
		`${imports}const page = <Trans messages={messages} i18nKey="terms" />`,
	],
	invalid: [
		{ code: `${imports}messages.en.title`, errors: [/only to useI18n/] },
		{
			code: `${imports}const page = <Other messages={messages} />`,
			errors: [/only to useI18n/],
		},
		{
			code: `${imports}const copy = { ...messages }`,
			errors: [/only to useI18n/],
		},
		{
			code: `import { en } from './Page.i18n'`,
			errors: [/default import/],
		},
	],
})

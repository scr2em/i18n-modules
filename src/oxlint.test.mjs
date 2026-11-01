import { RuleTester } from 'oxlint/plugins-dev'
import { describe, it } from 'vitest'

import plugin from './oxlint.mjs'

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
	languageOptions: { parserOptions: { lang: 'tsx' } },
})

const imports = `import { translate, useI18n } from '@scr2em/i18n-modules'
import messages from './Page.i18n.json'
`

ruleTester.run('static-keys', plugin.rules['static-keys'], {
	valid: [
		`${imports}const { t } = useI18n(messages); t('title'); t(\`title\`)`,
		`${imports}const { t: translatePage } = useI18n(messages); translatePage('items', { count })`,
		`${imports}translate(messages, 'title')`,
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
		{ code: `${imports}translate(messages, key)`, errors: [/string literal/] },
	],
})

ruleTester.run('colocated-messages', plugin.rules['colocated-messages'], {
	valid: [
		{
			code: `import messages from './Page.i18n.json'`,
			filename: '/app/src/Page.tsx',
		},
		{ code: `import data from './data.json'`, filename: '/app/src/Page.tsx' },
	],
	invalid: [
		{
			code: `import messages from './Other.i18n.json'`,
			filename: '/app/src/Page.tsx',
			errors: [/'\.\/Page\.i18n\.json'/],
		},
		{
			code: `import messages from '../shared/Page.i18n.json'`,
			filename: '/app/src/Page.tsx',
			errors: [/'\.\/Page\.i18n\.json'/],
		},
	],
})

ruleTester.run('no-messages-access', plugin.rules['no-messages-access'], {
	valid: [
		`${imports}const { t } = useI18n(messages); translate(messages, 'title')`,
		`${imports}const page = { messages: 1 }; page.messages`,
	],
	invalid: [
		{ code: `${imports}messages.en.title`, errors: [/only to useI18n/] },
		{
			code: `${imports}const copy = { ...messages }`,
			errors: [/only to useI18n/],
		},
		{
			code: `import { en } from './Page.i18n.json'`,
			errors: [/default import/],
		},
	],
})

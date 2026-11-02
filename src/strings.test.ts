// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { readLanguages } from './strings.ts'

let root = ''

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

function writeStrings(source: string) {
	root = mkdtempSync(join(tmpdir(), 'i18n-strings-'))
	const file = join(root, 'Page.i18n.ts')
	writeFileSync(file, source)
	return file
}

describe('readLanguages', () => {
	it('reads defineMessages, `as const` and quoted keys', () => {
		const file = writeStrings(
			"import { defineMessages } from '@scr2em/i18n-modules'\n" +
				"export default defineMessages({ en: { title: 'Title', nested: { 'a-b': `Text` } }, fr: { title: 'Titre' } })\n",
		)
		expect(readLanguages(file)).toEqual({
			en: { title: 'Title', nested: { 'a-b': 'Text' } },
			fr: { title: 'Titre' },
		})
		const plain = writeStrings("export default { en: { title: 'Title' } } as const\n")
		expect(readLanguages(plain)).toEqual({ en: { title: 'Title' } })
	})

	it('names the line of a value that is not a literal', () => {
		const file = writeStrings(
			"export default defineMessages({\n\ten: {\n\t\ttitle: `Hi ${name}`,\n\t},\n})\n",
		)
		expect(() => readLanguages(file)).toThrow(/Page\.i18n\.ts:3: a template literal/)
	})
})

describe('the type check of a strings file', () => {
	it('autocompletes the values of a string and fails for a wrong one', () => {
		root = mkdtempSync(join(tmpdir(), 'i18n-types-'))
		writeFileSync(
			join(root, 'Page.i18n.ts'),
			"import { defineMessages } from '@scr2em/i18n-modules'\n" +
				"export default defineMessages({ en: { greeting: 'Hi {{name}}' } })\n",
		)
		writeFileSync(
			join(root, 'Page.ts'),
			[
				"import { useI18n } from '@scr2em/i18n-modules'",
				"import messages from './Page.i18n'",
				'export function usePage() {',
				'\tconst { t } = useI18n(messages)',
				"\treturn [t('greeting', { name: 'Ada' }), t('greeting', { nmae: 'Ada' })]",
				'}',
				'',
			].join('\n'),
		)
		writeFileSync(
			join(root, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					strict: true,
					noEmit: true,
					skipLibCheck: true,
					module: 'esnext',
					moduleResolution: 'bundler',
					allowImportingTsExtensions: true,
					jsx: 'react-jsx',
					lib: ['dom', 'esnext'],
					paths: { '@scr2em/i18n-modules': [resolve('src/index.ts')] },
				},
				files: ['Page.ts'],
			}),
		)
		let output = ''
		try {
			execFileSync(resolve('node_modules/.bin/tsc'), ['-p', root], { encoding: 'utf8' })
		} catch (error) {
			output = String((error as { stdout?: string }).stdout ?? error)
		}
		// Only the wrong name fails, in the second call on line 5.
		expect(output).toContain("'nmae' does not exist")
		expect(output.match(/error TS/g)).toHaveLength(1)
		expect(output).toMatch(/Page\.ts\(5,/)
	})
})

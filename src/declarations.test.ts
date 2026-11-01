// @vitest-environment node
import { execFileSync } from 'node:child_process'
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'

import {
	declarationFor,
	declarationPath,
	generateDeclarations,
} from './declarations.ts'
import { i18nModules } from './vite.ts'

let root = ''

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

function makeRoot() {
	root = mkdtempSync(join(tmpdir(), 'i18n-declarations-'))
	return root
}

function writeJson(path: string, content: object) {
	mkdirSync(resolve(path, '..'), { recursive: true })
	writeFileSync(path, JSON.stringify(content))
}

describe('declarationFor', () => {
	it('types the import with the exact text of the default language', () => {
		const source = declarationFor({ greeting: { title: 'Hi {{name}}' } })
		expect(source).toContain(
			"import type { I18nMessages } from '@scr2em/i18n-modules'",
		)
		expect(source).toContain('"title": "Hi {{name}}"')
		expect(source).toContain('export default messages')
	})
})

describe('generateDeclarations', () => {
	it('writes a file next to every .i18n.json file, and skips node_modules', () => {
		const folder = makeRoot()
		writeJson(join(folder, 'Page.i18n.json'), { en: { title: 'Title' } })
		writeJson(join(folder, 'deep/Card.i18n.json'), { en: { title: 'Card' } })
		writeJson(join(folder, 'node_modules/lib/Lib.i18n.json'), {
			en: { title: 'Lib' },
		})

		const written = generateDeclarations(folder)

		expect(written.sort()).toEqual(
			[join(folder, 'Page.i18n.json'), join(folder, 'deep/Card.i18n.json')].sort(),
		)
		expect(existsSync(join(folder, 'deep/Card.i18n.d.json.ts'))).toBe(true)
		expect(existsSync(join(folder, 'node_modules/lib/Lib.i18n.d.json.ts'))).toBe(
			false,
		)
		// Nothing changed, so nothing is written again.
		expect(generateDeclarations(folder)).toEqual([])
	})

	it('skips a file with no default language', () => {
		const folder = makeRoot()
		writeJson(join(folder, 'Page.i18n.json'), { fr: { title: 'Titre' } })
		expect(generateDeclarations(folder)).toEqual([])
	})
})

describe('the Vite plugin', () => {
	async function buildPage(options: { declarations?: boolean } = {}) {
		const folder = makeRoot()
		writeJson(join(folder, 'Page.i18n.json'), { en: { title: 'Title' } })
		writeFileSync(
			join(folder, 'runtime.js'),
			'export const registerI18nModule = (...args) => args',
		)
		writeFileSync(
			join(folder, 'Page.js'),
			"import messages from './Page.i18n.json'\nconsole.log(messages)",
		)
		await build({
			configFile: false,
			root: folder,
			logLevel: 'silent',
			plugins: [i18nModules({ runtime: 'runtime.js', ...options })],
			build: {
				outDir: 'dist',
				lib: { entry: join(folder, 'Page.js'), formats: ['es'] },
			},
		})
		return declarationPath(join(folder, 'Page.i18n.json'))
	}

	it('writes the declaration files', async () => {
		const path = await buildPage()
		expect(readFileSync(path, 'utf8')).toContain('"title": "Title"')
	})

	it('writes none with `declarations: false`', async () => {
		expect(existsSync(await buildPage({ declarations: false }))).toBe(false)
	})
})

describe('the type check with a declaration file', () => {
	it('autocompletes the values of a string and fails for a wrong one', () => {
		const folder = makeRoot()
		writeJson(join(folder, 'Page.i18n.json'), {
			en: { greeting: 'Hi {{name}}', terms: 'Accept the <link>terms</link>' },
		})
		generateDeclarations(folder)
		writeFileSync(
			join(folder, 'Page.ts'),
			[
				"import { translate } from '@scr2em/i18n-modules'",
				"import messages from './Page.i18n.json'",
				"translate(messages, 'greeting', { name: 'Ada' })",
				"translate(messages, 'greeting', { nmae: 'Ada' })",
				'',
			].join('\n'),
		)
		writeFileSync(
			join(folder, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					strict: true,
					noEmit: true,
					skipLibCheck: true,
					module: 'esnext',
					moduleResolution: 'bundler',
					resolveJsonModule: true,
					allowArbitraryExtensions: true,
					allowImportingTsExtensions: true,
					jsx: 'react-jsx',
					lib: ['dom', 'esnext'],
					paths: { '@scr2em/i18n-modules': [resolve('src/index.ts')] },
				},
				files: ['Page.ts'],
			}),
		)

		const output = typeCheck(folder)

		// Only the wrong name fails, on line 4.
		expect(output).toMatch(/Page\.ts\(4,/)
		expect(output).toContain("'nmae' does not exist")
		expect(output).not.toMatch(/Page\.ts\(3,/)
	})
})

function typeCheck(folder: string): string {
	try {
		execFileSync(resolve('node_modules/.bin/tsc'), ['-p', folder], {
			encoding: 'utf8',
		})
		return ''
	} catch (error) {
		return String((error as { stdout?: string }).stdout ?? error)
	}
}

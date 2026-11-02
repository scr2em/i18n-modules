// @vitest-environment node
import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build, createServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'

import { findKeyProblems, i18nModules } from './vite.ts'

describe('findKeyProblems', () => {
	it('accepts languages with the same keys', () => {
		expect(
			findKeyProblems(
				{ en: { page: { title: 'Title' } }, fr: { page: { title: 'Titre' } } },
				'en',
			),
		).toEqual([])
	})

	it('names missing and extra keys', () => {
		expect(
			findKeyProblems(
				{
					en: { page: { title: 'Title', subtitle: 'Subtitle' } },
					fr: { page: { title: 'Titre', heading: 'Titre' } },
				},
				'en',
			),
		).toEqual([
			'  "fr" is missing "page.subtitle"',
			'  "fr" has "page.heading", which "en" does not have',
		])
	})

	it('lets plural forms differ between languages', () => {
		expect(
			findKeyProblems(
				{
					en: { items_one: 'item', items_other: 'items' },
					ar: {
						items_zero: '٠',
						items_one: '١',
						items_two: '٢',
						items_many: 'ن',
					},
				},
				'en',
			),
		).toEqual([])
	})

	it('accepts BCP 47 tags with a region or a script', () => {
		expect(
			findKeyProblems(
				{
					en: { title: 'Title' },
					'pt-BR': { title: 'Título' },
					'zh-Hant-TW': { title: '標題' },
				},
				'en',
			),
		).toEqual([])
	})

	it('names a key that is not a language tag, or not in its canonical form', () => {
		expect(
			findKeyProblems(
				{ en: { title: 'Title' }, english: { title: 'Title' } },
				'en',
			),
		).toEqual([
			'  "english" is not a language tag. Use a BCP 47 tag with an ISO 639 language, such as "en", "fr" or "pt-BR".',
		])
		expect(
			findKeyProblems({ en: { title: 'Title' }, 'pt-br': { title: 'Título' } }, 'en'),
		).toEqual(['  "pt-br" must be written "pt-BR"'])
	})

	it('lets a regional language leave out the keys of its less specific language', () => {
		const languages = {
			en: { title: 'Title', color: 'Color' },
			pt: { title: 'Título', color: 'Cor' },
			'pt-BR': { color: 'Cor (BR)' },
		}
		expect(findKeyProblems(languages, 'en')).toEqual([])
		expect(
			findKeyProblems({ ...languages, 'pt-BR': { extra: 'Extra' } }, 'en'),
		).toEqual(['  "pt-BR" has "extra", which "en" does not have'])
	})

	it('needs every key in a regional language with no less specific language', () => {
		expect(
			findKeyProblems(
				{ en: { title: 'Title', color: 'Color' }, 'pt-BR': { color: 'Cor' } },
				'en',
			),
		).toEqual(['  "pt-BR" is missing "title"'])
	})

	it('needs the default language', () => {
		expect(findKeyProblems({ fr: { title: 'Titre' } }, 'en')).toEqual([
			'  the default language "en" is missing',
		])
	})
})

/** The source of a `.i18n.ts` file with these strings. */
function stringsFile(strings: object) {
	return `import { defineMessages } from '@scr2em/i18n-modules'\n\nexport default defineMessages(${JSON.stringify(strings)})\n`
}

describe('the build', () => {
	let root = ''

	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
	})

	async function buildFixture(
		file: object,
		{
			importer = 'Page.js',
			code = "import messages from './Page.i18n.ts'\nconsole.log(messages)",
		} = {},
	) {
		root = mkdtempSync(join(tmpdir(), 'i18n-modules-'))
		writeFileSync(join(root, 'Page.i18n.ts'), stringsFile(file))
		writeFileSync(
			join(root, 'runtime.js'),
			'export const registerI18nModule = (...args) => args',
		)
		writeFileSync(join(root, importer), code)
		await build({
			configFile: false,
			root,
			logLevel: 'silent',
			plugins: [i18nModules({ runtime: 'runtime.js' })],
			build: {
				outDir: 'dist',
				minify: false,
				lib: { entry: join(root, importer), formats: ['es'] },
			},
		})
		return readdirSync(join(root, 'dist')).map((name) =>
			readFileSync(join(root, 'dist', name), 'utf8'),
		)
	}

	it('puts the default language in the importer and every other language in its own chunk', async () => {
		const chunks = await buildFixture({
			en: { title: 'English title' },
			fr: { title: 'Titre français' },
		})
		const entry = chunks.find((chunk) => chunk.includes('English title'))
		expect(entry).toContain('"Page.i18n"')
		expect(entry).not.toContain('Titre français')
		expect(
			chunks.filter((chunk) => chunk.includes('Titre français')),
		).toHaveLength(1)
	})

	it('fails when a language has different keys', async () => {
		await expect(
			buildFixture({
				en: { title: 'Title', subtitle: 'Subtitle' },
				fr: { title: 'Titre' },
			}),
		).rejects.toThrow('"fr" is missing "subtitle"')
	})

	it('lets the tests and stories of the file import its strings', async () => {
		for (const importer of ['Page.test.js', 'Page.spec.js', 'Page.stories.js']) {
			const chunks = await buildFixture(
				{ en: { title: 'English title' } },
				{ importer },
			)
			expect(chunks.join('')).toContain('English title')
			rmSync(root, { recursive: true, force: true })
		}
	})

	it('fails when a different file imports the strings', async () => {
		await expect(
			buildFixture({ en: { title: 'Title' } }, { importer: 'Other.js' }),
		).rejects.toThrow(
			'Only Page.*, Page.test.*, Page.spec.*, Page.stories.* in the same folder can import it',
		)
	})

	it('fails for a dynamic import from a different file', async () => {
		await expect(
			buildFixture(
				{ en: { title: 'Title' } },
				{
					importer: 'Other.js',
					code: "import('./Page.i18n.ts').then(console.log)",
				},
			),
		).rejects.toThrow('cannot import')
	})

	it('fails for a file that re-exports the strings of a different file', async () => {
		await expect(
			buildFixture(
				{ en: { title: 'Title' } },
				{
					importer: 'strings.js',
					code: "export { default } from './Page.i18n.ts'",
				},
			),
		).rejects.toThrow('cannot import')
	})

	it('loads the strings in a dev server, which resolves the watched files', async () => {
		root = mkdtempSync(join(tmpdir(), 'i18n-modules-'))
		writeFileSync(
			join(root, 'Page.i18n.ts'),
			stringsFile({ en: { title: 'Title' } }),
		)
		writeFileSync(
			join(root, 'runtime.js'),
			'export const registerI18nModule = (namespace) => namespace',
		)
		writeFileSync(
			join(root, 'Page.js'),
			"import messages from './Page.i18n.ts'\nexport default messages",
		)
		const server = await createServer({
			configFile: false,
			root,
			logLevel: 'silent',
			plugins: [i18nModules({ runtime: 'runtime.js' })],
			server: { middlewareMode: true, ws: false },
		})
		try {
			const page = await server.ssrLoadModule('/Page.js')
			expect(page.default).toBe('Page.i18n')
		} finally {
			await server.close()
		}
	})

	it('resolves an import with no extension', async () => {
		const chunks = await buildFixture(
			{ en: { title: 'English title' } },
			{ code: "import messages from './Page.i18n'\nconsole.log(messages)" },
		)
		expect(chunks.join('')).toContain('English title')
	})

	it('fails for strings that are not literals', async () => {
		root = mkdtempSync(join(tmpdir(), 'i18n-modules-'))
		writeFileSync(
			join(root, 'Page.i18n.ts'),
			"const title = 'Title'\nexport default defineMessages({ en: { title } })\n",
		)
		writeFileSync(join(root, 'runtime.js'), 'export const registerI18nModule = () => 0')
		writeFileSync(join(root, 'Page.js'), "import messages from './Page.i18n.ts'\nconsole.log(messages)")
		await expect(
			build({
				configFile: false,
				root,
				logLevel: 'silent',
				plugins: [i18nModules({ runtime: 'runtime.js' })],
				build: { outDir: 'dist', lib: { entry: join(root, 'Page.js'), formats: ['es'] } },
			}),
		).rejects.toThrow('string literals only')
	})
})

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
import { build } from 'vite'
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

	it('needs the default language', () => {
		expect(findKeyProblems({ fr: { title: 'Titre' } }, 'en')).toEqual([
			'  the default language "en" is missing',
		])
	})
})

describe('the build', () => {
	let root = ''

	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
	})

	async function buildFixture(
		file: object,
		{
			importer = 'Page.js',
			code = "import messages from './Page.i18n.json'\nconsole.log(messages)",
		} = {},
	) {
		root = mkdtempSync(join(tmpdir(), 'i18n-modules-'))
		writeFileSync(join(root, 'Page.i18n.json'), JSON.stringify(file))
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
					code: "import('./Page.i18n.json').then(console.log)",
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
					code: "export { default } from './Page.i18n.json'",
				},
			),
		).rejects.toThrow('cannot import')
	})
})

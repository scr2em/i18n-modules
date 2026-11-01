import '@testing-library/jest-dom/vitest'
import { act, render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import {
	getLanguage,
	registerI18nModule,
	setLanguage,
	useI18n,
} from './index.ts'
import { tFor } from './testUtils.ts'

// What `import messages from './Greeting.i18n.json'` gives, made by hand: the
// test runs the runtime without the Vite plugin.
const english = {
	greeting: { title: 'Hello {{name}}' },
	onlyInEnglish: 'Only English',
	items_one: '{{count}} item',
	items_other: '{{count}} items',
} as const
let frenchLoads = 0
const messages = registerI18nModule('test/Greeting.i18n', 'en', english, {
	fr: () => {
		frenchLoads += 1
		return Promise.resolve({
			default: {
				greeting: { title: 'Bonjour {{name}}' },
				items_one: '{{count}} élément',
				items_other: '{{count}} éléments',
			},
		})
	},
})

function Greeting() {
	const { t } = useI18n(messages)
	return (
		<p>
			{t('greeting.title', { name: 'Ada' })} / {t('onlyInEnglish')} /{' '}
			{t('items', { count: 2 })}
		</p>
	)
}

function TypeChecks() {
	const { t } = useI18n(messages)
	// @ts-expect-error -- a key that the file does not have
	t('greeting.missing')
	// @ts-expect-error -- plural forms are read through their base key
	t('items_one')
	// @ts-expect-error -- a plural key needs a count
	t('items')
	// @ts-expect-error -- the text has {{name}}
	t('greeting.title')
	// @ts-expect-error -- the name in the text is `name`
	t('greeting.title', { nmae: 'Ada' })
	// @ts-expect-error -- the text has no values
	t('onlyInEnglish', { name: 'Ada' })
	// Values can be numbers, and `count` must be a number.
	t('greeting.title', { name: 7 })
	// @ts-expect-error -- `count` must be a number
	t('items', { count: '2' })
	return null
}

let fallbackRenders = 0

function Fallback() {
	fallbackRenders += 1
	return null
}

afterEach(async () => {
	await act(() => setLanguage('en'))
	fallbackRenders = 0
})

describe('useI18n', () => {
	it('shows the default language on the first render, then switches language without a loading state', async () => {
		render(
			<Suspense fallback={<Fallback />}>
				<Greeting />
				<TypeChecks />
			</Suspense>,
		)
		expect(
			screen.getByText('Hello Ada / Only English / 2 items'),
		).toBeInTheDocument()

		await act(() => setLanguage('fr'))

		// A key that the language does not have falls back to English.
		expect(
			screen.getByText('Bonjour Ada / Only English / 2 éléments'),
		).toBeInTheDocument()
		expect(fallbackRenders).toBe(0)
	})

	it('waits for the strings of a module that is imported after a language switch', async () => {
		await act(() => setLanguage('fr'))
		const lateMessages = registerI18nModule(
			'test/Late.i18n',
			'en',
			{ title: 'Late' },
			{ fr: () => Promise.resolve({ default: { title: 'Tardif' } }) },
		)
		function Late() {
			const { t } = useI18n(lateMessages)
			return <p>{t('title')}</p>
		}

		// React waits for a promise that suspends the first render only inside
		// an async `act`. Outside it, the retry happens later, on React's own
		// schedule.
		// oxlint-disable-next-line testing-library/no-unnecessary-act
		await act(async () => {
			render(
				<Suspense fallback={<Fallback />}>
					<Late />
				</Suspense>,
			)
		})

		expect(screen.getByText('Tardif')).toBeInTheDocument()
		expect(screen.queryByText('Late')).not.toBeInTheDocument()
	})
})

describe('the t function', () => {
	it('is the same on every render, and changes with the language', async () => {
		const seen: unknown[] = []
		function Recorder() {
			const { t } = useI18n(messages)
			seen.push(t)
			return null
		}
		const { rerender } = render(<Recorder />)
		rerender(<Recorder />)
		expect(seen[0]).toBe(seen[1])

		await act(() => setLanguage('fr'))
		expect(seen.at(-1)).not.toBe(seen[0])
	})
})

describe('plurals', () => {
	const pluralMessages = registerI18nModule(
		'test/Plurals.i18n',
		'en',
		{
			files_zero: 'No files',
			files_one: '{{count}} file',
			files_other: '{{count}} files',
		},
		{
			ar: () =>
				Promise.resolve({
					default: {
						files_zero: 'لا ملفات',
						files_one: 'ملف واحد',
						files_two: 'ملفان',
						files_few: '{{count}} ملفات',
						files_many: '{{count}} ملفًا',
						files_other: '{{count}} ملف',
					},
				}),
			// Russian: no zero form, so 0 uses the rules of the language.
			ru: () =>
				Promise.resolve({
					default: {
						files_one: '{{count}} файл',
						files_few: '{{count}} файла',
						files_many: '{{count}} файлов',
						files_other: '{{count}} файла',
					},
				}),
		},
	)

	it('uses the zero form when the file has it', () => {
		expect(tFor(pluralMessages)('files', { count: 0 })).toBe('No files')
		expect(tFor(pluralMessages)('files', { count: 1 })).toBe('1 file')
		expect(tFor(pluralMessages)('files', { count: 5 })).toBe('5 files')
	})

	it('uses every plural form of the language', async () => {
		await setLanguage('ar')
		expect(
			[0, 1, 2, 3, 11, 100].map((count) =>
				tFor(pluralMessages)('files', { count }),
			),
		).toEqual([
			'لا ملفات',
			'ملف واحد',
			'ملفان',
			'3 ملفات',
			'11 ملفًا',
			'100 ملف',
		])
	})

	it('falls back to the plural rules of the language for a count of 0', async () => {
		await setLanguage('ru')
		expect(
			[0, 1, 3, 5].map((count) =>
				tFor(pluralMessages)('files', { count }),
			),
		).toEqual(['0 файлов', '1 файл', '3 файла', '5 файлов'])
	})
})

describe('language tags', () => {
	const tagMessages = registerI18nModule(
		'test/Tags.i18n',
		'en',
		{ title: 'Title', color: 'Color', size: 'Size' },
		{
			pt: () =>
				Promise.resolve({ default: { title: 'Título', color: 'Cor' } }),
			'pt-BR': () => Promise.resolve({ default: { color: 'Cor (BR)' } }),
			'zh-Hant': () => Promise.resolve({ default: { title: '標題' } }),
		},
	)

	it('falls back from the regional language to its language, then to the default language', async () => {
		await setLanguage('pt-BR')
		expect(tFor(tagMessages)('color')).toBe('Cor (BR)')
		expect(tFor(tagMessages)('title')).toBe('Título')
		expect(tFor(tagMessages)('size')).toBe('Size')
	})

	it('writes a tag in its canonical form', async () => {
		await setLanguage('pt-br')
		expect(getLanguage()).toBe('pt-BR')
		expect(tFor(tagMessages)('color')).toBe('Cor (BR)')
	})

	it('uses the strings of a less specific tag with a script', async () => {
		await setLanguage('zh-Hant-TW')
		expect(tFor(tagMessages)('title')).toBe('標題')
	})

	it('uses the default language for a regional tag of it', async () => {
		await setLanguage('en-US')
		expect(tFor(tagMessages)('title')).toBe('Title')
	})
})

describe('the language of the app', () => {
	it('is the language of every useI18n', async () => {
		expect(tFor(messages)('items', { count: 1 })).toBe('1 item')
		await setLanguage('fr-CA')
		expect(getLanguage()).toBe('fr-CA')
		expect(tFor(messages)('items', { count: 1 })).toBe('1 élément')
	})

	it('loads a language once', async () => {
		const loadsBefore = frenchLoads
		await setLanguage('fr')
		await setLanguage('en')
		await setLanguage('fr')
		expect(frenchLoads - loadsBefore).toBeLessThanOrEqual(1)
	})
})

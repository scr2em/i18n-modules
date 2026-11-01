import '@testing-library/jest-dom/vitest'
import { act, render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import {
	getLanguage,
	registerI18nModule,
	setLanguage,
	translate,
	useI18n,
} from './index.ts'

// What `import messages from './Greeting.i18n.json'` gives, made by hand: the
// test runs the runtime without the Vite plugin.
const english = {
	greeting: { title: 'Hello {{name}}' },
	onlyInEnglish: 'Only English',
	items_one: '{{count}} item',
	items_other: '{{count}} items',
}
let frenchLoads = 0
// TypeScript types an import as the file's JSON; this stands in for it.
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
}) as unknown as { en: typeof english }

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
		) as unknown as { en: { title: string } }
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
	) as unknown as {
		en: { files_zero: string; files_one: string; files_other: string }
	}

	it('uses the zero form when the file has it', () => {
		expect(translate(pluralMessages, 'files', { count: 0 })).toBe('No files')
		expect(translate(pluralMessages, 'files', { count: 1 })).toBe('1 file')
		expect(translate(pluralMessages, 'files', { count: 5 })).toBe('5 files')
	})

	it('uses every plural form of the language', async () => {
		await setLanguage('ar')
		expect(
			[0, 1, 2, 3, 11, 100].map((count) =>
				translate(pluralMessages, 'files', { count }),
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
				translate(pluralMessages, 'files', { count }),
			),
		).toEqual(['0 файлов', '1 файл', '3 файла', '5 файлов'])
	})
})

describe('translate', () => {
	it('reads a string outside React in the current language', async () => {
		expect(translate(messages, 'items', { count: 1 })).toBe('1 item')
		await setLanguage('fr-CA')
		expect(getLanguage()).toBe('fr-CA')
		expect(translate(messages, 'items', { count: 1 })).toBe('1 élément')
	})

	it('loads a language once', async () => {
		const loadsBefore = frenchLoads
		await setLanguage('fr')
		await setLanguage('en')
		await setLanguage('fr')
		expect(frenchLoads - loadsBefore).toBeLessThanOrEqual(1)
	})
})

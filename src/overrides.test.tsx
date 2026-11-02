import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
	I18nOverrides,
	registerI18nModule,
	setLanguage,
	Trans,
	useI18n,
} from './index.ts'

const pageMessages = registerI18nModule(
	'test/OverridePage.i18n',
	'en',
	{
		title: 'Title',
		subtitle: 'Subtitle',
		greeting: 'Hello {{name}}',
		terms: 'Accept the <link>terms</link>',
		items_one: '{{count}} item',
		items_other: '{{count}} items',
	},
	{
		fr: () =>
			Promise.resolve({ default: { title: 'Titre', subtitle: 'Sous-titre' } }),
	},
)
const cardMessages = registerI18nModule(
	'test/OverrideCard.i18n',
	'en',
	{ title: 'Card' },
	{},
)

function Page({ testId = 'page' }: { testId?: string }) {
	const { t } = useI18n(pageMessages)
	return (
		<p data-testid={testId}>
			{t('title')} | {t('subtitle')} | {t('greeting', { name: 'Ada' })} |{' '}
			{t('items', { count: 1 })} | {t('items', { count: 2 })}
		</p>
	)
}

function Card() {
	const { t } = useI18n(cardMessages)
	return <p data-testid="card">{t('title')}</p>
}

afterEach(async () => {
	vi.restoreAllMocks()
	await act(() => setLanguage('en'))
})

describe('I18nOverrides', () => {
	it('replaces strings in its subtree only, and keeps the others', () => {
		render(
			<>
				<Page testId="outside" />
				<I18nOverrides
					messages={pageMessages}
					strings={{ title: 'Custom title', greeting: 'Hi {{name}}!' }}
				>
					<Page testId="inside" />
				</I18nOverrides>
			</>,
		)
		expect(screen.getByTestId('outside')).toHaveTextContent(
			'Title | Subtitle | Hello Ada | 1 item | 2 items',
		)
		expect(screen.getByTestId('inside')).toHaveTextContent(
			'Custom title | Subtitle | Hi Ada! | 1 item | 2 items',
		)
	})

	it('replaces only the exact plural form', () => {
		render(
			<I18nOverrides
				messages={pageMessages}
				strings={{ items_other: '{{count}} things' }}
			>
				<Page />
			</I18nOverrides>,
		)
		// `items_one` still comes from the file.
		expect(screen.getByTestId('page')).toHaveTextContent('1 item | 2 things')
	})

	it('shows the file text while the strings are not there yet', () => {
		const { rerender } = render(
			<I18nOverrides
				messages={pageMessages}
				strings={undefined}
			>
				<Page />
			</I18nOverrides>,
		)
		expect(screen.getByTestId('page')).toHaveTextContent('Title |')
		rerender(
			<I18nOverrides
				messages={pageMessages}
				strings={{ title: 'Loaded' }}
			>
				<Page />
			</I18nOverrides>,
		)
		expect(screen.getByTestId('page')).toHaveTextContent('Loaded |')
	})

	it('applies strings with a language to that language only', async () => {
		await act(() => setLanguage('fr'))
		await act(() => setLanguage('en'))
		render(
			<I18nOverrides
				messages={pageMessages}
				strings={{ title: 'Titre perso' }}
				language="fr"
			>
				<Page />
			</I18nOverrides>,
		)
		expect(screen.getByTestId('page')).toHaveTextContent('Title |')
		await act(() => setLanguage('fr-CA'))
		expect(screen.getByTestId('page')).toHaveTextContent(
			'Titre perso | Sous-titre',
		)
	})

	it('lets an inner override win, and scopes each one to its file', () => {
		render(
			<I18nOverrides
				messages={pageMessages}
				strings={{ title: 'Outer', subtitle: 'Outer sub' }}
			>
				<I18nOverrides
					messages={pageMessages}
					strings={{ title: 'Inner' }}
				>
					<I18nOverrides
						messages={cardMessages}
						strings={{ title: 'Custom card' }}
					>
						<Page />
						<Card />
					</I18nOverrides>
				</I18nOverrides>
			</I18nOverrides>,
		)
		expect(screen.getByTestId('page')).toHaveTextContent('Inner | Outer sub')
		expect(screen.getByTestId('card')).toHaveTextContent('Custom card')
	})

	it('also replaces the text of <Trans>, with its tags', () => {
		const { container } = render(
			<I18nOverrides
				messages={pageMessages}
				strings={{ terms: 'Read the <link>rules</link>' }}
			>
				<Trans
					messages={pageMessages}
					i18nKey="terms"
					components={{ link: <a href="/rules" /> }}
				/>
			</I18nOverrides>,
		)
		expect(container.innerHTML).toBe('Read the <a href="/rules">rules</a>')
	})

	it('keeps t the same while the strings are the same object', () => {
		const strings = { title: 'Custom title' }
		const seen: unknown[] = []
		function Recorder() {
			seen.push(useI18n(pageMessages).t)
			return null
		}
		const { rerender } = render(
			<I18nOverrides
				messages={pageMessages}
				strings={strings}
			>
				<Recorder />
			</I18nOverrides>,
		)
		rerender(
			<I18nOverrides
				messages={pageMessages}
				strings={strings}
			>
				<Recorder />
			</I18nOverrides>,
		)
		expect(seen[0]).toBe(seen[1])
	})

	it('warns in development about unknown keys and new {{names}}', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
		// Remote text has no types: the cast stands for a fetched JSON.
		const remote = { unknown: 'x', greeting: 'Hi {{nickname}}' } as never
		render(
			<I18nOverrides
				messages={pageMessages}
				strings={remote}
			>
				<Page />
			</I18nOverrides>,
		)
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('has no string "unknown"'),
		)
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('{{nickname}}'))
	})

	it('types the keys of the strings', () => {
		function TypeChecks() {
			return (
				<>
					<I18nOverrides
						messages={pageMessages}
						// @ts-expect-error -- the file has no key `missing`
						strings={{ missing: 'x' }}
					/>
					<I18nOverrides
						messages={pageMessages}
						// @ts-expect-error -- a string must be a string
						strings={{ title: 1 }}
					/>
				</>
			)
		}
		expect(TypeChecks).toBeTypeOf('function')
	})
})

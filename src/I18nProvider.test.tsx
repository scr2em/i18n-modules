import '@testing-library/jest-dom/vitest'
import { act, render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import {
	I18nProvider,
	registerI18nModule,
	setLanguage,
	translate,
	useI18n,
} from './index.ts'

const messages = registerI18nModule(
	'test/Provider.i18n',
	'en',
	{ title: 'Title' },
	{
		fr: () => Promise.resolve({ default: { title: 'Titre' } }),
		de: () => Promise.resolve({ default: { title: 'Titel' } }),
	},
)

function Title({ testId }: { testId: string }) {
	const { t, language } = useI18n(messages)
	return (
		<p data-testid={testId}>
			{t('title')} ({language})
		</p>
	)
}

afterEach(async () => {
	await act(() => setLanguage('en'))
})

describe('I18nProvider', () => {
	it('sets the language of its subtree only', async () => {
		// The provider's language must be loaded, or the subtree suspends.
		await act(() => setLanguage('fr'))
		await act(() => setLanguage('en'))

		render(
			<>
				<Title testId="outside" />
				<I18nProvider language="fr">
					<Title testId="inside" />
				</I18nProvider>
			</>,
		)

		expect(screen.getByTestId('outside')).toHaveTextContent('Title (en)')
		expect(screen.getByTestId('inside')).toHaveTextContent('Titre (fr)')
	})

	it('lets the innermost provider win', async () => {
		await act(() => setLanguage('fr'))
		await act(() => setLanguage('de'))
		await act(() => setLanguage('en'))

		render(
			<I18nProvider language="fr">
				<Title testId="french" />
				<I18nProvider language="de">
					<Title testId="german" />
				</I18nProvider>
			</I18nProvider>,
		)

		expect(screen.getByTestId('french')).toHaveTextContent('Titre (fr)')
		expect(screen.getByTestId('german')).toHaveTextContent('Titel (de)')
	})

	it('keeps its language when the language of the app changes', async () => {
		render(
			<>
				<Title testId="outside" />
				<I18nProvider language="en">
					<Title testId="inside" />
				</I18nProvider>
			</>,
		)

		await act(() => setLanguage('fr'))

		expect(screen.getByTestId('outside')).toHaveTextContent('Titre (fr)')
		expect(screen.getByTestId('inside')).toHaveTextContent('Title (en)')
	})

	it('waits for the strings of a language that is not loaded yet', async () => {
		const lateMessages = registerI18nModule(
			'test/ProviderLate.i18n',
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
				<Suspense>
					<I18nProvider language="fr">
						<Late />
					</I18nProvider>
				</Suspense>,
			)
		})

		expect(screen.getByText('Tardif')).toBeInTheDocument()
		expect(screen.queryByText('Late')).not.toBeInTheDocument()
	})

	it('does not change translate, which uses the language of the app', () => {
		render(
			<I18nProvider language="fr">
				<Title testId="inside" />
			</I18nProvider>,
		)
		expect(translate(messages, 'title')).toBe('Title')
	})
})

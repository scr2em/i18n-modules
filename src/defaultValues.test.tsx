import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import {
	registerI18nModule,
	setDefaultValues,
	setLanguage,
	useI18n,
} from './index.ts'
import { tFor } from './testUtils.ts'

declare module './index.ts' {
	interface DefaultValues {
		staffName: string
	}
}

const messages = registerI18nModule(
	'test/DefaultValues.i18n',
	'en',
	{
		staff: '{{staffName}}',
		staffCount: '{{count}} {{staffName}}',
		total: 'Total: {{count, number}}',
		greeting: 'Hello {{name}}',
	},
	{},
)

afterEach(async () => {
	setDefaultValues({})
	await act(() => setLanguage('en'))
})

describe('setDefaultValues', () => {
	it('fills the names that have a default value, and re-renders', () => {
		function Staff() {
			const { t } = useI18n(messages)
			return <p>{t('staff')}</p>
		}
		setDefaultValues({ staffName: 'Agents' })
		render(<Staff />)
		expect(screen.getByText('Agents')).toBeTruthy()

		act(() => setDefaultValues({ staffName: 'Reps' }))
		expect(screen.getByText('Reps')).toBeTruthy()
	})

	it('lets a value in t() win over the default value', () => {
		setDefaultValues({ staffName: 'Agents' })
		expect(tFor(messages)('staffCount', { count: 2, staffName: 'Reps' })).toBe(
			'2 Reps',
		)
	})

	it('types the default names as optional, and the others as required', () => {
		expect(tFor(messages)('staff')).toBe('{{staffName}}')
		// @ts-expect-error -- `count` has no default value
		tFor(messages)('staffCount')
		// @ts-expect-error -- `name` has no default value
		tFor(messages)('greeting')
	})
})

describe('values', () => {
	it('renders null and undefined as an empty string', () => {
		expect(tFor(messages)('greeting', { name: undefined })).toBe('Hello ')
		expect(tFor(messages)('greeting', { name: null })).toBe('Hello ')
	})

	it('formats {{count, number}} with the language', async () => {
		expect(tFor(messages)('total', { count: 1234567 })).toBe(
			'Total: 1,234,567',
		)
		await setLanguage('de')
		expect(tFor(messages)('total', { count: 1234567 })).toBe(
			'Total: 1.234.567',
		)
	})
})

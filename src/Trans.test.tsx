import '@testing-library/jest-dom/vitest'
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { registerI18nModule, setLanguage, Trans } from './index.ts'

const english = {
	terms: 'I accept the <link>terms</link>.',
	nested: 'Read <bold>the <link>guide</link> first</bold>.',
	lineBreak: 'One<br/>Two',
	greeting: 'Hello <bold>{{name}}</bold>',
	unknown: 'A <script>tag</script> and a <b>stray close</bold>.',
	unclosed: 'Start <bold>never closed',
	files_one: '<bold>{{count}}</bold> file',
	files_other: '<bold>{{count}}</bold> files',
} as const
const messages = registerI18nModule('test/Trans.i18n', 'en', english, {
	fr: () =>
		Promise.resolve({
			default: { terms: "J'accepte les <link>conditions</link>." },
		}),
})

const components = {
	link: <a href="/terms" />,
	bold: <strong />,
	br: <br />,
}

afterEach(async () => {
	await act(() => setLanguage('en'))
})

describe('Trans', () => {
	it('puts the text between the tags in the elements', () => {
		const { container } = render(
			<Trans messages={messages} i18nKey="terms" components={components} />,
		)
		expect(container.innerHTML).toBe(
			'I accept the <a href="/terms">terms</a>.',
		)
	})

	it('renders tags inside other tags', () => {
		const { container } = render(
			<Trans messages={messages} i18nKey="nested" components={components} />,
		)
		expect(container.innerHTML).toBe(
			'Read <strong>the <a href="/terms">guide</a> first</strong>.',
		)
	})

	it('renders a self-closing tag with no children', () => {
		const { container } = render(
			<Trans messages={messages} i18nKey="lineBreak" components={components} />,
		)
		expect(container.innerHTML).toBe('One<br>Two')
	})

	it('puts values in, and never reads a value as a tag', () => {
		const { container } = render(
			<Trans
				messages={messages}
				i18nKey="greeting"
				values={{ name: '<link>Ada</link>' }}
				components={components}
			/>,
		)
		expect(container.innerHTML).toBe(
			'Hello <strong>&lt;link&gt;Ada&lt;/link&gt;</strong>',
		)
	})

	it('shows unknown, stray and unclosed tags as text', () => {
		const { container, rerender } = render(
			// @ts-expect-error -- the test leaves out the `script` and `b` tags
			<Trans messages={messages} i18nKey="unknown" components={components} />,
		)
		expect(container.textContent).toBe(
			'A <script>tag</script> and a <b>stray close</bold>.',
		)
		expect(container.querySelector('script')).toBeNull()

		rerender(
			<Trans messages={messages} i18nKey="unclosed" components={components} />,
		)
		expect(container.textContent).toBe('Start <bold>never closed')
	})

	it('picks the plural form from count', () => {
		const { container } = render(
			<Trans
				messages={messages}
				i18nKey="files"
				values={{ count: 3 }}
				components={components}
			/>,
		)
		expect(container.innerHTML).toBe('<strong>3</strong> files')
	})

	it('changes with the language', async () => {
		render(
			<Trans messages={messages} i18nKey="terms" components={components} />,
		)
		await act(() => setLanguage('fr'))
		expect(screen.getByRole('link')).toHaveTextContent('conditions')
	})

	it('types the key and the values', () => {
		function TypeChecks() {
			return (
				<>
					{/* @ts-expect-error -- a key that the file does not have */}
					<Trans messages={messages} i18nKey="missing" />
					{/* @ts-expect-error -- a plural key needs a count */}
					<Trans messages={messages} i18nKey="files" components={components} />
					{/* @ts-expect-error -- the text has {{name}} */}
					<Trans messages={messages} i18nKey="greeting" components={components} />
					<Trans
						messages={messages}
						i18nKey="greeting"
						// @ts-expect-error -- the name in the text is `name`
						values={{ nmae: 'Ada' }}
						components={components}
					/>
					{/* @ts-expect-error -- the text has a <link> tag */}
					<Trans messages={messages} i18nKey="terms" components={{}} />
					{/* @ts-expect-error -- the text has <bold> and <link> tags */}
					<Trans messages={messages} i18nKey="nested" components={{ bold: <strong /> }} />
				</>
			)
		}
		expect(TypeChecks).toBeTypeOf('function')
	})
})

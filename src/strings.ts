import { readFileSync } from 'node:fs'
import { parseAst } from 'vite'

/**
 * Reads a `Name.i18n.ts` file without running it:
 *
 *   import { defineMessages } from '@scr2em/i18n-modules'
 *
 *   export default defineMessages({
 *     en: { title: 'Files' },
 *     fr: { title: 'Fichiers' },
 *   })
 *
 * The object must be a literal: keys, nested objects and strings only. The
 * Vite plugin puts each language in its own chunk, so it must know the strings
 * at build time.
 */

export type Messages = { [key: string]: string | Messages }

export const FILE_SUFFIX = '.i18n.ts'

/** `./Page.i18n.ts`, or `./Page.i18n` with no extension. */
export function isStringsSpecifier(source: string): boolean {
	return source.endsWith(FILE_SUFFIX) || source.endsWith('.i18n')
}

export function readLanguages(file: string): Record<string, Messages> {
	const source = readFileSync(file, 'utf8')
	let program: AstNode
	try {
		program = parseAst(source, { lang: 'ts' } as never) as unknown as AstNode
	} catch (error) {
		throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`)
	}
	const exported = (program.body as AstNode[]).find(
		(statement) => statement.type === 'ExportDefaultDeclaration',
	)
	if (!exported) {
		throw new Error(
			`${file}: export the strings with \`export default defineMessages({ en: { … } })\``,
		)
	}
	const value = literalValue(unwrap(exported.declaration as AstNode), file, source)
	if (typeof value === 'string') {
		throw new Error(`${file}: the strings must be an object with one object per language`)
	}
	const languages: Record<string, Messages> = {}
	for (const [language, messages] of Object.entries(value)) {
		if (typeof messages === 'string') {
			throw new Error(`${file}: "${language}" must be an object of strings`)
		}
		languages[language] = messages
	}
	return languages
}

type AstNode = { type: string; start: number; [key: string]: unknown }

/** `defineMessages({…})`, `{…} as const` and `{…} satisfies …` give `{…}`. */
function unwrap(node: AstNode): AstNode {
	if (
		node.type === 'CallExpression' &&
		(node.callee as AstNode).type === 'Identifier' &&
		(node.callee as { name: string }).name === 'defineMessages'
	) {
		return unwrap((node.arguments as AstNode[])[0])
	}
	if (
		node.type === 'TSAsExpression' ||
		node.type === 'TSSatisfiesExpression' ||
		node.type === 'ParenthesizedExpression'
	) {
		return unwrap(node.expression as AstNode)
	}
	return node
}

function literalValue(node: AstNode | undefined, file: string, source: string): string | Messages {
	const fail = (what: string): never => {
		const line = node ? source.slice(0, node.start).split('\n').length : 1
		throw new Error(
			`${file}:${line}: ${what}. A strings file has keys, nested objects and string literals only.`,
		)
	}
	if (!node) return fail('the strings are missing')
	if (node.type === 'Literal' && typeof node.value === 'string') {
		return node.value
	}
	if (node.type === 'TemplateLiteral') {
		const quasis = node.quasis as { value: { cooked: string } }[]
		if ((node.expressions as unknown[]).length > 0) {
			return fail('a template literal with `${…}` is not a string literal (use `{{name}}`)')
		}
		return quasis[0].value.cooked
	}
	if (node.type !== 'ObjectExpression') {
		return fail(`a ${node.type} is not a string or an object`)
	}
	const messages: Messages = {}
	for (const property of node.properties as AstNode[]) {
		if (property.type !== 'Property' || property.computed) {
			fail('only plain keys are allowed (no spread or computed keys)')
		}
		const key = property.key as AstNode & { name?: string; value?: unknown }
		const name =
			key.type === 'Identifier'
				? key.name
				: typeof key.value === 'string'
					? key.value
					: fail('a key must be a name or a string')
		messages[name as string] = literalValue(property.value as AstNode, file, source)
	}
	return messages
}

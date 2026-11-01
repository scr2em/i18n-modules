/**
 * oxlint JS plugin for `@scr2em/i18n-modules`. Add it to `.oxlintrc.json`:
 *
 *   "jsPlugins": ["@scr2em/i18n-modules/oxlint"],
 *   "rules": {
 *     "i18n-modules/static-keys": "error",
 *     "i18n-modules/colocated-messages": "error",
 *     "i18n-modules/no-messages-access": "error"
 *   }
 *
 * - `static-keys`: the key given to `t()` (from `useI18n`), `translate()` or
 *   `<Trans i18nKey>` is a string literal, so tools can find every key.
 * - `colocated-messages`: a file imports only its own strings, `Name.i18n.json`
 *   next to `Name.tsx`, as with CSS Modules. Tests and stories
 *   (`Name.test.tsx`, `Name.spec.tsx`, `Name.stories.tsx`) can import them
 *   too. A dynamic import or a re-export of a `.i18n.json` file is reported,
 *   because it lets other files read the strings. The Vite plugin also fails
 *   the build for an import from a different file.
 * - `no-messages-access`: the imported strings go only to `useI18n`,
 *   `translate` or `<Trans messages>`. At runtime the import is not the JSON, so `messages.en.title`
 *   is `undefined`.
 */

const FILE_SUFFIX = '.i18n.json'
const PACKAGE = '@scr2em/i18n-modules'

function isStringLiteral(node) {
	return (
		(node?.type === 'Literal' && typeof node.value === 'string') ||
		(node?.type === 'TemplateLiteral' && node.expressions.length === 0)
	)
}

function isI18nJsonImport(node) {
	return (
		typeof node.source.value === 'string' &&
		node.source.value.endsWith(FILE_SUFFIX)
	)
}

/** The local names of `useI18n`, `translate` and `Trans` imported from the
 *  package. */
function packageImports(program) {
	const names = { useI18n: new Set(), translate: new Set(), Trans: new Set() }
	for (const statement of program.body) {
		if (
			statement.type !== 'ImportDeclaration' ||
			statement.source.value !== PACKAGE
		) {
			continue
		}
		for (const specifier of statement.specifiers) {
			if (specifier.type !== 'ImportSpecifier') continue
			const imported = specifier.imported.name ?? specifier.imported.value
			if (imported in names) names[imported].add(specifier.local.name)
		}
	}
	return names
}

function calleeName(node) {
	return node.callee.type === 'Identifier' ? node.callee.name : undefined
}

/** The attribute `name` of a JSX opening element. */
function jsxAttribute(element, name) {
	return element.attributes.find(
		(attribute) =>
			attribute.type === 'JSXAttribute' && attribute.name.name === name,
	)
}

function isTransElement(element, imports) {
	return (
		element?.type === 'JSXOpeningElement' &&
		element.name.type === 'JSXIdentifier' &&
		imports.Trans.has(element.name.name)
	)
}

const staticKeys = {
	meta: { type: 'problem' },
	create(context) {
		let imports = { useI18n: new Set(), translate: new Set(), Trans: new Set() }
		const translateFunctions = new Set()
		const calls = []
		const report = (node) =>
			context.report({
				node,
				message:
					'Give the i18n key as a string literal. Tools find keys only in string literals.',
			})
		return {
			Program(node) {
				imports = packageImports(node)
			},
			VariableDeclarator(node) {
				if (
					node.init?.type !== 'CallExpression' ||
					!imports.useI18n.has(calleeName(node.init)) ||
					node.id.type !== 'ObjectPattern'
				) {
					return
				}
				for (const property of node.id.properties) {
					if (
						property.type === 'Property' &&
						property.key.type === 'Identifier' &&
						property.key.name === 't' &&
						property.value.type === 'Identifier'
					) {
						translateFunctions.add(property.value.name)
					}
				}
			},
			CallExpression(node) {
				calls.push(node)
			},
			JSXOpeningElement(node) {
				if (!isTransElement(node, imports)) return
				const attribute = jsxAttribute(node, 'i18nKey')
				const value =
					attribute?.value?.type === 'JSXExpressionContainer'
						? attribute.value.expression
						: attribute?.value
				if (!isStringLiteral(value)) report(attribute ?? node)
			},
			'Program:exit'() {
				for (const call of calls) {
					const name = calleeName(call)
					if (translateFunctions.has(name)) {
						if (!isStringLiteral(call.arguments[0])) report(call)
					} else if (imports.translate.has(name)) {
						if (!isStringLiteral(call.arguments[1])) report(call)
					}
				}
			},
		}
	},
}

const IMPORTER_SUFFIX = /\.(?:test|spec|stories)$/

const colocatedMessages = {
	meta: { type: 'problem' },
	create(context) {
		const filename = context.filename ?? context.getFilename()
		// `Page` for `Page.tsx`, `Page.test.tsx` and `Page.stories.tsx`.
		const ownerName = filename
			.split(/[\\/]/)
			.pop()
			.replace(/\.[^.]+$/, '')
			.replace(IMPORTER_SUFFIX, '')
		const expected = `./${ownerName}${FILE_SUFFIX}`
		const reportReExport = (node) =>
			context.report({
				node: node.source,
				message:
					'Do not export a .i18n.json file. Other files could then read its strings.',
			})
		return {
			ImportDeclaration(node) {
				if (!isI18nJsonImport(node) || node.source.value === expected) return
				context.report({
					node: node.source,
					message: `Import only the strings of this file, from '${expected}'. To use the same text in a different file, put it in that file's own .i18n.json file.`,
				})
			},
			ImportExpression(node) {
				const source = node.source
				const isI18nJson =
					(source.type === 'Literal' &&
						typeof source.value === 'string' &&
						source.value.endsWith(FILE_SUFFIX)) ||
					(source.type === 'TemplateLiteral' &&
						source.quasis.some((quasi) =>
							quasi.value.raw.includes(FILE_SUFFIX),
						))
				if (!isI18nJson) return
				context.report({
					node: source,
					message:
						'Do not import a .i18n.json file with import(). Import the strings of this file with a static import.',
				})
			},
			ExportNamedDeclaration(node) {
				if (node.source && isI18nJsonImport(node)) reportReExport(node)
			},
			ExportAllDeclaration(node) {
				if (isI18nJsonImport(node)) reportReExport(node)
			},
		}
	},
}

const noMessagesAccess = {
	meta: { type: 'problem' },
	create(context) {
		let imports = { useI18n: new Set(), translate: new Set(), Trans: new Set() }
		const messageNames = new Set()
		return {
			Program(node) {
				imports = packageImports(node)
				for (const statement of node.body) {
					if (
						statement.type !== 'ImportDeclaration' ||
						!isI18nJsonImport(statement)
					) {
						continue
					}
					for (const specifier of statement.specifiers) {
						if (specifier.type === 'ImportDefaultSpecifier') {
							messageNames.add(specifier.local.name)
						} else {
							context.report({
								node: specifier,
								message: 'Import the .i18n.json file as a default import.',
							})
						}
					}
				}
			},
			Identifier(node) {
				if (!messageNames.has(node.name)) return
				const parent = node.parent
				const isDeclaration = parent.type === 'ImportDefaultSpecifier'
				const isPropertyName =
					(parent.type === 'MemberExpression' &&
						parent.property === node &&
						!parent.computed) ||
					(parent.type === 'Property' && parent.key === node && !parent.shorthand)
				const isI18nArgument =
					parent.type === 'CallExpression' &&
					parent.arguments[0] === node &&
					(imports.useI18n.has(calleeName(parent)) ||
						imports.translate.has(calleeName(parent)))
				const isTransMessages =
					parent.type === 'JSXExpressionContainer' &&
					parent.parent?.type === 'JSXAttribute' &&
					parent.parent.name.name === 'messages' &&
					isTransElement(parent.parent.parent, imports)
				if (isDeclaration || isPropertyName || isI18nArgument || isTransMessages)
					return
				context.report({
					node,
					message: `Give '${node.name}' only to useI18n(), translate() or <Trans messages>. At runtime it is not the JSON of the file.`,
				})
			},
		}
	},
}

export default {
	meta: { name: 'i18n-modules' },
	rules: {
		'static-keys': staticKeys,
		'colocated-messages': colocatedMessages,
		'no-messages-access': noMessagesAccess,
	},
}

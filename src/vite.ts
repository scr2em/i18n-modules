import { realpathSync } from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Plugin } from 'vite'

import {
	FILE_SUFFIX,
	findStringsFiles,
	isStringsSpecifier,
	type Messages,
	readLanguages,
} from './strings.ts'

/**
 * Lets a component or util keep its own strings next to it, in a
 * `Name.i18n.ts` file with one object per language:
 *
 *   export default defineMessages({
 *     en: { title: 'Files' },
 *     fr: { title: 'Fichiers' },
 *   })
 *
 * Importing the file registers its strings, under a namespace made from its
 * path. Read them with `useI18n` from `@scr2em/i18n-modules`. TypeScript
 * reads the file itself, so the keys, the `{{values}}` and the tags are typed
 * with no generated files.
 *
 * - The default language is put in the importer's chunk, so the strings load
 *   with the code that uses them.
 * - Every other language goes to its own chunk, which loads only when the user
 *   uses that language.
 * - Only the file with the same name in the same folder can import it:
 *   `Page.i18n.ts` is for `Page.tsx`, and for its tests and stories
 *   (`Page.test.tsx`, `Page.spec.tsx`, `Page.stories.tsx`). An import from a
 *   different file fails the dev server (error overlay) and the build.
 * - The strings must be literals (keys, nested objects and strings), because
 *   the plugin reads them at build time to split the languages.
 * - The languages are BCP 47 tags, such as `en`, `fr` or `pt-BR`, written in
 *   their canonical form (`pt-BR`, not `pt-br`).
 * - Every language must have the same keys as the default language. A
 *   regional language can leave out keys when the file has its less specific
 *   language: `pt-BR` falls back to `pt`. A missing
 *   or extra key fails the dev server (error overlay) and the build. Plural
 *   forms (`_one`, `_other`, …) can differ, because languages have different
 *   plural rules.
 */
export function i18nModules({
	runtime = RUNTIME,
	defaultLanguage = 'en',
	sharedStrings = false,
}: {
	/** The module that exports `registerI18nModule`, as a path from the
	 *  project root. The default is this package's runtime. A path alias
	 *  would not work: the generated module is virtual, so it has no folder
	 *  to resolve an alias from. */
	runtime?: string
	defaultLanguage?: string
	/**
	 * Experimental, in builds only (like Tailwind): puts the unique strings of
	 * the default language of all files in one shared table, and each strings
	 * module holds indexes into it. Dev stays scoped. Default: false.
	 */
	sharedStrings?: boolean
} = {}): Plugin {
	let root = process.cwd()
	let isBuild = false
	/** For each language, the index of each unique string in its shared
	 *  table, in builds with `sharedStrings`. */
	let tables: Map<string, Map<string, number>> | undefined

	return {
		name: 'i18n-modules',
		enforce: 'pre',
		configResolved(config) {
			// Resolved files have real paths, so the root must have one too.
			root = realpathSync(config.root)
			isBuild = config.command === 'build'
		},
		buildStart() {
			if (!sharedStrings || !isBuild) {
				return
			}
			// Like Tailwind scans its content: all strings files of the project.
			// One table for each language, which loads with that language.
			const counts = new Map<string, Map<string, number>>()
			for (const file of findStringsFiles(root)) {
				for (const [language, messages] of Object.entries(readLanguages(file))) {
					const languageCounts = counts.get(language) ?? new Map<string, number>()
					for (const text of leaves(messages)) {
						languageCounts.set(text, (languageCounts.get(text) ?? 0) + 1)
					}
					counts.set(language, languageCounts)
				}
			}
			// The most used strings first, so they get the shortest indexes.
			tables = new Map(
				[...counts.entries()].map(([language, languageCounts]) => [
					language,
					new Map(
						[...languageCounts.entries()]
							.sort(([, first], [, second]) => second - first)
							.map(([text], index) => [text, index]),
					),
				]),
			)
		},
		async resolveId(source, importer) {
			if (source.startsWith(LANGUAGE_SPECIFIER) || source.startsWith(TABLE_SPECIFIER)) {
				return `\0${source}`
			}
			if (!isStringsSpecifier(source)) {
				return null
			}
			// The file itself, which `load` watches with `addWatchFile`: Vite
			// resolves watched files in dev and in Vitest. It is not an import.
			if (importer?.startsWith(MODULE_ID)) {
				return null
			}
			const resolved = await this.resolve(source, importer, { skipSelf: true })
			if (!resolved) {
				return null
			}
			const problem = importerProblem(resolved.id, importer)
			if (problem) {
				this.error(problem)
			}
			return `${MODULE_ID}${resolved.id}${MODULE_ID_END}`
		},
		load(id) {
			if (id.startsWith(`\0${TABLE_SPECIFIER}`) && tables) {
				const language = id.slice(1 + TABLE_SPECIFIER.length)
				return {
					code: `export default ${JSON.stringify([...(tables.get(language)?.keys() ?? [])])}`,
					moduleType: 'js',
				}
			}
			if (id.startsWith(MODULE_ID) && id.endsWith(MODULE_ID_END)) {
				const file = id.slice(MODULE_ID.length, -MODULE_ID_END.length)
				this.addWatchFile(file)
				const languages = readLanguages(file)
				const problems = findKeyProblems(languages, defaultLanguage)
				if (problems.length > 0) {
					this.error(`${relative(root, file)}:\n${problems.join('\n')}`)
				}
				const loaders = Object.keys(languages)
					.filter((language) => language !== defaultLanguage)
					.map(
						(language) =>
							`${JSON.stringify(language)}: () => import(${JSON.stringify(`${LANGUAGE_SPECIFIER}${file}${LANGUAGE_SEPARATOR}${language}`)})`,
					)
				const registerArguments = `${JSON.stringify(namespaceOf(root, file))}, ${JSON.stringify(defaultLanguage)}`
				if (tables) {
					const index = tables.get(defaultLanguage) as Map<string, number>
					return {
						code: [
							`import { registerI18nModule } from ${JSON.stringify(resolve(root, runtime))}`,
							`import t from ${JSON.stringify(TABLE_SPECIFIER + defaultLanguage)}`,
							`export default registerI18nModule(${registerArguments}, ${tableCode(languages[defaultLanguage], index)}, { ${loaders.join(', ')} })`,
						].join('\n'),
						moduleType: 'js',
					}
				}
				return {
					code: [
						`import { registerI18nModule } from ${JSON.stringify(resolve(root, runtime))}`,
						`export default registerI18nModule(${registerArguments}, ${JSON.stringify(languages[defaultLanguage])}, { ${loaders.join(', ')} })`,
					].join('\n'),
					moduleType: 'js',
				}
			}
			if (id.startsWith(`\0${LANGUAGE_SPECIFIER}`)) {
				const specifier = id.slice(1 + LANGUAGE_SPECIFIER.length)
				const separatorIndex = specifier.lastIndexOf(LANGUAGE_SEPARATOR)
				const file = specifier.slice(0, separatorIndex)
				const language = specifier.slice(
					separatorIndex + LANGUAGE_SEPARATOR.length,
				)
				this.addWatchFile(file)
				const messages = readLanguages(file)[language] ?? {}
				const index = tables?.get(language)
				if (index) {
					return {
						code: `import t from ${JSON.stringify(TABLE_SPECIFIER + language)}\nexport default ${tableCode(messages, index)}`,
						moduleType: 'js',
					}
				}
				return {
					code: `export default ${JSON.stringify(messages)}`,
					moduleType: 'js',
				}
			}
			return null
		},
		// The modules have virtual ids, so Vite can't tie them to the file on
		// its own. Updating them lets React Fast Refresh re-render the importer.
		hotUpdate({ file }) {
			if (!file.endsWith(FILE_SUFFIX)) {
				return
			}
			const graph = this.environment.moduleGraph
			const modules = [...graph.idToModuleMap.entries()]
				.filter(
					([id]) =>
						id === `${MODULE_ID}${file}${MODULE_ID_END}` ||
						id.startsWith(
							`\0${LANGUAGE_SPECIFIER}${file}${LANGUAGE_SEPARATOR}`,
						),
				)
				.map(([, module]) => module)
			for (const module of modules) {
				graph.invalidateModule(module)
			}
			return modules
		},
	}
}

// `index.ts` next to this file in the source, `index.js` in the build.
const RUNTIME = fileURLToPath(
	new URL(
		import.meta.url.endsWith('.ts') ? './index.ts' : './index.js',
		import.meta.url,
	),
)
// The ids must not end in `.ts`, or Vite's TypeScript handling takes the module.
const MODULE_ID = '\0i18n-module:'
const MODULE_ID_END = '::module'
const LANGUAGE_SPECIFIER = 'i18n-module-language:'
const LANGUAGE_SEPARATOR = '::'
const TABLE_SPECIFIER = 'i18n-modules-table:'

function* leaves(messages: Messages): Generator<string> {
	for (const value of Object.values(messages)) {
		if (typeof value === 'string') yield value
		else yield* leaves(value)
	}
}

/** The messages as code that reads each string from the table `t`. */
function tableCode(messages: Messages, index: Map<string, number>): string {
	const entries = Object.entries(messages).map(
		([key, value]) =>
			`${JSON.stringify(key)}:${typeof value === 'string' ? `t[${index.get(value)}]` : tableCode(value, index)}`,
	)
	return `{${entries.join(',')}}`
}

/** The messages with the index of each string in the shared table. */
function toIndexes(
	messages: Messages,
	index: Map<string, number>,
): { [key: string]: number | object } {
	const result: { [key: string]: number | object } = {}
	for (const [key, value] of Object.entries(messages)) {
		result[key] =
			typeof value === 'string' ? (index.get(value) as number) : toIndexes(value, index)
	}
	return result
}
const PLURAL_SUFFIX = /_(?:zero|one|two|few|many|other)$/

const IMPORTER_SUFFIXES = ['', '.test', '.spec', '.stories']

/** The names of the files that can import `file`, without their extension. */
export function allowedImporters(file: string): string[] {
	const name = basename(file).slice(0, -FILE_SUFFIX.length)
	return IMPORTER_SUFFIXES.map((suffix) => `${name}${suffix}`)
}

/** Why `importer` cannot import `file`, or nothing when it can. */
function importerProblem(file: string, importer: string | undefined) {
	const importerFile = importer?.split('?')[0]
	if (!importerFile) {
		return undefined
	}
	const importerName = basename(importerFile).replace(/\.[^.]+$/, '')
	if (
		dirname(importerFile) === dirname(file) &&
		allowedImporters(file).includes(importerName)
	) {
		return undefined
	}
	const allowed = allowedImporters(file)
		.map((name) => `${name}.*`)
		.join(', ')
	return `${importerFile} cannot import ${file}. Only ${allowed} in the same folder can import it. To use the same text in a different file, put it in that file's own .i18n.ts file.`
}

function namespaceOf(root: string, file: string) {
	return relative(root, file).split('\\').join('/').slice(0, -'.ts'.length)
}

/** The key paths of `messages`, with plural forms reduced to one key. */
function keyPaths(messages: Messages, prefix = ''): Set<string> {
	const paths = new Set<string>()
	for (const [key, value] of Object.entries(messages)) {
		if (typeof value === 'string') {
			paths.add(`${prefix}${key.replace(PLURAL_SUFFIX, '')}`)
		} else {
			for (const path of keyPaths(value, `${prefix}${key}.`)) {
				paths.add(path)
			}
		}
	}
	return paths
}

export function findKeyProblems(
	languages: Record<string, Messages>,
	defaultLanguage: string,
): string[] {
	const tagProblems = [defaultLanguage, ...Object.keys(languages)].flatMap(
		(language) => {
			const problem = languageTagProblem(language)
			return problem ? [problem] : []
		},
	)
	if (tagProblems.length > 0) {
		return [...new Set(tagProblems)]
	}
	const defaultMessages = languages[defaultLanguage]
	if (!defaultMessages) {
		return [`  the default language "${defaultLanguage}" is missing`]
	}
	const expected = keyPaths(defaultMessages)
	return Object.entries(languages)
		.filter(([language]) => language !== defaultLanguage)
		.flatMap(([language, messages]) => {
			const actual = keyPaths(messages)
			// `pt-BR` can leave out keys when the file has `pt`.
			const hasFallback = lessSpecificTags(language).some(
				(tag) => tag !== defaultLanguage && tag in languages,
			)
			return [
				...[...expected]
					.filter((path) => !hasFallback && !actual.has(path))
					.map((path) => `  "${language}" is missing "${path}"`),
				...[...actual]
					.filter((path) => !expected.has(path))
					.map(
						(path) =>
							`  "${language}" has "${path}", which "${defaultLanguage}" does not have`,
					),
			]
		})
}

/** Why `language` is not a canonical BCP 47 tag with an ISO 639 language,
 *  or nothing when it is. */
function languageTagProblem(language: string): string | undefined {
	const notATag = `  "${language}" is not a language tag. Use a BCP 47 tag with an ISO 639 language, such as "en", "fr" or "pt-BR".`
	let canonical: string | undefined
	try {
		canonical = Intl.getCanonicalLocales(language)[0]
	} catch {
		return notATag
	}
	// BCP 47 also allows 5 to 8 letters (`english`), but ISO 639 codes have
	// 2 or 3 letters.
	if (!canonical || !/^[a-z]{2,3}(?:-|$)/.test(canonical)) {
		return notATag
	}
	return canonical === language
		? undefined
		: `  "${language}" must be written "${canonical}"`
}

/** The less specific tags of `language`: `zh-Hant` and `zh` for
 *  `zh-Hant-TW`. */
function lessSpecificTags(language: string): string[] {
	const subtags = language.split('-')
	return subtags
		.slice(1)
		.map((_subtag, index) => subtags.slice(0, subtags.length - 1 - index).join('-'))
}

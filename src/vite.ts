import { readFileSync, realpathSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Plugin } from 'vite'

/**
 * Lets a component or util keep its own strings next to it, in a
 * `Name.i18n.json` file with one object per language:
 *
 *   { "en": { "title": "Files" }, "fr": { "title": "…" } }
 *
 * Importing the file registers its strings, under a namespace made from its
 * path. Read them with `useI18n` from `@scr2em/i18n-modules`, which types the
 * keys.
 *
 * - The default language is put in the importer's chunk, so the strings load
 *   with the code that uses them.
 * - Every other language goes to its own chunk, which loads only when the user
 *   uses that language.
 * - Every language must have the same keys as the default language. A missing
 *   or extra key fails the dev server (error overlay) and the build. Plural
 *   forms (`_one`, `_other`, …) can differ, because languages have different
 *   plural rules.
 */
export function i18nModules({
	runtime = RUNTIME,
	defaultLanguage = 'en',
}: {
	/** The module that exports `registerI18nModule`, as a path from the
	 *  project root. The default is this package's runtime. A path alias
	 *  would not work: the generated module is virtual, so it has no folder
	 *  to resolve an alias from. */
	runtime?: string
	defaultLanguage?: string
} = {}): Plugin {
	let root = process.cwd()

	return {
		name: 'i18n-modules',
		enforce: 'pre',
		configResolved(config) {
			// Resolved files have real paths, so the root must have one too.
			root = realpathSync(config.root)
		},
		async resolveId(source, importer) {
			if (source.startsWith(LANGUAGE_SPECIFIER)) {
				return `\0${source}`
			}
			if (!source.endsWith(FILE_SUFFIX)) {
				return null
			}
			const resolved = await this.resolve(source, importer, { skipSelf: true })
			return resolved ? `${MODULE_ID}${resolved.id}${MODULE_ID_END}` : null
		},
		load(id) {
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
				return {
					code: [
						`import { registerI18nModule } from ${JSON.stringify(resolve(root, runtime))}`,
						`export default registerI18nModule(${JSON.stringify(namespaceOf(root, file))}, ${JSON.stringify(defaultLanguage)}, ${JSON.stringify(languages[defaultLanguage])}, { ${loaders.join(', ')} })`,
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
				return {
					code: `export default ${JSON.stringify(readLanguages(file)[language] ?? {})}`,
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

type Messages = { [key: string]: string | Messages }

// `index.ts` next to this file in the source, `index.js` in the build.
const RUNTIME = fileURLToPath(
	new URL(
		import.meta.url.endsWith('.ts') ? './index.ts' : './index.js',
		import.meta.url,
	),
)
const FILE_SUFFIX = '.i18n.json'
// The ids must not end in `.json`, or Vite's JSON handling takes the module.
const MODULE_ID = '\0i18n-module:'
const MODULE_ID_END = '::module'
const LANGUAGE_SPECIFIER = 'i18n-module-language:'
const LANGUAGE_SEPARATOR = '::'
const PLURAL_SUFFIX = /_(?:zero|one|two|few|many|other)$/

function namespaceOf(root: string, file: string) {
	return relative(root, file).split('\\').join('/').slice(0, -'.json'.length)
}

function readLanguages(file: string): Record<string, Messages> {
	const content: unknown = JSON.parse(readFileSync(file, 'utf8'))
	if (!isMessages(content)) {
		throw new Error(
			`${file}: expected an object with one object of strings per language`,
		)
	}
	const languages: Record<string, Messages> = {}
	for (const [language, messages] of Object.entries(content)) {
		if (typeof messages === 'string') {
			throw new Error(`${file}: "${language}" must be an object of strings`)
		}
		languages[language] = messages
	}
	return languages
}

function isMessages(value: unknown): value is Messages {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		Object.values(value).every(
			(entry) => typeof entry === 'string' || isMessages(entry),
		)
	)
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
	const defaultMessages = languages[defaultLanguage]
	if (!defaultMessages) {
		return [`  the default language "${defaultLanguage}" is missing`]
	}
	const expected = keyPaths(defaultMessages)
	return Object.entries(languages)
		.filter(([language]) => language !== defaultLanguage)
		.flatMap(([language, messages]) => {
			const actual = keyPaths(messages)
			return [
				...[...expected]
					.filter((path) => !actual.has(path))
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

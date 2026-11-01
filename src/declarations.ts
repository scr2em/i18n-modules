import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Writes `Page.i18n.d.json.ts` next to `Page.i18n.json`. TypeScript reads it
 * in place of the JSON (with `allowArbitraryExtensions`), so the type of the
 * import has the exact text of each string. `useI18n` and `<Trans>` read the
 * `{{values}}` and the tags from that text.
 */

export type Messages = { [key: string]: string | Messages }

export const FILE_SUFFIX = '.i18n.json'

const PACKAGE_NAME = '@scr2em/i18n-modules'

/** Folders that never have strings of the app. */
const SKIPPED_FOLDERS = new Set(['node_modules', '.git', 'dist', 'build'])

export function declarationPath(file: string): string {
	return file.replace(/\.json$/, '.d.json.ts')
}

/** The source of the declaration file for the strings of the default
 *  language. */
export function declarationFor(defaultMessages: Messages): string {
	return [
		`// Made by ${PACKAGE_NAME} from the .i18n.json file next to it. Do not edit.`,
		`import type { I18nMessages } from '${PACKAGE_NAME}'`,
		'',
		// JSON is a valid TypeScript type, with each string as a literal type.
		`declare const messages: I18nMessages<${JSON.stringify(defaultMessages, null, '\t')}>`,
		'export default messages',
		'',
	].join('\n')
}

/** Writes the declaration file of `file` if it changed. Returns whether it
 *  wrote the file. A file that cannot be read is left for the Vite plugin,
 *  which reports the problem. */
export function writeDeclaration(file: string, defaultLanguage = 'en'): boolean {
	let defaultMessages: Messages | undefined
	try {
		defaultMessages = readLanguages(file)[defaultLanguage]
	} catch {
		return false
	}
	if (!defaultMessages) {
		return false
	}
	const path = declarationPath(file)
	const source = declarationFor(defaultMessages)
	let current = ''
	try {
		current = readFileSync(path, 'utf8')
	} catch {
		// No declaration file yet.
	}
	if (current === source) {
		return false
	}
	writeFileSync(path, source)
	return true
}

/** The `.i18n.json` files in `folder` and its subfolders. */
export function findI18nFiles(folder: string): string[] {
	return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
		const path = join(folder, entry.name)
		if (entry.isDirectory()) {
			return SKIPPED_FOLDERS.has(entry.name) ? [] : findI18nFiles(path)
		}
		return entry.name.endsWith(FILE_SUFFIX) ? [path] : []
	})
}

/** Writes the declaration files of all the `.i18n.json` files in `folder`.
 *  Returns the files that changed. */
export function generateDeclarations(
	folder: string,
	defaultLanguage = 'en',
): string[] {
	return findI18nFiles(folder).filter((file) =>
		writeDeclaration(file, defaultLanguage),
	)
}

export function readLanguages(file: string): Record<string, Messages> {
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

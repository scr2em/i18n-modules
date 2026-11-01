#!/usr/bin/env node
import { relative, resolve } from 'node:path'

import { declarationPath, generateDeclarations } from './declarations.ts'

const USAGE = `Usage: i18n-modules generate [folder] [--default-language <language>]

Writes a .i18n.d.json.ts file next to each .i18n.json file in the folder
(default: the current folder). Run it before tsc, for example in CI.`

const [command, ...options] = process.argv.slice(2)

if (command !== 'generate') {
	console.log(USAGE)
	process.exit(command === undefined || command === '--help' ? 0 : 1)
}

const languageIndex = options.indexOf('--default-language')
const defaultLanguage =
	languageIndex === -1 ? 'en' : (options[languageIndex + 1] ?? 'en')
const folder = resolve(
	options.find(
		(option, index) =>
			!option.startsWith('--') &&
			(languageIndex === -1 || index !== languageIndex + 1),
	) ?? '.',
)

const written = generateDeclarations(folder, defaultLanguage)
for (const file of written) {
	console.log(`wrote ${relative(process.cwd(), declarationPath(file))}`)
}
console.log(
	`i18n-modules: ${written.length} declaration file(s) changed in ${relative(process.cwd(), folder) || '.'}`,
)

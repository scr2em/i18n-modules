import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAst } from 'vite';
export const FILE_SUFFIX = '.i18n.ts';
/** `./Page.i18n.ts`, or `./Page.i18n` with no extension. */
export function isStringsSpecifier(source) {
    return source.endsWith(FILE_SUFFIX) || source.endsWith('.i18n');
}
/** Folders that never have strings of the app. */
const SKIPPED_FOLDERS = new Set(['node_modules', '.git', 'dist', 'build']);
/** The `.i18n.ts` files in `folder` and its subfolders. */
export function findStringsFiles(folder) {
    return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
        const path = join(folder, entry.name);
        if (entry.isDirectory()) {
            return SKIPPED_FOLDERS.has(entry.name) ? [] : findStringsFiles(path);
        }
        return entry.name.endsWith(FILE_SUFFIX) ? [path] : [];
    });
}
export function readLanguages(file) {
    const source = readFileSync(file, 'utf8');
    let program;
    try {
        program = parseAst(source, { lang: 'ts' });
    }
    catch (error) {
        throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const exported = program.body.find((statement) => statement.type === 'ExportDefaultDeclaration');
    if (!exported) {
        throw new Error(`${file}: export the strings with \`export default defineMessages({ en: { … } })\``);
    }
    const value = literalValue(unwrap(exported.declaration), file, source);
    if (typeof value === 'string') {
        throw new Error(`${file}: the strings must be an object with one object per language`);
    }
    const languages = {};
    for (const [language, messages] of Object.entries(value)) {
        if (typeof messages === 'string') {
            throw new Error(`${file}: "${language}" must be an object of strings`);
        }
        languages[language] = messages;
    }
    return languages;
}
/** `defineMessages({…})`, `{…} as const` and `{…} satisfies …` give `{…}`. */
function unwrap(node) {
    if (node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'defineMessages') {
        return unwrap(node.arguments[0]);
    }
    if (node.type === 'TSAsExpression' ||
        node.type === 'TSSatisfiesExpression' ||
        node.type === 'ParenthesizedExpression') {
        return unwrap(node.expression);
    }
    return node;
}
function literalValue(node, file, source) {
    const fail = (what) => {
        const line = node ? source.slice(0, node.start).split('\n').length : 1;
        throw new Error(`${file}:${line}: ${what}. A strings file has keys, nested objects and string literals only.`);
    };
    if (!node)
        return fail('the strings are missing');
    if (node.type === 'Literal' && typeof node.value === 'string') {
        return node.value;
    }
    if (node.type === 'TemplateLiteral') {
        const quasis = node.quasis;
        if (node.expressions.length > 0) {
            return fail('a template literal with `${…}` is not a string literal (use `{{name}}`)');
        }
        return quasis[0].value.cooked;
    }
    if (node.type !== 'ObjectExpression') {
        return fail(`a ${node.type} is not a string or an object`);
    }
    const messages = {};
    for (const property of node.properties) {
        if (property.type !== 'Property' || property.computed) {
            fail('only plain keys are allowed (no spread or computed keys)');
        }
        const key = property.key;
        const name = key.type === 'Identifier'
            ? key.name
            : typeof key.value === 'string'
                ? key.value
                : fail('a key must be a name or a string');
        messages[name] = literalValue(property.value, file, source);
    }
    return messages;
}

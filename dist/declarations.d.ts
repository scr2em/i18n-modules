/**
 * Writes `Page.i18n.d.json.ts` next to `Page.i18n.json`. TypeScript reads it
 * in place of the JSON (with `allowArbitraryExtensions`), so the type of the
 * import has the exact text of each string. `useI18n`, `translate` and
 * `<Trans>` read the `{{values}}` and the tags from that text.
 */
export type Messages = {
    [key: string]: string | Messages;
};
export declare const FILE_SUFFIX = ".i18n.json";
export declare function declarationPath(file: string): string;
/** The source of the declaration file for the strings of the default
 *  language. */
export declare function declarationFor(defaultMessages: Messages): string;
/** Writes the declaration file of `file` if it changed. Returns whether it
 *  wrote the file. A file that cannot be read is left for the Vite plugin,
 *  which reports the problem. */
export declare function writeDeclaration(file: string, defaultLanguage?: string): boolean;
/** The `.i18n.json` files in `folder` and its subfolders. */
export declare function findI18nFiles(folder: string): string[];
/** Writes the declaration files of all the `.i18n.json` files in `folder`.
 *  Returns the files that changed. */
export declare function generateDeclarations(folder: string, defaultLanguage?: string): string[];
export declare function readLanguages(file: string): Record<string, Messages>;

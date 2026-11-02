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
export type Messages = {
    [key: string]: string | Messages;
};
export declare const FILE_SUFFIX = ".i18n.ts";
/** `./Page.i18n.ts`, or `./Page.i18n` with no extension. */
export declare function isStringsSpecifier(source: string): boolean;
/** The `.i18n.ts` files in `folder` and its subfolders. */
export declare function findStringsFiles(folder: string): string[];
export declare function readLanguages(file: string): Record<string, Messages>;

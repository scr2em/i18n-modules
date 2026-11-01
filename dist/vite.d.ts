import { type Plugin } from 'vite';
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
 * - Only the file with the same name in the same folder can import it:
 *   `Page.i18n.json` is for `Page.tsx`, and for its tests and stories
 *   (`Page.test.tsx`, `Page.spec.tsx`, `Page.stories.tsx`). An import from a
 *   different file fails the dev server (error overlay) and the build.
 * - Every language must have the same keys as the default language. A missing
 *   or extra key fails the dev server (error overlay) and the build. Plural
 *   forms (`_one`, `_other`, …) can differ, because languages have different
 *   plural rules.
 */
export declare function i18nModules({ runtime, defaultLanguage, }?: {
    /** The module that exports `registerI18nModule`, as a path from the
     *  project root. The default is this package's runtime. A path alias
     *  would not work: the generated module is virtual, so it has no folder
     *  to resolve an alias from. */
    runtime?: string;
    defaultLanguage?: string;
}): Plugin;
type Messages = {
    [key: string]: string | Messages;
};
/** The names of the files that can import `file`, without their extension. */
export declare function allowedImporters(file: string): string[];
export declare function findKeyProblems(languages: Record<string, Messages>, defaultLanguage: string): string[];
export {};

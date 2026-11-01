/**
 * Scoped strings, like CSS Modules: a component keeps its strings next to it,
 * in a `Name.i18n.json` file with one object per language:
 *
 *   { "en": { "title": "Files" }, "fr": { "title": "…" } }
 *
 * The file's namespace comes from its path, so two files never share keys.
 *
 *   import messages from './Page.i18n.json'
 *   const { t } = useI18n(messages)
 *   t('title')
 *
 * - `{{name}}` in a string is replaced by `values.name`.
 * - `t('items', { count })` reads `items_one`, `items_other`, … with the plural
 *   rules of the current language (`Intl.PluralRules`). `items_zero` is used
 *   for a count of 0 when the file has it. A plural key needs `count`: the
 *   type check fails without it.
 * - A key that the current language does not have falls back to the default
 *   language.
 *
 * The default language is in the importer's chunk, so its strings show on the
 * first render. Other languages load in their own chunks. `setLanguage` loads
 * them before it switches, so a component never shows two languages.
 */
export declare function useI18n<Source extends DefaultLanguageMessages>(source: Source): {
    t: <Key extends MessageKey<Source['en']>>(key: Key, ...values: ValuesFor<Source['en'], Key>) => string;
    language: string;
};
/** Reads a string outside React (Yup messages, utils), in the current
 *  language. */
export declare function translate<Source extends DefaultLanguageMessages, Key extends MessageKey<Source['en']>>(source: Source, key: Key, ...values: ValuesFor<Source['en'], Key>): string;
export declare function getLanguage(): string;
/**
 * Loads the strings of every imported module for `language`, then switches
 * to it. Components re-render once, with all strings in the new language.
 */
export declare function setLanguage(language: string): Promise<void>;
/** Called by the code that the Vite plugin makes from a `.i18n.json` file. */
export declare function registerI18nModule(namespace: string, defaultLanguage: string, defaultMessages: Messages, loaders: Record<string, LanguageLoader>): I18nModuleHandle;
type Messages = {
    [key: string]: string | Messages;
};
type DefaultLanguageMessages = {
    en: Messages;
};
type InterpolationValues = Record<string, string | number>;
type LanguageLoader = () => Promise<{
    default: Messages;
}>;
declare const NAMESPACE: unique symbol;
/** What a `.i18n.json` import is at runtime. TypeScript still types it as the
 *  file's JSON, which is what gives `useI18n` its keys. The
 *  `i18n-modules/no-messages-access` lint rule stops reads of that JSON. */
type I18nModuleHandle = {
    readonly [NAMESPACE]: string;
};
type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
type WithoutPluralSuffix<Key extends string> = Key extends `${infer Base}_${PluralSuffix}` ? Base : Key;
/** The dot paths of the plural keys in `Tree`, without the plural suffix. */
type PluralKey<Tree> = {
    [Key in keyof Tree & string]: Tree[Key] extends string ? Key extends `${infer Base}_${PluralSuffix}` ? Base : never : `${Key}.${PluralKey<Tree[Key]>}`;
}[keyof Tree & string];
/** The values that `t(key, …)` takes: `count` is required for a plural key. */
type ValuesFor<Tree, Key> = Key extends PluralKey<Tree> ? [values: InterpolationValues & {
    count: number;
}] : [values?: InterpolationValues];
/** The dot paths to the strings in `Tree`. Plural forms give one key, the one
 *  that `t(key, { count })` takes. */
type MessageKey<Tree> = {
    [Key in keyof Tree & string]: Tree[Key] extends string ? WithoutPluralSuffix<Key> : `${Key}.${MessageKey<Tree[Key]>}`;
}[keyof Tree & string];
export {};

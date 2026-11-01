import { type ReactElement, type ReactNode } from 'react';
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
/**
 * Renders a string that has tags, with React elements in place of the tags:
 *
 *   // "terms": "I accept the <link>terms</link>.<br/>Thank you, {{name}}."
 *   <Trans
 *     messages={messages}
 *     i18nKey="terms"
 *     values={{ name }}
 *     components={{ link: <a href="/terms" />, br: <br /> }}
 *   />
 *
 * - The text between `<link>` and `</link>` becomes the children of the
 *   `link` element. Tags can be inside other tags.
 * - `<br/>` renders the element with no children.
 * - A tag that is not in `components` shows as plain text. No HTML from a
 *   string is ever rendered.
 * - Tags are read before `{{values}}` go in, so a value never becomes a tag.
 */
export declare function Trans<Source extends DefaultLanguageMessages>(props: TransProps<Source>): ReactNode;
/** One set of props for each key of the file, so `values` with `count` is
 *  required exactly for the plural keys. */
export type TransProps<Source extends DefaultLanguageMessages> = [
    MessageKey<Source['en']>
] extends [never] ? TransPropsFor<Source, string, never> : TransPropsFor<Source, MessageKey<Source['en']>, PluralKey<Source['en']>>;
type TransPropsFor<Source, Keys extends string, PluralKeys> = {
    [Key in Keys]: {
        messages: Source;
        i18nKey: Key;
        /** The element for each tag name in the string. */
        components?: Record<string, ReactElement>;
    } & (Key extends PluralKeys ? {
        values: InterpolationValues & {
            count: number;
        };
    } : {
        values?: InterpolationValues;
    });
}[Keys];
/**
 * Sets the language of a subtree. Components inside it use `language`, and
 * components outside it keep the language of the app. The innermost provider
 * wins. The app needs no provider: with none, components use the language
 * that `setLanguage` sets.
 *
 *   <I18nProvider language="fr">
 *     <Preview />
 *   </I18nProvider>
 *
 * When `language` changes to a language that is not loaded yet, the subtree
 * suspends while its strings load. Change it in `startTransition` to keep the
 * old text on the screen until the new strings are ready.
 */
export declare function I18nProvider({ language, children, }: {
    language: string;
    children?: ReactNode;
}): ReactNode;
/** Reads a string outside React (Yup messages, utils), in the language of the
 *  app. `I18nProvider` has no effect on it. */
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

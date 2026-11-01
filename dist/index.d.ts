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
 * - `{{name}}` in a string is replaced by `values.name`. The type check knows
 *   the names from the text, so `t()` autocompletes them and fails when one
 *   is missing or wrong. This needs the `.i18n.d.json.ts` files that the Vite
 *   plugin writes.
 * - `t('items', { count })` reads `items_one`, `items_other`, … with the plural
 *   rules of the current language (`Intl.PluralRules`). `items_zero` is used
 *   for a count of 0 when the file has it. A plural key needs `count`: the
 *   type check fails without it.
 * - Languages are BCP 47 tags: `en`, `fr`, `pt-BR`, `zh-Hant-TW`. A key that
 *   the current language does not have falls back to the less specific tags
 *   (`pt-BR`, then `pt`), then to the default language.
 *
 * The default language is in the importer's chunk, so its strings show on the
 * first render. Other languages load in their own chunks. `setLanguage` loads
 * them before it switches, so a component never shows two languages.
 */
export declare function useI18n<Tree extends Messages>(source: I18nMessages<Tree>): {
    t: <Key extends MessageKey<Tree>>(key: Key, ...values: ValuesFor<Tree, Key>) => string;
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
 * - Tag names can be numbers: `<0>…</0>` uses `components={{ 0: <b /> }}`.
 * - A tag that is not in `components` shows as plain text. No HTML from a
 *   string is ever rendered.
 * - Tags are read before `{{values}}` go in, so a value never becomes a tag.
 * - The type check reads the tags and the values from the text: `components`
 *   needs one element for each tag, and `values` one value for each name.
 */
export declare function Trans<Tree extends Messages>(props: TransProps<Tree>): ReactNode;
/** One set of props for each key of the file, with the `values` and the
 *  `components` that the text of that key needs. */
export type TransProps<Tree extends Messages> = [MessageKey<Tree>] extends [
    never
] ? {
    messages: I18nMessages<Tree>;
    i18nKey: string;
    values?: InterpolationValues;
    components?: Record<string, ReactElement>;
} : {
    [Key in MessageKey<Tree>]: {
        messages: I18nMessages<Tree>;
        i18nKey: Key;
    } & ValuesProp<Tree, Key> & ComponentsProp<Tree, Key>;
}[MessageKey<Tree>];
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
export declare function translate<Tree extends Messages, Key extends MessageKey<Tree>>(source: I18nMessages<Tree>, key: Key, ...values: ValuesFor<Tree, Key>): string;
export declare function getLanguage(): string;
/**
 * Loads the strings of every imported module for `language`, then switches
 * to it. Components re-render once, with all strings in the new language.
 */
export declare function setLanguage(requested: string): Promise<void>;
/** Called by the code that the Vite plugin makes from a `.i18n.json` file.
 *  Tests can call it to make strings without the plugin. */
export declare function registerI18nModule<const Tree extends Messages>(namespace: string, defaultLanguage: string, defaultMessages: Tree, loaders: Record<string, LanguageLoader>): I18nMessages<Tree>;
/**
 * The type of a `.i18n.json` import, from its `.i18n.d.json.ts` file. `Tree`
 * is the text of the default language. At runtime the import is not the JSON,
 * so this type has no properties to read: give it to `useI18n`, `translate`
 * or `<Trans>`.
 */
export type I18nMessages<Tree extends Messages> = {
    readonly [MESSAGES_TREE]: Tree;
};
export type Messages = {
    readonly [key: string]: string | Messages;
};
type InterpolationValues = Record<string, string | number>;
type LanguageLoader = () => Promise<{
    default: Messages;
}>;
/** A key that exists only for the type check, to carry the text of a file. */
declare const MESSAGES_TREE: unique symbol;
type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
type WithoutPluralSuffix<Key extends string> = Key extends `${infer Base}_${PluralSuffix}` ? Base : Key;
/** The dot paths of the plural keys in `Tree`, without the plural suffix. */
type PluralKey<Tree> = {
    [Key in keyof Tree & string]: Tree[Key] extends string ? Key extends `${infer Base}_${PluralSuffix}` ? Base : never : `${Key}.${PluralKey<Tree[Key]>}`;
}[keyof Tree & string];
type Trim<Text extends string> = Text extends ` ${infer Rest}` ? Trim<Rest> : Text extends `${infer Rest} ` ? Trim<Rest> : Text;
/** The names in `{{name}}` in `Text`. */
type PlaceholderNames<Text extends string> = Text extends `${string}{{${infer Name}}}${infer Rest}` ? Trim<Name> | PlaceholderNames<Rest> : never;
/** The names of the opening and self-closing tags in `Text`: `link` for
 *  `<link>…</link>`, `br` for `<br/>`. */
type TagNames<Text extends string> = Text extends `${string}<${infer Tag}>${infer Rest}` ? TagName<Tag> | TagNames<Rest> : never;
type TagName<Tag extends string> = Tag extends `/${string}` | ` ${string}` ? never : Tag extends `${infer Name}/` ? Trim<Name> : Tag;
/** The text of `Key` in `Tree`, with all its plural forms. */
type TextOf<Tree, Key extends string> = Key extends `${infer Head}.${infer Rest}` ? Head extends keyof Tree ? TextOf<Tree[Head], Rest> : never : {
    [Name in keyof Tree & string]: WithoutPluralSuffix<Name> extends Key ? Tree[Name] extends string ? Tree[Name] : never : never;
}[keyof Tree & string];
/** The values that the text of `Key` needs: one for each `{{name}}`, and
 *  `count` for a plural key. */
type ValuesObject<Tree, Key extends string> = {
    [Name in PlaceholderNames<TextOf<Tree, Key>> | (Key extends PluralKey<Tree> ? 'count' : never)]: Name extends 'count' ? number : string | number;
};
/** The values that `t(key, …)` takes. Without the text of the strings (when
 *  the import is typed as plain JSON), any values are allowed. */
type ValuesFor<Tree, Key extends string> = string extends TextOf<Tree, Key> ? [values?: InterpolationValues] : [keyof ValuesObject<Tree, Key>] extends [never] ? [] : [values: ValuesObject<Tree, Key>];
type ValuesProp<Tree, Key extends string> = string extends TextOf<Tree, Key> ? {
    values?: InterpolationValues;
} : [keyof ValuesObject<Tree, Key>] extends [never] ? {
    values?: never;
} : {
    values: ValuesObject<Tree, Key>;
};
type ComponentsProp<Tree, Key extends string> = string extends TextOf<Tree, Key> ? {
    components?: Record<string, ReactElement>;
} : [TagNames<TextOf<Tree, Key>>] extends [never] ? {
    components?: never;
} : {
    /** One element for each tag in the text. */
    components: Record<TagNames<TextOf<Tree, Key>>, ReactElement>;
};
/** The dot paths to the strings in `Tree`. Plural forms give one key, the one
 *  that `t(key, { count })` takes. */
type MessageKey<Tree> = {
    [Key in keyof Tree & string]: Tree[Key] extends string ? WithoutPluralSuffix<Key> : `${Key}.${MessageKey<Tree[Key]>}`;
}[keyof Tree & string];
export {};

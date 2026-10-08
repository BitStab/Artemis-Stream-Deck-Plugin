import streamDeck from "@elgato/streamdeck";

export function t(key: string): string {
    return streamDeck.i18n.translate(key);
}

import streamDeck from "@elgato/streamdeck";
import type { ArtemisConnectionOptions } from "./artemis-types";

export type ArtemisGlobalSettings = {
    host?: string;
    port?: number;
    protocol?: string;
};

export const DEFAULT_ARTEMIS_SETTINGS = {
    host: "127.0.0.1",
    port: 9696,
    protocol: "http"
} as const;

export async function getArtemisGlobalSettings(): Promise<Required<ArtemisGlobalSettings>> {
    const stored = await streamDeck.settings.getGlobalSettings<ArtemisGlobalSettings>();

    const protocol = stored.protocol === "https" ? "https" : "http";
    const host = typeof stored.host === "string" && stored.host.trim()
        ? stored.host.trim()
        : DEFAULT_ARTEMIS_SETTINGS.host;
    const port = normalizePort(stored.port);

    return { protocol, host, port };
}

export async function getArtemisConnectionOptions(): Promise<ArtemisConnectionOptions> {
    const settings = await getArtemisGlobalSettings();
    return {
        baseUrl: `${settings.protocol}://${settings.host}:${settings.port}/`,
        timeoutMs: 3000
    };
}

function normalizePort(value: unknown): number {
    const port = typeof value === "number" ? value : Number(value);
    return Number.isInteger(port) && port > 0 && port <= 65535
        ? port
        : DEFAULT_ARTEMIS_SETTINGS.port;
}

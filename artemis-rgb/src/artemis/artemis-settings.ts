import streamDeck from "@elgato/streamdeck";
import type { ArtemisConnectionOptions, ArtemisScalarValue } from "./artemis-types";

export type ArtemisGlobalSettings = {
    host?: string;
    port?: number;
    protocol?: string;
    variableStates?: Record<string, ArtemisScalarValue>;
};

export const DEFAULT_ARTEMIS_SETTINGS = {
    host: "127.0.0.1",
    port: 9696,
    protocol: "http"
} as const;

let stateCache: Record<string, ArtemisScalarValue> | undefined;
let writeQueue = Promise.resolve();

export async function getArtemisGlobalSettings(): Promise<Required<Pick<ArtemisGlobalSettings, "host" | "port" | "protocol">> & ArtemisGlobalSettings> {
    const stored = await streamDeck.settings.getGlobalSettings<ArtemisGlobalSettings>();
    const protocol = stored.protocol === "https" ? "https" : "http";
    const host = typeof stored.host === "string" && stored.host.trim() ? stored.host.trim() : DEFAULT_ARTEMIS_SETTINGS.host;
    const port = normalizePort(stored.port);
    return { ...stored, protocol, host, port };
}

export async function getArtemisConnectionOptions(): Promise<ArtemisConnectionOptions> {
    const settings = await getArtemisGlobalSettings();
    return { baseUrl: `${settings.protocol}://${settings.host}:${settings.port}/`, timeoutMs: 3000 };
}

export function variableStateKey(moduleId: string, variableName: string): string {
    return `${moduleId.trim().toLowerCase()}::${variableName.trim().toLowerCase()}`;
}

export async function getVariableState(moduleId: string, variableName: string): Promise<ArtemisScalarValue | undefined> {
    if (!stateCache) {
        const settings = await getArtemisGlobalSettings();
        stateCache = { ...(settings.variableStates ?? {}) };
    }
    return stateCache[variableStateKey(moduleId, variableName)];
}

export async function setVariableState(moduleId: string, variableName: string, value: ArtemisScalarValue): Promise<void> {
    if (!stateCache) {
        const settings = await getArtemisGlobalSettings();
        stateCache = { ...(settings.variableStates ?? {}) };
    }
    stateCache[variableStateKey(moduleId, variableName)] = value;
    writeQueue = writeQueue.then(async () => {
        const settings = await streamDeck.settings.getGlobalSettings<ArtemisGlobalSettings>();
        await streamDeck.settings.setGlobalSettings({ ...settings, variableStates: { ...stateCache } });
    });
    await writeQueue;
}

function normalizePort(value: unknown): number {
    const port = typeof value === "number" ? value : Number(value);
    return Number.isInteger(port) && port > 0 && port <= 65535 ? port : DEFAULT_ARTEMIS_SETTINGS.port;
}

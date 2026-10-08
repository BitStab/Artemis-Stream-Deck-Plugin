import streamDeck, {
    action,
    DidReceiveSettingsEvent,
    DialDownEvent,
    KeyDownEvent,
    SingletonAction,
    WillAppearEvent
} from "@elgato/streamdeck";

import { ArtemisApiError, ArtemisClient } from "../artemis/artemis-client";
import { getArtemisConnectionOptions, getVariableState, setVariableState } from "../artemis/artemis-settings";
import type { ArtemisControllableVariableType, ArtemisScalarValue } from "../artemis/artemis-types";

export type JsonVariableButtonSettings = {
    moduleId?: string;
    variableName?: string;
    variableType?: ArtemisControllableVariableType;
    label?: string;
    valueA?: ArtemisScalarValue;
    valueB?: ArtemisScalarValue;
    defaultValue?: ArtemisScalarValue;
    minimum?: number;
    maximum?: number;
    step?: number;
    suffix?: string;
    enumValues?: ArtemisScalarValue[];
};

const DEFAULT_MODULE = "streamdeck";

@action({ UUID: "com.it-stecher.artemis-rgb.json-variable-toggle" })
export class JsonVariableToggle extends SingletonAction<JsonVariableButtonSettings> {
    override async onWillAppear(ev: WillAppearEvent<JsonVariableButtonSettings>): Promise<void> {
        if (ev.action.isDial()) {
            await ev.action.setFeedbackLayout("$A1");
            await ev.action.setTriggerDescription({ push: "Apply Artemis variable" });
        }
        await this.sync(ev.action, ev.payload.settings);
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<JsonVariableButtonSettings>): Promise<void> {
        await this.sync(ev.action, ev.payload.settings);
    }

    override async onKeyDown(ev: KeyDownEvent<JsonVariableButtonSettings>): Promise<void> {
        await this.apply(ev.action, ev.payload.settings);
    }

    override async onDialDown(ev: DialDownEvent<JsonVariableButtonSettings>): Promise<void> {
        await this.apply(ev.action, ev.payload.settings);
    }

    private async apply(actionInstance: any, raw: JsonVariableButtonSettings): Promise<void> {
        const settings = normalizeSettings(raw);
        if (!settings.variableName) return this.renderMissing(actionInstance);
        try {
            const client = new ArtemisClient(await getArtemisConnectionOptions());
            const definition = await client.getJsonVariableDefinition(settings.moduleId, settings.variableName);
            const type = definition?.type === "boolean" || definition?.type === "number" || definition?.type === "integer" || definition?.type === "string"
                ? definition.type : settings.variableType;
            const fallback = defaultFor(type, definition?.defaultValue ?? settings.defaultValue);
            const current = coerceValue(type, await getVariableState(settings.moduleId, settings.variableName), fallback);
            const next = nextButtonValue(type, current, settings.valueA, settings.valueB, fallback);
            await client.ensureJsonVariable(settings.moduleId, settings.variableName, type, {
                title: settings.label || definition?.title,
                minimum: type === "number" || type === "integer" ? settings.minimum : undefined,
                maximum: type === "number" || type === "integer" ? settings.maximum : undefined,
                step: type === "number" || type === "integer" ? definition?.step : undefined,
                suffix: type === "number" || type === "integer" ? settings.suffix : undefined,
                enumValues: settings.enumValues?.length ? settings.enumValues : definition?.enumValues,
                defaultValue: fallback
            });
            await client.setJsonModuleData(settings.moduleId, { [settings.variableName]: next });
            await setVariableState(settings.moduleId, settings.variableName, next);
            await this.render(actionInstance, settings, type, next);
            if (actionInstance.isKey()) await actionInstance.showOk();
        } catch (error) {
            await this.handleError(actionInstance, error);
        }
    }

    private async sync(actionInstance: any, raw: JsonVariableButtonSettings): Promise<void> {
        const settings = normalizeSettings(raw);
        if (!settings.variableName) return this.renderMissing(actionInstance);
        try {
            const client = new ArtemisClient(await getArtemisConnectionOptions());
            const definition = await client.getJsonVariableDefinition(settings.moduleId, settings.variableName);
            const type = definition?.type === "boolean" || definition?.type === "number" || definition?.type === "integer" || definition?.type === "string"
                ? definition.type : settings.variableType;
            const fallback = defaultFor(type, definition?.defaultValue ?? settings.defaultValue);
            const stored = await getVariableState(settings.moduleId, settings.variableName);
            const current = coerceValue(type, stored, fallback);
            await client.ensureJsonVariable(settings.moduleId, settings.variableName, type, {
                title: settings.label || definition?.title,
                minimum: type === "number" || type === "integer" ? settings.minimum : undefined,
                maximum: type === "number" || type === "integer" ? settings.maximum : undefined,
                step: type === "number" || type === "integer" ? definition?.step : undefined,
                suffix: type === "number" || type === "integer" ? settings.suffix : undefined,
                enumValues: settings.enumValues?.length ? settings.enumValues : definition?.enumValues,
                defaultValue: fallback
            });
            // JSON-module runtime values are write-only through the official API. Re-apply our persisted state.
            await client.setJsonModuleData(settings.moduleId, { [settings.variableName]: current });
            await setVariableState(settings.moduleId, settings.variableName, current);
            await this.render(actionInstance, settings, type, current);
        } catch (error) {
            await this.handleError(actionInstance, error);
        }
    }

    private async render(actionInstance: any, settings: Required<JsonVariableButtonSettings>, type: ArtemisControllableVariableType, value: ArtemisScalarValue): Promise<void> {
        const label = settings.label || settings.variableName || "Variable";
        const display = type === "boolean" ? (value ? "ON" : "OFF") : `${String(value)}${type === "number" || type === "integer" ? settings.suffix : ""}`;
        if (actionInstance.isKey()) await actionInstance.setTitle(`${truncate(label, 14)}\n${truncate(display, 14)}`);
        else if (actionInstance.isDial()) await actionInstance.setFeedback({ title: truncate(label, 20), value: truncate(display, 20) });
    }

    private async renderMissing(actionInstance: any): Promise<void> {
        if (actionInstance.isKey()) await actionInstance.setTitle("Set\nVariable");
        else if (actionInstance.isDial()) await actionInstance.setFeedback({ title: "Artemis", value: "Set variable" });
    }

    private async handleError(actionInstance: any, error: unknown): Promise<void> {
        const message = error instanceof ArtemisApiError ? error.message : String(error);
        streamDeck.logger.error(`Variable Button failed: ${message}`);
        if (actionInstance.isKey()) await actionInstance.setTitle("Artemis\nERROR");
        else if (actionInstance.isDial()) await actionInstance.setFeedback({ title: "Artemis", value: "ERROR" });
        await actionInstance.showAlert();
    }
}

function normalizeSettings(settings: JsonVariableButtonSettings): Required<JsonVariableButtonSettings> {
    return {
        moduleId: settings.moduleId?.trim() || DEFAULT_MODULE,
        variableName: settings.variableName?.trim() || "",
        variableType: settings.variableType ?? "boolean",
        label: settings.label?.trim() || "",
        valueA: settings.valueA ?? (settings as any).setValue ?? "",
        valueB: settings.valueB ?? "",
        defaultValue: settings.defaultValue ?? "",
        minimum: finite(settings.minimum, 0),
        maximum: finite(settings.maximum, 100),
        step: Math.abs(finite(settings.step, 1)) || 1,
        suffix: settings.suffix ?? "",
        enumValues: settings.enumValues ?? []
    };
}
function nextButtonValue(type: ArtemisControllableVariableType, current: ArtemisScalarValue, rawA: ArtemisScalarValue, rawB: ArtemisScalarValue, fallback: ArtemisScalarValue): ArtemisScalarValue {
    if (type === "boolean") return !Boolean(current);
    const a = coerceValue(type, rawA, fallback);
    const b = coerceValue(type, rawB, fallback);
    return valuesEqual(type, current, a) ? b : a;
}
function valuesEqual(type: ArtemisControllableVariableType, a: ArtemisScalarValue, b: ArtemisScalarValue): boolean {
    if (type === "number" || type === "integer") return Number(a) === Number(b);
    return String(a) === String(b);
}

function defaultFor(type: ArtemisControllableVariableType, value: ArtemisScalarValue | undefined): ArtemisScalarValue {
    if (value !== undefined && value !== "") return coerceValue(type, value, type === "boolean" ? false : type === "string" ? "" : 0);
    return type === "boolean" ? false : type === "string" ? "" : 0;
}
function coerceValue(type: ArtemisControllableVariableType, value: unknown, fallback: ArtemisScalarValue): ArtemisScalarValue {
    if (type === "boolean") return typeof value === "boolean" ? value : value === "true" || value === 1 || value === "1" ? true : value === "false" || value === 0 || value === "0" ? false : Boolean(fallback);
    if (type === "string") return typeof value === "string" ? value : value == null ? String(fallback) : String(value);
    const n = Number(value);
    if (!Number.isFinite(n)) return Number(fallback) || 0;
    return type === "integer" ? Math.round(n) : n;
}
function finite(value: unknown, fallback: number): number { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function truncate(value: string, max: number): string { return value.length <= max ? value : `${value.slice(0, max - 1)}…`; }

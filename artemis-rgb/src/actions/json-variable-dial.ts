import streamDeck, {
    action,
    DidReceiveSettingsEvent,
    DialDownEvent,
    DialRotateEvent,
    SingletonAction,
    WillAppearEvent
} from "@elgato/streamdeck";

import { ArtemisApiError, ArtemisClient } from "../artemis/artemis-client";
import { getArtemisConnectionOptions, getVariableState, setVariableState } from "../artemis/artemis-settings";
import type { ArtemisControllableVariableType, ArtemisScalarValue } from "../artemis/artemis-types";

export type JsonVariableDialSettings = {
    moduleId?: string;
    variableName?: string;
    variableType?: ArtemisControllableVariableType;
    label?: string;
    minimum?: number;
    maximum?: number;
    step?: number;
    defaultValue?: ArtemisScalarValue;
    suffix?: string;
    choices?: string[];
};

const DEFAULT_MODULE = "streamdeck";

@action({ UUID: "com.it-stecher.artemis-rgb.json-variable-dial" })
export class JsonVariableDial extends SingletonAction<JsonVariableDialSettings> {
    override async onWillAppear(ev: WillAppearEvent<JsonVariableDialSettings>): Promise<void> {
        if (ev.action.isDial()) {
            await ev.action.setFeedbackLayout("$A1");
            await ev.action.setTriggerDescription({ rotate: "Adjust Artemis variable", push: "Toggle / reset" });
        }
        await this.sync(ev.action, ev.payload.settings);
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<JsonVariableDialSettings>): Promise<void> {
        await this.sync(ev.action, ev.payload.settings);
    }

    override async onDialRotate(ev: DialRotateEvent<JsonVariableDialSettings>): Promise<void> {
        const settings = normalizeSettings(ev.payload.settings);
        if (!settings.variableName) return this.renderMissing(ev.action);
        try {
            const resolved = await this.resolve(settings);
            let next: ArtemisScalarValue;
            if (resolved.type === "boolean") {
                next = ev.payload.ticks > 0 ? true : ev.payload.ticks < 0 ? false : resolved.current;
            } else if (resolved.type === "string") {
                const choices = resolved.choices;
                if (!choices.length) throw new ArtemisApiError("String dial requires enum values or configured choices");
                const currentIndex = Math.max(0, choices.findIndex((v) => v === String(resolved.current)));
                next = choices[mod(currentIndex + ev.payload.ticks, choices.length)];
            } else {
                const current = Number(resolved.current);
                const raw = clamp(current + ev.payload.ticks * settings.step, settings.minimum, settings.maximum);
                next = resolved.type === "integer" ? Math.round(raw) : roundStep(raw, settings.step);
            }
            await this.write(ev.action, settings, resolved.type, next, resolved.choices);
        } catch (error) {
            await this.handleError(ev.action, error);
        }
    }

    override async onDialDown(ev: DialDownEvent<JsonVariableDialSettings>): Promise<void> {
        const settings = normalizeSettings(ev.payload.settings);
        if (!settings.variableName) return this.renderMissing(ev.action);
        try {
            const resolved = await this.resolve(settings);
            let next: ArtemisScalarValue;
            if (resolved.type === "boolean") next = !Boolean(resolved.current);
            else if (resolved.type === "string") next = String(resolved.defaultValue);
            else next = resolved.type === "integer" ? Math.round(Number(resolved.defaultValue)) : Number(resolved.defaultValue);
            await this.write(ev.action, settings, resolved.type, next, resolved.choices);
        } catch (error) {
            await this.handleError(ev.action, error);
        }
    }

    private async sync(actionInstance: any, settingsRaw: JsonVariableDialSettings): Promise<void> {
        const settings = normalizeSettings(settingsRaw);
        if (!settings.variableName) return this.renderMissing(actionInstance);
        try {
            const resolved = await this.resolve(settings);
            await this.write(actionInstance, settings, resolved.type, resolved.current, resolved.choices, false);
        } catch (error) {
            await this.handleError(actionInstance, error);
        }
    }

    private async resolve(settings: Required<JsonVariableDialSettings>): Promise<{ client: ArtemisClient; type: ArtemisControllableVariableType; current: ArtemisScalarValue; defaultValue: ArtemisScalarValue; choices: string[] }> {
        const client = new ArtemisClient(await getArtemisConnectionOptions());
        const definition = await client.getJsonVariableDefinition(settings.moduleId, settings.variableName);
        const type = definition?.type === "boolean" || definition?.type === "number" || definition?.type === "integer" || definition?.type === "string"
            ? definition.type : settings.variableType;
        const schemaChoices = definition?.enumValues?.map(String) ?? [];
        const choices = schemaChoices.length ? schemaChoices : settings.choices;
        const fallback = normalizeDefault(type, definition?.defaultValue ?? settings.defaultValue, choices, settings.minimum);
        const stored = await getVariableState(settings.moduleId, settings.variableName);
        const current = coerce(type, stored, fallback, choices);
        return { client, type, current, defaultValue: fallback, choices };
    }

    private async write(actionInstance: any, settings: Required<JsonVariableDialSettings>, type: ArtemisControllableVariableType, value: ArtemisScalarValue, choices: string[], showOk = false): Promise<void> {
        const client = new ArtemisClient(await getArtemisConnectionOptions());
        await client.ensureJsonVariable(settings.moduleId, settings.variableName, type, {
            title: settings.label || undefined,
            minimum: type === "number" || type === "integer" ? settings.minimum : undefined,
            maximum: type === "number" || type === "integer" ? settings.maximum : undefined,
            enumValues: type === "string" && choices.length ? choices : undefined,
            defaultValue: normalizeDefault(type, settings.defaultValue, choices, settings.minimum)
        });
        await client.setJsonModuleData(settings.moduleId, { [settings.variableName]: value });
        await setVariableState(settings.moduleId, settings.variableName, value);
        await this.render(actionInstance, settings, type, value);
        if (showOk) await actionInstance.showOk();
    }

    private async render(actionInstance: any, settings: Required<JsonVariableDialSettings>, type: ArtemisControllableVariableType, value: ArtemisScalarValue): Promise<void> {
        const label = settings.label || settings.variableName || "Variable";
        let display = type === "boolean" ? (value ? "ON" : "OFF") : String(value);
        if (type === "number" || type === "integer") display += settings.suffix;
        await actionInstance.setFeedback({ title: truncate(label, 20), value: truncate(display, 22) });
    }

    private async renderMissing(actionInstance: any): Promise<void> {
        await actionInstance.setFeedback({ title: "Artemis", value: "Set variable" });
    }

    private async handleError(actionInstance: any, error: unknown): Promise<void> {
        const message = error instanceof ArtemisApiError ? error.message : String(error);
        streamDeck.logger.error(`Variable Dial failed: ${message}`);
        await actionInstance.setFeedback({ title: "Artemis", value: "ERROR" });
        await actionInstance.showAlert();
    }
}

function normalizeSettings(settings: JsonVariableDialSettings): Required<JsonVariableDialSettings> {
    const minimum = finite(settings.minimum, 0);
    const maximumRaw = finite(settings.maximum, 100);
    const maximum = maximumRaw > minimum ? maximumRaw : minimum + 100;
    const step = Math.abs(finite(settings.step, 1)) || 1;
    return {
        moduleId: settings.moduleId?.trim() || DEFAULT_MODULE,
        variableName: settings.variableName?.trim() || "",
        variableType: settings.variableType ?? "number",
        label: settings.label?.trim() || "",
        minimum,
        maximum,
        step,
        defaultValue: settings.defaultValue ?? minimum,
        suffix: settings.suffix ?? "",
        choices: (settings.choices ?? []).map(String).filter(Boolean)
    };
}
function normalizeDefault(type: ArtemisControllableVariableType, value: unknown, choices: string[], minimum: number): ArtemisScalarValue {
    if (type === "boolean") return typeof value === "boolean" ? value : false;
    if (type === "string") {
        const v = typeof value === "string" ? value : "";
        return choices.length && !choices.includes(v) ? choices[0] : v;
    }
    const n = Number(value);
    const base = Number.isFinite(n) ? n : minimum;
    return type === "integer" ? Math.round(base) : base;
}
function coerce(type: ArtemisControllableVariableType, value: unknown, fallback: ArtemisScalarValue, choices: string[]): ArtemisScalarValue {
    if (value === undefined) return fallback;
    if (type === "boolean") return typeof value === "boolean" ? value : Boolean(fallback);
    if (type === "string") {
        const s = String(value);
        return choices.length && !choices.includes(s) ? fallback : s;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return type === "integer" ? Math.round(n) : n;
}
function finite(value: unknown, fallback: number): number { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function roundStep(value: number, step: number): number { const digits = Math.max(0, (String(step).split(".")[1] || "").length); return Number(value.toFixed(Math.min(digits + 2, 8))); }
function mod(value: number, length: number): number { return ((value % length) + length) % length; }
function truncate(value: string, max: number): string { return value.length <= max ? value : `${value.slice(0, max - 1)}…`; }

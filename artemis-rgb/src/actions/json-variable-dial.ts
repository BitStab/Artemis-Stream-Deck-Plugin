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
import { t } from "../i18n";

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
    private rotateQueue: Promise<void> = Promise.resolve();
    private readonly runtimeValues = new Map<string, ArtemisScalarValue>();

    override async onWillAppear(ev: WillAppearEvent<JsonVariableDialSettings>): Promise<void> {
        if (ev.action.isDial()) {
            await ev.action.setFeedbackLayout("$A1");
            await ev.action.setTriggerDescription({ rotate: t("variable.trigger.rotate"), push: t("variable.trigger.push") });
        }
        await this.sync(ev.action, ev.payload.settings);
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<JsonVariableDialSettings>): Promise<void> {
        await this.sync(ev.action, ev.payload.settings);
    }

    override async onDialRotate(ev: DialRotateEvent<JsonVariableDialSettings>): Promise<void> {
        const ticks = Number(ev.payload.ticks);
        if (!Number.isFinite(ticks) || ticks === 0) return;

        const settings = normalizeSettings(ev.payload.settings);
        streamDeck.logger.info(`Variable Dial event received: ticks=${ticks}, variable=${settings.moduleId}.${settings.variableName || "<unset>"}, type=${settings.variableType}, step=${settings.step}`);

        // Show feedback immediately, before any Artemis/network work. If this appears,
        // Stream Deck is definitely delivering dialRotate events to the action.
        if (ev.action.isDial()) {
            const label = settings.label || settings.variableName || t("variable.dial");
            await ev.action.setFeedback({
                title: truncate(label, 20),
                value: `Δ ${ticks > 0 ? "+" : ""}${ticks}`
            });
        }

        // Dial events can arrive much faster than HTTP round-trips. Serialize them so every
        // tick builds on the value written by the previous tick instead of racing it.
        this.rotateQueue = this.rotateQueue.then(() => this.handleDialRotate(ev, ticks));
        await this.rotateQueue;
    }

    private async handleDialRotate(ev: DialRotateEvent<JsonVariableDialSettings>, ticks: number): Promise<void> {
        const settings = normalizeSettings(ev.payload.settings);
        if (!settings.variableName) return this.renderMissing(ev.action);
        try {
            const resolved = await this.resolve(settings);
            const key = variableRuntimeKey(settings.moduleId, settings.variableName);
            const current = this.runtimeValues.has(key)
                ? this.runtimeValues.get(key)!
                : resolved.current;

            let next: ArtemisScalarValue;
            if (resolved.type === "boolean") {
                next = ticks > 0 ? true : ticks < 0 ? false : current;
            } else if (resolved.type === "string") {
                const choices = resolved.choices;
                if (!choices.length) throw new ArtemisApiError("String dial requires enum values or configured choices");
                const found = choices.findIndex((v) => v === String(current));
                const currentIndex = found >= 0 ? found : 0;
                next = choices[mod(currentIndex + ticks, choices.length)];
            } else {
                const currentNumber = Number(current);
                const safeCurrent = Number.isFinite(currentNumber) ? currentNumber : Number(resolved.defaultValue);
                const raw = clamp(safeCurrent + ticks * resolved.step, resolved.minimum, resolved.maximum);
                next = resolved.type === "integer" ? Math.round(raw) : roundStep(raw, resolved.step);
            }

            this.runtimeValues.set(key, next);
            streamDeck.logger.debug(`Variable Dial rotate: ${settings.moduleId}.${settings.variableName}, ticks=${ticks}, current=${String(current)}, next=${String(next)}`);

            // Give immediate visual feedback before waiting for the HTTP request.
            await this.render(ev.action, settings, resolved.type, next);
            await this.writeValue(ev.action, settings, resolved.type, next);
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
            this.runtimeValues.set(variableRuntimeKey(settings.moduleId, settings.variableName), next);
            await this.writeValue(ev.action, settings, resolved.type, next);
        } catch (error) {
            await this.handleError(ev.action, error);
        }
    }

    private async sync(actionInstance: any, settingsRaw: JsonVariableDialSettings): Promise<void> {
        const settings = normalizeSettings(settingsRaw);
        if (!settings.variableName) return this.renderMissing(actionInstance);
        try {
            const resolved = await this.resolve(settings);
            this.runtimeValues.set(variableRuntimeKey(settings.moduleId, settings.variableName), resolved.current);
            await this.ensureDefinition(settings, resolved.type, resolved.choices);
            await this.writeValue(actionInstance, settings, resolved.type, resolved.current, false);
        } catch (error) {
            await this.handleError(actionInstance, error);
        }
    }

    private async resolve(settings: Required<JsonVariableDialSettings>): Promise<{ client: ArtemisClient; type: ArtemisControllableVariableType; current: ArtemisScalarValue; defaultValue: ArtemisScalarValue; choices: string[]; minimum: number; maximum: number; step: number; suffix: string }> {
        const client = new ArtemisClient(await getArtemisConnectionOptions());
        const definition = await client.getJsonVariableDefinition(settings.moduleId, settings.variableName);
        const definitionType = definition?.type === "boolean" || definition?.type === "number" || definition?.type === "integer" || definition?.type === "string"
            ? definition.type : undefined;
        // The Property Inspector setting is authoritative. This also lets the user correct
        // a type if an Artemis schema is old or serialized unexpectedly.
        const type = settings.variableType ?? definitionType ?? "number";
        const schemaChoices = definition?.enumValues?.map(String) ?? [];
        const choices = schemaChoices.length ? schemaChoices : settings.choices;
        const minimum = definition?.minimum ?? settings.minimum;
        const maximum = definition?.maximum ?? settings.maximum;
        const step = definition?.step ?? settings.step;
        const suffix = definition?.suffix ?? settings.suffix;
        const fallback = normalizeDefault(type, definition?.defaultValue ?? settings.defaultValue, choices, minimum);
        const stored = await getVariableState(settings.moduleId, settings.variableName);
        const current = coerce(type, stored, fallback, choices);
        return { client, type, current, defaultValue: fallback, choices, minimum, maximum, step, suffix };
    }

    private async ensureDefinition(settings: Required<JsonVariableDialSettings>, type: ArtemisControllableVariableType, choices: string[]): Promise<void> {
        const client = new ArtemisClient(await getArtemisConnectionOptions());
        await client.ensureJsonVariable(settings.moduleId, settings.variableName, type, {
            title: settings.label || undefined,
            minimum: type === "number" || type === "integer" ? settings.minimum : undefined,
            maximum: type === "number" || type === "integer" ? settings.maximum : undefined,
            step: type === "number" || type === "integer" ? settings.step : undefined,
            suffix: type === "number" || type === "integer" ? settings.suffix : undefined,
            enumValues: type === "string" && choices.length ? choices : undefined,
            defaultValue: normalizeDefault(type, settings.defaultValue, choices, settings.minimum)
        });
    }

    private async writeValue(actionInstance: any, settings: Required<JsonVariableDialSettings>, type: ArtemisControllableVariableType, value: ArtemisScalarValue, showOk = false): Promise<void> {
        const client = new ArtemisClient(await getArtemisConnectionOptions());
        await client.setJsonModuleData(settings.moduleId, { [settings.variableName]: value });
        await setVariableState(settings.moduleId, settings.variableName, value);
        await this.render(actionInstance, settings, type, value);
        if (showOk) await actionInstance.showOk();
    }

    private async render(actionInstance: any, settings: Required<JsonVariableDialSettings>, type: ArtemisControllableVariableType, value: ArtemisScalarValue): Promise<void> {
        const label = settings.label || settings.variableName || "Variable";
        let display = type === "boolean" ? (value ? t("common.on") : t("common.off")) : String(value);
        if (type === "number" || type === "integer") display += settings.suffix;
        await actionInstance.setFeedback({ title: truncate(label, 20), value: truncate(display, 22) });
    }

    private async renderMissing(actionInstance: any): Promise<void> {
        await actionInstance.setFeedback({ title: "Artemis", value: t("variable.set_variable") });
    }

    private async handleError(actionInstance: any, error: unknown): Promise<void> {
        const message = error instanceof ArtemisApiError ? error.message : String(error);
        streamDeck.logger.error(`Variable Dial failed: ${message}`);
        await actionInstance.setFeedback({ title: "Artemis", value: t("common.error") });
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

function variableRuntimeKey(moduleId: string, variableName: string): string { return `${moduleId.trim().toLowerCase()}::${variableName.trim().toLowerCase()}`; }

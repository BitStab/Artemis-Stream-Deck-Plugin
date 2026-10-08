import streamDeck, {
    action,
    DidReceiveSettingsEvent,
    DialDownEvent,
    DialRotateEvent,
    SingletonAction,
    WillAppearEvent
} from "@elgato/streamdeck";

import { ArtemisApiError, ArtemisClient } from "../artemis/artemis-client";
import { getArtemisConnectionOptions } from "../artemis/artemis-settings";

export type JsonVariableDialSettings = {
    moduleId?: string;
    variableName?: string;
    label?: string;
    minimum?: number;
    maximum?: number;
    step?: number;
    defaultValue?: number;
    currentValue?: number;
    suffix?: string;
};

const DEFAULT_MODULE = "streamdeck";

@action({ UUID: "com.it-stecher.artemis-rgb.json-variable-dial" })
export class JsonVariableDial extends SingletonAction<JsonVariableDialSettings> {
    override async onWillAppear(ev: WillAppearEvent<JsonVariableDialSettings>): Promise<void> {
        if (ev.action.isDial()) {
            await ev.action.setFeedbackLayout("$A1");
            await ev.action.setTriggerDescription({ rotate: "Adjust Artemis variable", push: "Reset to default" });
        }
        const settings = normalizeSettings(ev.payload.settings);
        if (settings.currentValue !== ev.payload.settings.currentValue) await ev.action.setSettings(settings);
        await this.render(ev.action, settings);
        await this.sync(ev.action, settings);
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<JsonVariableDialSettings>): Promise<void> {
        const settings = normalizeSettings(ev.payload.settings);
        await this.render(ev.action, settings);
        await this.sync(ev.action, settings);
    }

    override async onDialRotate(ev: DialRotateEvent<JsonVariableDialSettings>): Promise<void> {
        const settings = normalizeSettings(ev.payload.settings);
        const next = clamp(settings.currentValue! + ev.payload.ticks * settings.step!, settings.minimum!, settings.maximum!);
        const updated = { ...settings, currentValue: roundStep(next, settings.step!) };
        await ev.action.setSettings(updated);
        await this.sync(ev.action, updated);
    }

    override async onDialDown(ev: DialDownEvent<JsonVariableDialSettings>): Promise<void> {
        const settings = normalizeSettings(ev.payload.settings);
        const updated = { ...settings, currentValue: clamp(settings.defaultValue!, settings.minimum!, settings.maximum!) };
        await ev.action.setSettings(updated);
        await this.sync(ev.action, updated);
    }

    private async sync(actionInstance: any, settings: Required<JsonVariableDialSettings>): Promise<void> {
        if (!settings.variableName.trim()) {
            await actionInstance.setFeedback({ title: "Artemis", value: "Set variable" });
            return;
        }
        try {
            const client = new ArtemisClient(await getArtemisConnectionOptions());
            await client.setJsonVariable(
                settings.moduleId.trim() || DEFAULT_MODULE,
                settings.variableName.trim(),
                "number",
                settings.currentValue,
                { title: settings.label.trim() || undefined, minimum: settings.minimum, maximum: settings.maximum }
            );
            await this.render(actionInstance, settings);
        } catch (error) {
            const message = error instanceof ArtemisApiError ? error.message : String(error);
            streamDeck.logger.error(`JSON Variable Dial failed: ${message}`);
            await actionInstance.setFeedback({ title: "Artemis", value: "ERROR" });
            await actionInstance.showAlert();
        }
    }

    private async render(actionInstance: any, settings: Required<JsonVariableDialSettings>): Promise<void> {
        const label = settings.label.trim() || settings.variableName.trim() || "Variable";
        await actionInstance.setFeedback({
            title: truncate(label, 20),
            value: `${formatNumber(settings.currentValue)}${settings.suffix}`
        });
    }
}

function normalizeSettings(settings: JsonVariableDialSettings): Required<JsonVariableDialSettings> {
    const minimum = finite(settings.minimum, 0);
    const maximumRaw = finite(settings.maximum, 100);
    const maximum = maximumRaw > minimum ? maximumRaw : minimum + 100;
    const step = Math.abs(finite(settings.step, 1)) || 1;
    const defaultValue = clamp(finite(settings.defaultValue, minimum), minimum, maximum);
    const currentValue = clamp(finite(settings.currentValue, defaultValue), minimum, maximum);
    return {
        moduleId: settings.moduleId?.trim() || DEFAULT_MODULE,
        variableName: settings.variableName ?? "",
        label: settings.label ?? "",
        minimum,
        maximum,
        step,
        defaultValue,
        currentValue,
        suffix: settings.suffix ?? ""
    };
}
function finite(value: unknown, fallback: number): number { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function roundStep(value: number, step: number): number { const digits = Math.max(0, (String(step).split(".")[1] || "").length); return Number(value.toFixed(Math.min(digits + 2, 8))); }
function formatNumber(value: number): string { return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2))); }
function truncate(value: string, max: number): string { return value.length <= max ? value : `${value.slice(0, max - 1)}…`; }

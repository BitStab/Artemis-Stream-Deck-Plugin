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
        await this.syncFromArtemis(ev.action, normalizeSettings(ev.payload.settings));
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<JsonVariableDialSettings>): Promise<void> {
        await this.syncFromArtemis(ev.action, normalizeSettings(ev.payload.settings));
    }

    override async onDialRotate(ev: DialRotateEvent<JsonVariableDialSettings>): Promise<void> {
        const settings = normalizeSettings(ev.payload.settings);
        if (!settings.variableName.trim()) return this.renderMissing(ev.action);
        try {
            const client = new ArtemisClient(await getArtemisConnectionOptions());
            await client.ensureJsonVariable(settings.moduleId, settings.variableName, "number", {
                title: settings.label.trim() || undefined,
                minimum: settings.minimum,
                maximum: settings.maximum
            });
            const rawCurrent = await client.tryGetJsonVariableValue(settings.moduleId, settings.variableName);
            const current = typeof rawCurrent === "number" && Number.isFinite(rawCurrent) ? rawCurrent : settings.defaultValue;
            const next = roundStep(clamp(current + ev.payload.ticks * settings.step, settings.minimum, settings.maximum), settings.step);
            await client.setJsonModuleData(settings.moduleId, { [settings.variableName]: next });
            await this.render(ev.action, settings, next);
        } catch (error) {
            await this.handleError(ev.action, error);
        }
    }

    override async onDialDown(ev: DialDownEvent<JsonVariableDialSettings>): Promise<void> {
        const settings = normalizeSettings(ev.payload.settings);
        if (!settings.variableName.trim()) return this.renderMissing(ev.action);
        try {
            const client = new ArtemisClient(await getArtemisConnectionOptions());
            await client.ensureJsonVariable(settings.moduleId, settings.variableName, "number", {
                title: settings.label.trim() || undefined,
                minimum: settings.minimum,
                maximum: settings.maximum
            });
            const next = clamp(settings.defaultValue, settings.minimum, settings.maximum);
            await client.setJsonModuleData(settings.moduleId, { [settings.variableName]: next });
            await this.render(ev.action, settings, next);
        } catch (error) {
            await this.handleError(ev.action, error);
        }
    }

    private async syncFromArtemis(actionInstance: any, settings: Required<JsonVariableDialSettings>): Promise<void> {
        if (!settings.variableName.trim()) return this.renderMissing(actionInstance);
        try {
            const client = new ArtemisClient(await getArtemisConnectionOptions());
            await client.ensureJsonVariable(settings.moduleId, settings.variableName, "number", {
                title: settings.label.trim() || undefined,
                minimum: settings.minimum,
                maximum: settings.maximum
            });
            const rawCurrent = await client.tryGetJsonVariableValue(settings.moduleId, settings.variableName);
            const current = typeof rawCurrent === "number" && Number.isFinite(rawCurrent) ? rawCurrent : settings.defaultValue;
            await this.render(actionInstance, settings, current);
        } catch (error) {
            await this.handleError(actionInstance, error);
        }
    }

    private async render(actionInstance: any, settings: Required<JsonVariableDialSettings>, value: number): Promise<void> {
        const label = settings.label.trim() || settings.variableName.trim() || "Variable";
        await actionInstance.setFeedback({
            title: truncate(label, 20),
            value: `${formatNumber(value)}${settings.suffix}`
        });
    }

    private async renderMissing(actionInstance: any): Promise<void> {
        await actionInstance.setFeedback({ title: "Artemis", value: "Set variable" });
    }

    private async handleError(actionInstance: any, error: unknown): Promise<void> {
        const message = error instanceof ArtemisApiError ? error.message : String(error);
        streamDeck.logger.error(`JSON Variable Dial failed: ${message}`);
        await actionInstance.setFeedback({ title: "Artemis", value: "ERROR" });
        await actionInstance.showAlert();
    }
}

function normalizeSettings(settings: JsonVariableDialSettings): Required<JsonVariableDialSettings> {
    const minimum = finite(settings.minimum, 0);
    const maximumRaw = finite(settings.maximum, 100);
    const maximum = maximumRaw > minimum ? maximumRaw : minimum + 100;
    const step = Math.abs(finite(settings.step, 1)) || 1;
    const defaultValue = clamp(finite(settings.defaultValue, minimum), minimum, maximum);
    return {
        moduleId: settings.moduleId?.trim() || DEFAULT_MODULE,
        variableName: settings.variableName ?? "",
        label: settings.label ?? "",
        minimum,
        maximum,
        step,
        defaultValue,
        suffix: settings.suffix ?? ""
    };
}
function finite(value: unknown, fallback: number): number { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function roundStep(value: number, step: number): number { const digits = Math.max(0, (String(step).split(".")[1] || "").length); return Number(value.toFixed(Math.min(digits + 2, 8))); }
function formatNumber(value: number): string { return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2))); }
function truncate(value: string, max: number): string { return value.length <= max ? value : `${value.slice(0, max - 1)}…`; }

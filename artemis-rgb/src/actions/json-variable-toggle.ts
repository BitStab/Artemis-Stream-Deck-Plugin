import streamDeck, {
    action,
    DidReceiveSettingsEvent,
    DialDownEvent,
    KeyDownEvent,
    SingletonAction,
    WillAppearEvent
} from "@elgato/streamdeck";

import { ArtemisApiError, ArtemisClient } from "../artemis/artemis-client";
import { getArtemisConnectionOptions } from "../artemis/artemis-settings";

export type JsonVariableToggleSettings = {
    moduleId?: string;
    variableName?: string;
    label?: string;
};

const DEFAULT_MODULE = "streamdeck";

@action({ UUID: "com.it-stecher.artemis-rgb.json-variable-toggle" })
export class JsonVariableToggle extends SingletonAction<JsonVariableToggleSettings> {
    override async onWillAppear(ev: WillAppearEvent<JsonVariableToggleSettings>): Promise<void> {
        if (ev.action.isDial()) {
            await ev.action.setFeedbackLayout("$A1");
            await ev.action.setTriggerDescription({ push: "Toggle Artemis variable" });
        }
        await this.syncFromArtemis(ev.action, ev.payload.settings);
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<JsonVariableToggleSettings>): Promise<void> {
        await this.syncFromArtemis(ev.action, ev.payload.settings);
    }

    override async onKeyDown(ev: KeyDownEvent<JsonVariableToggleSettings>): Promise<void> {
        await this.toggle(ev.action, ev.payload.settings);
    }

    override async onDialDown(ev: DialDownEvent<JsonVariableToggleSettings>): Promise<void> {
        await this.toggle(ev.action, ev.payload.settings);
    }

    private async toggle(actionInstance: any, settings: JsonVariableToggleSettings): Promise<void> {
        const moduleId = settings.moduleId?.trim() || DEFAULT_MODULE;
        const variableName = settings.variableName?.trim();
        if (!variableName) return this.renderMissing(actionInstance);

        try {
            const client = new ArtemisClient(await getArtemisConnectionOptions());
            await client.ensureJsonVariable(moduleId, variableName, "boolean", { title: settings.label?.trim() || undefined });
            const current = await client.tryGetJsonVariableValue(moduleId, variableName);
            const next = !(typeof current === "boolean" ? current : false);
            await client.setJsonModuleData(moduleId, { [variableName]: next });
            await this.render(actionInstance, settings, next);
            if (actionInstance.isKey()) await actionInstance.showOk();
        } catch (error) {
            await this.handleError(actionInstance, error);
        }
    }

    private async syncFromArtemis(actionInstance: any, settings: JsonVariableToggleSettings): Promise<void> {
        const moduleId = settings.moduleId?.trim() || DEFAULT_MODULE;
        const variableName = settings.variableName?.trim();
        if (!variableName) return this.renderMissing(actionInstance);

        try {
            const client = new ArtemisClient(await getArtemisConnectionOptions());
            await client.ensureJsonVariable(moduleId, variableName, "boolean", { title: settings.label?.trim() || undefined });
            const current = await client.tryGetJsonVariableValue(moduleId, variableName);
            await this.render(actionInstance, settings, typeof current === "boolean" ? current : false);
        } catch (error) {
            await this.handleError(actionInstance, error);
        }
    }

    private async render(actionInstance: any, settings: JsonVariableToggleSettings, value: boolean): Promise<void> {
        const label = settings.label?.trim() || settings.variableName?.trim() || "Variable";
        const state = value ? "ON" : "OFF";
        if (actionInstance.isKey()) await actionInstance.setTitle(`${truncate(label, 14)}\n${state}`);
        else if (actionInstance.isDial()) await actionInstance.setFeedback({ title: truncate(label, 20), value: state });
    }

    private async renderMissing(actionInstance: any): Promise<void> {
        if (actionInstance.isKey()) await actionInstance.setTitle("Set\nVariable");
        else if (actionInstance.isDial()) await actionInstance.setFeedback({ title: "Artemis", value: "Set variable" });
    }

    private async handleError(actionInstance: any, error: unknown): Promise<void> {
        const message = error instanceof ArtemisApiError ? error.message : String(error);
        streamDeck.logger.error(`JSON Variable Toggle failed: ${message}`);
        if (actionInstance.isKey()) await actionInstance.setTitle("Artemis\nERROR");
        else if (actionInstance.isDial()) await actionInstance.setFeedback({ title: "Artemis", value: "ERROR" });
        await actionInstance.showAlert();
    }
}

function truncate(value: string, max: number): string { return value.length <= max ? value : `${value.slice(0, max - 1)}…`; }

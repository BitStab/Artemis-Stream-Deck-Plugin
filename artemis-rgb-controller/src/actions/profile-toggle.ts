import streamDeck, {
    action,
    DidReceiveSettingsEvent,
    DialDownEvent,
    DialRotateEvent,
    KeyDownEvent,
    SingletonAction,
    WillAppearEvent
} from "@elgato/streamdeck";

import { ArtemisApiError, ArtemisClient } from "../artemis/artemis-client";
import { getArtemisConnectionOptions } from "../artemis/artemis-settings";
import type { ArtemisProfile } from "../artemis/artemis-types";
import { t } from "../i18n";

export type ProfileSelectSettings = {
    profileId?: string;
    profileName?: string;
};

@action({ UUID: "com.it-stecher.artemis-rgb-controller.profile-toggle" })
export class ProfileToggle extends SingletonAction<ProfileSelectSettings> {
    override async onWillAppear(ev: WillAppearEvent<ProfileSelectSettings>): Promise<void> {
        if (ev.action.isDial()) {
            await ev.action.setFeedbackLayout("$A1");
            await ev.action.setTriggerDescription({
                rotate: t("profile.trigger.rotate"),
                push: t("profile.trigger.push")
            });
        }
        await this.refresh(ev.action, ev.payload.settings);
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ProfileSelectSettings>): Promise<void> {
        await this.refresh(ev.action, ev.payload.settings);
    }

    override async onKeyDown(ev: KeyDownEvent<ProfileSelectSettings>): Promise<void> {
        await this.load(ev.action, ev.payload.settings);
    }

    override async onDialDown(ev: DialDownEvent<ProfileSelectSettings>): Promise<void> {
        await this.load(ev.action, ev.payload.settings);
    }

    override async onDialRotate(ev: DialRotateEvent<ProfileSelectSettings>): Promise<void> {
        try {
            const client = new ArtemisClient(await getArtemisConnectionOptions());
            const profiles = sortProfiles(await client.getProfiles());
            if (!profiles.length) {
                await ev.action.setFeedback({ title: "Artemis", value: t("profile.no_profiles") });
                await ev.action.showAlert();
                return;
            }

            const found = profiles.findIndex(p => p.id === ev.payload.settings.profileId);
            const currentIndex = found >= 0 ? found : 0;
            const step = ev.payload.ticks;
            const nextIndex = mod(currentIndex + step, profiles.length);
            const selected = profiles[nextIndex];
            const settings: ProfileSelectSettings = { profileId: selected.id, profileName: selected.name };
            await ev.action.setSettings(settings);
            await this.renderSelection(ev.action, selected, false);
        } catch (error) {
            await this.handleError(ev.action, error);
        }
    }

    private async load(actionInstance: any, settings: ProfileSelectSettings): Promise<void> {
        if (!settings.profileId) {
            await this.renderMissing(actionInstance);
            await actionInstance.showAlert();
            return;
        }
        try {
            const client = new ArtemisClient(await getArtemisConnectionOptions());
            const loaded = await client.loadProfileExclusive(settings.profileId);
            await this.renderSelection(actionInstance, loaded, true);
        } catch (error) {
            await this.handleError(actionInstance, error);
        }
    }

    private async refresh(actionInstance: any, settings: ProfileSelectSettings): Promise<void> {
        if (!settings.profileId) {
            await this.renderMissing(actionInstance);
            return;
        }
        try {
            const client = new ArtemisClient(await getArtemisConnectionOptions());
            const profile = await client.getProfile(settings.profileId);
            if (!profile) {
                if (actionInstance.isKey()) await actionInstance.setTitle(`${settings.profileName ?? t("common.profile")}\n${t("common.not_found")}`);
                else if (actionInstance.isDial()) await actionInstance.setFeedback({ title: "Artemis", value: t("common.not_found") });
                return;
            }
            await this.renderSelection(actionInstance, profile, profile.isActive);
        } catch (error) {
            await this.handleError(actionInstance, error);
        }
    }

    private async renderSelection(actionInstance: any, profile: ArtemisProfile, loaded: boolean): Promise<void> {
        if (actionInstance.isKey()) {
            await actionInstance.setTitle(truncate(profile.name, 16));
        } else if (actionInstance.isDial()) {
            await actionInstance.setFeedback({
                title: truncate(profile.name, 20),
                value: loaded ? t("profile.loaded") : t("profile.press_to_load")
            });
        }
    }

    private async renderMissing(actionInstance: any): Promise<void> {
        if (actionInstance.isKey()) await actionInstance.setTitle(`${t("common.select")}\n${t("common.profile")}`);
        else if (actionInstance.isDial()) await actionInstance.setFeedback({ title: "Artemis", value: t("profile.select_profile") });
    }

    private async handleError(actionInstance: any, error: unknown): Promise<void> {
        const message = error instanceof ArtemisApiError ? error.message : String(error);
        streamDeck.logger.error(`Profile Select failed: ${message}`);
        if (actionInstance.isKey()) await actionInstance.setTitle(`Artemis\n${t("common.offline")}`);
        else if (actionInstance.isDial()) await actionInstance.setFeedback({ title: "Artemis", value: t("common.offline") });
        await actionInstance.showAlert();
    }
}

function sortProfiles(profiles: ArtemisProfile[]): ArtemisProfile[] {
    return [...profiles].sort((a, b) =>
        (a.category?.order ?? 0) - (b.category?.order ?? 0) ||
        (a.order ?? 0) - (b.order ?? 0) ||
        (a.name ?? "").localeCompare(b.name ?? "")
    );
}
function mod(value: number, divisor: number): number { return ((value % divisor) + divisor) % divisor; }
function truncate(value: string, max: number): string { return value.length <= max ? value : `${value.slice(0, max - 1)}…`; }

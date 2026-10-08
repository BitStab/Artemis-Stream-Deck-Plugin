import streamDeck, {
    action,
    KeyDownEvent,
    SingletonAction,
    WillAppearEvent
} from "@elgato/streamdeck";

import { ArtemisApiError, ArtemisClient } from "../artemis/artemis-client";
import { getArtemisConnectionOptions } from "../artemis/artemis-settings";

@action({ UUID: "com.it-stecher.artemis-rgb.api-test" })
export class ArtemisApiTest extends SingletonAction {
    override async onWillAppear(ev: WillAppearEvent): Promise<void> {
        await this.refresh(ev.action);
    }

    override async onKeyDown(ev: KeyDownEvent): Promise<void> {
        await this.refresh(ev.action);
    }

    private async refresh(actionInstance: WillAppearEvent["action"] | KeyDownEvent["action"]): Promise<void> {
        try {
            const artemis = new ArtemisClient(await getArtemisConnectionOptions());
            const { profiles, profileCount } = await artemis.testConnection();

            streamDeck.logger.info(
                `Artemis API reachable at ${artemis.url}; profiles: ${JSON.stringify(profiles)}`
            );

            if (actionInstance.isKey()) {
                await actionInstance.setTitle(`Artemis\nOK\n${profileCount} Profiles`);
                await actionInstance.showOk();
            }
        } catch (error) {
            const message = error instanceof ArtemisApiError ? error.message : String(error);
            streamDeck.logger.error(`Artemis API test failed: ${message}`);
            if (actionInstance.isKey()) {
                await actionInstance.setTitle("Artemis\nOFFLINE");
                await actionInstance.showAlert();
            }
        }
    }
}

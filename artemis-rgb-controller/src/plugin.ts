import streamDeck from "@elgato/streamdeck";

import { ProfileToggle } from "./actions/profile-toggle";
import { JsonVariableToggle } from "./actions/json-variable-toggle";
import { JsonVariableDial } from "./actions/json-variable-dial";

streamDeck.logger.setLevel("trace");

streamDeck.actions.registerAction(new ProfileToggle());
streamDeck.actions.registerAction(new JsonVariableToggle());
streamDeck.actions.registerAction(new JsonVariableDial());

streamDeck.connect();

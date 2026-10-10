export interface ArtemisProfileCategory {
    id: string;
    name: string;
    order: number;
}

export interface ArtemisProfile {
    id: string;
    name: string;
    order: number;
    isActive: boolean;
    isSuspended: boolean;
    isMissingModule: boolean;
    hasActivationCondition: boolean;
    activationConditionMet: boolean;
    category?: ArtemisProfileCategory;
}

export interface ArtemisConnectionOptions {
    baseUrl?: string;
    timeoutMs?: number;
}

export type ArtemisJsonVariableType = "boolean" | "number" | "integer" | "string" | "array" | "object";
export type ArtemisControllableVariableType = "boolean" | "number" | "integer" | "string";
export type ArtemisScalarValue = boolean | number | string;

export interface ArtemisJsonVariable {
    name: string;
    title: string;
    description?: string;
    type: ArtemisJsonVariableType;
    minimum?: number;
    maximum?: number;
    step?: number;
    suffix?: string;
    defaultValue?: ArtemisScalarValue;
    enumValues?: ArtemisScalarValue[];
}

export interface ArtemisJsonModule {
    moduleId: string;
    schema: Record<string, unknown>;
    variables: ArtemisJsonVariable[];
}

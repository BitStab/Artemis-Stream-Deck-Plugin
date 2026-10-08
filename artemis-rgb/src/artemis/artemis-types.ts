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

export interface ArtemisJsonModule {
    moduleId: string;
    schema: Record<string, unknown>;
}

export type ArtemisJsonVariableType = "boolean" | "number" | "string";

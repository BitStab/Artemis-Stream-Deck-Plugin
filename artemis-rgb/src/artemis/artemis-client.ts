import type {
    ArtemisConnectionOptions,
    ArtemisProfile,
    ArtemisProfileCategory,
    ArtemisJsonModule,
    ArtemisJsonVariableType
} from "./artemis-types";

export class ArtemisApiError extends Error {
    constructor(
        message: string,
        public readonly status?: number,
        public readonly responseBody?: string
    ) {
        super(message);
        this.name = "ArtemisApiError";
    }
}

type UnknownRecord = Record<string, unknown>;

/** Client for the official Artemis.Plugins.WebAPI plugin. */
export class ArtemisClient {
    private readonly baseUrl: string;
    private readonly timeoutMs: number;

    constructor(options: ArtemisConnectionOptions = {}) {
        this.baseUrl = normalizeBaseUrl(options.baseUrl ?? "http://127.0.0.1:9696/");
        this.timeoutMs = options.timeoutMs ?? 3000;
    }

    get url(): string {
        return this.baseUrl;
    }

    async getProfiles(): Promise<ArtemisProfile[]> {
        const raw = await this.requestJson<unknown>("profiles");
        if (!Array.isArray(raw)) {
            throw new ArtemisApiError("Artemis /profiles returned an unexpected response (expected an array)");
        }
        return raw.map((item, index) => normalizeProfile(item, index));
    }

    async getProfileCategories(): Promise<ArtemisProfileCategory[]> {
        const raw = await this.requestJson<unknown>("profiles/categories");
        if (!Array.isArray(raw)) {
            throw new ArtemisApiError("Artemis /profiles/categories returned an unexpected response (expected an array)");
        }
        return raw.map((item, index) => normalizeCategory(item, index));
    }

    async getProfile(profileId: string): Promise<ArtemisProfile | undefined> {
        const profiles = await this.getProfiles();
        return profiles.find((profile) => profile.id.toLowerCase() === profileId.toLowerCase());
    }

    async setProfileSuspended(profileId: string, suspended: boolean): Promise<void> {
        const query = new URLSearchParams({ suspend: String(suspended) });
        await this.request(`profiles/suspend/${encodeURIComponent(profileId)}?${query}`, { method: "POST" });
    }


    async loadProfileExclusive(profileId: string): Promise<ArtemisProfile> {
        const profiles = await this.getProfiles();
        const target = profiles.find((profile) => profile.id.toLowerCase() === profileId.toLowerCase());
        if (!target) throw new ArtemisApiError(`Artemis profile not found: ${profileId}`, 404);

        // Suspend every other profile first, then release the selected profile.
        // This gives Stream Deck a simple "one selected profile" model on top of Artemis' suspend API.
        const others = profiles.filter((profile) => profile.id.toLowerCase() !== profileId.toLowerCase());
        await Promise.all(others.map((profile) =>
            profile.isSuspended ? Promise.resolve() : this.setProfileSuspended(profile.id, true)
        ));
        if (target.isSuspended) await this.setProfileSuspended(target.id, false);

        const updated = await this.getProfile(target.id);
        if (!updated) throw new ArtemisApiError(`Artemis profile disappeared after loading: ${profileId}`);
        return updated;
    }

    async toggleProfileSuspended(profileId: string): Promise<ArtemisProfile> {
        const profile = await this.getProfile(profileId);
        if (!profile) throw new ArtemisApiError(`Artemis profile not found: ${profileId}`, 404);

        await this.setProfileSuspended(profileId, !profile.isSuspended);
        const updated = await this.getProfile(profileId);
        if (!updated) throw new ArtemisApiError(`Artemis profile disappeared after update: ${profileId}`);
        return updated;
    }


    async getJsonModules(): Promise<ArtemisJsonModule[]> {
        const raw = await this.requestJson<unknown>("json-modules");
        if (!Array.isArray(raw)) {
            throw new ArtemisApiError("Artemis /json-modules returned an unexpected response (expected an array)");
        }
        return raw.map((item, index) => normalizeJsonModule(item, index));
    }

    async ensureJsonVariable(
        moduleId: string,
        variableName: string,
        type: ArtemisJsonVariableType,
        options: { title?: string; description?: string; minimum?: number; maximum?: number } = {}
    ): Promise<void> {
        const safeModuleId = moduleId.trim();
        const safeVariableName = variableName.trim();
        if (!safeModuleId) throw new ArtemisApiError("JSON module ID must not be empty");
        if (!safeVariableName) throw new ArtemisApiError("JSON variable name must not be empty");
        if (safeModuleId.length > 50) throw new ArtemisApiError("JSON module ID must be 50 characters or less");

        const modules = await this.getJsonModules();
        const existing = modules.find(m => m.moduleId === safeModuleId);
        const schema = cloneSchema(existing?.schema);
        schema["$schema"] ??= "https://json-schema.org/draft/2020-12/schema";
        schema.title ??= options.title || "Stream Deck";
        schema.description ??= "Variables controlled by the Artemis Stream Deck plugin";
        schema.type = "object";

        const properties = isRecord(schema.properties) ? { ...schema.properties } : {};
        if (!isRecord(properties[safeVariableName])) {
            const property: Record<string, unknown> = {
                type,
                title: options.title || humanize(safeVariableName)
            };
            if (options.description) property.description = options.description;
            if (type === "number") {
                if (Number.isFinite(options.minimum)) property.minimum = options.minimum;
                if (Number.isFinite(options.maximum)) property.maximum = options.maximum;
            }
            properties[safeVariableName] = property;
            schema.properties = properties;
            await this.request(`json-modules/${encodeURIComponent(safeModuleId)}/schema`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(schema)
            });
        }
    }

    async setJsonModuleData(moduleId: string, data: Record<string, unknown>): Promise<void> {
        await this.request(`json-modules/${encodeURIComponent(moduleId.trim())}/data`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });
    }

    async setJsonVariable(
        moduleId: string,
        variableName: string,
        type: ArtemisJsonVariableType,
        value: boolean | number | string,
        options: { title?: string; description?: string; minimum?: number; maximum?: number } = {}
    ): Promise<void> {
        await this.ensureJsonVariable(moduleId, variableName, type, options);
        await this.setJsonModuleData(moduleId, { [variableName]: value });
    }
    async testConnection(): Promise<{ profileCount: number; profiles: ArtemisProfile[] }> {
        const profiles = await this.getProfiles();
        return { profileCount: profiles.length, profiles };
    }

    private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
        const response = await this.request(path, init);
        if (response.status === 204) return undefined as T;
        return response.json() as Promise<T>;
    }

    private async request(path: string, init: RequestInit = {}): Promise<Response> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await fetch(new URL(path, this.baseUrl), {
                ...init,
                headers: { Accept: "application/json", ...init.headers },
                signal: controller.signal
            });
            if (!response.ok) {
                const body = await response.text().catch(() => "");
                throw new ArtemisApiError(
                    `Artemis API returned HTTP ${response.status} for ${init.method ?? "GET"} ${path}`,
                    response.status,
                    body
                );
            }
            return response;
        } catch (error) {
            if (error instanceof ArtemisApiError) throw error;
            if (error instanceof Error && error.name === "AbortError") {
                throw new ArtemisApiError(`Artemis API request timed out after ${this.timeoutMs} ms`);
            }
            const message = error instanceof Error ? error.message : String(error);
            throw new ArtemisApiError(`Could not connect to Artemis at ${this.baseUrl}: ${message}`);
        } finally {
            clearTimeout(timeout);
        }
    }
}

function normalizeProfile(value: unknown, index: number): ArtemisProfile {
    const raw = asRecord(value);
    const id = text(raw.id ?? raw.Id);
    if (!id) throw new ArtemisApiError(`Profile #${index + 1} returned by Artemis has no id/Id`);

    const categoryRaw = raw.category ?? raw.Category;
    return {
        id,
        name: text(raw.name ?? raw.Name) || `Profile ${index + 1}`,
        order: numberValue(raw.order ?? raw.Order),
        isActive: booleanValue(raw.isActive ?? raw.IsActive),
        isSuspended: booleanValue(raw.isSuspended ?? raw.IsSuspended),
        isMissingModule: booleanValue(raw.isMissingModule ?? raw.IsMissingModule),
        hasActivationCondition: booleanValue(raw.hasActivationCondition ?? raw.HasActivationCondition),
        activationConditionMet: booleanValue(raw.activationConditionMet ?? raw.ActivationConditionMet),
        category: categoryRaw == null ? undefined : normalizeCategory(categoryRaw, 0)
    };
}

function normalizeCategory(value: unknown, index: number): ArtemisProfileCategory {
    const raw = asRecord(value);
    return {
        id: text(raw.id ?? raw.Id),
        name: text(raw.name ?? raw.Name) || (index ? `Category ${index + 1}` : "Uncategorized"),
        order: numberValue(raw.order ?? raw.Order)
    };
}

function asRecord(value: unknown): UnknownRecord {
    return value !== null && typeof value === "object" ? value as UnknownRecord : {};
}
function text(value: unknown): string { return typeof value === "string" ? value : value == null ? "" : String(value); }
function numberValue(value: unknown): number { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function booleanValue(value: unknown): boolean { return value === true || value === "true" || value === 1 || value === "1"; }

function normalizeJsonModule(value: unknown, index: number): ArtemisJsonModule {
    const raw = asRecord(value);
    const moduleId = text(raw.moduleId ?? raw.ModuleId);
    if (!moduleId) throw new ArtemisApiError(`JSON module #${index + 1} returned by Artemis has no moduleId/ModuleId`);
    const schemaRaw = raw.schema ?? raw.Schema;
    return { moduleId, schema: isRecord(schemaRaw) ? schemaRaw : {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function cloneSchema(schema: Record<string, unknown> | undefined): Record<string, unknown> {
    return schema ? JSON.parse(JSON.stringify(schema)) as Record<string, unknown> : {};
}
function humanize(value: string): string {
    return value.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());
}
function normalizeBaseUrl(url: string): string { return url.endsWith("/") ? url : `${url}/`; }

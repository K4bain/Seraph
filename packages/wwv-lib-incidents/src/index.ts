import { 
    createSvgIconUrl,
    type WorldPlugin, 
    type GeoEntity, 
    type TimeRange, 
    type PluginContext, 
    type LayerConfig, 
    type CesiumEntityOptions, 
    type ServerPluginConfig, 
    type FilterDefinition,
    type PluginCategory
} from "@worldwideview/wwv-plugin-sdk";

export abstract class BaseIncidentPlugin implements WorldPlugin {
    abstract id: string;
    abstract name: string;
    abstract description: string;
    abstract icon: any;
    abstract category: PluginCategory;
    abstract version: string;

    protected context: PluginContext | null = null;
    protected iconUrls: Record<string, string> = {};
    
    // Configurable rendering defaults
    protected defaultLayerColor = "#ef4444";
    protected clusterDistance = 40;
    
    async initialize(ctx: PluginContext): Promise<void> { this.context = ctx; }
    destroy(): void { this.context = null; }

    abstract fetch(timeRange: TimeRange): Promise<GeoEntity[]>;
    
    // Typical incident pipelines scale visually based on a primary "severity" value 
    // (e.g. fatalities, magnitude, acres burned)
    protected abstract getSeverityValue(entity: GeoEntity): number;
    protected abstract getSeverityColor(value: number): string;
    protected abstract getSeveritySize(value: number): number;

    protected getEntityIcon(entity: GeoEntity): any {
        return this.icon;
    }

    abstract getServerConfig(): ServerPluginConfig;
    abstract getFilterDefinitions(): FilterDefinition[];
    abstract getLegend?(): { label: string; color: string; filterId?: string; filterValue?: string }[];

    getPollingInterval(): number { 
        return 0; // Incident plugins typically use ServerConfig.pollingIntervalMs or WebSocket
    }

    getLayerConfig(): LayerConfig {
        return { 
            color: this.defaultLayerColor, 
            clusterEnabled: true, 
            clusterDistance: this.clusterDistance 
        };
    }

    renderEntity(entity: GeoEntity): CesiumEntityOptions {
        const severity = this.getSeverityValue(entity);
        const color = this.getSeverityColor(severity);
        const size = this.getSeveritySize(severity);
        const iconComponent = this.getEntityIcon(entity);
        
        // Cache key includes icon name + color
        const iconName = iconComponent?.displayName || iconComponent?.name || "default";
        const cacheKey = `${iconName}-${color}`;
        
        if (!this.iconUrls[cacheKey]) {
            this.iconUrls[cacheKey] = createSvgIconUrl(iconComponent, { color });
        }

        return {
            type: "billboard", 
            iconUrl: this.iconUrls[cacheKey], 
            color,
            iconScale: size / 30,
            labelText: entity.label || undefined,
            labelFont: "11px JetBrains Mono, monospace" // Adds optional label standard
        };
    }

    /**
     * Default WebSocket payload normaliser. WsClient calls this when a data message
     * arrives; if absent, WsClient silently drops anything that isn't a flat array.
     *
     * Handles three shapes:
     *   - Scheduler envelope: { source, fetchedAt, items: GeoEntity[], totalCount } → items
     *   - GeoJSON FeatureCollection: { features: [{geometry, properties}, ...] } → normalised
     *   - Flat array: passes through (with timestamp normalisation)
     *
     * Subclasses may override for domain-specific shapes; this default covers
     * the common scheduler-wrapped and GeoJSON cases so the bug doesn't recur.
     *
     * @param payload - Raw payload received from the WebSocket message
     * @param _existingEntities - Current entities in the layer (unused by default; available for subclass merging logic)
     * @returns Normalised GeoEntity[] ready for the layer renderer
     */
    mapWebsocketPayload(payload: any, _existingEntities?: GeoEntity[]): GeoEntity[] {
        const items = this.extractIncidentItems(payload);
        return items.map((e) => ({
            ...e,
            timestamp: e.timestamp instanceof Date ? e.timestamp : new Date(e.timestamp ?? Date.now()),
        }));
    }

    /**
     * Extracts a raw GeoEntity array from the three common payload shapes:
     * scheduler envelope, GeoJSON FeatureCollection, or flat array.
     *
     * @param payload - The raw WebSocket payload
     * @returns Unnormalised array of GeoEntity-like objects (timestamps not yet coerced)
     */
    protected extractIncidentItems(payload: any): GeoEntity[] {
        if (Array.isArray(payload)) {
            return payload as GeoEntity[];
        }
        if (payload && Array.isArray(payload.items)) {
            return payload.items as GeoEntity[];
        }
        if (payload && Array.isArray(payload.features)) {
            return payload.features.map((f: any, i: number) => this.geoJsonFeatureToEntity(f, i));
        }
        return [];
    }

    /**
     * Converts a GeoJSON Feature object into a GeoEntity.
     *
     * @param feature - GeoJSON Feature with geometry.coordinates and optional properties
     * @param index - Position in the parent features array, used to generate a fallback id
     * @returns A GeoEntity with lat/lon extracted from the feature geometry
     */
    protected geoJsonFeatureToEntity(feature: any, index: number): GeoEntity {
        const coords = feature?.geometry?.coordinates ?? [0, 0];
        const props = feature?.properties ?? {};
        return {
            id: props.id ?? `${this.id}-${index}`,
            pluginId: this.id,
            latitude: coords[1],
            longitude: coords[0],
            timestamp: props.timestamp ? new Date(props.timestamp) : new Date(),
            properties: props,
            label: props.label,
        };
    }
}

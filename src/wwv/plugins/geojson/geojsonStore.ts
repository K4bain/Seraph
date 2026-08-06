import { create } from "zustand";
import type { GeoJsonFeatureCollection } from "@/wwv/types/geojson";

export interface ImportedLayer {
    id: string;
    name: string;
    description: string;
    color: string;
    visible: boolean;
    featureCollection: GeoJsonFeatureCollection;
}

export interface GeoJsonStore {
    importedLayers: ImportedLayer[];
    addImportedLayer: (layer: ImportedLayer) => void;
    removeImportedLayer: (id: string) => void;
    toggleImportedLayerVisibility: (id: string) => void;
    updateImportedLayer: (
        id: string,
        patch: Partial<Pick<ImportedLayer, "name" | "description" | "color">>,
    ) => void;
}

export const useGeoJsonStore = create<GeoJsonStore>((set) => ({
    importedLayers: [],

    addImportedLayer: (layer) => set((state) => ({
        importedLayers: [...state.importedLayers, layer],
    })),

    removeImportedLayer: (id) => set((state) => ({
        importedLayers: state.importedLayers.filter((l) => l.id !== id),
    })),

    toggleImportedLayerVisibility: (id) => set((state) => ({
        importedLayers: state.importedLayers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l),),
    })),

    updateImportedLayer: (id, patch) => set((state) => ({
        importedLayers: state.importedLayers.map((l) => (l.id === id ? { ...l, ...patch } : l),),
    })),
}));

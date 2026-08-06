"use client";

import { Trash2 } from "lucide-react";
import { dataBus } from "@/wwv/core/data/DataBus";
import { useGeoJsonStore } from "./geojsonStore";

export function ImportedLayerList() {
    const layers = useGeoJsonStore((s) => s.importedLayers);
    const removeLayer = useGeoJsonStore((s) => s.removeImportedLayer);

    const handleDelete = (layerId: string) => {
        // Unregister the dynamically created plugin via DataBus
        dataBus.emit("dynamicPluginRemove", { pluginId: layerId });
        removeLayer(layerId);
    };

    if (layers.length === 0) {
        return (
          <div className="geojson-empty">
            No imported layers yet. Click &quot;Import GeoJSON&quot; to add
            one.
          </div>
        );
    }

    return (
      <div className="geojson-layer-list">
        {layers.map((layer) => (
          <div key={layer.id} className="geojson-layer-item">
            <span
              className="geojson-layer-item__color"
              style={{ backgroundColor: layer.color }}
            />
            <div className="geojson-layer-item__info">
              <div className="geojson-layer-item__name">
                {layer.name}
              </div>
              <div className="geojson-layer-item__count">
                {layer.featureCollection.features.length}
                {' '}
                features
              </div>
            </div>
            <button
              type="button"
              className="geojson-layer-item__btn geojson-layer-item__btn--danger"
              onClick={() => handleDelete(layer.id)}
              aria-label="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
            ))}
      </div>
    );
}

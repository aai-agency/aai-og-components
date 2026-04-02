import type { Feature } from "geojson";
import type { CSSProperties } from "react";
import type { Asset, AssetStore, AssetTypeConfig, ColorScheme, MapViewState } from "../../types";
import type { AssetDetailSection } from "../asset-card";
import type { MapControlId, MapLayerId } from "./components/controls";
import type { SelectedOverlayFeature } from "./components/selection-summary";

export interface OGMapProps {
  /** Array of assets to render on the map */
  assets?: Asset[];
  /** Mapbox access token. Required. */
  mapboxAccessToken: string;
  /** Initial map view state. Auto-computed from assets if omitted. */
  initialViewState?: MapViewState;
  /** Color assets by this scheme */
  colorBy?: ColorScheme;
  /** Called when the user changes the color scheme via the legend dropdown */
  onColorByChange?: (scheme: ColorScheme) => void;
  /** Per-type display configuration (icons, colors, tooltip fields) */
  typeConfigs?: AssetTypeConfig[];
  /** Optional storage backend. Enables persistence + overlay saving. */
  store?: AssetStore;
  /** Callback when an asset is clicked */
  onAssetClick?: (asset: Asset) => void;
  /** Callback when an asset is hovered */
  onAssetHover?: (asset: Asset | null) => void;
  /** Callback when the view state changes (pan/zoom) */
  onViewStateChange?: (viewState: MapViewState) => void;
  /** Enable clustering at low zoom levels. Default: false */
  cluster?: boolean;
  /** Min zoom level at which clusters expand. Default: 10 */
  clusterMaxZoom?: number;
  /** Cluster radius in pixels. Default: 50 */
  clusterRadius?: number;
  /** Show asset count badge. Default: true */
  showAssetCount?: boolean;
  /** Show the color legend. Default: true */
  showLegend?: boolean;
  /** Enable file upload overlay (KMZ/KML/GeoJSON). Default: false */
  enableOverlayUpload?: boolean;
  /** Mapbox style URL. Default: "mapbox://styles/mapbox/light-v11" */
  mapStyle?: string;
  /** Map container height. Default: "500px" */
  height?: string | number;
  /** Map container width. Default: "100%" */
  width?: string | number;
  /** Additional CSS class */
  className?: string;
  /** Additional inline styles */
  style?: CSSProperties;
  /** Custom tooltip renderer */
  renderTooltip?: (asset: Asset) => React.ReactNode;
  /** Interactive mode. Default: true */
  interactive?: boolean;
  /** Controls to display. Default: all controls enabled */
  controls?: MapControlId[];
  /** Toggleable map layers (for layer control panel) */
  layers?: MapLayerId[];
  /** Callback when a drawing selection is created */
  onDrawCreate?: (features: Feature[]) => void;
  /** Callback when a drawing selection is cleared */
  onDrawDelete?: () => void;
  /** Callback when lasso selection completes with assets and overlay features */
  onLassoSelect?: (assets: Asset[], overlayFeatures: SelectedOverlayFeature[]) => void;
  /** Show map controls panel. Default: true */
  showControls?: boolean;
  /** Show asset detail card when an asset is selected. Default: true */
  showDetailCard?: boolean;
  /** Custom sections for the detail card */
  detailSections?: AssetDetailSection[];
  /** Custom header renderer for the detail card */
  renderDetailHeader?: (asset: Asset) => React.ReactNode;
  /** Custom body renderer for the detail card */
  renderDetailBody?: (asset: Asset) => React.ReactNode;
  /** Callback when the detail card is closed */
  onDetailClose?: () => void;
}

export interface MapTooltipProps {
  asset: Asset;
  x: number;
  y: number;
  typeConfigs: Map<string, AssetTypeConfig>;
  renderTooltip?: (asset: Asset) => React.ReactNode;
}

export interface ClusterMarkerProps {
  count: number;
  size: number;
  onClick: () => void;
}

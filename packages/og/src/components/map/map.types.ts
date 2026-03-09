import type { CSSProperties } from "react";
import type { Asset, AssetTypeConfig, ColorScheme, MapViewState, AssetStore, Well } from "../../types";

export interface OGMapProps {
  /** Array of assets to render on the map */
  assets?: Asset[];
  /** @deprecated Use `assets` prop. Legacy well array support. */
  wells?: Well[];
  /** Mapbox access token. Required. */
  mapboxAccessToken: string;
  /** Initial map view state. Auto-computed from assets if omitted. */
  initialViewState?: MapViewState;
  /** Color assets by this scheme */
  colorBy?: ColorScheme;
  /** Per-type display configuration (icons, colors, tooltip fields) */
  typeConfigs?: AssetTypeConfig[];
  /** Optional storage backend. Enables persistence + overlay saving. */
  store?: AssetStore;
  /** Callback when an asset is clicked */
  onAssetClick?: (asset: Asset) => void;
  /** @deprecated Use onAssetClick */
  onWellClick?: (well: Well) => void;
  /** Callback when an asset is hovered */
  onAssetHover?: (asset: Asset | null) => void;
  /** @deprecated Use onAssetHover */
  onWellHover?: (well: Well | null) => void;
  /** Callback when the view state changes (pan/zoom) */
  onViewStateChange?: (viewState: MapViewState) => void;
  /** Enable clustering at low zoom levels. Default: true */
  cluster?: boolean;
  /** Min zoom level at which clusters expand. Default: 10 */
  clusterMaxZoom?: number;
  /** Cluster radius in pixels. Default: 50 */
  clusterRadius?: number;
  /** Show asset count badge. Default: true */
  showAssetCount?: boolean;
  /** @deprecated Use showAssetCount */
  showWellCount?: boolean;
  /** Show the color legend. Default: true */
  showLegend?: boolean;
  /** Enable file upload overlay (KMZ/KML/GeoJSON). Default: false */
  enableOverlayUpload?: boolean;
  /** Mapbox style URL. Default: "mapbox://styles/mapbox/dark-v11" */
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

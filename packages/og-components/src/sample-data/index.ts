import type { Asset } from "../types";
import wellsJson from "./wells.json";

/**
 * 50 real production wells from the Bakken and DJ basins.
 * 25 from each basin, all with 24-month timeSeries data.
 * Use for demos, testing, and playground development.
 *
 * ```tsx
 * import { sampleAssets } from "@aai-agency/og-components/sample-data";
 * import { Map } from "@aai-agency/og-components";
 *
 * <Map assets={sampleAssets} mapboxAccessToken={token} />
 * ```
 */
export const sampleAssets: Asset[] = wellsJson as Asset[];

/**
 * Sample KMZ file containing 3 lease boundary polygons
 * (North Bakken Unit, South Bakken Unit, DJ Basin Unit).
 * Base64-encoded — decode to a Blob/File to test overlay upload.
 *
 * ```ts
 * import { sampleKMZ } from "@aai-agency/og-components/sample-data";
 *
 * const blob = new Blob(
 *   [Uint8Array.from(atob(sampleKMZ.base64), c => c.charCodeAt(0))],
 *   { type: "application/vnd.google-earth.kmz" }
 * );
 * const file = new File([blob], sampleKMZ.fileName, { type: blob.type });
 * ```
 */
export const sampleKMZ = {
  fileName: "lease-boundaries.kmz",
  description: "3 lease boundary polygons: North Bakken Unit, South Bakken Unit, DJ Basin Unit",
  base64:
    "UEsDBAoAAAAIAGgZg1xKDyHF8wEAAE4IAAAHAAAAZG9jLmttbNVV7W6bMBT936ew2N8GUxK1qHKoVHWTNnVbtSwP4MElQQEb2U4T3n4X3IaPuom2SquGhMT1uffo4HMM7GZfFuQRlM6lmHsXfuAREIlMc7Gae8ufnyaRdxOfsQ12YafQc29tTHVN6W6382UFYpVrX4Ch2EFDP/TiM0LYnUy2JQjTFFgKXkK84GVVALkHroHcyq1IucpBM9qitjEFnai8Migm/ri3A0U78MsO1ESi2ILXmmRSEQPaoFJi1kC+W+ArF3wFitE+l2VfmBr58nTutZxt6VkM0ftc2KWYJbKQKs6yAK8sY9TWbJenZh2HjNoHRruRZ5IHWdQDkul0REK7FquK9guXxPCExuZ+s8YByXGNDwVPoORqc2BsHfwmlVmTW77ZgCBLkZu+syNvF05rJ2TAAfsK1fBmgHAF3GEp0upG2VIV8Yduxxg9rPZfetWN4YrcGlBPOaw/6w552meufmC0+ssIJFIqPBscgzdECJlcBFM/Op9FfngeuLDwOHaFw04sOo695Gx8dMq0aRi/GKOvbIXNwWHXsBw6/1oSFsj31iQMOFJ4hEJWzRflD5MQvl8ULhvbrty2BaewqRu7PIWNOd87Cndf0EOd/3UMDvP/xwdg1hzIwJ+5HJo1h/w4Frix6BQ25vw3rjPa/eZZ8/+PfwNQSwECFAAKAAAACABoGYNcSg8hxfMBAABOCAAABwAAAAAAAAAAAAAAAAAAAAAAZG9jLmttbFBLBQYAAAAAAQABADUAAAAYAgAAAAA=",
};

declare module "shpjs" {
  function shp(buffer: ArrayBuffer): Promise<GeoJSON.FeatureCollection | GeoJSON.FeatureCollection[]>;
  export default shp;
}

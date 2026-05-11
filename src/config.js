export const APP_NAME = "Pipdown";

// Configure the Blizlab video stitching endpoint here when the real API URL is available.
// exportDigest(dayData) posts FormData with a metadata JSON blob plus ordered clip files.
export const BLIZLAB_EXPORT_ENDPOINT = "";

export const DEFAULT_SETTINGS = {
  userName: "",
  duration: 2,
  aspectRatio: "1:1",
  cameraDeviceId: "",
};

export const ASPECT_RATIOS = {
  "1:1": "ratio-1-1",
};

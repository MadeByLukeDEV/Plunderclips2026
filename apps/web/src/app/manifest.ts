import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Plunderclips",
    short_name: "Plunderclips",
    description: "Sea of Thieves clips from streamers.",
    start_url: "/",
    display: "standalone",
    background_color: "#10141b",
    theme_color: "#10141b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}

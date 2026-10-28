import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen } from "@/components/AuthScreen";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Namma Ration | நம்ம ரேஷன் – Shop & Cardholder Login" },
      {
        name: "description",
        content: "Shopkeepers manage stock, status, timings and SMS alerts. Cardholders check live shop status, stock and their collection status.",
      },
      { property: "og:title", content: "Namma Ration | நம்ம ரேஷன் – Shop & Cardholder Login" },
      {
        property: "og:description",
        content: "Live ration shop status and management for Tamil Nadu PDS shops and cardholders.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthScreen,
});

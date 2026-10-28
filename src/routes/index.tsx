import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen } from "@/components/AuthScreen";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Namma Ration | நம்ம ரேஷன் – Shopkeeper Login" },
      {
        name: "description",
        content: "Log in or register your PDS ration shop to manage stock, crowd level, customers and SMS alerts.",
      },
      { property: "og:title", content: "Namma Ration | நம்ம ரேஷன் – Shopkeeper Login" },
      {
        property: "og:description",
        content: "Shopkeeper admin console for Tamil Nadu PDS ration shops.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthScreen,
});

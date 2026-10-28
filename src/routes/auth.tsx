import { createFileRoute } from "@tanstack/react-router";
import { AuthScreen } from "@/components/AuthScreen";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in – Namma Ration" },
      { name: "description", content: "Sign in to your Namma Ration shopkeeper dashboard." },
      { property: "og:title", content: "Sign in – Namma Ration" },
      { property: "og:description", content: "Sign in to your Namma Ration shopkeeper dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthScreen,
});

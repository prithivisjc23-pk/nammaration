import { createFileRoute } from "@tanstack/react-router";
import { Portal } from "@/components/portal/Portal";

export const Route = createFileRoute("/_authenticated/portal")({
  head: () => ({
    meta: [
      { title: "My Ration Shop – Namma Ration" },
      { name: "description", content: "Live shop status, timings, stock and your monthly collection status." },
      { property: "og:title", content: "My Ration Shop – Namma Ration" },
      { property: "og:description", content: "Live shop status, timings, stock and your monthly collection status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalPage,
});

function PortalPage() {
  const { user } = Route.useRouteContext();
  return <Portal userId={user.id} />;
}

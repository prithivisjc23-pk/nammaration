import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/dashboard/Dashboard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard – Namma Ration" },
      { name: "description", content: "Daily shop controls, stock, customers and SMS alerts for your ration shop." },
      { property: "og:title", content: "Dashboard – Namma Ration" },
      { property: "og:description", content: "Daily shop controls, stock, customers and SMS alerts for your ration shop." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = Route.useRouteContext();
  return <Dashboard userId={user.id} />;
}

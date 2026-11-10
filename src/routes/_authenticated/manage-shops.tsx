import { createFileRoute } from "@tanstack/react-router";
import { ManageShops } from "@/components/ManageShops";

export const Route = createFileRoute("/_authenticated/manage-shops")({
  head: () => ({ meta: [
    { title: "Manage Shops – Namma Ration Super Admin" },
    { name: "description", content: "Secure administration of Tamil Nadu ration shops and ONORC access." },
    { property: "og:title", content: "Manage Shops – Namma Ration Super Admin" },
    { property: "og:description", content: "Secure administration of Tamil Nadu ration shops and ONORC access." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  component: ManageShops,
});
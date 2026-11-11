import { redirect } from "next/navigation";

// A fallback only (#1467). A page load of the portal's index is redirected in
// `src/proxy.ts` before anything renders; this answers the requests the proxy
// passes through untouched -- an RSC fetch from a client-side navigation.
export default function PortalPage() {
  redirect("/portal/home");
}

import { redirect } from "next/navigation";

/** Dashboard moved to the landing (/) as the search-first front door. */
export default function Dashboard() {
  redirect("/");
}

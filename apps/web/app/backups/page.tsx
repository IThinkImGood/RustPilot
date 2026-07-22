import { redirect } from "next/navigation";

export default function BackupsIndexPage() {
  redirect("/backups/manual");
}

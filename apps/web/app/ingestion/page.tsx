import { auth } from "@/auth";
import { AdminAccessCard } from "@/components/admin-access-card";
import { IngestionControlPanel } from "@/components/ingestion-control-panel";
import { isViewerAdmin } from "@/lib/authz";

export default async function IngestionPage() {
  const session = await auth();

  if (!session?.user || !isViewerAdmin({ id: session.user.id, email: session.user.email })) {
    return <AdminAccessCard />;
  }

  return <IngestionControlPanel />;
}

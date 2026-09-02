import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { redirect } from "next/navigation";
import ReviewClient from "./review-client";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(id)) redirect("/");
  const cookieStore = await cookies();
  const token = cookieStore.get("fa27_session")?.value;
  if (!token) redirect("/login");
  const session = await verifySession(token);
  if (!session || !session.authed || !session.evaluatorId) redirect("/login");
  // Evaluator existence check is done in API; server page just ensures authed
  return <ReviewClient assessmentId={id} />;
}

import { Suspense } from "react";
import Workspace from "@/lib/workspace";

async function TripContent({ params, searchParams }: PageProps<"/trips/[reference]">) {
  const { reference } = await params;
  const { start, files, places } = await searchParams;
  return <Workspace key={reference} reference={reference} startConversation={start === "1"} starterFileIds={typeof files === "string" ? files : ""} starterPlaceIds={typeof places === "string" ? places : ""} />;
}

export default function TripPage(props: PageProps<"/trips/[reference]">) {
  return <Suspense fallback={<main className="shell"><p role="status">Opening your trip...</p></main>}><TripContent {...props} /></Suspense>;
}

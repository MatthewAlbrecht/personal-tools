import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Card } from "~/components/ui/card";

export default async function ExamplePage() {
  const cookieStore = await cookies();
  const isAuthed = cookieStore.get("session")?.value != null;

  if (!isAuthed) {
    redirect("/login");
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 font-bold text-3xl">Example Page</h1>
        <p className="text-muted-foreground">
          This is an example of an authenticated page. Users must be logged in to
          view this content.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="p-6">
          <h2 className="mb-2 font-semibold text-xl">Feature 1</h2>
          <p className="text-muted-foreground text-sm">
            Add your feature description here. This card shows how content can be
            displayed in an authenticated page.
          </p>
        </Card>

        <Card className="p-6">
          <h2 className="mb-2 font-semibold text-xl">Feature 2</h2>
          <p className="text-muted-foreground text-sm">
            You can add more interactive elements, forms, or data displays here.
          </p>
        </Card>

        <Card className="p-6">
          <h2 className="mb-2 font-semibold text-xl">Feature 3</h2>
          <p className="text-muted-foreground text-sm">
            This demonstrates the grid layout that adapts to different screen
            sizes.
          </p>
        </Card>
      </div>

      <div className="mt-8">
        <Card className="p-6">
          <h2 className="mb-4 font-semibold text-xl">Quick Start</h2>
          <div className="space-y-2 text-sm">
            <p>To customize this page:</p>
            <ol className="ml-6 list-decimal space-y-1 text-muted-foreground">
              <li>Replace the placeholder content with your own</li>
              <li>Add tRPC queries to fetch data from your backend</li>
              <li>Use Convex queries for real-time data</li>
              <li>Add forms or interactive components as needed</li>
            </ol>
          </div>
        </Card>
      </div>
    </main>
  );
}


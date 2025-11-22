"use client";

import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { api } from "~/trpc/react";

export function ExampleTrpcDemo() {
  const [name, setName] = useState("");
  const [itemText, setItemText] = useState("");

  // Example query
  const { data: greeting, isLoading: greetingLoading } =
    api.example.hello.useQuery({ name: name || undefined }, { enabled: true });

  // Example query for list
  const { data: items, isLoading: itemsLoading } =
    api.example.getAll.useQuery();

  // Example mutation
  const createMutation = api.example.create.useMutation({
    onSuccess: () => {
      setItemText("");
      alert("Item created successfully!");
    },
  });

  function handleCreate() {
    if (itemText.trim()) {
      createMutation.mutate({ text: itemText });
    }
  }

  return (
    <div className="w-full max-w-2xl space-y-8">
      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 font-semibold text-xl">tRPC Query Example</h2>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="name-input"
              className="mb-2 block font-medium text-sm"
            >
              Enter your name:
            </label>
            <Input
              id="name-input"
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="rounded bg-muted p-4">
            {greetingLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : (
              <p className="text-lg">{greeting?.greeting}</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 font-semibold text-xl">tRPC Mutation Example</h2>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="New item text"
              value={itemText}
              onChange={(e) => setItemText(e.target.value)}
            />
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !itemText.trim()}
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 font-semibold text-xl">tRPC List Query</h2>
        {itemsLoading ? (
          <p className="text-muted-foreground">Loading items...</p>
        ) : (
          <ul className="space-y-2">
            {items?.map((item) => (
              <li key={item.id} className="rounded bg-muted p-3">
                {item.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

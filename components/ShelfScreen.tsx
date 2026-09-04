"use client";

import Link from "next/link";
import { useLibrary } from "./LibraryProvider";
import { StreakCard } from "./StreakCard";
import { CurrentlyReadingCard, FinishedCard, WantToReadCard } from "./BookCards";
import {
  buttonClass,
  EmptyState,
  LoadingRules,
  PageTitle,
  SectionHeading,
} from "./ui";
import { entriesByStatus } from "@/lib/library";

export function ShelfScreen() {
  const { state, ready } = useLibrary();

  const reading = entriesByStatus(state, "reading");
  const want = entriesByStatus(state, "want");
  const finished = entriesByStatus(state, "finished");

  const caption = ready
    ? `${state.entries.length} ${state.entries.length === 1 ? "book" : "books"} · ${reading.length} in progress`
    : "Loading your shelf…";

  if (!ready) {
    return (
      <>
        <PageTitle title="Shelf" caption={caption} />
        <div className="px-4 py-4">
          <LoadingRules rows={3} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageTitle title="Shelf" caption={caption} />

      <div className="space-y-7 px-4 py-4">
        <StreakCard />

        <section>
          <SectionHeading count={reading.length}>Currently reading</SectionHeading>
          {reading.length > 0 ? (
            <div className="space-y-3">
              {reading.map((entry) => (
                <CurrentlyReadingCard key={entry.id} entry={entry} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Nothing open right now"
              body="Start a book from your list, or find a new one to pick up."
              action={
                <Link href="/search" className={buttonClass("primary")}>
                  Find a book
                </Link>
              }
            />
          )}
        </section>

        <section>
          <SectionHeading count={want.length}>Want to read</SectionHeading>
          {want.length > 0 ? (
            <div className="space-y-2.5">
              {want.map((entry) => (
                <WantToReadCard key={entry.id} entry={entry} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Your list is empty"
              body="Books you save for later land here, ready to start in one tap."
            />
          )}
        </section>

        <section>
          <SectionHeading count={finished.length}>Finished</SectionHeading>
          {finished.length > 0 ? (
            <div className="space-y-2.5">
              {finished.map((entry) => (
                <FinishedCard key={entry.id} entry={entry} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No finished books yet"
              body="Every book you complete gets stamped and filed here."
            />
          )}
        </section>
      </div>
    </>
  );
}

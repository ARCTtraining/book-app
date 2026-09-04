import { NextResponse } from "next/server";
import { GoogleBooksError, searchGoogleBooks } from "@/lib/googleBooks";

/**
 * Catalogue search, proxied server-side.
 *
 * The API key lives only here: it is read from the server environment and
 * never sent to the browser, which is why the client calls this route rather
 * than Google directly. Failures are reported with a status the client can
 * act on — it falls back to the bundled sample catalogue rather than showing
 * an error, so the prototype still demos without a key or a network.
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return NextResponse.json({ books: [] });
  }

  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_BOOKS_API_KEY is not set", books: [] },
      { status: 503 }
    );
  }

  try {
    const books = await searchGoogleBooks(query, apiKey);
    return NextResponse.json(
      { books },
      {
        headers: {
          // Shared cache only: results are identical for every reader.
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (error) {
    const status = error instanceof GoogleBooksError ? error.status : 502;
    const message =
      error instanceof GoogleBooksError ? error.message : "Catalogue search failed";
    console.error("[api/books]", message);
    return NextResponse.json({ error: message, books: [] }, { status });
  }
}

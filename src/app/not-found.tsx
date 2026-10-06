import Link from "next/link";
import { connection } from "next/server";

export default async function NotFound() {
  await connection();

  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p>The requested page could not be found.</p>
        <Link href="/">Return to the sign-in page</Link>
      </section>
    </main>
  );
}

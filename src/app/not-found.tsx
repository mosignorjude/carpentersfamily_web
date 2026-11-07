import Link from "next/link";
import { connection } from "next/server";

export default async function NotFound() {
  await connection();

  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p>The page you are looking for doesn’t exist or has been moved.</p>
        <Link href="/">Back to Home</Link>
      </section>
    </main>
  );
}

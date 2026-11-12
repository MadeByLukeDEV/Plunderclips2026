import Link from "next/link";
import { Button } from "@plunderclips/ui/components/button";

export default function NotFound() {
  return (
    <section aria-labelledby="nf-title" className="screen">
      <div className="wrap flex flex-col justify-center">
        <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">404</p>
        <h1 id="nf-title" className="text-h2 mt-3 max-w-[18ch]">
          Nothing on this stretch of water
        </h1>
        <p className="text-lead text-muted-foreground mt-4 max-w-[48ch]">
          The clip may still be waiting for a mod, or the link has a typo in it.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/clips">Browse clips</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/submit">Submit a clip</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

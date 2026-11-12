import { Button } from "@plunderclips/ui/components/button";
import { DEV_USERS } from "@plunderclips/identity";
import { devSignIn } from "@/app/sign-in/dev-actions";

/** Shown only when DEV_LOGIN=true outside production. */
export function DevLogin({ next }: { next: string }) {
  return (
    <div className="border-border mt-8 rounded-xl border border-dashed p-5">
      <h2 className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
        Dev login · local only
      </h2>
      <form action={devSignIn} className="mt-4 grid grid-cols-2 gap-3">
        <input type="hidden" name="next" value={next} />
        {DEV_USERS.map((u) => (
          <Button key={u.role} type="submit" name="role" value={u.role} variant="secondary">
            Sign in as {u.role}
          </Button>
        ))}
      </form>
    </div>
  );
}

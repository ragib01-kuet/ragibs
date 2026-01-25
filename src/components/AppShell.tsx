import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthProvider";

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Link
      to={to}
      className={cn(
        "text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
        active && "text-foreground"
      )}
    >
      {children}
    </Link>
  );
}

export function AppShell({ title, children }: { title?: string; children: React.ReactNode }) {
  const { session, roles, profile, signOut } = useAuth();
  const isAdmin = roles.includes("admin");
  const isTeacher = roles.includes("teacher") || isAdmin;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-sm font-semibold tracking-tight">
              Ragib’s World Courses
            </Link>
            <nav className="hidden items-center gap-4 md:flex">
              <NavItem to="/">Courses</NavItem>
              {isTeacher && <NavItem to="/studio">Teacher Studio</NavItem>}
              {isAdmin && <NavItem to="/admin/invites">Admin</NavItem>}
              {session && <NavItem to="/profile">Profile</NavItem>}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {session ? (
              <>
                <div className="hidden text-right md:block">
                  <div className="text-sm font-medium leading-none">{profile?.display_name ?? "Account"}</div>
                  <div className="text-xs text-muted-foreground">{profile?.email ?? ""}</div>
                </div>
                <Button variant="secondary" onClick={() => void signOut()}>
                  Sign out
                </Button>
              </>
            ) : (
              <Button asChild>
                <Link to="/login">Sign in</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        {title ? <h1 className="text-2xl font-semibold tracking-tight">{title}</h1> : null}
        <div className={cn(title ? "mt-6" : "")}>{children}</div>
      </main>
    </div>
  );
}

import { useEffect, useState } from "react";
import { MiniAppIconView } from "../components/MiniAppIconView.tsx";
import { ProfileInitials } from "../components/ProfileInitials.tsx";
import { ProfileNameForm } from "../components/ProfileNameDialog.tsx";
import { TokenActivityCalendar } from "../components/TokenActivityCalendar.tsx";
import { Button } from "../components/ui/Button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog.tsx";
import { formatFullTokenCount, formatTokenCount } from "../lib/format.ts";
import { useIcon } from "../lib/icon-context.tsx";
import { useStore } from "../store.tsx";

export function MyFelixPanel() {
  const { profileOverview, profileLoading, refreshProfile, setProfileName } = useStore();
  const [editingName, setEditingName] = useState(false);
  const PencilIcon = useIcon("pencil");

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  if (profileLoading && !profileOverview) return null;

  const profile = profileOverview?.profile ?? { name: "" };
  const stats = profileOverview?.stats ?? {
    lifetimeTokens: 0,
    peakTokens: 0,
    currentStreakDays: 0,
    longestStreakDays: 0,
    activity: [],
    topApps: [],
  };
  const displayName = profile.name.trim() || "My Felix";

  return (
    <section className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-8 px-8 py-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <ProfileInitials name={displayName} size="lg" />
          <div className="flex max-w-full flex-col items-center gap-1">
            <div className="relative flex max-w-full items-center justify-center">
              <h1 className="max-w-xl truncate text-2xl font-semibold tracking-tight">{displayName}</h1>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setEditingName(true)}
                title="Edit name"
                aria-label="Edit name"
                className="absolute left-full ml-1.5"
              >
                <PencilIcon />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">Your Felix scorecard</p>
          </div>
        </div>

        <div className="grid overflow-hidden rounded-[1.75rem] border border-border/60 bg-background sm:grid-cols-4">
          <StatTile label="Lifetime tokens" value={formatTokenCount(stats.lifetimeTokens)} />
          <StatTile label="Peak tokens" value={formatTokenCount(stats.peakTokens)} />
          <StatTile label="Current streak" value={formatDays(stats.currentStreakDays)} />
          <StatTile label="Longest streak" value={formatDays(stats.longestStreakDays)} />
        </div>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">Token activity</h2>
            <p className="text-xs text-muted-foreground">Last 365 days of Felix build usage.</p>
          </div>
          <TokenActivityCalendar activity={stats.activity} />
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">Top apps</h2>
            <p className="text-xs text-muted-foreground">Ranked by tokens used while building.</p>
          </div>
          {stats.topApps.length > 0 ? (
            <div className="flex flex-col gap-2">
              {stats.topApps.map((app, index) => (
                <div
                  key={app.appId}
                  className="flex items-center justify-between gap-4 rounded-xl bg-muted/50 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <MiniAppIconView
                      appId={app.appId}
                      emoji={app.emoji}
                      icon={app.icon}
                      className="size-9 shrink-0 rounded-[10px] bg-surface-3 shadow-surface-1"
                      emojiClassName="text-base"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{app.name}</p>
                      <p className="text-xs text-muted-foreground">#{index + 1}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-medium" title={formatFullTokenCount(app.tokens)}>
                    {formatTokenCount(app.tokens)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">
              No build tokens tracked yet.
            </p>
          )}
        </section>
      </div>

      <Dialog open={editingName} onOpenChange={setEditingName} modal>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>Update your name used for your My Felix profile.</DialogDescription>
          </DialogHeader>
          <ProfileNameForm
            initialName={profile.name}
            submitLabel="Save"
            onCancel={() => setEditingName(false)}
            onSave={async (name) => {
              await setProfileName(name);
              setEditingName(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="relative flex min-h-24 flex-col items-center justify-center gap-1 px-4 py-4 text-center after:absolute after:right-0 after:top-1/2 after:hidden after:h-12 after:w-px after:-translate-y-1/2 after:bg-border/60 sm:after:block sm:last:after:hidden">
      <span className="text-2xl font-semibold leading-none tracking-tight">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function formatDays(value: number): string {
  return value === 1 ? "1 day" : `${value} days`;
}

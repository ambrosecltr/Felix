import type { ProfileAppUsage } from "@felix/contracts";
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
import {
  formatBuildDuration,
  formatFullTokenCount,
  formatInteger,
  formatTokenCount,
} from "../lib/format.ts";
import { useIcon } from "../lib/icon-context.tsx";
import { useStore } from "../store.tsx";

const TOP_APP_GRID_CLASS =
  "grid grid-cols-[minmax(18rem,1fr)_7rem_8rem_10rem] items-center gap-4";

export function MyFelixPanel() {
  const { profileOverview, profileLoading, refreshProfile, setProfileName } = useStore();
  const [editingName, setEditingName] = useState(false);
  const PencilIcon = useIcon("pencil");
  const TokensIcon = useIcon("star");
  const MessagesIcon = useIcon("message-circle");
  const TimeIcon = useIcon("clock");

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
          {stats.topApps.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="flex min-w-[48rem] flex-col gap-2">
                <div className={`${TOP_APP_GRID_CLASS} px-3 pb-1`}>
                  <div className="flex flex-col gap-1">
                    <h2 className="text-sm font-medium">Top apps</h2>
                    <p className="text-xs text-muted-foreground">
                      Ranked by tokens used while building.
                    </p>
                  </div>
                  <TopAppMetricHeader icon={TokensIcon} label="Tokens" />
                  <TopAppMetricHeader icon={MessagesIcon} label="Messages" />
                  <TopAppMetricHeader icon={TimeIcon} label="Time building" />
                </div>
                {stats.topApps.map((app, index) => (
                  <TopAppRow key={app.appId} app={app} index={index} />
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <h2 className="text-sm font-medium">Top apps</h2>
                <p className="text-xs text-muted-foreground">
                  Ranked by tokens used while building.
                </p>
              </div>
              <p className="rounded-xl bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">
                No build tokens tracked yet.
              </p>
            </>
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

function TopAppMetricHeader({
  icon: Icon,
  label,
}: {
  icon: ReturnType<typeof useIcon>;
  label: string;
}) {
  return (
    <span className="inline-flex items-center justify-end gap-1 whitespace-nowrap text-right text-xs text-muted-foreground">
      <Icon className="size-3 shrink-0" />
      <span>{label}</span>
    </span>
  );
}

const PIXEL8_COLUMNS = 64;
const PIXEL8_ROWS = 4;
const PIXEL8_CYCLE_S = 7.2;

function Pixel8Background() {
  const centerCol = (PIXEL8_COLUMNS - 1) / 2;
  const centerRow = (PIXEL8_ROWS - 1) / 2;
  const maxDistance = Math.hypot(centerCol, centerRow * 8);
  const cells = [];
  for (let row = 0; row < PIXEL8_ROWS; row += 1) {
    for (let col = 0; col < PIXEL8_COLUMNS; col += 1) {
      const distance = Math.hypot(col - centerCol, (row - centerRow) * 8);
      const progress = distance / maxDistance;
      const delay = -(PIXEL8_CYCLE_S * (1 - progress));
      cells.push(
        <span
          key={`${row}-${col}`}
          className="pixel8-cell"
          style={{ animationDelay: `${delay.toFixed(2)}s` }}
        />,
      );
    }
  }
  return (
    <div aria-hidden className="pixel8-grid">
      {cells}
    </div>
  );
}

function TopAppRow({ app, index }: { app: ProfileAppUsage; index: number }) {
  const isTopApp = index === 0;
  return (
    <div
      className={`${TOP_APP_GRID_CLASS} relative rounded-xl bg-muted/50 px-3 py-2 ${
        isTopApp ? "pixel8-row overflow-hidden" : ""
      }`}
    >
      {isTopApp ? <Pixel8Background /> : null}
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
      <TopAppMetricValue title={formatFullTokenCount(app.tokens)}>
        {formatTokenCount(app.tokens)}
      </TopAppMetricValue>
      <TopAppMetricValue title={formatInteger(app.completedMessages)}>
        {formatInteger(app.completedMessages)}
      </TopAppMetricValue>
      <TopAppMetricValue title={formatBuildDuration(app.buildTimeMs)}>
        {formatBuildDuration(app.buildTimeMs)}
      </TopAppMetricValue>
    </div>
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

function TopAppMetricValue({
  title,
  children,
}: {
  title: string;
  children: string;
}) {
  return (
    <span className="text-right text-sm font-medium tabular-nums" title={title}>
      {children}
    </span>
  );
}

function formatDays(value: number): string {
  return value === 1 ? "1 day" : `${value} days`;
}

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ThemeBadge } from "@/components/ui/theme-badge";
import { ParticipationMeter } from "@/components/ui/participation-meter";
import { ProgressRing } from "@/components/ui/progress-ring";
import { StickyActionBar } from "@/components/ui/sticky-action-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import ScoreControlClient from "./score-control-client";

export default function Styleguide() {
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px 80px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>Styleguide — T04</h1>
        <ThemeToggle />
      </div>
      <p style={{ color: "var(--text-muted)", marginTop: 8 }}>Every component in every state, both themes. Check with axe, check contrast.</p>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>Buttons</h2>
        <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <Button>Primary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>Card / Chip / ThemeBadge</h2>
        <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <Card style={{ width: 280 }}>Card — shadow-sm, radius-lg, surface</Card>
          <Chip>Small group discussion</Chip>
          <Chip>Reflective pauses</Chip>
          <ThemeBadge theme="craft" />
          <ThemeBadge theme="clarity" />
          <ThemeBadge theme="change" />
          <ThemeBadge theme="challenge" />
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>Participation / Progress</h2>
        <div style={{ display: "flex", gap: 24, alignItems: "center", marginTop: 12 }}>
          <ParticipationMeter value={4} />
          <ProgressRing value={4} max={11} />
          <ProgressRing value={7} max={10} />
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>ScoreControl — the critical component</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 6 }}>Keyboard: 1/2/3 selects, arrows move, focus ring visible, aria-checked. Tick "No evidence" to see disabled state.</p>
        <div style={{ display: "grid", gap: 16, marginTop: 12 }}>
          <ScoreControlDemo />
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>Empty / Skeleton / Sticky bar</h2>
        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          <EmptyState title="No applications yet. Import a CSV export from the application form to get started." description="This is the empty state." action={<Button>Import CSV</Button>} />
          <div style={{ display: "flex", gap: 12 }}>
            <Skeleton style={{ width: 120, height: 18 }} />
            <Skeleton style={{ width: 80, height: 18 }} />
          </div>
          <StickyActionBar>
            <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-muted)", marginRight: "auto" }}>Total <b style={{ color: "var(--text)", fontSize: 17 }}>6 / 8</b></span>
            <Button variant="ghost">Save draft</Button>
            <Button>Submit assessment</Button>
          </StickyActionBar>
        </div>
      </section>

      <p style={{ marginTop: 40, color: "var(--text-faint)", fontSize: 12 }}>Contrast: --text #1C1917 on --bg #FBF9F6 = 15.9:1, --text-muted #6B6459 on --bg = 5.4:1 — both AA. Verify after any token change.</p>
    </main>
  );
}

function ScoreControlDemo() {
  // Use client wrapper
  return <ScoreControlClient />;
}


"use client";
import { useState } from "react";
import { ScoreControl } from "@/components/ui/score-control";
import type { ScoreValue } from "@/lib/rubric";

export default function ScoreControlClient() {
  const [v, setV] = useState<ScoreValue | null>(1);
  const [ne, setNe] = useState(false);
  return <ScoreControl criterion="focus" value={v} noEvidence={ne} onChange={(nv, n) => { setV(nv); setNe(n); }} />;
}

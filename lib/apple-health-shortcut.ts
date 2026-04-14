import { parse } from "scpl";

/**
 * Build a Shortcuts binary (.shortcut) that POSTs rolling 24h Apple Health
 * metrics to `/api/health/apple?token=…`.
 *
 * ScPL cannot set HealthKit type/date filters programmatically; each Find Health
 * Samples block must be opened once in Shortcuts to choose the metric and window.
 */
export function compileFitshotAppleShortcutBuffer(webhookUrl: string): Buffer {
  const urlLit = JSON.stringify(webhookUrl);
  const scpl = `
Comment
| FitShot Apple Health (last 24h)
| After Add Shortcut: open each Find Health Samples block, set Type to match the comment above it, and limit samples to the last 24 hours (Between RangeStart and RangeEnd, or Last 1 Day).
| Automation (7am Guatemala): Shortcuts → Automation → Time of Day → 7:00 → Repeat Daily → Run Shortcut → this shortcut. Use your local time if you are in Guatemala (CST).

Date use="Current Date"
AdjustDate [Subtract, 24, Hours] -> v:RangeStart

Date use="Current Date" -> v:RangeEnd

Date use="Current Date"
FormatDate dateFormat="Custom" formatString="yyyy-MM-dd" timeFormat="None" -> v:DayStr

Number 24 -> v:windowHours

Comment
| Steps (quantity)
FindHealthSamples
CalculateStatistics Sum -> v:fitshot_steps

Comment
| Active Energy (kcal)
FindHealthSamples
CalculateStatistics Sum -> v:fitshot_active_kcal

Comment
| Heart Rate Variability (ms, SDNN)
FindHealthSamples
CalculateStatistics Average -> v:fitshot_hrv

Comment
| Resting Heart Rate (bpm)
FindHealthSamples
CalculateStatistics Average -> v:fitshot_rhr

Comment
| Sleep duration (minutes) — e.g. Time Asleep or Sleep Analysis total
FindHealthSamples
CalculateStatistics Sum -> v:fitshot_sleep_min

Comment
| Sleep quality — e.g. Sleep Score or similar numeric sample
FindHealthSamples
CalculateStatistics Average -> v:fitshot_sleep_qual

Text ${urlLit}
URL
GetContentsofURL advanced=true method=POST requestBody=JSON jSONValues={
  date = v:DayStr
  source = "ios-shortcuts"
  windowHours = v:windowHours
  steps = v:fitshot_steps
  activeEnergyKcal = v:fitshot_active_kcal
  hrv = v:fitshot_hrv
  restingHeartRate = v:fitshot_rhr
  sleepDurationMinutes = v:fitshot_sleep_min
  sleepQuality = v:fitshot_sleep_qual
}
`;

  const { shortcutplist } = parse(scpl, { make: ["shortcutplist"] });
  return shortcutplist;
}
